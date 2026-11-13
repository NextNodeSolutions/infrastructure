import { createHash } from 'node:crypto'

import { decoder } from '../domain/decode.ts'
import { STATE_BUCKET } from '../domain/platform.ts'

import { maskSecret } from './github.ts'
import {
	fieldsOf,
	isSuccess,
	NOT_FOUND,
	refusalFieldsOf,
	send,
} from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { Zone } from '../domain/hostname.ts'
import type { PlatformCredentials } from '../domain/platform.ts'
import type { Reply } from './http.ts'

const API = 'https://api.cloudflare.com/client/v4'
const ZONES_PER_PAGE = 50

export type Account = {
	readonly id: string
	readonly token: string
}

type StateKeys = {
	readonly accessKeyId: string
	readonly secretAccessKey: string
	readonly region: string
}

export type StateBackend = {
	readonly objectEndpoint: string
	readonly url: string
	readonly keys: StateKeys
}

const STATE_REGION = 'auto'

const decode = decoder(message => new Error(`Cloudflare: ${message}`))

export function accountOf(credentials: PlatformCredentials): Account {
	return {
		id: credentials.cloudflareAccount,
		token: credentials.cloudflareToken,
	}
}

function ask(
	account: Account,
	method: string,
	path: string,
	body?: Fields,
): Promise<Reply> {
	return send({
		method,
		url: `${API}${path}`,
		headers: { authorization: `Bearer ${account.token}` },
		body,
	})
}

function reasonsOf(reply: Reply): string {
	const errors = refusalFieldsOf(reply)?.errors
	if (!Array.isArray(errors)) return ''
	return decode
		.records({ errors }, 'errors')
		.map(error => String(error.message))
		.join('; ')
}

function refused(reply: Reply, action: string): Error {
	return new Error(
		`Cloudflare refused to ${action} (HTTP ${reply.status}): ${reasonsOf(reply)}`,
	)
}

function resultsOf(reply: Reply, action: string): readonly Fields[] {
	if (!isSuccess(reply)) throw refused(reply, action)
	return decode.records(fieldsOf(reply, 'Cloudflare'), 'result')
}

// The Worker a hostname is attached to as a custom domain, when one is.
export async function hostnameHolder(
	account: Account,
	hostname: string,
): Promise<string | undefined> {
	const [attached] = resultsOf(
		await ask(
			account,
			'GET',
			`/accounts/${account.id}/workers/domains?hostname=${encodeURIComponent(hostname)}`,
		),
		`look up the Worker of ${hostname}`,
	)
	if (!attached) return undefined
	return decode.string(attached, 'service')
}

function settingsOf(account: Account, worker: string): string {
	return `/accounts/${account.id}/workers/scripts/${worker}/script-settings`
}

// The tags of a Worker, and none when the account holds no Worker of that name.
export async function workerTags(
	account: Account,
	worker: string,
): Promise<readonly string[] | undefined> {
	const reply = await ask(account, 'GET', settingsOf(account, worker))
	if (reply.status === NOT_FOUND) return undefined
	if (!isSuccess(reply)) throw refused(reply, `read the tags of ${worker}`)
	const settings = decode.record(
		fieldsOf(reply, 'Cloudflare').result,
		'the settings',
	)
	return Array.isArray(settings.tags) ? decode.strings(settings, 'tags') : []
}

export async function tagWorker(
	account: Account,
	worker: string,
	tags: readonly string[],
): Promise<void> {
	const reply = await ask(account, 'PATCH', settingsOf(account, worker), {
		tags,
	})
	if (!isSuccess(reply)) throw refused(reply, `tag ${worker}`)
}

export async function listZones(account: Account): Promise<readonly Zone[]> {
	const zones = resultsOf(
		await ask(
			account,
			'GET',
			`/zones?account.id=${account.id}&per_page=${ZONES_PER_PAGE}`,
		),
		'list the zones of the account',
	)
	return zones.map(zone => ({
		id: decode.string(zone, 'id'),
		name: decode.string(zone, 'name'),
	}))
}

export async function recordTypesAt(
	account: Account,
	zone: Zone,
	hostname: string,
): Promise<readonly string[]> {
	const records = resultsOf(
		await ask(
			account,
			'GET',
			`/zones/${zone.id}/dns_records?name=${encodeURIComponent(hostname)}`,
		),
		`read the DNS records of ${hostname}`,
	)
	return records.map(record => decode.string(record, 'type'))
}

async function hasStateBucket(account: Account): Promise<boolean> {
	const reply = await ask(
		account,
		'GET',
		`/accounts/${account.id}/r2/buckets/${STATE_BUCKET}`,
	)
	if (reply.status === NOT_FOUND) return false
	if (!isSuccess(reply))
		throw refused(reply, `read the bucket ${STATE_BUCKET}`)
	return true
}

// Two releases of a first run may both find the bucket missing: the one that loses the
// creation finds it made.
async function ensureStateBucket(account: Account): Promise<void> {
	if (await hasStateBucket(account)) return
	const created = await ask(
		account,
		'POST',
		`/accounts/${account.id}/r2/buckets`,
		{ name: STATE_BUCKET },
	)
	if (isSuccess(created) || (await hasStateBucket(account))) return
	throw refused(created, `create the bucket ${STATE_BUCKET}`)
}

// The state lives in an R2 bucket behind Pulumi's S3 backend. R2's S3 API takes the API
// token itself as a key pair: its id as the access key, its SHA-256 as the secret key.
export async function stateBackend(account: Account): Promise<StateBackend> {
	await ensureStateBucket(account)
	const verified = await ask(account, 'GET', '/user/tokens/verify')
	if (!isSuccess(verified)) throw refused(verified, 'verify its own token')
	const token = decode.record(
		fieldsOf(verified, 'Cloudflare').result,
		'the token',
	)
	const secretKey = createHash('sha256').update(account.token).digest('hex')
	maskSecret(secretKey)
	const endpoint = `${account.id}.r2.cloudflarestorage.com`
	return {
		objectEndpoint: `https://${endpoint}/${STATE_BUCKET}/`,
		url: `s3://${STATE_BUCKET}?endpoint=${endpoint}&region=${STATE_REGION}&s3ForcePathStyle=true`,
		keys: {
			accessKeyId: decode.string(token, 'id'),
			secretAccessKey: secretKey,
			region: STATE_REGION,
		},
	}
}
