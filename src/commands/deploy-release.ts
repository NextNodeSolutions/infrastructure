import { join } from 'node:path'

import { refuseAnythingButFiles } from '../adapters/artifact-files.ts'
import { requiredVariable, takeVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { gitHub, readFileAt } from '../adapters/github-api.ts'
import {
	createDeployment,
	reportDeployment,
} from '../adapters/github-deployments.ts'
import { writeSummary } from '../adapters/github.ts'
import { programRoot } from '../adapters/program-directory.ts'
import { installDependencies } from '../adapters/program-install.ts'
import { parseToml } from '../adapters/toml.ts'
import { short } from '../domain/deploy-selection.ts'
import { renderFailure, renderReleased } from '../domain/deploy-summary.ts'
import { declarationFile, decodeDeployEntry } from '../domain/deployable.ts'
import { occasionOf } from '../domain/occasion.ts'
import { manifestFile, subjectOf } from '../domain/subject.ts'

import { releasePackage } from './release-package.ts'
import { releaseWorker } from './release-worker.ts'

import type { GitHub } from '../adapters/github-api.ts'
import type { DeploymentStatus } from '../adapters/github-deployments.ts'
import type { Released } from '../domain/deploy-summary.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'
import type { Subject } from '../domain/subject.ts'

const DEPLOYABLE = 'DEPLOYABLE'
const ARTIFACT_DIRECTORY = 'ARTIFACT'

// The job that holds the credentials. It runs nothing of the project and checks out
// nothing of it: it takes the directory it is asked to release as a request, reads that
// directory's declaration from the commit through the API, and uploads the files the
// build left. It releases the standing pull request and refuses every other.
export async function deployRelease(): Promise<void> {
	const workspace = requiredVariable('GITHUB_WORKSPACE')
	const token = takeVariable('GITHUB_TOKEN')
	const identity = {
		url: takeVariable('ACTIONS_ID_TOKEN_REQUEST_URL'),
		token: takeVariable('ACTIONS_ID_TOKEN_REQUEST_TOKEN'),
	}
	const event = readPullRequestEvent()
	if (occasionOf(event) !== 'release') {
		throw new Error(
			`Only the standing pull request releases: this one targets ${event.baseRef} and releases nothing`,
		)
	}
	const requested = decodeDeployEntry(
		JSON.parse(requiredVariable(DEPLOYABLE)),
		DEPLOYABLE,
	)
	const root = programRoot()
	await installDependencies(root, 'parsing')
	const api = gitHub(token, event)
	const subject = await committedSubject(api, event, requested.directory)
	const { name } = subject.deployable
	if (name !== requested.name) {
		throw new Error(
			`The commit deploys ${requested.directory} as ${name}, and this job was asked for ${requested.name}`,
		)
	}
	const artifact = join(workspace, requiredVariable(ARTIFACT_DIRECTORY))
	refuseAnythingButFiles(artifact)
	const context = {
		repository: event.repository,
		root,
		artifact,
		identity,
		commit: event.headSha,
	}
	const { declaration } = subject
	await recorded(api, { name, commit: event.headSha }, () =>
		declaration.kind === 'package'
			? releasePackage(subject, declaration, context)
			: releaseWorker(subject, declaration, context),
	)
}

async function committedSubject(
	api: GitHub,
	event: PullRequestEvent,
	directory: string,
): Promise<Subject> {
	const file = declarationFile(directory)
	const [toml, manifest] = await Promise.all([
		readFileAt(api, file, event.headSha),
		readFileAt(api, manifestFile(directory), event.headSha),
	])
	const parsedManifest: unknown = JSON.parse(manifest)
	return subjectOf(event.repository, directory, {
		toml: await parseToml(toml, file),
		manifest: parsedManifest,
	})
}

type Recorded = {
	readonly name: string
	readonly commit: string
}

type Outcome = Pick<DeploymentStatus, 'state' | 'description' | 'url'>

function runUrl(): string {
	return `${requiredVariable('GITHUB_SERVER_URL')}/${requiredVariable('GITHUB_REPOSITORY')}/actions/runs/${requiredVariable('GITHUB_RUN_ID')}`
}

// GitHub keeps the record: the environment named after the deployable shows what serves,
// and its last success is the commit the next run compares with.
async function recorded(
	api: GitHub,
	{ name, commit }: Recorded,
	release: () => Promise<Released>,
): Promise<void> {
	const logUrl = runUrl()
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
		const cause =
			failure instanceof Error ? failure.message : String(failure)
		await report({ state: 'failure', description: cause, url: undefined })
		writeSummary(renderFailure(name, cause))
		throw failure
	}
}
