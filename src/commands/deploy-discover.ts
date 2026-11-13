import { join } from 'node:path'

import {
	declaringDirectories,
	readCheckout,
	readSubject,
} from '../adapters/checkout.ts'
import { requiredVariable, takeVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { hasFile } from '../adapters/files.ts'
import { gitHub } from '../adapters/github-api.ts'
import { hasStandingPullRequest } from '../adapters/github-standing.ts'
import { writeOutputs, writeSummary } from '../adapters/github.ts'
import {
	leaveProjectTree,
	programRevision,
} from '../adapters/program-directory.ts'
import { installDependencies } from '../adapters/program-install.ts'
import { NEXTNODE_FILE } from '../domain/declaration.ts'
import { deployOutputs, NOTHING_TO_DEPLOY } from '../domain/deploy-outputs.ts'
import {
	NOT_A_DEPLOYMENT,
	NOTHING_DECLARED,
	renderPlan,
} from '../domain/deploy-summary.ts'
import { MANIFEST_FILE } from '../domain/manifest.ts'
import { occasionOf, opensStanding } from '../domain/occasion.ts'
import { Refusal } from '../domain/refusal.ts'

import { planRows } from './deploy-verdicts.ts'

import type { GitHub } from '../adapters/github-api.ts'
import type { Standing } from '../domain/deploy-outputs.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'

function nothing(summary: string): void {
	writeOutputs(NOTHING_TO_DEPLOY)
	writeSummary(summary)
}

// The job that decides what a run deploys. It reads the project's files and runs its
// package manager, so its token only reads: what it decides is a request to the release,
// which reads the commit again before it acts.
export async function deployDiscover(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const token = takeVariable('GITHUB_TOKEN')
	const event = readPullRequestEvent()
	const occasion = occasionOf(event)
	const programRoot = leaveProjectTree(project)
	if (occasion === 'elsewhere') return nothing(NOT_A_DEPLOYMENT)
	if (!hasManifest(project)) return nothing(NOTHING_DECLARED)
	const checkout = readCheckout(project)
	const directories = await declaringDirectories(checkout)
	if (!directories.length) return nothing(NOTHING_DECLARED)
	await installDependencies(programRoot, 'parsing')
	const subjects = await Promise.all(
		directories.map(directory =>
			readSubject(project, event.repository, directory),
		),
	)
	const api = gitHub(token, event)
	const rows = await planRows(subjects, {
		api,
		checkout,
		headSha: event.headSha,
	})
	const standing = await standingOf(api, event)
	writeOutputs(
		deployOutputs({
			toolchain: checkout.toolchain,
			executor: checkout.executor,
			deployables: rows
				.filter(row => occasion === 'release' && row.verdict.deploys)
				.map(row => row.deployable),
			standing,
		}),
	)
	writeSummary(
		renderPlan({
			occasion,
			commit: event.headSha,
			rows,
			standing,
			programRevision: await programRevision(programRoot),
		}),
	)
}

function hasManifest(project: string): boolean {
	if (hasFile(join(project, MANIFEST_FILE))) return true
	if (!hasFile(join(project, NEXTNODE_FILE))) return false
	throw new Refusal(
		NEXTNODE_FILE,
		`${NEXTNODE_FILE}: a repository that deploys needs a ${MANIFEST_FILE} at its root, with packageManager and engines.node`,
	)
}

async function standingOf(
	api: GitHub,
	event: PullRequestEvent,
): Promise<Standing> {
	if (!opensStanding(event)) return 'not looked for'
	return (await hasStandingPullRequest(api, event)) ? 'open' : 'missing'
}
