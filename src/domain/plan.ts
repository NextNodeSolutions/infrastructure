import { declaredChecks, hasBuildScript } from './checks.ts'
import { decoder } from './decode.ts'
import { isExecutor } from './executor.ts'

import type { Executor } from './executor.ts'

export type Package = {
	readonly name: string
	readonly directory: string
	readonly scripts: readonly string[]
}

export type CheckEntry = {
	readonly name: string
	readonly package: string
	readonly script: string
	readonly executor: Executor
}

export type BuildPlan = {
	readonly executor: Executor
	readonly packages: readonly string[]
}

export type Plan = {
	readonly checks: readonly CheckEntry[]
	readonly build: BuildPlan | undefined
}

export function planFor(
	packages: readonly Package[],
	executor: Executor,
): Plan {
	const checks = packages.flatMap(member =>
		declaredChecks(member.scripts).map(check => ({
			name:
				executor === 'single'
					? check.label
					: `${check.label} (${member.name})`,
			package: member.name,
			script: check.script,
			executor,
		})),
	)
	const building = packages
		.filter(member => hasBuildScript(member.scripts))
		.map(member => member.name)
	return {
		checks,
		build: building.length ? { executor, packages: building } : undefined,
	}
}

export function decodeCheckEntry(parsed: unknown, source: string): CheckEntry {
	const decode = decoder(message => new Error(`${source}: ${message}`))
	const fields = decode.record(parsed, source)
	return {
		name: decode.string(fields, 'name'),
		package: decode.string(fields, 'package'),
		script: decode.string(fields, 'script'),
		executor: decodeExecutor(decode.string(fields, 'executor'), source),
	}
}

export function decodeBuildPlan(parsed: unknown, source: string): BuildPlan {
	const decode = decoder(message => new Error(`${source}: ${message}`))
	const fields = decode.record(parsed, source)
	const listed = fields.packages
	if (
		!Array.isArray(listed) ||
		!listed.every(name => typeof name === 'string')
	) {
		throw new Error(`${source}: packages must be a list of names`)
	}
	return {
		executor: decodeExecutor(decode.string(fields, 'executor'), source),
		packages: listed,
	}
}

function decodeExecutor(candidate: string, source: string): Executor {
	if (!isExecutor(candidate)) {
		throw new Error(`${source}: ${candidate} is not an executor`)
	}
	return candidate
}
