import { short } from './deploy-selection.ts'

import type { Standing } from './deploy-outputs.ts'
import type { Verdict } from './deploy-selection.ts'
import type { Deployable } from './deployable.ts'

export type PlanRow = {
	readonly deployable: Deployable
	readonly verdict: Verdict
}

export type Plan = {
	readonly commit: string
	readonly rows: readonly PlanRow[]
	readonly programRevision: string
}

export const NOTHING_DECLARED =
	'Nothing to deploy: the repository holds no nextnode.toml.\n'

export const NOT_A_PROPOSAL =
	'Nothing to plan: only a pull request into the default branch proposes a deployment.\n'

// The pull request that deployments run on, said on every proposal: when it is missing,
// merges deploy nothing until it is open again.
const STANDING_NOTES: Record<Standing, readonly string[]> = {
	open: ['The standing pull request is open: a merge deploys.', ''],
	missing: [
		'The standing pull request is missing, so a merge would deploy nothing: this run opens it again.',
		'',
	],
	'not looked for': [],
}

function render(heading: string, plan: Plan, notes: readonly string[]): string {
	const rows = plan.rows.map(
		({ deployable, verdict }) =>
			`| \`${deployable.name}\` | ${deployable.kind} | \`${deployable.directory}\` | ${verdict.deploys ? 'yes' : 'no'} | ${verdict.reason} |`,
	)
	return [
		heading,
		'',
		'| Deployable | Kind | Directory | Deploys | Why |',
		'| --- | --- | --- | --- | --- |',
		...rows,
		'',
		...notes,
		`Deploy program at \`${plan.programRevision}\`.`,
		'',
	].join('\n')
}

export function renderProposal(plan: Plan, standing: Standing): string {
	return render(
		`Plan for \`${short(plan.commit)}\`: what a merge of this pull request deploys.`,
		plan,
		STANDING_NOTES[standing],
	)
}

export function renderRelease(plan: Plan): string {
	return render(`Deploying \`${short(plan.commit)}\`.`, plan, [])
}

export type Fact = readonly [label: string, value: string]

export type Released = {
	readonly name: string
	readonly url: string
	readonly facts: readonly Fact[]
}

export function renderReleased(released: Released): string {
	return [
		`### Deployed \`${released.name}\``,
		'',
		'| | |',
		'| --- | --- |',
		...released.facts.map(([label, value]) => `| ${label} | ${value} |`),
		'',
	].join('\n')
}

export function renderFailure(name: string, cause: string): string {
	return [
		`### \`${name}\` was not deployed`,
		'',
		cause,
		'',
		'What already serves keeps serving. Fix the cause and merge the fix, or re-run the failed jobs of this run: both deploy everything since the last deployment that succeeded.',
		'',
	].join('\n')
}
