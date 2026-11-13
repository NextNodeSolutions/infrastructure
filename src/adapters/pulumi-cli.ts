import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { PULUMI_CLI, unpackPulumi } from '../domain/pulumi-cli.ts'

import { stream } from './processes.ts'

const DOWNLOAD_TIMEOUT_MS = 120_000

function refuseOtherPlatform(): void {
	const platform = `${process.platform}-${process.arch}`
	if (platform === PULUMI_CLI.platform) return
	throw new Error(
		`The Pulumi CLI is pinned for ${PULUMI_CLI.platform}, and this job runs on ${platform}: run the Release job on the runner the workflow names`,
	)
}

async function pinnedArchive(): Promise<Buffer> {
	const response = await fetch(PULUMI_CLI.archive, {
		signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
	})
	if (!response.ok) {
		throw new Error(
			`Downloading the Pulumi CLI from ${PULUMI_CLI.archive} answered HTTP ${response.status}: re-run the failed jobs`,
		)
	}
	const archive = Buffer.from(await response.arrayBuffer())
	const digest = createHash('sha256').update(archive).digest('hex')
	if (digest !== PULUMI_CLI.sha256) {
		throw new Error(
			`The Pulumi CLI archive has the digest ${digest}, and the program pins ${PULUMI_CLI.sha256}: nothing was installed`,
		)
	}
	return archive
}

// The CLI the release provisions with, installed under root only once its archive
// matches the pinned digest. The SDK runs root/bin/pulumi.
export async function installPulumi(root: string): Promise<string> {
	refuseOtherPlatform()
	const archive = join(root, 'pulumi.tar.gz')
	const binaries = join(root, 'bin')
	mkdirSync(binaries, { recursive: true })
	writeFileSync(archive, await pinnedArchive())
	await stream(unpackPulumi(archive, binaries), root)
	return root
}
