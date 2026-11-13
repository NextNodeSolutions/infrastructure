import { readPullRequestEvent } from '../adapters/event.ts'
import { takeGitHub } from '../adapters/github-api.ts'
import { ensureStandingPullRequest } from '../adapters/github-standing.ts'
import { writeSummary } from '../adapters/github.ts'
import { opensStanding } from '../domain/occasion.ts'

// The one job whose token writes to the repository, on a pull request nobody reviewed
// yet. It therefore checks out nothing of the project, installs nothing and runs nothing
// of it: it reads the event GitHub wrote and calls the API.
export async function deployAnchor(): Promise<void> {
	const event = readPullRequestEvent()
	const api = takeGitHub(event)
	if (!opensStanding(event)) {
		writeSummary(
			'Only a pull request that a person opened in this repository, into its default branch, opens the standing pull request.\n',
		)
		return
	}
	writeSummary(`${await ensureStandingPullRequest(api, event)}\n`)
}
