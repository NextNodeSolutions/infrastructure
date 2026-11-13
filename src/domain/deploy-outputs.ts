import type { Deployable, DeployEntry } from './deployable.ts'
import type { Executor } from './executor.ts'
import type { Toolchain } from './toolchain.ts'

// Whether the pull request that deployments run on is open. Nobody looks for it on a
// run whose token could not open it.
export type Standing = 'open' | 'missing' | 'not looked for'

export type DeployOutputs = {
	readonly node: string
	readonly builds: string
	readonly anchor: string
}

export type Deploying = {
	readonly toolchain: Toolchain
	readonly executor: Executor
	readonly deployables: readonly Deployable[]
	readonly standing: Standing
}

export const NOTHING_TO_DEPLOY: DeployOutputs = {
	node: '',
	builds: '[]',
	anchor: '',
}

const ANCHOR_NEEDED = 'true'

function entryFor(deployable: Deployable, executor: Executor): DeployEntry {
	return { ...deployable, executor }
}

export function deployOutputs(deploying: Deploying): DeployOutputs {
	const entries = deploying.deployables.map(deployable =>
		entryFor(deployable, deploying.executor),
	)
	return {
		node: String(deploying.toolchain.nodeMajor),
		builds: JSON.stringify(entries),
		anchor: deploying.standing === 'missing' ? ANCHOR_NEEDED : '',
	}
}
