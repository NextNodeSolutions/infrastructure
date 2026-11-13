// The branch that never moves. A standing pull request from the default branch into it is
// what a ruleset-required workflow can run on after a merge: every merge moves that pull
// request's head, and GitHub then starts the workflow on it.
export const DEPLOYMENTS_BRANCH = 'deployments'

export const VISIBILITIES = ['public', 'private', 'internal'] as const

export type Visibility = (typeof VISIBILITIES)[number]

export type PullRequestEvent = {
	readonly owner: string
	readonly repository: string
	readonly repositoryId: string
	readonly visibility: Visibility
	readonly defaultBranch: string
	readonly baseRef: string
	readonly headRef: string
	readonly headSha: string
	readonly origin: 'this repository' | 'a fork'
	readonly sender: string
}

const DEPENDABOT = 'dependabot[bot]'

// A proposal is planned, the standing pull request is released, anything else is ignored.
export type Occasion = 'proposal' | 'release' | 'elsewhere'

export function occasionOf(event: PullRequestEvent): Occasion {
	if (event.baseRef !== DEPLOYMENTS_BRANCH)
		return event.baseRef === event.defaultBranch ? 'proposal' : 'elsewhere'
	const isStanding =
		event.origin === 'this repository' &&
		event.headRef === event.defaultBranch
	if (isStanding) return 'release'
	throw new Error(
		`Only ${event.defaultBranch} deploys. A pull request from ${event.headRef} into ${DEPLOYMENTS_BRANCH} deploys nothing and cannot merge: close it`,
	)
}

// A release serves the standing pull request and refuses every other, before anything
// of the project is read and before any credential is asked for. Discovery already asks
// for no release elsewhere: this holds when a job is started without it.
export function refuseUnlessStanding(event: PullRequestEvent): void {
	if (occasionOf(event) === 'release') return
	throw new Error(
		`Only the standing pull request deploys: this one targets ${event.baseRef} and deploys nothing`,
	)
}

// Whether this run can open the standing pull request. GitHub hands a token that only
// reads to a run that a fork or Dependabot started, whatever the workflow asks for.
export function opensStanding(event: PullRequestEvent): boolean {
	return (
		occasionOf(event) === 'proposal' &&
		event.origin === 'this repository' &&
		event.sender !== DEPENDABOT
	)
}

export function standingPullRequest(event: PullRequestEvent): {
	readonly base: string
	readonly head: string
	readonly title: string
	readonly body: string
} {
	return {
		base: DEPLOYMENTS_BRANCH,
		head: event.defaultBranch,
		title: `Deployments of ${event.defaultBranch}`,
		body: [
			`This pull request is how \`${event.defaultBranch}\` gets deployed. Every merge into \`${event.defaultBranch}\` moves its head, and the Deploy workflow then runs here: its checks are the deployments.`,
			'',
			`It never merges, and \`${DEPLOYMENTS_BRANCH}\` never moves. If it is closed, the next pull request into \`${event.defaultBranch}\` opens it again.`,
		].join('\n'),
	}
}
