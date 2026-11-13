import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MANIFEST_FILE } from '../domain/manifest.ts'
import {
	listTrust,
	placeholderManifest,
	showTrust,
	stagePlaceholder,
	trustDeploy,
	whoAmI,
} from '../domain/npm-setup.ts'
import { asksForApproval, decodeTrustList } from '../domain/npm-trust.ts'
import { NPM_REGISTRY } from '../domain/platform.ts'

import { attempt, stream } from './processes.ts'

import type { TrustedPublisher } from '../domain/npm-trust.ts'

// npm runs with the person's own session and in an empty directory, so it reads the
// person's configuration and no project's, and the program never handles a token.
async function inEmptyDirectory<Result>(
	work: (directory: string) => Promise<Result>,
): Promise<Result> {
	const directory = mkdtempSync(join(tmpdir(), 'nextnode-npm-'))
	try {
		return await work(directory)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
}

export function signedInAs(): Promise<string> {
	return inEmptyDirectory(async directory => {
		const reply = await attempt(whoAmI(NPM_REGISTRY), directory)
		if (!reply.isSuccess) {
			throw new Error(
				'npm has no session in this terminal: run `npm login`, then this command again',
			)
		}
		return reply.printed.trim()
	})
}

// Staging creates the package with no approval and publishes nothing anyone installs.
export function stagePackage(name: string, repository: string): Promise<void> {
	return inEmptyDirectory(async directory => {
		writeFileSync(
			join(directory, MANIFEST_FILE),
			JSON.stringify(placeholderManifest(name, repository)),
		)
		await stream(stagePlaceholder(name, NPM_REGISTRY), directory)
	})
}

// A listing taken without a terminal fails while npm waits for an approval. The person then
// approves one listing in the terminal, and the next listings pass within npm's window.
export function trustedPublishers(
	name: string,
): Promise<readonly TrustedPublisher[]> {
	return inEmptyDirectory(async directory => {
		const first = await attempt(listTrust(name, NPM_REGISTRY), directory)
		if (first.isSuccess) return decodeTrustList(first.printed)
		if (!asksForApproval(first.complaint)) {
			throw new Error(
				`npm did not list the trusted publishers of ${name}: ${first.complaint.trim()}`,
			)
		}
		await stream(showTrust(name, NPM_REGISTRY), directory)
		const second = await attempt(listTrust(name, NPM_REGISTRY), directory)
		if (second.isSuccess) return decodeTrustList(second.printed)
		throw new Error(
			`npm asked again for approval to list ${name}. Tick the option that skips two-factor authentication for 5 minutes on npm's page, then run this command again`,
		)
	})
}

export function trustDeployWorkflow(
	name: string,
	repository: string,
): Promise<void> {
	return inEmptyDirectory(directory =>
		stream(trustDeploy(name, repository, NPM_REGISTRY), directory),
	)
}
