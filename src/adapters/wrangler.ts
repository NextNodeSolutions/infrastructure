import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { decoder } from '../domain/decode.ts'

import { onlyVariables } from './environment.ts'

import type { WranglerConfig } from '../domain/wrangler-config.ts'
import type { Account } from './cloudflare.ts'
import type { ToolEnvironment } from './environment.ts'

const CONFIG_FILE = 'wrangler.json'
const OUTPUT_FILE = 'wrangler-output.ndjson'
const INHERITED = ['PATH', 'HOME']
const DEPLOY_ENTRY = 'deploy'

// One run of Wrangler: the binary the program installed, a configuration the platform
// wrote, the directory that holds it and the variables it is started with.
export type Wrangler = {
	readonly program: string
	readonly directory: string
	readonly config: string
	readonly output: string
	readonly environment: ToolEnvironment
}

export type Uploaded = {
	readonly targets: readonly string[]
	readonly version: string
}

const decode = decoder(message => new Error(`Wrangler's output: ${message}`))

// A build bundles with no account: only a release hands Wrangler the credentials.
function credentialsOf(
	account: Account | undefined,
): ToolEnvironment | undefined {
	if (!account) return undefined
	return {
		CLOUDFLARE_API_TOKEN: account.token,
		CLOUDFLARE_ACCOUNT_ID: account.id,
	}
}

// Wrangler is started with the variables it needs and no other. Its scratch directory
// holds its configuration, so what it writes beside that file stays out of the project.
export function prepareWrangler(
	programRoot: string,
	scratch: string,
	config: WranglerConfig,
	account?: Account,
): Wrangler {
	mkdirSync(scratch, { recursive: true })
	const configPath = join(scratch, CONFIG_FILE)
	const output = join(scratch, OUTPUT_FILE)
	writeFileSync(configPath, JSON.stringify(config))
	return {
		program: join(programRoot, 'node_modules', '.bin', 'wrangler'),
		directory: scratch,
		config: configPath,
		output,
		environment: {
			...onlyVariables(INHERITED),
			...credentialsOf(account),
			CI: 'true',
			WRANGLER_SEND_METRICS: 'false',
			WRANGLER_OUTPUT_FILE_PATH: output,
		},
	}
}

// What Wrangler recorded of the upload: one JSON entry per line, one per step it took.
export function readUpload(wrangler: Wrangler): Uploaded {
	const entries = readFileSync(wrangler.output, 'utf8')
		.split('\n')
		.filter(line => line !== '')
		.map(line => {
			const parsed: unknown = JSON.parse(line)
			return decode.record(parsed, 'an entry')
		})
	const deployed = entries.find(entry => entry.type === DEPLOY_ENTRY)
	if (!deployed) throw new Error("Wrangler's output records no deployment")
	return {
		targets: decode.strings(deployed, 'targets'),
		version: decode.string(deployed, 'version_id'),
	}
}
