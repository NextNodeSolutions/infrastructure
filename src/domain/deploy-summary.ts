import { short } from './deploy-selection.ts'
import { markdownTable } from './markdown-table.ts'

import type { WorkerDeclaration } from './declaration.ts'
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
	const rows = plan.rows.map(({ deployable, verdict }) => [
		`\`${deployable.name}\``,
		deployable.kind,
		`\`${deployable.directory}\``,
		verdict.deploys ? 'yes' : 'no',
		verdict.reason,
	])
	return [
		heading,
		'',
		...markdownTable(
			['Deployable', 'Kind', 'Directory', 'Deploys', 'Why'],
			rows,
		),
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

function renderFacts(heading: string, facts: readonly Fact[]): string {
	return [heading, '', ...markdownTable(['', ''], facts), ''].join('\n')
}

export function renderReleased(released: Released): string {
	return renderFacts(`### Deployed \`${released.name}\``, released.facts)
}

// What a Worker's build leaves for its release, read from the declaration it staged.
export function stagedWorker(declaration: WorkerDeclaration): readonly Fact[] {
	const { main, assets, databases } = declaration
	const code: readonly Fact[] = main
		? [['Code', `\`${main}\` bundled by Wrangler`]]
		: []
	const files: readonly Fact[] = assets
		? [['Assets', `\`${assets.directory}\``]]
		: []
	const migrations = databases.flatMap(
		({ binding, migrationsDirectory }): readonly Fact[] =>
			migrationsDirectory
				? [
						[
							`Migrations of \`${binding}\``,
							`\`${migrationsDirectory}\``,
						],
					]
				: [],
	)
	return [...code, ...files, ...migrations]
}

export function renderBuilt(name: string, staged: readonly Fact[]): string {
	return [
		renderFacts(`### Built \`${name}\``, staged),
		'The Release job of this run uploads these files as they are.',
		'',
	].join('\n')
}

export type FailedJob = 'build' | 'release'

const FAILURES: Record<FailedJob, { outcome: string; next: string }> = {
	build: {
		outcome: 'was not built',
		next: 'This run releases nothing of it, and the other deployables go on. Fix the build and merge the fix, or re-run the failed jobs of this run when the cause was transient.',
	},
	release: {
		outcome: 'was not deployed',
		next: 'The last deployment that succeeded stays the baseline. Fix the cause and merge the fix, or re-run the failed jobs of this run: both deploy everything since that deployment.',
	},
}

export function renderFailure(
	job: FailedJob,
	name: string,
	cause: string,
): string {
	const { outcome, next } = FAILURES[job]
	return [`### \`${name}\` ${outcome}`, '', cause, '', next, ''].join('\n')
}
