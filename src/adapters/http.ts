import { decoder } from '../domain/decode.ts'

import type { Decoder, Fields } from '../domain/decode.ts'

export type Reply = {
	readonly status: number
	readonly text: string
}

export type Request = {
	readonly method: string
	readonly url: string
	readonly headers: Readonly<Record<string, string>>
	readonly body?: Fields | undefined
}

type Content = Pick<RequestInit, 'headers' | 'body'>

const REQUEST_TIMEOUT_MS = 30_000
const FIRST_SUCCESS = 200
const FIRST_REDIRECT = 300
const JSON_CONTENT = { 'content-type': 'application/json' }

export const UNAUTHORIZED = 401
export const NOT_FOUND = 404

function contentOf({ headers, body }: Request): Content {
	if (!body) return { headers }
	return {
		headers: { ...headers, ...JSON_CONTENT },
		body: JSON.stringify(body),
	}
}

export async function send(request: Request): Promise<Reply> {
	const response = await fetch(request.url, {
		...contentOf(request),
		method: request.method,
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	})
	return { status: response.status, text: await response.text() }
}

export function isSuccess(reply: Reply): boolean {
	return reply.status >= FIRST_SUCCESS && reply.status < FIRST_REDIRECT
}

function bodyOf<Body>(
	reply: Reply,
	service: string,
	shape: string,
	read: (parsed: unknown, decode: Decoder) => Body,
): Body {
	const decode = decoder(message => new Error(`${service}: ${message}`))
	try {
		const parsed: unknown = JSON.parse(reply.text)
		return read(parsed, decode)
	} catch (failure: unknown) {
		throw new Error(
			`${service} answered HTTP ${reply.status} with a body that is not ${shape}`,
			{ cause: failure },
		)
	}
}

export function fieldsOf(reply: Reply, service: string): Fields {
	return bodyOf(reply, service, 'a JSON object', (parsed, decode) =>
		decode.record(parsed, 'the reply'),
	)
}

export function recordsOf(reply: Reply, service: string): readonly Fields[] {
	return bodyOf(reply, service, 'a JSON list of objects', (parsed, decode) =>
		decode.recordList(parsed, 'the reply'),
	)
}

// The body of a refusal as fields, and none when it is not a JSON object: a refusal is
// read for its reason, and a missing reason is no second failure.
export function refusalFieldsOf(reply: Reply): Fields | undefined {
	try {
		const parsed: unknown = JSON.parse(reply.text)
		if (typeof parsed !== 'object' || parsed === null) return undefined
		return { ...parsed }
	} catch {
		return undefined
	}
}

export function messageOf(reply: Reply): string {
	const message = refusalFieldsOf(reply)?.message
	return typeof message === 'string' ? message : ''
}
