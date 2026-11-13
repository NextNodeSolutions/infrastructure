import { decoder } from '../domain/decode.ts'

import { takeVariable } from './environment.ts'
import { maskSecret } from './github.ts'
import { fieldsOf, isSuccess, messageOf, send } from './http.ts'

// What GitHub gives a job to ask for a token that names the run: its repository, its
// workflow, its event and the branches of its pull request. Whoever holds it can ask for
// a token any service would admit, so the program keeps it and no tool it starts gets it.
export type RunIdentity = {
	readonly url: string
	readonly token: string
}

const decode = decoder(message => new Error(`GitHub: ${message}`))

export function takeRunIdentity(): RunIdentity {
	return {
		url: takeVariable('ACTIONS_ID_TOKEN_REQUEST_URL'),
		token: takeVariable('ACTIONS_ID_TOKEN_REQUEST_TOKEN'),
	}
}

// A token that names the run to one audience: the service it is handed to cannot use it
// anywhere else.
export async function identityToken(
	identity: RunIdentity,
	audience: string,
): Promise<string> {
	const url = new URL(identity.url)
	url.searchParams.set('audience', audience)
	const reply = await send({
		method: 'GET',
		url: url.href,
		headers: { authorization: `Bearer ${identity.token}` },
	})
	if (!isSuccess(reply)) {
		throw new Error(
			`GitHub issued no identity token to this job (HTTP ${reply.status}): ${messageOf(reply)}`,
		)
	}
	const token = decode.string(fieldsOf(reply, 'GitHub'), 'value')
	maskSecret(token)
	return token
}
