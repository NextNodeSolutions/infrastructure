import { requiredVariable, takeVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { gitHub } from '../adapters/github-api.ts'
import { writeOutputs, writeSummary } from '../adapters/github.ts'
import { programRevision } from '../adapters/program-directory.ts'
import { deployOutputs, NOTHING_TO_DEPLOY } from '../domain/deploy-outputs.ts'
import { NOTHING_DECLARED, renderRelease } from '../domain/deploy-summary.ts'
import { refuseUnlessStanding } from '../domain/occasion.ts'

import { survey } from './deploy-survey.ts'

// The job that decides what a run deploys. It reads the project's files and runs its
// package manager, so its token only reads: what it decides is a request to the release,
// which reads the commit again before it acts.
export async function deployDiscover(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const token = takeVariable('GITHUB_TOKEN')
	const event = readPullRequestEvent()
	refuseUnlessStanding(event)
	const surveyed = await survey(project, event, gitHub(token, event))
	if (!surveyed) {
		writeOutputs(NOTHING_TO_DEPLOY)
		writeSummary(NOTHING_DECLARED)
		return
	}
	const { checkout, rows } = surveyed
	writeOutputs(
		deployOutputs({
			toolchain: checkout.toolchain,
			executor: checkout.executor,
			deployables: rows
				.filter(row => row.verdict.deploys)
				.map(row => row.deployable),
		}),
	)
	writeSummary(
		renderRelease({
			commit: event.headSha,
			rows,
			programRevision: await programRevision(),
		}),
	)
}
