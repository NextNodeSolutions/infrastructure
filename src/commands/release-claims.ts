import {
	hostnameHolder,
	listZones,
	recordTypesAt,
	stateBackend,
	workerTags,
} from '../adapters/cloudflare.ts'
import { reserveOwnership } from '../adapters/resource-ownership.ts'
import { declarationFile } from '../domain/deployable.ts'
import { refuseTakenHostname, zoneFor } from '../domain/hostname.ts'
import { refuseForeignWorker, withOwner } from '../domain/ownership.ts'
import { resourcePlan } from '../domain/resources.ts'

import type { Account, StateBackend } from '../adapters/cloudflare.ts'
import type { WorkerDeclaration } from '../domain/declaration.ts'
import type { Deployable } from '../domain/deployable.ts'
import type { ResourcePlan } from '../domain/resources.ts'

export type Claim = {
	readonly repository: string
	readonly repositoryId: string
	readonly deployable: Deployable
	readonly declaration: WorkerDeclaration
}

async function ownedTags(
	account: Account,
	{ repository, deployable }: Claim,
): Promise<readonly string[]> {
	const tags = await workerTags(account, deployable.name)
	refuseForeignWorker(
		{ worker: deployable.name, repository, tags },
		declarationFile(deployable.directory),
	)
	return withOwner(tags ?? [], repository)
}

async function refuseTaken(
	account: Account,
	{ deployable, declaration }: Claim,
): Promise<void> {
	const hostname = declaration.domain
	if (!hostname) return
	const worker = deployable.name
	const holder = await hostnameHolder(account, hostname)
	if (holder === worker) return
	const zone = zoneFor(hostname, await listZones(account))
	const recordTypes =
		zone && !holder ? await recordTypesAt(account, zone, hostname) : []
	refuseTakenHostname(
		{ hostname, worker, holder, zone, recordTypes },
		declarationFile(deployable.directory),
	)
}

type ClaimedWorker = {
	readonly tags: readonly string[]
	readonly backend: StateBackend
	readonly plan: ResourcePlan
}

export async function claimWorker(
	account: Account,
	claim: Claim,
): Promise<ClaimedWorker> {
	const tags = await ownedTags(account, claim)
	await refuseTaken(account, claim)
	const { deployable, declaration } = claim
	const plan = resourcePlan(deployable, declaration)
	const backend = await stateBackend(account)
	await reserveOwnership(backend, {
		owner: `${claim.repositoryId}/${deployable.name}`,
		keys: [
			`workers/${deployable.name}`,
			...(declaration.domain ? [`hostnames/${declaration.domain}`] : []),
			...plan.databases.map(database => `d1/${database.name}`),
			...plan.buckets.map(bucket => `r2/${bucket.name}`),
		],
	})
	return { tags, backend, plan }
}
