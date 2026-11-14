import { decoder } from '../domain/decode.ts'
import { PLATFORM_SECRETS, VAULT } from '../domain/platform.ts'

import { maskSecret } from './github.ts'
import { fieldsOf, isSuccess, messageOf, send } from './http.ts'
import { identityToken } from './run-identity.ts'

import type { PlatformCredentials } from '../domain/platform.ts'
import type { RunIdentity } from './run-identity.ts'

const decode = decoder(message => new Error(`The vault: ${message}`))

// The vault admits a run by the claims of its token, never by a stored secret: the Deploy
// workflow of this repository, on the standing pull request of an organization repository.
async function login(runIdentityToken: string): Promise<string> {
	const reply = await send({
		method: 'POST',
		url: `${VAULT.api}/v1/auth/oidc-auth/login`,
		headers: {},
		body: { identityId: VAULT.identity, jwt: runIdentityToken },
	})
	if (!isSuccess(reply)) {
		throw new Error(
			`The vault admitted no login from this run (HTTP ${reply.status}): ${messageOf(reply)}. It admits the Deploy workflow on the standing pull request and nothing else`,
		)
	}
	const token = decode.string(fieldsOf(reply, 'The vault'), 'accessToken')
	maskSecret(token)
	return token
}

async function readSecret(token: string, name: string): Promise<string> {
	const query = new URLSearchParams({
		projectId: VAULT.project,
		environment: VAULT.environment,
		secretPath: '/',
	})
	const reply = await send({
		method: 'GET',
		url: `${VAULT.api}/v4/secrets/${name}?${query.toString()}`,
		headers: { authorization: `Bearer ${token}` },
	})
	if (!isSuccess(reply)) {
		throw new Error(
			`The vault refused to read ${name} (HTTP ${reply.status}): ${messageOf(reply)}`,
		)
	}
	const secret = decode.record(fieldsOf(reply, 'The vault').secret, name)
	return decode.string(secret, 'secretValue')
}

export async function platformCredentials(
	identity: RunIdentity,
): Promise<PlatformCredentials> {
	const token = await login(await identityToken(identity, VAULT.audience))
	const [cloudflareToken, cloudflareAccount, statePassphrase] =
		await Promise.all([
			readSecret(token, PLATFORM_SECRETS.cloudflareToken),
			readSecret(token, PLATFORM_SECRETS.cloudflareAccount),
			readSecret(token, PLATFORM_SECRETS.statePassphrase),
		])
	maskSecret(cloudflareToken)
	maskSecret(statePassphrase)
	return { cloudflareToken, cloudflareAccount, statePassphrase }
}
