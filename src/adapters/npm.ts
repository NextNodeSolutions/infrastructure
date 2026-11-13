import { printPackedManifest } from '../domain/deploy-commands.ts'
import { decodeManifest } from '../domain/manifest.ts'
import { NPM_REGISTRY } from '../domain/platform.ts'

import { onlyVariables } from './environment.ts'
import { isSuccess, NOT_FOUND, send } from './http.ts'
import { capture } from './processes.ts'

import type { Manifest } from '../domain/manifest.ts'
import type { PublishedAs } from '../domain/subject.ts'
import type { ToolEnvironment } from './environment.ts'
import type { RunIdentity } from './vault.ts'

// What npm reads to know it runs in a GitHub Actions job and to sign where the package
// came from. The job's own token is not among them.
const RUN_DESCRIPTION = [
	'PATH',
	'HOME',
	'CI',
	'GITHUB_ACTIONS',
	'GITHUB_EVENT_NAME',
	'GITHUB_REF',
	'GITHUB_REPOSITORY',
	'GITHUB_REPOSITORY_ID',
	'GITHUB_REPOSITORY_OWNER_ID',
	'GITHUB_RUN_ATTEMPT',
	'GITHUB_RUN_ID',
	'GITHUB_SERVER_URL',
	'GITHUB_SHA',
	'GITHUB_WORKFLOW_REF',
	'RUNNER_ENVIRONMENT',
]

const PACKED_MANIFEST = 'the package.json of the tarball'

// What a tarball says it is. A build ran the project's code, so the release asks before
// it publishes.
export async function packedManifest(
	tarball: string,
	cwd: string,
): Promise<Manifest> {
	const printed = await capture(printPackedManifest(tarball), cwd)
	const parsed: unknown = JSON.parse(printed)
	return decodeManifest(parsed, PACKED_MANIFEST)
}

// npm publishes with no stored token: it asks GitHub for a token that names the run and
// trades it at the registry, which accepts it for the packages that trust this workflow.
export function publishEnvironment(identity: RunIdentity): ToolEnvironment {
	return {
		...onlyVariables(RUN_DESCRIPTION),
		ACTIONS_ID_TOKEN_REQUEST_URL: identity.url,
		ACTIONS_ID_TOKEN_REQUEST_TOKEN: identity.token,
	}
}

// Asked without a credential: a restricted package answers as if it had no version, so
// its publication is decided by the registry when it refuses a version it already has.
export async function hasVersion(published: PublishedAs): Promise<boolean> {
	const name = published.name.replace('/', '%2F')
	const reply = await send({
		method: 'GET',
		url: `${NPM_REGISTRY}/${name}/${encodeURIComponent(published.version)}`,
		headers: { accept: 'application/json' },
	})
	if (reply.status === NOT_FOUND) return false
	if (isSuccess(reply)) return true
	throw new Error(
		`The npm registry did not say whether ${published.name}@${published.version} exists (HTTP ${reply.status})`,
	)
}
