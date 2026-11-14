import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { decoder } from '../domain/decode.ts'

import { installPulumi } from './pulumi-cli.ts'

import type * as CloudflareProvider from '@pulumi/cloudflare'
import type { CustomResourceOptions } from '@pulumi/pulumi'
import type { Deployment } from '@pulumi/pulumi/automation/index.js'
import type { PlatformCredentials } from '../domain/platform.ts'
import type {
	NamedResource,
	Provisioned,
	ResourcePlan,
	RetainedStores,
} from '../domain/resources.ts'
import type { StateBackend } from './cloudflare.ts'

export type Convergence = {
	readonly project: string
	readonly stack: string
	readonly plan: ResourcePlan
	readonly retained: RetainedStores
	readonly credentials: PlatformCredentials
	readonly backend: StateBackend
	readonly workDirectory: string
}

type CloudflareSdk = typeof CloudflareProvider
type Program = () => Promise<Record<string, unknown>>

// The import id of a store, by binding.
type Imports = {
	readonly databases: Readonly<Record<string, string>>
	readonly buckets: Readonly<Record<string, string>>
}

const DATABASE_TYPE = 'cloudflare:index/d1Database:D1Database'
const BUCKET_TYPE = 'cloudflare:index/r2Bucket:R2Bucket'
const BUCKET_JURISDICTION = 'default'

// A binding removed from the file leaves its data in the account for a person to delete.
const KEPT = { retainOnDelete: true }

const decode = decoder(message => new Error(`Pulumi: ${message}`))

function optionsOf(importId: string | undefined): CustomResourceOptions {
	return importId ? { ...KEPT, import: importId } : KEPT
}

// The URNs of the resources the state holds. A top-level URN ends with ::type::name.
function managedIn(exported: Deployment): readonly string[] {
	const state = decode.record(exported.deployment, 'the state of the stack')
	if (!state.resources) return []
	return decode
		.records(state, 'resources')
		.map(resource => decode.string(resource, 'urn'))
}

// A store the account holds and the state lost, as when its binding left the file and
// came back, is imported with its data instead of created again.
function importsOf(
	retained: RetainedStores,
	managed: readonly string[],
	accountId: string,
): Imports {
	const isLost =
		(type: string) =>
		({ binding }: NamedResource): boolean =>
			!managed.some(urn => urn.endsWith(`::${type}::${binding}`))
	return {
		databases: Object.fromEntries(
			retained.databases
				.filter(isLost(DATABASE_TYPE))
				.map(({ binding, id }) => [binding, `${accountId}/${id}`]),
		),
		buckets: Object.fromEntries(
			retained.buckets
				.filter(isLost(BUCKET_TYPE))
				.map(({ binding, name }) => [
					binding,
					`${accountId}/${name}/${BUCKET_JURISDICTION}`,
				]),
		),
	}
}

function databaseIdsOf(output: unknown): Provisioned {
	return decode.stringRecord(output, 'the databases of the stack')
}

function resourcesOf(
	cloudflare: CloudflareSdk,
	plan: ResourcePlan,
	accountId: string,
	imports: Imports,
): Program {
	return () => {
		const databases = plan.databases.map(
			({ binding, name }) =>
				[
					binding,
					new cloudflare.D1Database(
						binding,
						{ accountId, name },
						optionsOf(imports.databases[binding]),
					).id,
				] as const,
		)
		const buckets = plan.buckets.map(
			({ binding, name }) =>
				new cloudflare.R2Bucket(
					binding,
					{ accountId, name },
					optionsOf(imports.buckets[binding]),
				).name,
		)
		return Promise.resolve({
			databaseIds: Object.fromEntries(databases),
			buckets,
		})
	}
}

function environmentOf({
	backend,
	credentials,
}: Convergence): Record<string, string> {
	return {
		AWS_ACCESS_KEY_ID: backend.keys.accessKeyId,
		AWS_SECRET_ACCESS_KEY: backend.keys.secretAccessKey,
		AWS_REGION: backend.keys.region,
		PULUMI_CONFIG_PASSPHRASE: credentials.statePassphrase,
		CLOUDFLARE_API_TOKEN: credentials.cloudflareToken,
		PULUMI_SKIP_UPDATE_CHECK: 'true',
	}
}

// The databases and buckets a Worker binds, created when missing and never deleted.
// The SDK is loaded when called, like every dependency of the program. It hands the CLI
// the job's environment, which holds no token by then, and the variables named here.
export async function converge(convergence: Convergence): Promise<Provisioned> {
	const cli = join(convergence.workDirectory, 'cli')
	const [automation, cloudflare] = await Promise.all([
		import('@pulumi/pulumi/automation/index.js'),
		import('@pulumi/cloudflare'),
		installPulumi(cli),
	])
	const project = join(convergence.workDirectory, 'project')
	mkdirSync(project, { recursive: true })
	const pulumiCommand = await automation.PulumiCommand.get({ root: cli })
	const workspace = await automation.LocalWorkspace.create({
		workDir: project,
		pulumiCommand,
		secretsProvider: 'passphrase',
		projectSettings: {
			name: convergence.project,
			runtime: 'nodejs',
			backend: { url: convergence.backend.url },
		},
		envVars: environmentOf(convergence),
	})
	const stack = await automation.Stack.createOrSelect(
		convergence.stack,
		workspace,
	)
	const accountId = convergence.credentials.cloudflareAccount
	const imports = importsOf(
		convergence.retained,
		managedIn(await stack.exportStack()),
		accountId,
	)
	const { outputs } = await stack.up({
		program: resourcesOf(cloudflare, convergence.plan, accountId, imports),
		onOutput: text => process.stdout.write(text),
		refresh: true,
	})
	return databaseIdsOf(outputs.databaseIds?.value)
}
