import { runUrl } from './run.ts'

import type { Visibility } from './occasion.ts'
import type { RunAddress } from './run.ts'
import type { PublishedAs } from './subject.ts'

export const STATEMENT_PAYLOAD_TYPE = 'application/vnd.in-toto+json'

const STATEMENT_TYPE = 'https://in-toto.io/Statement/v1'
const PREDICATE_TYPE = 'https://slsa.dev/provenance/v1'
const BUILD_TYPE =
	'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1'
const BUILDER_PREFIX = 'https://github.com/actions/runner'

// What GitHub says of the run that signs, through the job variables npm reads too.
export type BuildRun = RunAddress & {
	readonly repositoryId: string
	readonly repositoryOwnerId: string
	readonly workflowRef: string
	readonly eventName: string
	readonly ref: string
	readonly sha: string
	readonly runAttempt: string
	readonly runnerEnvironment: string
}

// A signature is recorded in a public transparency log under the repository's name, and
// the registry admits a provenance statement only from a public repository.
export function hasProvenance(visibility: Visibility): boolean {
	return visibility === 'public'
}

export type SignedTarball = PublishedAs & {
	readonly sha512: string
}

// The name npm compares with the statement's subject: a scoped name escapes its `@`.
function packageUrl({ name, version }: PublishedAs): string {
	return `pkg:npm/${name.replace(/^@/, '%40')}@${version}`
}

function workflowOf(run: BuildRun): { path: string; ref: string } {
	const prefix = `${run.repository}/`
	const named = run.workflowRef.startsWith(prefix)
		? run.workflowRef.slice(prefix.length)
		: run.workflowRef
	const at = named.indexOf('@')
	if (at < 0) {
		throw new Error(
			`GITHUB_WORKFLOW_REF must name a workflow at a ref, and it is ${run.workflowRef}`,
		)
	}
	return { path: named.slice(0, at), ref: named.slice(at + 1) }
}

// The statement npm itself signs for a publication from GitHub Actions, from the same
// job variables, so the registry receives the shape it receives from npm. The
// certificate that signs it carries the same run facts, as GitHub's token states them.
export function provenanceStatement(
	tarball: SignedTarball,
	run: BuildRun,
): Record<string, unknown> {
	const source = `${run.serverUrl}/${run.repository}`
	return {
		_type: STATEMENT_TYPE,
		subject: [
			{ name: packageUrl(tarball), digest: { sha512: tarball.sha512 } },
		],
		predicateType: PREDICATE_TYPE,
		predicate: {
			buildDefinition: {
				buildType: BUILD_TYPE,
				externalParameters: {
					workflow: { ...workflowOf(run), repository: source },
				},
				internalParameters: {
					github: {
						event_name: run.eventName,
						repository_id: run.repositoryId,
						repository_owner_id: run.repositoryOwnerId,
					},
				},
				resolvedDependencies: [
					{
						uri: `git+${source}@${run.ref}`,
						digest: { gitCommit: run.sha },
					},
				],
			},
			runDetails: {
				builder: {
					id: `${BUILDER_PREFIX}/${run.runnerEnvironment}`,
				},
				metadata: {
					invocationId: `${runUrl(run)}/attempts/${run.runAttempt}`,
				},
			},
		},
	}
}
