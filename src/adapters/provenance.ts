import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
	provenanceStatement,
	STATEMENT_PAYLOAD_TYPE,
} from '../domain/provenance.ts'

import { requiredVariable } from './environment.ts'
import { identityToken } from './run-identity.ts'

import type { BuildRun } from '../domain/provenance.ts'
import type { PublishedAs } from '../domain/subject.ts'
import type { RunIdentity } from './run-identity.ts'

const SIGSTORE_AUDIENCE = 'sigstore'
const BUNDLE_FILE = 'provenance.sigstore.json'
const TRANSPARENCY_LOG = 'https://search.sigstore.dev/'

export type Provenance = {
	readonly file: string
	readonly logEntry: string
}

function buildRun(): BuildRun {
	return {
		serverUrl: requiredVariable('GITHUB_SERVER_URL'),
		repository: requiredVariable('GITHUB_REPOSITORY'),
		repositoryId: requiredVariable('GITHUB_REPOSITORY_ID'),
		repositoryOwnerId: requiredVariable('GITHUB_REPOSITORY_OWNER_ID'),
		workflowRef: requiredVariable('GITHUB_WORKFLOW_REF'),
		eventName: requiredVariable('GITHUB_EVENT_NAME'),
		ref: requiredVariable('GITHUB_REF'),
		sha: requiredVariable('GITHUB_SHA'),
		runId: requiredVariable('GITHUB_RUN_ID'),
		runAttempt: requiredVariable('GITHUB_RUN_ATTEMPT'),
		runnerEnvironment: requiredVariable('RUNNER_ENVIRONMENT'),
	}
}

function sha512Of(file: string): string {
	return createHash('sha512').update(readFileSync(file)).digest('hex')
}

// The program signs, so the token that names the run to Sigstore reaches no tool: npm
// receives the finished bundle and checks it against the tarball before it publishes.
export async function signProvenance(
	tarball: string,
	published: PublishedAs,
	identity: RunIdentity,
	scratch: string,
): Promise<Provenance> {
	const statement = provenanceStatement(
		{ ...published, sha512: sha512Of(tarball) },
		buildRun(),
	)
	const { attest } = await import('sigstore')
	const bundle = await attest(
		Buffer.from(JSON.stringify(statement)),
		STATEMENT_PAYLOAD_TYPE,
		{ identityToken: await identityToken(identity, SIGSTORE_AUDIENCE) },
	)
	const file = join(scratch, BUNDLE_FILE)
	writeFileSync(file, JSON.stringify(bundle))
	const [entry] = bundle.verificationMaterial.tlogEntries
	if (!entry) {
		throw new Error(
			'Sigstore signed the provenance and recorded it in no transparency log',
		)
	}
	return { file, logEntry: `${TRANSPARENCY_LOG}?logIndex=${entry.logIndex}` }
}
