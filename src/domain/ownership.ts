import { Refusal } from './refusal.ts'

import type { ResourcePlan } from './resources.ts'

const OWNER = 'nextnode:repository='

// A Worker's name is derived from a repository and a package, and two repositories can
// derive the same one. The account has one namespace for all of them, so a Worker carries
// the repository that deploys it, and a release uploads over no Worker that carries
// another.
export type WorkerClaim = {
	readonly worker: string
	readonly repository: string
	readonly tags: readonly string[] | undefined
}

function ownerTag(repository: string): string {
	return `${OWNER}${repository.toLowerCase()}`
}

export function withOwner(
	tags: readonly string[],
	repository: string,
): readonly string[] {
	const owner = ownerTag(repository)
	return tags.includes(owner) ? tags : [...tags, owner]
}

export function refuseForeignWorker(claim: WorkerClaim, file: string): void {
	const { worker, repository, tags } = claim
	if (!tags || tags.includes(ownerTag(repository))) return
	const other = tags.find(tag => tag.startsWith(OWNER))
	if (!other) return
	throw new Refusal(
		file,
		`${file}: the Worker ${worker} is deployed by the repository ${other.slice(OWNER.length)}. Rename the package, so that this one deploys under a name of its own`,
	)
}

// The names a release reserves in the state bucket before it writes, each held by the
// immutable repository id and the deployable. The keys and the owner are stored, so
// their spelling is a persisted format.
export type Ownership = {
	readonly owner: string
	readonly keys: readonly string[]
}

export type Reservation = {
	readonly repositoryId: string
	readonly worker: string
	readonly hostname: string | undefined
	readonly plan: ResourcePlan
}

export function ownershipOf(reservation: Reservation): Ownership {
	const { repositoryId, worker, hostname, plan } = reservation
	return {
		owner: `${repositoryId}/${worker}`,
		keys: [
			`workers/${worker}`,
			...(hostname ? [`hostnames/${hostname}`] : []),
			...plan.databases.map(database => `d1/${database.name}`),
			...plan.buckets.map(bucket => `r2/${bucket.name}`),
		],
	}
}
