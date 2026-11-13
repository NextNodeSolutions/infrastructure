import { decoder } from '../domain/decode.ts'

import { findInPages, refusedBy } from './github-api.ts'
import { successfulPipelineDeployment } from './github-release-proof.ts'
import { fieldsOf, isSuccess, recordsOf } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { GitHub } from './github-api.ts'

// GitHub's limit for the description of a deployment status.
const LONGEST_DESCRIPTION = 140

const decode = decoder(message => new Error(`GitHub deployments: ${message}`))

function idOf(deployment: Fields): number {
	if (typeof deployment.id !== 'number')
		throw new Error('GitHub deployments: a deployment has no id')
	return deployment.id
}

async function firstSuccess(
	api: GitHub,
	deployments: readonly Fields[],
	environment: string,
): Promise<string | undefined> {
	const [deployment, ...older] = deployments
	if (!deployment) return undefined
	const commit = decode.string(deployment, 'sha')
	if (
		await successfulPipelineDeployment(api, {
			id: idOf(deployment),
			commit,
			environment,
		})
	)
		return commit
	return firstSuccess(api, older, environment)
}

// The commit of the last deployment that succeeded in an environment: the baseline of
// the next one. GitHub keeps it, so the pipeline keeps no state of its own.
export function lastDeployedCommit(
	api: GitHub,
	environment: string,
): Promise<string | undefined> {
	return findInPages(
		api,
		{
			path: `/deployments?environment=${encodeURIComponent(environment)}`,
			action: `list the deployments of ${environment}`,
			entries: reply => recordsOf(reply, 'GitHub deployments'),
		},
		deployments => firstSuccess(api, deployments, environment),
	)
}

export type DeploymentRecord = {
	readonly environment: string
	readonly commit: string
	readonly description: string
}

export async function createDeployment(
	api: GitHub,
	record: DeploymentRecord,
): Promise<number> {
	const reply = await api.post('/deployments', {
		ref: record.commit,
		environment: record.environment,
		description: record.description,
		auto_merge: false,
		required_contexts: [],
		production_environment: true,
	})
	if (!isSuccess(reply))
		throw refusedBy(reply, `record a deployment of ${record.environment}`)
	return idOf(fieldsOf(reply, 'GitHub deployments'))
}

export type DeploymentStatus = {
	readonly state: 'in_progress' | 'success' | 'failure'
	readonly description: string
	readonly logUrl: string
	readonly url: string | undefined
}

export async function reportDeployment(
	api: GitHub,
	deployment: number,
	status: DeploymentStatus,
): Promise<void> {
	const reply = await api.post(`/deployments/${deployment}/statuses`, {
		state: status.state,
		description: status.description.slice(0, LONGEST_DESCRIPTION),
		log_url: status.logUrl,
		environment_url: status.url,
	})
	if (!isSuccess(reply))
		throw refusedBy(reply, `report the deployment as ${status.state}`)
}
