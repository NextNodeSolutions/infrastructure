import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

import { listPackages } from '../domain/commands.ts'
import { NEXTNODE_FILE } from '../domain/declaration.ts'
import { declarationFile } from '../domain/deployable.ts'
import { ROOT_DIRECTORY } from '../domain/directory.ts'
import { executorFor, TURBO_FILE, WORKSPACE_FILE } from '../domain/executor.ts'
import { manifestFile } from '../domain/manifest.ts'
import { Refusal } from '../domain/refusal.ts'
import { WITHOUT_BASE } from '../domain/selection.ts'
import { subjectOf } from '../domain/subject.ts'
import { readToolchain } from '../domain/toolchain.ts'

import { hasFile, readJsonFile, readManifest } from './files.ts'
import { decodeListing, throughNpm } from './pnpm.ts'
import { capture } from './processes.ts'
import { parseToml } from './toml.ts'

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

// A single package declares at its root. A workspace declares in its members: the root
// is every member's dependency, so a root declaration would deploy on every change.
export async function declaringDirectories(
	checkout: Checkout,
): Promise<readonly string[]> {
	const { project, executor, toolchain } = checkout
	const hasRootFile = hasFile(join(project, NEXTNODE_FILE))
	if (executor === 'single') return hasRootFile ? [ROOT_DIRECTORY] : []
	if (hasRootFile) {
		throw new Refusal(
			NEXTNODE_FILE,
			`${NEXTNODE_FILE}: a workspace declares what it deploys in its packages, one ${NEXTNODE_FILE} beside each package.json, never at the root`,
		)
	}
	const listing = decodeListing(
		await capture(
			throughNpm(toolchain.pnpmVersion)(listPackages(WITHOUT_BASE)),
			project,
		),
	)
	return listing
		.map(listed => relative(project, listed.path))
		.filter(directory => directory !== '')
		.filter(directory => hasFile(join(project, directory, NEXTNODE_FILE)))
}

// One deployable as the checkout holds it: its nextnode.toml and the package.json beside.
export async function readSubject(
	project: string,
	repository: string,
	directory: string,
): Promise<Subject> {
	const file = declarationFile(directory)
	const manifest = manifestFile(directory)
	return subjectOf(repository, directory, {
		toml: await parseToml(readFileSync(join(project, file), 'utf8'), file),
		manifest: readJsonFile(join(project, manifest), manifest),
	})
}
