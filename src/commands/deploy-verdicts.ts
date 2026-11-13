import { hasChangesIn, relationToHead } from '../adapters/git.ts'
import { lastDeployedCommit } from '../adapters/github-deployments.ts'
import { hasVersion } from '../adapters/npm.ts'
import { listWorkspace } from '../adapters/pnpm.ts'
import {
	NEVER_DEPLOYED,
	verdictFor,
	withPublication,
} from '../domain/deploy-selection.ts'
import { changedSince, ROOT_FILES } from '../domain/selection.ts'
import { publishedAs } from '../domain/subject.ts'

import type { Checkout } from '../adapters/checkout.ts'
import type { GitHub } from '../adapters/github-api.ts'
import type { Changed, Since, Verdict } from '../domain/deploy-selection.ts'
import type { PlanRow } from '../domain/deploy-summary.ts'
import type { Subject } from '../domain/subject.ts'

export type Evidence = {
	readonly api: GitHub
	readonly checkout: Checkout
	readonly checkedOut: string
}

async function changesSince(
	{ project, executor, toolchain }: Checkout,
	deployed: string,
): Promise<Changed> {
	const reachesEverything =
		executor === 'single' ||
		(await hasChangesIn(deployed, ROOT_FILES, project))
	if (reachesEverything) return 'everything'
	const listing = await listWorkspace(
		project,
		toolchain.pnpmVersion,
		changedSince(deployed),
	)
	return listing.map(listed => listed.name)
}

async function sinceOf(
	deployed: string,
	{ checkout, checkedOut }: Evidence,
): Promise<Since> {
	const relation = await relationToHead(
		deployed,
		checkedOut,
		checkout.project,
	)
	if (relation !== 'older') return { relation }
	return { relation, changed: await changesSince(checkout, deployed) }
}

type SinceDeployed = (deployed: string) => Promise<Since>

// One answer per deployed commit: the deployables of a repository mostly share theirs.
function oncePerCommit(evidence: Evidence): SinceDeployed {
	const asked = new Map<string, Promise<Since>>()
	return deployed => {
		const answer = asked.get(deployed) ?? sinceOf(deployed, evidence)
		asked.set(deployed, answer)
		return answer
	}
}

async function verdictOf(
	subject: Subject,
	evidence: Evidence,
	sinceDeployed: SinceDeployed,
): Promise<Verdict> {
	const { deployable } = subject
	const deployed = await lastDeployedCommit(evidence.api, deployable.name)
	const verdict = deployed
		? verdictFor(deployable, deployed, await sinceDeployed(deployed))
		: NEVER_DEPLOYED
	if (subject.declaration.kind !== 'package') return verdict
	const published = publishedAs(subject)
	return withPublication(verdict, {
		version: published.version,
		registry: (await hasVersion(published))
			? 'has this version'
			: 'lacks this version',
	})
}

// What each deployable does at this commit, decided against the last deployment GitHub
// recorded for it and, for a package, against the registry.
export function planRows(
	subjects: readonly Subject[],
	evidence: Evidence,
): Promise<readonly PlanRow[]> {
	const sinceDeployed = oncePerCommit(evidence)
	return Promise.all(
		subjects.map(async subject => ({
			deployable: subject.deployable,
			verdict: await verdictOf(subject, evidence, sinceDeployed),
		})),
	)
}
