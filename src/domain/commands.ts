import { BUILD_SCRIPT } from './checks.ts'
import { filterArguments } from './selection.ts'

import type { Executor } from './executor.ts'
import type { BuildPlan, CheckEntry } from './plan.ts'
import type { Selection } from './selection.ts'

export type Command = {
	readonly program: string
	readonly args: readonly string[]
}

export function pnpm(...args: readonly string[]): Command {
	return { program: 'pnpm', args }
}

export const INSTALL = pnpm('install', '--frozen-lockfile')

export function listPackages(selection: Selection): Command {
	return pnpm(
		'-r',
		...filterArguments(selection),
		'ls',
		'--depth',
		'-1',
		'--json',
	)
}

const CHECK_COMMANDS: Record<
	Executor,
	(entry: CheckEntry) => readonly Command[]
> = {
	single: entry => [pnpm('run', entry.script)],
	pnpm: entry => [
		pnpm(
			'-r',
			'--if-present',
			'--filter',
			`${entry.package}^...`,
			'run',
			BUILD_SCRIPT,
		),
		pnpm('-r', '--filter', entry.package, 'run', entry.script),
	],
	turbo: entry => [
		pnpm('exec', 'turbo', 'run', entry.script, `--filter=${entry.package}`),
	],
}

const BUILD_COMMANDS: Record<
	Executor,
	(plan: BuildPlan) => readonly Command[]
> = {
	single: () => [pnpm('run', BUILD_SCRIPT)],
	pnpm: plan => [
		pnpm(
			'-r',
			'--if-present',
			...plan.packages.map(name => `--filter=${name}...`),
			'run',
			BUILD_SCRIPT,
		),
	],
	turbo: plan => [
		pnpm(
			'exec',
			'turbo',
			'run',
			BUILD_SCRIPT,
			...plan.packages.map(name => `--filter=${name}`),
		),
	],
}

export function checkCommands(entry: CheckEntry): readonly Command[] {
	return CHECK_COMMANDS[entry.executor](entry)
}

export function buildCommands(plan: BuildPlan): readonly Command[] {
	return BUILD_COMMANDS[plan.executor](plan)
}
