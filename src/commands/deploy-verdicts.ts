import { hasChangesIn, relationToHead } from '../adapters/git.ts'
import { lastDeployedCommit } from '../adapters/github-deployments.ts'
import { hasVersion } from '../adapters/npm.ts'
import { listWorkspace } from '../adapters/pnpm.ts'
import { changedSince } from '../domain/deploy-commands.ts'
import {
	NEVER_DEPLOYED,
	verdictFor,
	withPublication,
} from '../domain/deploy-selection.ts'
import { ROOT_FILES } from '../domain/selection.ts'
import { publishedAs } from '../domain/subject.ts'

import type { Checkout } from '../adapters/checkout.ts'
import type { GitHub } from '../adapters/github-api.ts'
import type { Changed, Since, Verdict } from '../domain/deploy-selection.ts'
import type { PlanRow } from '../domain/deploy-summary.ts'
import type { Subject } from '../domain/subject.ts'

export type Evidence = {
	readonly api: GitHub
	readonly checkout: Checkout
	readonly headSha: string
}

type Changes = (deployed: string) => Promise<Changed>

// One listing per deployed commit: the deployables of a repository mostly share theirs.
function changesSince({ project, executor, toolchain }: Checkout): Changes {
	const asked = new Map<string, Promise<Changed>>()
	const ask: Changes = async deployed => {
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
	return deployed => {
		const answer = asked.get(deployed) ?? ask(deployed)
		asked.set(deployed, answer)
		return answer
	}
}

async function sinceOf(
	deployed: string,
	evidence: Evidence,
	changes: Changes,
): Promise<Since> {
	const relation = await relationToHead(
		deployed,
		evidence.headSha,
		evidence.checkout.project,
	)
	if (relation !== 'older') return { relation }
	return { relation, changed: await changes(deployed) }
}

async function verdictOf(
	subject: Subject,
	evidence: Evidence,
	changes: Changes,
): Promise<Verdict> {
	const { deployable } = subject
	const deployed = await lastDeployedCommit(evidence.api, deployable.name)
	const verdict = deployed
		? verdictFor(
				deployable,
				deployed,
				await sinceOf(deployed, evidence, changes),
			)
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
	const changes = changesSince(evidence.checkout)
	return Promise.all(
		subjects.map(async subject => ({
			deployable: subject.deployable,
			verdict: await verdictOf(subject, evidence, changes),
		})),
	)
}
