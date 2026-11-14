import { join } from 'node:path'

import { jsonVariable, requiredVariable } from '../adapters/environment.ts'
import { decodeDeployEntry } from '../domain/deployable.ts'

import type { RunIdentity } from '../adapters/run-identity.ts'
import type { DeployEntry } from '../domain/deployable.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'

const DEPLOYABLE = 'DEPLOYABLE'
const ARTIFACT_DIRECTORY = 'ARTIFACT'

export type ReleaseContext = {
	readonly event: PullRequestEvent
	readonly root: string
	readonly artifact: string
	readonly identity: RunIdentity
}

export function requestedDeployable(): DeployEntry {
	return decodeDeployEntry(jsonVariable(DEPLOYABLE), DEPLOYABLE)
}

// Where the build leaves the files a release uploads, inside the job's workspace.
export function artifactDirectory(workspace: string): string {
	return join(workspace, requiredVariable(ARTIFACT_DIRECTORY))
}
