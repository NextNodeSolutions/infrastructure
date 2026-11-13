import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SIGSTORE } from '../domain/platform.ts'
import {
	provenanceStatement,
	STATEMENT_PAYLOAD_TYPE,
} from '../domain/provenance.ts'

import { currentRun, requiredVariable } from './environment.ts'
import { identityToken } from './run-identity.ts'

import type { BuildRun } from '../domain/provenance.ts'
import type { PublishedAs } from '../domain/subject.ts'
import type { RunIdentity } from './run-identity.ts'

const BUNDLE_FILE = 'provenance.sigstore.json'

export type Provenance = {
	readonly file: string
	readonly logEntry: string
}

function buildRun(): BuildRun {
	return {
		...currentRun(),
		repositoryId: requiredVariable('GITHUB_REPOSITORY_ID'),
		repositoryOwnerId: requiredVariable('GITHUB_REPOSITORY_OWNER_ID'),
		workflowRef: requiredVariable('GITHUB_WORKFLOW_REF'),
		eventName: requiredVariable('GITHUB_EVENT_NAME'),
		ref: requiredVariable('GITHUB_REF'),
		sha: requiredVariable('GITHUB_SHA'),
		runAttempt: requiredVariable('GITHUB_RUN_ATTEMPT'),
		runnerEnvironment: requiredVariable('RUNNER_ENVIRONMENT'),
	}
}

function sha512Of(file: string): string {
	return createHash('sha512').update(readFileSync(file)).digest('hex')
}

// The program signs, so the token that names the run to Sigstore reaches no tool: npm
// receives the finished bundle and checks it against the tarball before it publishes.
export async function signProvenance(
	tarball: string,
	published: PublishedAs,
	identity: RunIdentity,
	scratch: string,
): Promise<Provenance> {
	const statement = provenanceStatement(
		{ ...published, sha512: sha512Of(tarball) },
		buildRun(),
	)
	const { attest } = await import('sigstore')
	const bundle = await attest(
		Buffer.from(JSON.stringify(statement)),
		STATEMENT_PAYLOAD_TYPE,
		{
			identityToken: await identityToken(identity, SIGSTORE.audience),
			fulcioURL: SIGSTORE.certificates,
			rekorURL: SIGSTORE.transparencyLog,
		},
	)
	const file = join(scratch, BUNDLE_FILE)
	writeFileSync(file, JSON.stringify(bundle))
	const [entry] = bundle.verificationMaterial.tlogEntries
	if (!entry) {
		throw new Error(
			'Sigstore signed the provenance and recorded it in no transparency log',
		)
	}
	return { file, logEntry: `${SIGSTORE.search}?logIndex=${entry.logIndex}` }
}
