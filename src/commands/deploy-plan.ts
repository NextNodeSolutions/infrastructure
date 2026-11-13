import { requiredVariable, takeVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { gitHub } from '../adapters/github-api.ts'
import { hasStandingPullRequest } from '../adapters/github-standing.ts'
import {
	annotateWarning,
	writeOutputs,
	writeSummary,
} from '../adapters/github.ts'
import { programRevision } from '../adapters/program-directory.ts'
import { planOutputs } from '../domain/deploy-outputs.ts'
import {
	NOT_A_PROPOSAL,
	NOTHING_DECLARED,
	renderProposal,
	STANDING_MISSING,
} from '../domain/deploy-summary.ts'
import { occasionOf, opensStanding } from '../domain/occasion.ts'

import { survey } from './deploy-survey.ts'

import type { GitHub } from '../adapters/github-api.ts'
import type { Standing } from '../domain/deploy-outputs.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'

function nothing(summary: string): void {
	writeOutputs(planOutputs('not looked for'))
	writeSummary(summary)
}

async function standingOf(
	api: GitHub,
	event: PullRequestEvent,
): Promise<Standing> {
	if (!opensStanding(event)) return 'not looked for'
	return (await hasStandingPullRequest(api, event)) ? 'open' : 'missing'
}

// The job that says what a merge of a pull request would deploy, and whether the
// pull request that deployments run on is there to deploy it. It deploys nothing.
export async function deployPlan(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const token = takeVariable('GITHUB_TOKEN')
	const event = readPullRequestEvent()
	if (occasionOf(event) !== 'proposal') return nothing(NOT_A_PROPOSAL)
	const api = gitHub(token, event)
	const surveyed = await survey(project, event, api)
	if (!surveyed) return nothing(NOTHING_DECLARED)
	const standing = await standingOf(api, event)
	if (standing === 'missing') annotateWarning(STANDING_MISSING)
	writeOutputs(planOutputs(standing))
	writeSummary(
		renderProposal(
			{
				commit: event.headSha,
				rows: surveyed.rows,
				programRevision: await programRevision(),
			},
			standing,
		),
	)
}
