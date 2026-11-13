import { ask, decode, refused, resultsOf } from './cloudflare-api.ts'
import { isSuccess, NOT_FOUND } from './http.ts'

import type {
	NamedResource,
	ResourcePlan,
	RetainedStores,
} from '../domain/resources.ts'
import type { Account } from './cloudflare-api.ts'

const DATABASES_PER_PAGE = 10_000

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

// The search also answers every database whose name contains the one asked for.
async function databaseId(
	account: Account,
	name: string,
): Promise<string | undefined> {
	const databases = resultsOf(
		await ask(
			account,
			'GET',
			`/accounts/${account.id}/d1/database?name=${encodeURIComponent(name)}&per_page=${DATABASES_PER_PAGE}`,
		),
		`look up the database ${name}`,
	)
	const found = databases.find(database => database.name === name)
	if (!found) return undefined
	return decode.string(found, 'uuid')
}

async function retainedDatabase(
	account: Account,
	store: NamedResource,
): Promise<RetainedStores['databases']> {
	const id = await databaseId(account, store.name)
	return id ? [{ ...store, id }] : []
}

async function retainedBucket(
	account: Account,
	store: NamedResource,
): Promise<RetainedStores['buckets']> {
	return (await hasBucket(account, store.name)) ? [store] : []
}

export async function retainedStores(
	account: Account,
	plan: ResourcePlan,
): Promise<RetainedStores> {
	const [databases, buckets] = await Promise.all([
		Promise.all(
			plan.databases.map(store => retainedDatabase(account, store)),
		),
		Promise.all(plan.buckets.map(store => retainedBucket(account, store))),
	])
	return { databases: databases.flat(), buckets: buckets.flat() }
}
