import { Refusal } from './refusal.ts'

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

export function ownerTag(repository: string): string {
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
