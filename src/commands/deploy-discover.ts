import { requiredVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { takeGitHub } from '../adapters/github-api.ts'
import { writeOutputs, writeSummary } from '../adapters/github.ts'
import { programRevision } from '../adapters/program-directory.ts'
import { deployOutputs, NOTHING_TO_DEPLOY } from '../domain/deploy-outputs.ts'
import {
	NOT_STANDING,
	NOTHING_DECLARED,
	renderRelease,
} from '../domain/deploy-summary.ts'
import { occasionOf } from '../domain/occasion.ts'

import { survey } from './deploy-survey.ts'

// The job that decides what a run deploys. It reads the project's files and runs its
// package manager, so its token only reads: what it decides is a request to the release,
// which reads the commit again before it acts. A pull request that is not the standing
// one asks for nothing, so the run ends green with no build and no release.
export async function deployDiscover(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const event = readPullRequestEvent()
	const api = takeGitHub(event)
	if (occasionOf(event) !== 'release') {
		writeOutputs(NOTHING_TO_DEPLOY)
		writeSummary(NOT_STANDING)
		return
	}
	const surveyed = await survey(project, event, api)
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
