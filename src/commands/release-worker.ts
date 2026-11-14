import { scratchDirectory } from '../adapters/artifact-files.ts'
import { accountOf } from '../adapters/cloudflare-api.ts'
import { retainedStores } from '../adapters/cloudflare-stores.ts'
import { tagWorker } from '../adapters/cloudflare.ts'
import { inGroup } from '../adapters/github.ts'
import { waitUntilHealthy } from '../adapters/health.ts'
import { runInOrder, stream } from '../adapters/processes.ts'
import { converge } from '../adapters/pulumi.ts'
import { platformCredentials } from '../adapters/vault.ts'
import { prepareWrangler, readUpload } from '../adapters/wrangler.ts'
import { applyMigrations, upload } from '../domain/deploy-commands.ts'
import { short } from '../domain/deploy-selection.ts'
import { hasResources, NOTHING_PROVISIONED } from '../domain/resources.ts'
import { migratedDatabases, releaseConfig } from '../domain/wrangler-config.ts'

import { claimWorker } from './release-claims.ts'

import type { Account } from '../adapters/cloudflare-api.ts'
import type { StateBackend } from '../adapters/cloudflare.ts'
import type { Uploaded } from '../adapters/wrangler.ts'
import type { WorkerDeclaration } from '../domain/declaration.ts'
import type { Fact, Released } from '../domain/deploy-summary.ts'
import type { PlatformCredentials } from '../domain/platform.ts'
import type { Provisioned, ResourcePlan } from '../domain/resources.ts'
import type { Subject } from '../domain/subject.ts'
import type { Release } from '../domain/wrangler-config.ts'
import type { ReleaseContext } from './deploy-job.ts'

type Stack = {
	readonly backend: StateBackend
	readonly project: string
	readonly stack: string
}

const WORKERS_DEV = /^https:\/\/\S+\.workers\.dev$/

export async function releaseWorker(
	subject: Subject,
	declaration: WorkerDeclaration,
	context: ReleaseContext,
): Promise<Released> {
	const { deployable, resources: plan } = subject
	const credentials = await platformCredentials(context.identity)
	const account = accountOf(credentials)
	const { tags, backend } = await claimWorker(account, {
		repository: context.event.repository,
		repositoryId: context.event.repositoryId,
		deployable,
		declaration,
		plan,
	})
	const provisioned = await provision(
		{ project: context.event.repository, stack: deployable.name, backend },
		plan,
		{ credentials, account },
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
	await tagWorker(account, deployable.name, tags)
	const url = addressOf(declaration, uploaded)
	const status = await waitUntilHealthy(`${url}${declaration.healthPath}`)
	return {
		name: deployable.name,
		url,
		facts: [
			['Address', url],
			['Commit', `\`${short(context.event.headSha)}\``],
			['Version', `\`${uploaded.version}\``],
			['Health', `\`${declaration.healthPath}\` answered HTTP ${status}`],
			...resourceFacts(plan),
		],
	}
}

type Platform = {
	readonly credentials: PlatformCredentials
	readonly account: Account
}

// One Pulumi project per repository, one stack per deployable.
async function provision(
	stack: Stack,
	plan: ResourcePlan,
	{ credentials, account }: Platform,
): Promise<Provisioned> {
	if (!hasResources(plan)) return NOTHING_PROVISIONED
	return inGroup('Provision the databases and buckets', async () =>
		converge({
			...stack,
			plan,
			retained: await retainedStores(account, plan),
			credentials,
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
		releaseConfig(release),
		account,
	)
	const migrations = migratedDatabases(release).map(database =>
		applyMigrations(wrangler.program, wrangler.config, database),
	)
	await inGroup('Apply the migrations', () =>
		runInOrder(migrations, wrangler.directory, wrangler.environment),
	)
	await inGroup('Upload the Worker', () =>
		stream(
			upload(
				wrangler.program,
				wrangler.config,
				short(context.event.headSha),
			),
			wrangler.directory,
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
