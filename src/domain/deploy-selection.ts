import type { Deployable } from './deployable.ts'

const SHORT_COMMIT = 7

// Where the last deployed commit stands against the commit being deployed.
export type Changed = 'everything' | readonly string[]

export type Since =
	| { readonly relation: 'same' | 'newer' | 'unrelated' }
	| { readonly relation: 'older'; readonly changed: Changed }

export type Verdict = {
	readonly deploys: boolean
	readonly reason: string
}

export function short(commit: string): string {
	return commit.slice(0, SHORT_COMMIT)
}

export const NEVER_DEPLOYED: Verdict = {
	deploys: true,
	reason: 'never deployed',
}

// The baseline is the last deployment that succeeded, per deployable. A failed, cancelled
// or missing run therefore heals itself: the next one deploys everything since.
export function verdictFor(
	deployable: Deployable,
	deployed: string,
	since: Since,
): Verdict {
	const at = short(deployed)
	if (since.relation === 'older') {
		const isReached =
			since.changed === 'everything' ||
			since.changed.includes(deployable.package)
		return isReached
			? { deploys: true, reason: `changed since ${at}` }
			: { deploys: false, reason: `unchanged since ${at}` }
	}
	if (since.relation === 'same')
		return { deploys: false, reason: 'already deployed at this commit' }
	if (since.relation === 'newer') {
		return {
			deploys: false,
			reason: `the newer commit ${at} is already deployed`,
		}
	}
	return {
		deploys: true,
		reason: `the deployed commit ${at} is not in this history`,
	}
}

export type Publication = {
	readonly version: string
	readonly registry: 'has this version' | 'lacks this version'
}

// A version is published once. A change that keeps the version publishes nothing.
export function withPublication(
	verdict: Verdict,
	publication: Publication,
): Verdict {
	if (!verdict.deploys) return verdict
	if (publication.registry === 'lacks this version') {
		return {
			deploys: true,
			reason: `${verdict.reason}, version ${publication.version} is not published`,
		}
	}
	return {
		deploys: false,
		reason: `version ${publication.version} is already published: change the version to publish`,
	}
}
