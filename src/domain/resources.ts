import { declarationFile } from './deployable.ts'
import { Refusal } from './refusal.ts'

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

// A D1 database is bound by the id Cloudflare gave it, a bucket by its name.
export type Provisioned = {
	readonly databaseIds: Readonly<Record<string, string>>
}

export const NOTHING_PROVISIONED: Provisioned = { databaseIds: {} }

const LONGEST_NAME = 63

export function resourcePlan(
	deployable: Deployable,
	declaration: WorkerDeclaration,
): ResourcePlan {
	const named = (binding: string): NamedResource => {
		const name = `${deployable.name}-${binding.toLowerCase().replaceAll('_', '-')}`
		if (name.length > LONGEST_NAME) {
			const file = declarationFile(deployable.directory)
			throw new Refusal(
				file,
				`${file}: the binding ${binding} would create ${name}, longer than ${LONGEST_NAME} characters. Shorten the binding`,
			)
		}
		return { binding, name }
	}
	return {
		databases: declaration.databases.map(database =>
			named(database.binding),
		),
		buckets: declaration.buckets.map(bucket => named(bucket.binding)),
	}
}

export function hasResources(plan: ResourcePlan): boolean {
	return plan.databases.length + plan.buckets.length > 0
}
