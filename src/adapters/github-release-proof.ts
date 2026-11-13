import { decoder } from '../domain/decode.ts'

import { refusedBy } from './github-api.ts'
import { fieldsOf, isSuccess, NOT_FOUND } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { GitHub } from './github-api.ts'

const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml'
const JOBS_PER_PAGE = 100
const RUN_ID = /\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?$/
const decode = decoder(message => new Error(`GitHub release proof: ${message}`))

type ReleaseProof = {
	readonly commit: string
	readonly environment: string
	readonly logUrl: string
}

async function hasSuccessfulRelease(
	api: GitHub,
	run: string,
	environment: string,
	page = 1,
): Promise<boolean> {
	const reply = await api.get(
		`/actions/runs/${run}/jobs?per_page=${JOBS_PER_PAGE}&page=${page}`,
	)
	if (!isSuccess(reply)) throw refusedBy(reply, 'verify release jobs')
	const jobs = decode.records(fieldsOf(reply, 'release jobs'), 'jobs')
	if (
		jobs.some(
			job =>
				job.name === `Release ${environment}` &&
				job.conclusion === 'success',
		)
	)
		return true
	if (jobs.length < JOBS_PER_PAGE) return false
	return hasSuccessfulRelease(api, run, environment, page + 1)
}

async function wasReleasedByPipeline(
	api: GitHub,
	proof: ReleaseProof,
): Promise<boolean> {
	const runId = RUN_ID.exec(proof.logUrl)?.[1]
	if (!runId) return false
	const reply = await api.get(`/actions/runs/${runId}`)
	if (reply.status === NOT_FOUND) return false
	if (!isSuccess(reply)) throw refusedBy(reply, 'verify a release run')
	const run = fieldsOf(reply, 'release run')
	const workflowId = run.workflow_id
	if (
		typeof workflowId !== 'number' ||
		run.event !== 'pull_request' ||
		run.path !== DEPLOY_WORKFLOW ||
		run.head_sha !== proof.commit
	)
		return false
	const requiredWorkflow = decode
		.string(run, 'url')
		.replace(/\/runs\/\d+$/, `/required_workflows/${workflowId}`)
	if (run.workflow_url !== requiredWorkflow) return false
	return hasSuccessfulRelease(api, runId, proof.environment)
}

type RecordedRelease = Omit<ReleaseProof, 'logUrl'> & { readonly id: number }

async function hasReleaseProof(
	api: GitHub,
	record: RecordedRelease,
	statuses: readonly Fields[],
): Promise<boolean> {
	const [status, ...older] = statuses
	if (!status) return false
	if (
		status.state === 'success' &&
		(await wasReleasedByPipeline(api, {
			...record,
			logUrl: decode.string(status, 'log_url'),
		}))
	)
		return true
	return hasReleaseProof(api, record, older)
}

export async function successfulPipelineDeployment(
	api: GitHub,
	record: RecordedRelease,
	page = 1,
): Promise<boolean> {
	const reply = await api.get(
		`/deployments/${record.id}/statuses?per_page=${JOBS_PER_PAGE}&page=${page}`,
	)
	if (!isSuccess(reply)) throw refusedBy(reply, 'read deployment statuses')
	const parsed: unknown = JSON.parse(reply.text)
	const statuses = decode.records({ statuses: parsed }, 'statuses')
	if (await hasReleaseProof(api, record, statuses)) return true
	if (statuses.length < JOBS_PER_PAGE) return false
	return successfulPipelineDeployment(api, record, page + 1)
}
