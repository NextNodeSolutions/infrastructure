import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { NEXTNODE_FILE } from '../domain/declaration.ts'
import { declarationFile } from '../domain/deployable.ts'
import { ROOT_DIRECTORY } from '../domain/directory.ts'
import { executorFor, TURBO_FILE, WORKSPACE_FILE } from '../domain/executor.ts'
import { refusal } from '../domain/refusal.ts'
import { readToolchain } from '../domain/toolchain.ts'

import { hasFile, readManifest } from './files.ts'
import { listWorkspace } from './pnpm.ts'
import { subjectFrom } from './subject-reader.ts'

import type { Executor } from '../domain/executor.ts'
import type { Manifest } from '../domain/manifest.ts'
import type { Subject } from '../domain/subject.ts'
import type { Toolchain } from '../domain/toolchain.ts'

// The project as a job checked it out: where it is, what it is built with and how.
export type Checkout = {
	readonly project: string
	readonly manifest: Manifest
	readonly toolchain: Toolchain
	readonly executor: Executor
}

export function readCheckout(project: string): Checkout {
	const manifest = readManifest(project)
	return {
		project,
		manifest,
		toolchain: readToolchain(manifest),
		executor: executorFor({
			hasWorkspaceFile: hasFile(join(project, WORKSPACE_FILE)),
			hasTurboFile: hasFile(join(project, TURBO_FILE)),
		}),
	}
}

// Where a workspace's members may declare, as each caller is allowed to find them.
export type MemberDirectories = (
	checkout: Checkout,
) => Promise<readonly string[]>

export async function workspaceMembers(
	checkout: Checkout,
): Promise<readonly string[]> {
	const members = await listWorkspace(
		checkout.project,
		checkout.toolchain.pnpmVersion,
		[],
	)
	return members.map(member => member.directory)
}

// A single package declares at its root. A workspace declares in its members: the root
// is every member's dependency, so a root declaration would deploy on every change.
export async function declaringDirectories(
	checkout: Checkout,
	members: MemberDirectories,
): Promise<readonly string[]> {
	const { project, executor } = checkout
	const hasRootFile = hasFile(join(project, NEXTNODE_FILE))
	if (executor === 'single') return hasRootFile ? [ROOT_DIRECTORY] : []
	if (hasRootFile) {
		throw refusal(
			NEXTNODE_FILE,
			`a workspace declares what it deploys in its packages, one ${NEXTNODE_FILE} beside each package.json, never at the root`,
		)
	}
	const directories = await members(checkout)
	return directories
		.filter(directory => directory !== ROOT_DIRECTORY)
		.filter(directory => hasFile(join(project, declarationFile(directory))))
}

export function readSubject(
	project: string,
	repository: string,
	directory: string,
): Promise<Subject> {
	return subjectFrom(repository, directory, file =>
		Promise.resolve(readFileSync(join(project, file), 'utf8')),
	)
}
