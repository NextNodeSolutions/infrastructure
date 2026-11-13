import { short } from './deploy-selection.ts'

import type { Standing } from './deploy-outputs.ts'
import type { Verdict } from './deploy-selection.ts'
import type { Deployable } from './deployable.ts'
import type { Occasion } from './occasion.ts'

export type PlanRow = {
	readonly deployable: Deployable
	readonly verdict: Verdict
}

export type Plan = {
	readonly occasion: Occasion
	readonly commit: string
	readonly rows: readonly PlanRow[]
	readonly standing: Standing
	readonly programRevision: string
}

export const NOTHING_DECLARED =
	'Nothing to deploy: the repository holds no nextnode.toml.\n'

export const NOT_A_DEPLOYMENT =
	'Nothing to deploy: this pull request does not target the default branch.\n'

const HEADINGS: Record<Occasion, (commit: string) => string> = {
	proposal: commit =>
		`Plan for \`${short(commit)}\`: what a merge of this pull request deploys.`,
	release: commit => `Deploying \`${short(commit)}\`.`,
	elsewhere: () => NOT_A_DEPLOYMENT,
}

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

export function renderPlan(plan: Plan): string {
	const rows = plan.rows.map(
		({ deployable, verdict }) =>
			`| \`${deployable.name}\` | ${deployable.kind} | \`${deployable.directory}\` | ${verdict.deploys ? 'yes' : 'no'} | ${verdict.reason} |`,
	)
	return [
		HEADINGS[plan.occasion](plan.commit),
		'',
		'| Deployable | Kind | Directory | Deploys | Why |',
		'| --- | --- | --- | --- | --- |',
		...rows,
		'',
		...STANDING_NOTES[plan.standing],
		`Deploy program at \`${plan.programRevision}\`.`,
		'',
	].join('\n')
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
