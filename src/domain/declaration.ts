export const NEXTNODE_FILE = 'nextnode.toml'

export type Assets = {
	readonly directory: string
	readonly options: Readonly<Record<string, string>>
}

export type Database = {
	readonly binding: string
	readonly migrationsDirectory: string | undefined
}

export type Bucket = { readonly binding: string }

export type WorkerDeclaration = {
	readonly kind: 'worker'
	readonly main: string | undefined
	readonly compatibilityDate: string
	readonly compatibilityFlags: readonly string[]
	readonly assets: Assets | undefined
	readonly variables: Readonly<Record<string, string>>
	readonly databases: readonly Database[]
	readonly buckets: readonly Bucket[]
	readonly domain: string | undefined
	readonly healthPath: string
}

// Public only: a release asks the registry without a credential whether a version
// exists, and a restricted package would answer that it has none.
export const PACKAGE_ACCESSES = ['public'] as const
export type PackageAccess = (typeof PACKAGE_ACCESSES)[number]

export type PackageDeclaration = {
	readonly kind: 'package'
	readonly access: PackageAccess
}

export type Declaration = WorkerDeclaration | PackageDeclaration

// Production keeps the bare name, so an environment added later takes its own name as a
// suffix and renames nothing that already serves.
export const PRODUCTION = 'production'
