import { decoder } from '../domain/decode.ts'
import { Refusal } from '../domain/refusal.ts'

import { fieldsOf, isSuccess, send } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { Ownership } from '../domain/ownership.ts'
import type { StateBackend } from './cloudflare.ts'
import type { Reply } from './http.ts'

const PRECONDITION_FAILED = 412
const decode = decoder(message => new Error(`Resource ownership: ${message}`))

async function request(
	backend: StateBackend,
	method: 'GET' | 'PUT',
	key: string,
	record?: Fields,
): Promise<Reply> {
	const { AwsClient } = await import('aws4fetch')
	const signer = new AwsClient({ ...backend.keys, service: 's3' })
	const encoded = key.split('/').map(encodeURIComponent).join('/')
	const url = new URL(`ownership/${encoded}`, backend.objectEndpoint)
	const headers = new Headers({ 'content-type': 'application/json' })
	if (record) headers.set('if-none-match', '*')
	const signed = await signer.sign(url, {
		method,
		headers,
		body: record ? JSON.stringify(record) : null,
	})
	return send({
		method,
		url: signed.url,
		headers: Object.fromEntries(signed.headers),
		body: record,
	})
}

type Reserving = {
	readonly backend: StateBackend
	readonly owner: string
	readonly file: string
}

async function reserveName(
	{ backend, owner, file }: Reserving,
	key: string,
): Promise<void> {
	const written = await request(backend, 'PUT', key, { owner })
	if (isSuccess(written)) return
	if (written.status !== PRECONDITION_FAILED) {
		throw new Error(
			`The ownership store refused to reserve ${key} (HTTP ${written.status})`,
		)
	}
	const existing = await request(backend, 'GET', key)
	if (!isSuccess(existing)) {
		throw new Error(
			`The ownership store refused to read ${key} (HTTP ${existing.status})`,
		)
	}
	const holder = decode.string(
		fieldsOf(existing, 'ownership record'),
		'owner',
	)
	if (holder === owner) return
	throw new Refusal(
		file,
		`${file}: ${key} is reserved by ${holder}, not ${owner}. Choose another name; no existing claim is replaced`,
	)
}

export async function reserveOwnership(
	backend: StateBackend,
	ownership: Ownership,
	file: string,
): Promise<void> {
	const reserving = { backend, owner: ownership.owner, file }
	await Promise.all(ownership.keys.map(key => reserveName(reserving, key)))
}
