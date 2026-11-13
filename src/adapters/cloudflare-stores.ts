import { ask, refused } from './cloudflare-api.ts'
import { isSuccess, NOT_FOUND } from './http.ts'

import type { Account } from './cloudflare-api.ts'

export async function hasBucket(
	account: Account,
	name: string,
): Promise<boolean> {
	const reply = await ask(
		account,
		'GET',
		`/accounts/${account.id}/r2/buckets/${name}`,
	)
	if (reply.status === NOT_FOUND) return false
	if (!isSuccess(reply)) throw refused(reply, `read the bucket ${name}`)
	return true
}
