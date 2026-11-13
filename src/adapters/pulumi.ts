import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { decoder } from '../domain/decode.ts'

import { installPulumi } from './pulumi-cli.ts'

import type * as CloudflareProvider from '@pulumi/cloudflare'
import type { PlatformCredentials } from '../domain/platform.ts'
import type { Provisioned, ResourcePlan } from '../domain/resources.ts'
import type { StateBackend } from './cloudflare.ts'

export type Convergence = {
	readonly project: string
	readonly stack: string
	readonly plan: ResourcePlan
	readonly credentials: PlatformCredentials
	readonly backend: StateBackend
	readonly workDirectory: string
}

type CloudflareSdk = typeof CloudflareProvider
type Program = () => Promise<Record<string, unknown>>

// A binding removed from the file leaves its data in the account for a person to delete.
const KEPT = { retainOnDelete: true }

const decode = decoder(message => new Error(`Pulumi: ${message}`))

function databaseIdsOf(output: unknown): Provisioned {
	const ids = decode.record(output, 'the databases of the stack')
	return {
		databaseIds: Object.fromEntries(
			Object.keys(ids).map(binding => [
				binding,
				decode.string(ids, binding),
			]),
		),
	}
}

function resourcesOf(
	cloudflare: CloudflareSdk,
	plan: ResourcePlan,
	accountId: string,
): Program {
	return () => {
		const databases = plan.databases.map(
			({ binding, name }) =>
				[
					binding,
					new cloudflare.D1Database(
						binding,
						{ accountId, name },
						KEPT,
					).id,
				] as const,
		)
		const buckets = plan.buckets.map(
			({ binding, name }) =>
				new cloudflare.R2Bucket(binding, { accountId, name }, KEPT)
					.name,
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
	const automation = await import('@pulumi/pulumi/automation/index.js')
	const cloudflare = await import('@pulumi/cloudflare')
	const project = join(convergence.workDirectory, 'project')
	mkdirSync(project, { recursive: true })
	const pulumiCommand = await automation.PulumiCommand.get({
		root: await installPulumi(join(convergence.workDirectory, 'cli')),
	})
	const stack = await automation.LocalWorkspace.createOrSelectStack(
		{
			stackName: convergence.stack,
			projectName: convergence.project,
			program: resourcesOf(
				cloudflare,
				convergence.plan,
				convergence.credentials.cloudflareAccount,
			),
		},
		{
			workDir: project,
			pulumiCommand,
			secretsProvider: 'passphrase',
			projectSettings: {
				name: convergence.project,
				runtime: 'nodejs',
				backend: { url: convergence.backend.url },
			},
			envVars: environmentOf(convergence),
		},
	)
	const { outputs } = await stack.up({
		onOutput: text => process.stdout.write(text),
		refresh: true,
	})
	return databaseIdsOf(outputs.databaseIds?.value)
}
