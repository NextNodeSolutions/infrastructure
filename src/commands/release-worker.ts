import { scratchDirectory } from '../adapters/artifact-files.ts'
import {
	accountOf,
	hostnameHolder,
	listZones,
	recordTypesAt,
	stateBackend,
} from '../adapters/cloudflare.ts'
import { inGroup } from '../adapters/github.ts'
import { waitUntilHealthy } from '../adapters/health.ts'
import { runInOrder, stream } from '../adapters/processes.ts'
import { installDependencies } from '../adapters/program-install.ts'
import { converge } from '../adapters/pulumi.ts'
import { platformCredentials } from '../adapters/vault.ts'
import { prepareWrangler, readUpload } from '../adapters/wrangler.ts'
import { applyMigrations, upload } from '../domain/deploy-commands.ts'
import { short } from '../domain/deploy-selection.ts'
import { declarationFile } from '../domain/deployable.ts'
import { refuseTakenHostname, zoneFor } from '../domain/hostname.ts'
import {
	hasResources,
	NOTHING_PROVISIONED,
	resourcePlan,
} from '../domain/resources.ts'
import { migratedDatabases, releaseConfig } from '../domain/wrangler-config.ts'

import type { Account } from '../adapters/cloudflare.ts'
import type { RunIdentity } from '../adapters/run-identity.ts'
import type { Uploaded } from '../adapters/wrangler.ts'
import type { WorkerDeclaration } from '../domain/declaration.ts'
import type { Fact, Released } from '../domain/deploy-summary.ts'
import type { PlatformCredentials } from '../domain/platform.ts'
import type { Provisioned, ResourcePlan } from '../domain/resources.ts'
import type { Subject } from '../domain/subject.ts'
import type { Release } from '../domain/wrangler-config.ts'

export type ReleaseContext = {
	readonly repository: string
	readonly root: string
	readonly artifact: string
	readonly identity: RunIdentity
	readonly commit: string
}

type Stack = {
	readonly project: string
	readonly stack: string
}

const WORKERS_DEV = /^https:\/\/\S+\.workers\.dev$/

export async function releaseWorker(
	subject: Subject,
	declaration: WorkerDeclaration,
	context: ReleaseContext,
): Promise<Released> {
	const { deployable } = subject
	await installDependencies(context.root, 'deploying')
	const credentials = await platformCredentials(context.identity)
	const account = accountOf(credentials)
	await refuseTaken(account, declaration, deployable)
	const plan = resourcePlan(deployable, declaration)
	const provisioned = await provision(
		{ project: context.repository, stack: deployable.name },
		plan,
		credentials,
	)
	const uploaded = await uploadRelease(
		{
			name: deployable.name,
			declaration,
			plan,
			provisioned,
			artifact: context.artifact,
		},
		account,
		context,
	)
	const url = addressOf(declaration, uploaded)
	const status = await waitUntilHealthy(`${url}${declaration.healthPath}`)
	return {
		name: deployable.name,
		url,
		facts: [
			['Address', url],
			['Commit', `\`${short(context.commit)}\``],
			['Version', `\`${uploaded.version}\``],
			['Health', `\`${declaration.healthPath}\` answered HTTP ${status}`],
			...resourceFacts(plan),
		],
	}
}

async function refuseTaken(
	account: Account,
	declaration: WorkerDeclaration,
	deployable: Subject['deployable'],
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

// One Pulumi project per repository, one stack per deployable.
async function provision(
	stack: Stack,
	plan: ResourcePlan,
	credentials: PlatformCredentials,
): Promise<Provisioned> {
	if (!hasResources(plan)) return NOTHING_PROVISIONED
	const backend = await stateBackend(accountOf(credentials))
	return inGroup('Provision the databases and buckets', () =>
		converge({
			...stack,
			plan,
			credentials,
			backend,
			workDirectory: scratchDirectory('pulumi'),
		}),
	)
}

async function uploadRelease(
	release: Release,
	account: Account,
	context: ReleaseContext,
): Promise<Uploaded> {
	const wrangler = prepareWrangler(
		context.root,
		scratchDirectory('wrangler'),
		releaseConfig(release),
		account,
	)
	const migrations = migratedDatabases(release).map(database =>
		applyMigrations(wrangler.program, wrangler.config, database),
	)
	await inGroup('Apply the migrations', () =>
		runInOrder(migrations, context.artifact, wrangler.environment),
	)
	await inGroup('Upload the Worker', () =>
		stream(
			upload(wrangler.program, wrangler.config, short(context.commit)),
			context.artifact,
			wrangler.environment,
		),
	)
	return readUpload(wrangler)
}

function addressOf(declaration: WorkerDeclaration, uploaded: Uploaded): string {
	if (declaration.domain) return `https://${declaration.domain}`
	const address = uploaded.targets.find(target => WORKERS_DEV.test(target))
	if (!address) throw new Error('Wrangler reported no address for the Worker')
	return address
}

function resourceFacts(plan: ResourcePlan): readonly Fact[] {
	return [
		...plan.databases.map((database): Fact => [
			`D1 \`${database.binding}\``,
			database.name,
		]),
		...plan.buckets.map((bucket): Fact => [
			`R2 \`${bucket.binding}\``,
			bucket.name,
		]),
	]
}
