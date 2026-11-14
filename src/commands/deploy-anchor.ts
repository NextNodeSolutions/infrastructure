import { readPullRequestEvent } from '../adapters/event.ts'
import { takeGitHub } from '../adapters/github-api.ts'
import { ensureStandingPullRequest } from '../adapters/github-standing.ts'
import { writeSummary } from '../adapters/github.ts'
import {
	NOT_OPENED_BY_A_PERSON,
	renderStandingOutcome,
} from '../domain/deploy-summary.ts'
import { opensStanding } from '../domain/occasion.ts'

// The one job whose token writes to the repository, on a pull request nobody reviewed
// yet. It therefore checks out nothing of the project, installs nothing and runs nothing
// of it: it reads the event GitHub wrote and calls the API.
export async function deployAnchor(): Promise<void> {
	const event = readPullRequestEvent()
	const api = takeGitHub(event)
	if (!opensStanding(event)) {
		writeSummary(NOT_OPENED_BY_A_PERSON)
		return
	}
	const outcome = await ensureStandingPullRequest(api, event)
	writeSummary(renderStandingOutcome(outcome, event.defaultBranch))
}
