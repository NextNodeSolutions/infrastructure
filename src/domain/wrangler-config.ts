import { ARTIFACT, bundleEntry, migrationsOf } from './artifact.ts'

import type { WorkerDeclaration } from './declaration.ts'
import type { Provisioned, ResourcePlan } from './resources.ts'

export type WranglerConfig = Readonly<Record<string, unknown>>

// What a build bundles with: only the keys that change the code Wrangler writes.
export function bundlingConfig(
	name: string,
	declaration: WorkerDeclaration,
	main: string,
): WranglerConfig {
	return {
		name,
		main,
		compatibility_date: declaration.compatibilityDate,
		compatibility_flags: declaration.compatibilityFlags,
	}
}

export type Release = {
	readonly name: string
	readonly declaration: WorkerDeclaration
	readonly plan: ResourcePlan
	readonly provisioned: Provisioned
	readonly artifact: string
}

// What a release uploads with. The platform writes every key: the file's own keys keep
// their meaning, the names and ids come from the repository, and the code is the bundle
// the build made, uploaded as it is.
export function releaseConfig(release: Release): WranglerConfig {
	const { declaration } = release
	return {
		name: release.name,
		compatibility_date: declaration.compatibilityDate,
		compatibility_flags: declaration.compatibilityFlags,
		...script(release),
		...assets(release),
		vars: declaration.variables,
		d1_databases: databases(release),
		r2_buckets: release.plan.buckets.map(bucket => ({
			binding: bucket.binding,
			bucket_name: bucket.name,
		})),
		routes: declaration.domain
			? [{ pattern: declaration.domain, custom_domain: true }]
			: [],
		workers_dev: !declaration.domain,
		preview_urls: false,
		observability: { enabled: true },
	}
}

function script({
	declaration,
	artifact,
}: Release): WranglerConfig | undefined {
	if (!declaration.main) return undefined
	return {
		main: `${artifact}/${ARTIFACT.bundle}/${bundleEntry(declaration.main)}`,
		no_bundle: true,
		find_additional_modules: true,
	}
}

function assets({
	declaration,
	artifact,
}: Release): WranglerConfig | undefined {
	if (!declaration.assets) return undefined
	return {
		assets: {
			...declaration.assets.options,
			directory: `${artifact}/${ARTIFACT.assets}`,
		},
	}
}

function migratedBindings(release: Release): ReadonlySet<string> {
	return new Set(
		release.declaration.databases
			.filter(declared => declared.migrationsDirectory)
			.map(declared => declared.binding),
	)
}

function migrations(
	release: Release,
	binding: string,
): WranglerConfig | undefined {
	if (!migratedBindings(release).has(binding)) return undefined
	return { migrations_dir: `${release.artifact}/${migrationsOf(binding)}` }
}

function databases(release: Release): readonly WranglerConfig[] {
	return release.plan.databases.map(database => {
		const id = release.provisioned[database.binding]
		if (!id) {
			throw new Error(
				`the database of ${database.binding} was not provisioned before the upload`,
			)
		}
		return {
			binding: database.binding,
			database_name: database.name,
			database_id: id,
			...migrations(release, database.binding),
		}
	})
}

export function migratedDatabases(release: Release): readonly string[] {
	const migrated = migratedBindings(release)
	return release.plan.databases
		.filter(database => migrated.has(database.binding))
		.map(database => database.name)
}
