import { DEPLOYMENTS_BRANCH, standingPullRequest } from '../domain/occasion.ts'

import { branchTip, refusedBy } from './github-api.ts'
import { isSuccess, NOT_FOUND, recordsOf } from './http.ts'

import type { PullRequestEvent, StandingOutcome } from '../domain/occasion.ts'
import type { GitHub } from './github-api.ts'

const UNPROCESSABLE = 422

export async function hasStandingPullRequest(
	api: GitHub,
	event: PullRequestEvent,
): Promise<boolean> {
	const head = encodeURIComponent(`${event.owner}:${event.defaultBranch}`)
	const reply = await api.get(
		`/pulls?state=open&base=${DEPLOYMENTS_BRANCH}&head=${head}&per_page=1`,
	)
	if (!isSuccess(reply))
		throw refusedBy(reply, 'look for the standing pull request')
	return recordsOf(reply, 'GitHub').length > 0
}

// The branch starts one commit behind the default branch: a pull request needs a commit
// between its two ends, and the branch then never moves. A default branch with a single
// commit has nothing to stand behind, so the answer is then no.
async function ensureBranch(
	api: GitHub,
	event: PullRequestEvent,
): Promise<boolean> {
	const existing = await api.get(`/git/ref/heads/${DEPLOYMENTS_BRANCH}`)
	if (isSuccess(existing)) return true
	if (existing.status !== NOT_FOUND)
		throw refusedBy(existing, `read ${DEPLOYMENTS_BRANCH}`)
	const { parent } = await branchTip(api, event.defaultBranch)
	if (!parent) return false
	const created = await api.post('/git/refs', {
		ref: `refs/heads/${DEPLOYMENTS_BRANCH}`,
		sha: parent,
	})
	if (!isSuccess(created))
		throw refusedBy(created, `create ${DEPLOYMENTS_BRANCH}`)
	return true
}

// Opens the pull request that deployments run on, and its branch, when either is missing.
// It reads nothing of the project and answers with what it did.
export async function ensureStandingPullRequest(
	api: GitHub,
	event: PullRequestEvent,
): Promise<StandingOutcome> {
	if (await hasStandingPullRequest(api, event)) return 'open'
	if (!(await ensureBranch(api, event))) return 'single commit'
	const { base, head, title, body } = standingPullRequest(event)
	const opened = await api.post('/pulls', { base, head, title, body })
	if (opened.status === UNPROCESSABLE) return 'nothing between'
	if (!isSuccess(opened))
		throw refusedBy(opened, 'open the standing pull request')
	return 'opened'
}
