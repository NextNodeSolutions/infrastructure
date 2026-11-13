import { decoder } from '../domain/decode.ts'

import { fieldsOf, isSuccess, refusalFieldsOf, send } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { PlatformCredentials } from '../domain/platform.ts'
import type { Reply } from './http.ts'

const API = 'https://api.cloudflare.com/client/v4'

export type Account = {
	readonly id: string
	readonly token: string
}

export const decode = decoder(message => new Error(`Cloudflare: ${message}`))

export function accountOf(credentials: PlatformCredentials): Account {
	return {
		id: credentials.cloudflareAccount,
		token: credentials.cloudflareToken,
	}
}

export function ask(
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

export function refused(reply: Reply, action: string): Error {
	return new Error(
		`Cloudflare refused to ${action} (HTTP ${reply.status}): ${reasonsOf(reply)}`,
	)
}

export function resultOf(reply: Reply, action: string, what: string): Fields {
	if (!isSuccess(reply)) throw refused(reply, action)
	return decode.record(fieldsOf(reply, 'Cloudflare').result, what)
}

export function resultsOf(reply: Reply, action: string): readonly Fields[] {
	if (!isSuccess(reply)) throw refused(reply, action)
	return decode.records(fieldsOf(reply, 'Cloudflare'), 'result')
}
