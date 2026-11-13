import { decoder } from '../domain/decode.ts'

import { refusedBy } from './github-api.ts'
import { isSuccess } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { GitHub } from './github-api.ts'
import type { Reply } from './http.ts'

// How far back a deployable's history is read for a deployment that succeeded. Beyond
// it the deployable counts as never deployed, which deploys it again.
const HISTORY_DEPTH = 10
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
): Promise<string | undefined> {
	const [latest, ...older] = deployments
	if (!latest) return undefined
	const statuses = listOf(
		await api.get(`/deployments/${idOf(latest)}/statuses?per_page=1`),
		'read a deployment status',
	)
	if (statuses[0]?.state !== 'success') return firstSuccess(api, older)
	return decode.string(latest, 'sha')
}

// The commit of the last deployment that succeeded in an environment: the baseline of
// the next one. GitHub keeps it, so the pipeline keeps no state of its own.
export async function lastDeployedCommit(
	api: GitHub,
	environment: string,
): Promise<string | undefined> {
	const deployments = listOf(
		await api.get(
			`/deployments?environment=${encodeURIComponent(environment)}&per_page=${HISTORY_DEPTH}`,
		),
		`list the deployments of ${environment}`,
	)
	return firstSuccess(api, deployments)
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
