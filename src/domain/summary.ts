import { BUILD_SCRIPT, declaredChecks, hasBuildScript } from './checks.ts'

import type { Executor } from './executor.ts'
import type { Package } from './plan.ts'
import type { Selection } from './selection.ts'

export type Discovery = {
	readonly selection: Selection
	readonly executor: Executor
	readonly packages: readonly Package[]
	readonly programRevision: string
}

export const NO_MANIFEST_SUMMARY =
	'Nothing to check: the repository root holds no package.json.\n'

export function renderSummary(discovery: Discovery): string {
	const rows = discovery.packages.map(
		member =>
			`| \`${member.name}\` | \`${member.directory}\` | ${checkNames(member.scripts)} |`,
	)
	return [
		`Selected ${discovery.selection.reason}. Executor: ${discovery.executor}.`,
		'',
		'| Package | Directory | Checks |',
		'| --- | --- | --- |',
		...rows,
		'',
		`Checks program at \`${discovery.programRevision}\`.`,
		'',
	].join('\n')
}

function checkNames(scripts: readonly string[]): string {
	const names = declaredChecks(scripts).map(check => check.script)
	if (hasBuildScript(scripts)) names.push(BUILD_SCRIPT)
	return names.join(', ')
}
