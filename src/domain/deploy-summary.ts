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

export const NOT_STANDING =
	'Nothing to deploy: only the standing pull request deploys.\n'

export const NOT_A_PROPOSAL =
	'Nothing to plan: only a pull request into the default branch proposes a deployment.\n'

// Nothing runs when a merge lands while the standing pull request is closed, so the
// first proposal that finds it missing says so where a reviewer looks.
export const STANDING_MISSING =
	'The standing pull request is missing, so a merge deploys nothing: this run opens it again. Merges that landed without it are deployed by the next one.'

const STANDING_NOTES: Record<Standing, readonly string[]> = {
	open: ['The standing pull request is open: a merge deploys.', ''],
	missing: [STANDING_MISSING, ''],
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
