import { refusal } from './refusal.ts'

import type { ResourcePlan } from './resources.ts'

const OWNER = 'nextnode:repository='

// A Worker that exists before its name is claimed was made by hand or by another
// pipeline. A release takes it over only when a person handed it to the repository by
// setting the repository's owner tag on it.
export type ExistingWorker = {
	readonly worker: string
	readonly repository: string
	readonly tags: readonly string[]
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

export function refuseWorkerNotHandedOver(
	existing: ExistingWorker,
	file: string,
): void {
	const { worker, repository, tags } = existing
	const owner = ownerTag(repository)
	if (tags.includes(owner)) return
	throw refusal(
		file,
		`the Worker ${worker} already exists and no repository holds its name. To hand it to this repository, add the tag ${owner} to it in Cloudflare, then release again. Otherwise rename the package, so that this one deploys under a name of its own`,
	)
}

export function workerClaimKey(worker: string): string {
	return `workers/${worker}`
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
			workerClaimKey(worker),
			...(hostname ? [`hostnames/${hostname}`] : []),
			...plan.databases.map(database => `d1/${database.name}`),
			...plan.buckets.map(bucket => `r2/${bucket.name}`),
		],
	}
}
