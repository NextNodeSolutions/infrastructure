import { decoder } from '../domain/decode.ts'

import { anyInPages, refusedBy } from './github-api.ts'
import { fieldsOf, isSuccess, NOT_FOUND, recordsOf } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { GitHub } from './github-api.ts'

// The workflow file and the name its Release job takes per deployable: a run proves a
// release only through these two, so they change together with deploy.yml.
const DEPLOY_WORKFLOW = '.github/workflows/deploy.yml'
const releaseJob = (environment: string): string => `Release ${environment}`
const RUN_ID = /\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?$/
const decode = decoder(message => new Error(`GitHub release proof: ${message}`))

type ReleaseProof = {
	readonly commit: string
	readonly environment: string
	readonly logUrl: string
}

// Every attempt of the run: a re-run lists only its own jobs unless asked for all, and
// the attempt that released may be an earlier one.
async function hasSuccessfulRelease(
	api: GitHub,
	run: string,
	environment: string,
): Promise<boolean> {
	return anyInPages(
		api,
		{
			path: `/actions/runs/${run}/jobs?filter=all`,
			action: 'verify release jobs',
			entries: reply =>
				decode.records(fieldsOf(reply, 'release jobs'), 'jobs'),
		},
		jobs =>
			jobs.some(
				job =>
					job.name === releaseJob(environment) &&
					job.conclusion === 'success',
			),
	)
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
): Promise<boolean> {
	return anyInPages(
		api,
		{
			path: `/deployments/${record.id}/statuses`,
			action: 'read deployment statuses',
			entries: reply => recordsOf(reply, 'GitHub release proof'),
		},
		statuses => hasReleaseProof(api, record, statuses),
	)
}
