import { PRODUCTION } from './declaration.ts'

import type {
	Assets,
	Bucket,
	Database,
	WorkerDeclaration,
} from './declaration.ts'
import type { Decoder, Fields } from './decode.ts'
import type { Refusal } from './refusal.ts'

export type Decoding = {
	readonly decode: Decoder
	readonly refuse: (message: string) => Refusal
}

// Wrangler's own keys, with Wrangler's meaning, so the file is also the Worker's local
// configuration. A key that names the Worker, the account or a resource is absent: the
// platform derives those from the repository, so no file can reach another project's.
export const WORKER_KEYS = [
	'main',
	'compatibility_date',
	'compatibility_flags',
	'assets',
	'vars',
	'd1_databases',
	'r2_buckets',
	'environments',
	'deploy',
] as const
const ASSET_OPTIONS = [
	'binding',
	'not_found_handling',
	'html_handling',
] as const
const DEFAULT_HEALTH_PATH = '/'

const HOSTNAME =
	/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const COMPATIBILITY_DATE = /^\d{4}-\d{2}-\d{2}$/
const BINDING = /^[A-Z][A-Z0-9_]*$/

export function decodeWorker(
	fields: Fields,
	decoding: Decoding,
): WorkerDeclaration {
	const { decode, refuse } = decoding
	const main = optionalPath(fields, 'main', decoding)
	const assets = decodeAssets(fields, decoding)
	if (!main && !assets) {
		throw refuse(
			'the file declares nothing to deploy: add main, [assets] or [package]',
		)
	}
	const compatibilityDate = decode.string(fields, 'compatibility_date')
	if (!COMPATIBILITY_DATE.test(compatibilityDate))
		throw refuse('compatibility_date must be a date written YYYY-MM-DD')
	const databases = decode
		.records(fields, 'd1_databases')
		.map(entry => decodeDatabase(entry, decoding))
	const buckets = decode
		.records(fields, 'r2_buckets')
		.map(entry => decodeBucket(entry, decoding))
	refuseUnusableBindings(main, [...databases, ...buckets], refuse)
	return {
		kind: 'worker',
		main,
		compatibilityDate,
		compatibilityFlags: decode.strings(fields, 'compatibility_flags'),
		assets,
		variables: decodeVariables(fields, decoding),
		databases,
		buckets,
		domain: decodeDomain(fields, decoding),
		healthPath: decodeHealthPath(fields, decoding),
	}
}

function refuseUnusableBindings(
	main: string | undefined,
	bound: readonly Bucket[],
	refuse: Decoding['refuse'],
): void {
	const bindings = bound.map(resource => resource.binding)
	const repeated = bindings.find(
		(binding, index) => bindings.indexOf(binding) !== index,
	)
	if (repeated) throw refuse(`the binding ${repeated} is declared twice`)
	if (!main && bindings.length) {
		throw refuse(
			'a Worker of static assets has no code to bind a database or a bucket to: add main',
		)
	}
}

// A path of the file stays inside the directory the file lives in: the build reads what
// it names, so a path that climbs out would reach another package's files.
function inside(path: string, key: string, refuse: Decoding['refuse']): string {
	const leaves =
		path === '' ||
		path.startsWith('/') ||
		path.includes('\\') ||
		path.split('/').includes('..')
	if (leaves)
		throw refuse(`${key} must be a path inside the file's directory`)
	return path
}

function optionalPath(
	fields: Fields,
	key: string,
	{ decode, refuse }: Decoding,
): string | undefined {
	if (!(key in fields)) return undefined
	return inside(decode.string(fields, key), key, refuse)
}

function decodeAssets(
	fields: Fields,
	{ decode, refuse }: Decoding,
): Assets | undefined {
	const assets = decode.optionalRecord(fields, 'assets')
	if (!assets) return undefined
	decode.onlyKeys(assets, ['directory', ...ASSET_OPTIONS], 'assets')
	const options = ASSET_OPTIONS.filter(option => option in assets).map(
		option => [option, decode.string(assets, option)] as const,
	)
	return {
		directory: inside(
			decode.string(assets, 'directory'),
			'assets.directory',
			refuse,
		),
		options: Object.fromEntries(options),
	}
}

function decodeBinding(entry: Fields, { decode, refuse }: Decoding): string {
	const binding = decode.string(entry, 'binding')
	if (!BINDING.test(binding)) {
		throw refuse(
			`the binding ${binding} must be written in capitals, digits and underscores`,
		)
	}
	return binding
}

function decodeDatabase(entry: Fields, decoding: Decoding): Database {
	decoding.decode.onlyKeys(
		entry,
		['binding', 'migrations_dir'],
		'an entry of d1_databases',
	)
	return {
		binding: decodeBinding(entry, decoding),
		migrationsDirectory: optionalPath(entry, 'migrations_dir', decoding),
	}
}

function decodeBucket(entry: Fields, decoding: Decoding): Bucket {
	decoding.decode.onlyKeys(entry, ['binding'], 'an entry of r2_buckets')
	return { binding: decodeBinding(entry, decoding) }
}

function decodeVariables(
	fields: Fields,
	{ decode }: Decoding,
): Readonly<Record<string, string>> {
	const variables = decode.optionalRecord(fields, 'vars') ?? {}
	return Object.fromEntries(
		Object.keys(variables).map(name => [
			name,
			decode.string(variables, name),
		]),
	)
}

function decodeDomain(
	fields: Fields,
	{ decode, refuse }: Decoding,
): string | undefined {
	const environments = decode.optionalRecord(fields, 'environments')
	if (!environments) return undefined
	decode.onlyKeys(environments, [PRODUCTION], 'environments')
	const production = decode.optionalRecord(environments, PRODUCTION)
	if (!production) return undefined
	decode.onlyKeys(production, ['domain'], `environments.${PRODUCTION}`)
	const domain = decode.string(production, 'domain')
	if (!HOSTNAME.test(domain)) {
		throw refuse(
			`environments.${PRODUCTION}.domain must be a hostname in lowercase`,
		)
	}
	return domain
}

function decodeHealthPath(
	fields: Fields,
	{ decode, refuse }: Decoding,
): string {
	const deploy = decode.optionalRecord(fields, 'deploy')
	if (!deploy) return DEFAULT_HEALTH_PATH
	decode.onlyKeys(deploy, ['health'], 'deploy')
	const health =
		decode.optionalString(deploy, 'health') ?? DEFAULT_HEALTH_PATH
	if (!health.startsWith('/'))
		throw refuse('deploy.health must be a path that starts with /')
	return health
}
