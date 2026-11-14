import type { Plan } from './plan.ts'
import type { Toolchain } from './toolchain.ts'

export type Outputs = {
	readonly node: string
	readonly checks: string
	readonly build: string
}

export const NOTHING_TO_CHECK: Outputs = {
	node: '',
	checks: '[]',
	build: '',
}

export function outputsFor(toolchain: Toolchain, plan: Plan): Outputs {
	return {
		node: String(toolchain.nodeMajor),
		checks: JSON.stringify(plan.checks),
		build: plan.build ? JSON.stringify(plan.build) : '',
	}
}
