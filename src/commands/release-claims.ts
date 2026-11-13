import {
	hostnameHolder,
	listZones,
	recordTypesAt,
	workerTags,
} from '../adapters/cloudflare.ts'
import { declarationFile } from '../domain/deployable.ts'
import { refuseTakenHostname, zoneFor } from '../domain/hostname.ts'
import { refuseForeignWorker, withOwner } from '../domain/ownership.ts'

import type { Account } from '../adapters/cloudflare.ts'
import type { WorkerDeclaration } from '../domain/declaration.ts'
import type { Deployable } from '../domain/deployable.ts'

export type Claim = {
	readonly repository: string
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

// What a release settles before it provisions anything: the Worker's name and its
// hostname are free or already this deployable's. It answers the tags the Worker carries
// once uploaded, which keep the ones it had.
export async function claimWorker(
	account: Account,
	claim: Claim,
): Promise<readonly string[]> {
	const tags = await ownedTags(account, claim)
	await refuseTaken(account, claim)
	return tags
}
