import { refuseAnythingButFiles } from '../adapters/artifact-files.ts'
import { currentRun, requiredVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { branchTip, takeGitHub } from '../adapters/github-api.ts'
import {
	createDeployment,
	reportDeployment,
} from '../adapters/github-deployments.ts'
import { writeSummary } from '../adapters/github.ts'
import { installDependencies } from '../adapters/program-install.ts'
import { programRoot } from '../adapters/relocation.ts'
import { takeRunIdentity } from '../adapters/run-identity.ts'
import { installProfileOf } from '../domain/deploy-commands.ts'
import { short } from '../domain/deploy-selection.ts'
import { renderFailure, renderReleased } from '../domain/deploy-summary.ts'
import { refuseUnlessStanding } from '../domain/occasion.ts'
import { causeOf } from '../domain/refusal.ts'
import { runUrl } from '../domain/run.ts'

import { artifactDirectory, requestedDeployable } from './deploy-job.ts'
import { releasePackage } from './release-package.ts'
import { committedSubject } from './release-subject.ts'
import { releaseWorker } from './release-worker.ts'

import type { GitHub } from '../adapters/github-api.ts'
import type { DeploymentStatus } from '../adapters/github-deployments.ts'
import type { Released } from '../domain/deploy-summary.ts'

// The job that holds the credentials. It runs nothing of the project and checks out
// nothing of it: it takes the directory it is asked to release as a request, reads that
// directory's declaration from the commit through the API, and uploads the files the
// build left. It releases the standing pull request and refuses every other.
export async function deployRelease(): Promise<void> {
	const workspace = requiredVariable('GITHUB_WORKSPACE')
	const event = readPullRequestEvent()
	const api = takeGitHub(event)
	const identity = takeRunIdentity()
	refuseUnlessStanding(event)
	const requested = requestedDeployable()
	const root = programRoot()
	await refuseStale(
		api,
		{ name: requested.name, commit: event.headSha },
		event.defaultBranch,
	)
	await installDependencies(root, installProfileOf(requested.kind))
	const subject = await committedSubject(api, event, requested)
	const { name } = subject.deployable
	const artifact = artifactDirectory(workspace)
	refuseAnythingButFiles(artifact)
	const context = { event, root, artifact, identity }
	const { declaration } = subject
	await recorded(api, { name, commit: event.headSha }, () =>
		declaration.kind === 'package'
			? releasePackage(subject, declaration, context)
			: releaseWorker(subject, declaration, context),
	)
}

type Recorded = {
	readonly name: string
	readonly commit: string
}

type Outcome = Pick<DeploymentStatus, 'state' | 'description' | 'url'>

async function refuseStale(
	api: GitHub,
	{ name, commit }: Recorded,
	branch: string,
): Promise<void> {
	const { commit: current } = await branchTip(api, branch)
	if (current === commit) return
	const cause = `${name}: this run holds ${short(commit)}, but ${branch} now holds ${short(current)}. Run the latest deployment instead; this run releases nothing`
	writeSummary(renderFailure('release', name, cause))
	throw new Error(cause)
}

// GitHub keeps the record: the environment named after the deployable shows what serves,
// and its last success is the commit the next run compares with.
async function recorded(
	api: GitHub,
	{ name, commit }: Recorded,
	release: () => Promise<Released>,
): Promise<void> {
	const logUrl = runUrl(currentRun())
	const at = short(commit)
	const deployment = await createDeployment(api, {
		environment: name,
		commit,
		description: `Deploy ${at}`,
	})
	const report = (outcome: Outcome): Promise<void> =>
		reportDeployment(api, deployment, { ...outcome, logUrl })
	await report({
		state: 'in_progress',
		description: `Deploying ${at}`,
		url: undefined,
	})
	try {
		const released = await release()
		await report({
			state: 'success',
			description: `Deployed ${at}`,
			url: released.url,
		})
		writeSummary(renderReleased(released))
	} catch (failure: unknown) {
		const cause = causeOf(failure)
		await report({ state: 'failure', description: cause, url: undefined })
		writeSummary(renderFailure('release', name, cause))
		throw failure
	}
}
