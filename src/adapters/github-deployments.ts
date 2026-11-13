import { decoder } from '../domain/decode.ts'

import { refusedBy } from './github-api.ts'
import { successfulPipelineDeployment } from './github-release-proof.ts'
import { isSuccess } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { GitHub } from './github-api.ts'
import type { Reply } from './http.ts'

const DEPLOYMENTS_PER_PAGE = 100
// GitHub's limit for the description of a deployment status.
const LONGEST_DESCRIPTION = 140

const decode = decoder(message => new Error(`GitHub deployments: ${message}`))

function listOf(reply: Reply, action: string): readonly Fields[] {
	if (!isSuccess(reply)) throw refusedBy(reply, action)
	const parsed: unknown = JSON.parse(reply.text)
	return decode.records({ listed: parsed }, 'listed')
}

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
	return deployedPage(api, environment, 1)
}

async function deployedPage(
	api: GitHub,
	environment: string,
	page: number,
): Promise<string | undefined> {
	const deployments = listOf(
		await api.get(
			`/deployments?environment=${encodeURIComponent(environment)}&per_page=${DEPLOYMENTS_PER_PAGE}&page=${page}`,
		),
		`list the deployments of ${environment}`,
	)
	const commit = await firstSuccess(api, deployments, environment)
	if (commit || deployments.length < DEPLOYMENTS_PER_PAGE) return commit
	return deployedPage(api, environment, page + 1)
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
	const parsed: unknown = JSON.parse(reply.text)
	return idOf(decode.record(parsed, 'the deployment'))
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
