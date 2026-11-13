import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { decoder } from '../domain/decode.ts'
import { printPackedManifest } from '../domain/deploy-commands.ts'
import { decodeManifest } from '../domain/manifest.ts'
import { NPM_REGISTRY } from '../domain/platform.ts'
import { refusal } from '../domain/refusal.ts'

import { toolEnvironment } from './environment.ts'
import { maskSecret } from './github.ts'
import {
	fieldsOf,
	isSuccess,
	messageOf,
	NOT_FOUND,
	send,
	UNAUTHORIZED,
} from './http.ts'
import { capture } from './processes.ts'
import { identityToken } from './run-identity.ts'

import type { Manifest } from '../domain/manifest.ts'
import type { PublishedAs } from '../domain/subject.ts'
import type { ToolEnvironment } from './environment.ts'
import type { RunIdentity } from './run-identity.ts'

const REGISTRY_HOST = new URL(NPM_REGISTRY).host
const TOKEN_VARIABLE = 'NODE_AUTH_TOKEN'
const CONFIG_FILE = 'npmrc'
const PACKED_MANIFEST = 'the package.json of the tarball'
const SHORT_DOCUMENT = 'application/vnd.npm.install-v1+json'

const decode = decoder(message => new Error(`The npm registry: ${message}`))

// One run of npm: the directory it works in, the configuration the platform wrote and
// the variables it is started with.
export type Publisher = {
	readonly directory: string
	readonly configuration: string
	readonly environment: ToolEnvironment
}

function registryPath(name: string): string {
	return name.replace('/', '%2F')
}

// What a tarball says it is. A build ran the project's code, so the release asks before
// it publishes. A refusal names the manifest the tarball was packed from.
export async function packedManifest(
	tarball: string,
	cwd: string,
	file: string,
): Promise<Manifest> {
	const printed = await capture(printPackedManifest(tarball), cwd)
	const parsed: unknown = JSON.parse(printed)
	const manifest = decode.record(parsed, PACKED_MANIFEST)
	if ('publishConfig' in manifest) {
		throw refusal(
			file,
			`the package must not carry publishConfig. Remove it, because the platform supplies all publishing configuration`,
		)
	}
	return decodeManifest(manifest, PACKED_MANIFEST)
}

// The registry stores no token for the platform: it trades a token that names the run
// for one that publishes this package alone, for a few minutes, when the package trusts
// this repository and the Deploy workflow.
export async function publishToken(
	identity: RunIdentity,
	name: string,
): Promise<string> {
	const runToken = await identityToken(identity, `npm:${REGISTRY_HOST}`)
	const reply = await send({
		method: 'POST',
		url: `${NPM_REGISTRY}/-/npm/v1/oidc/token/exchange/package/${registryPath(name)}`,
		headers: { authorization: `Bearer ${runToken}` },
	})
	if (!isSuccess(reply)) {
		throw new Error(
			`The npm registry trusts no publication of ${name} from this run (HTTP ${reply.status}): ${messageOf(reply)}. The package must exist on the registry and name this repository and the Deploy workflow as its trusted publisher`,
		)
	}
	const token = decode.string(fieldsOf(reply, 'The npm registry'), 'token')
	maskSecret(token)
	return token
}

// npm reads a tarball the project built, and that tarball can carry settings of its own.
// It is therefore started in a directory the platform made, with a configuration the
// platform wrote, and holds one credential: the token of the package it publishes.
export function preparePublisher(scratch: string, token: string): Publisher {
	const configuration = join(scratch, CONFIG_FILE)
	writeFileSync(
		configuration,
		`//${REGISTRY_HOST}/:_authToken=\${${TOKEN_VARIABLE}}\n`,
	)
	return {
		directory: scratch,
		configuration,
		environment: toolEnvironment({ [TOKEN_VARIABLE]: token }),
	}
}

// The version `latest` names, asked without a credential. The registry answers a scoped
// name it shows nothing of with 401 and an unscoped one with 404.
export async function latestVersion(name: string): Promise<string | undefined> {
	const reply = await send({
		method: 'GET',
		url: `${NPM_REGISTRY}/-/package/${registryPath(name)}/dist-tags`,
		headers: { accept: 'application/json' },
	})
	if (reply.status === NOT_FOUND || reply.status === UNAUTHORIZED)
		return undefined
	if (!isSuccess(reply)) {
		throw new Error(
			`The npm registry did not say which version of ${name} is latest (HTTP ${reply.status})`,
		)
	}
	const { latest } = fieldsOf(reply, 'The npm registry')
	if (typeof latest !== 'string') return undefined
	return latest
}

// Asked without a credential: a public package has a document once it is published or
// staged, and the registry answers a scoped name it shows nothing of with 401.
export async function isRegistered(name: string): Promise<boolean> {
	const reply = await send({
		method: 'GET',
		url: `${NPM_REGISTRY}/${registryPath(name)}`,
		headers: { accept: SHORT_DOCUMENT },
	})
	if (reply.status === NOT_FOUND || reply.status === UNAUTHORIZED)
		return false
	if (isSuccess(reply)) return true
	throw new Error(
		`The npm registry did not say whether ${name} exists (HTTP ${reply.status})`,
	)
}

// Asked without a credential, which sees every version of a public package.
export async function hasVersion(published: PublishedAs): Promise<boolean> {
	const reply = await send({
		method: 'GET',
		url: `${NPM_REGISTRY}/${registryPath(published.name)}/${encodeURIComponent(published.version)}`,
		headers: { accept: 'application/json' },
	})
	if (reply.status === NOT_FOUND) return false
	if (isSuccess(reply)) return true
	throw new Error(
		`The npm registry did not say whether ${published.name}@${published.version} exists (HTTP ${reply.status})`,
	)
}
