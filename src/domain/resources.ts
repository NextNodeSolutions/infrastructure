import { declarationFile } from './deployable.ts'
import { STATE_BUCKET } from './platform.ts'
import { refusal } from './refusal.ts'

import type { WorkerDeclaration } from './declaration.ts'
import type { Deployable } from './deployable.ts'

export type NamedResource = {
	readonly binding: string
	readonly name: string
}

// The backing resources of one Worker, named after it: a file names a binding, never a
// resource, so it cannot bind a database or a bucket that another project owns.
export type ResourcePlan = {
	readonly databases: readonly NamedResource[]
	readonly buckets: readonly NamedResource[]
}

// The id Cloudflare gave each D1 database, by binding: a bucket is bound by its name.
export type Provisioned = Readonly<Record<string, string>>

// The planned stores the account already holds, as a binding that left the file leaves
// them. Only the claim of this repository and Worker reserves their names.
export type RetainedStores = {
	readonly databases: readonly (NamedResource & { readonly id: string })[]
	readonly buckets: readonly NamedResource[]
}

export const NO_RESOURCES: ResourcePlan = { databases: [], buckets: [] }

export const NOTHING_PROVISIONED: Provisioned = {}

const LONGEST_NAME = 63

export function resourcePlan(
	deployable: Deployable,
	declaration: WorkerDeclaration,
): ResourcePlan {
	const file = declarationFile(deployable.directory)
	const named = (binding: string): NamedResource => {
		const name = `${deployable.name}-${binding.toLowerCase().replaceAll('_', '-')}`
		if (name.length > LONGEST_NAME) {
			throw refusal(
				file,
				`the binding ${binding} would create ${name}, longer than ${LONGEST_NAME} characters. Shorten the binding`,
			)
		}
		return { binding, name }
	}
	const buckets = declaration.buckets.map(bucket => named(bucket.binding))
	const platformBucket = buckets.find(bucket => bucket.name === STATE_BUCKET)
	if (platformBucket) {
		throw refusal(
			file,
			`the binding ${platformBucket.binding} would bind ${STATE_BUCKET}, the bucket that holds every repository's deployment state. Choose another binding`,
		)
	}
	return {
		databases: declaration.databases.map(database =>
			named(database.binding),
		),
		buckets,
	}
}

export function hasResources(plan: ResourcePlan): boolean {
	return plan.databases.length + plan.buckets.length > 0
}
