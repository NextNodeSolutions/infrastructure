import {
	hostnameHolder,
	listZones,
	recordTypesAt,
	stateBackend,
	workerTags,
} from '../adapters/cloudflare.ts'
import { isClaimed, reserveOwnership } from '../adapters/resource-ownership.ts'
import { declarationFile } from '../domain/deployable.ts'
import { refuseTakenHostname, zoneFor } from '../domain/hostname.ts'
import {
	ownershipOf,
	refuseWorkerNotHandedOver,
	withOwner,
	workerClaimKey,
} from '../domain/ownership.ts'

import type { Account } from '../adapters/cloudflare-api.ts'
import type { StateBackend } from '../adapters/cloudflare.ts'
import type { WorkerDeclaration } from '../domain/declaration.ts'
import type { Deployable } from '../domain/deployable.ts'
import type { ResourcePlan } from '../domain/resources.ts'

export type Claim = {
	readonly repository: string
	readonly repositoryId: string
	readonly deployable: Deployable
	readonly declaration: WorkerDeclaration
	readonly plan: ResourcePlan
}

async function refuseTakeover(
	backend: StateBackend,
	{ repository, deployable }: Claim,
	tags: readonly string[] | undefined,
): Promise<void> {
	if (!tags || (await isClaimed(backend, workerClaimKey(deployable.name)))) {
		return
	}
	refuseWorkerNotHandedOver(
		{ worker: deployable.name, repository, tags },
		declarationFile(deployable.directory),
	)
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
}

export async function claimWorker(
	account: Account,
	claim: Claim,
): Promise<ClaimedWorker> {
	const { repository, deployable, declaration, plan } = claim
	const tags = await workerTags(account, deployable.name)
	await refuseTaken(account, claim)
	const backend = await stateBackend(account)
	// Checked before the reservation, so that a refused release leaves no claim behind.
	await refuseTakeover(backend, claim, tags)
	await reserveOwnership(
		backend,
		ownershipOf({
			repositoryId: claim.repositoryId,
			worker: deployable.name,
			hostname: declaration.domain,
			plan,
		}),
		declarationFile(deployable.directory),
	)
	return { tags: withOwner(tags ?? [], repository), backend }
}
