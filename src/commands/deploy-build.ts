import { join } from 'node:path'

import {
	confinedPath,
	copyDirectory,
	emptyDirectory,
	moveDirectory,
	scratchDirectory,
} from '../adapters/artifact-files.ts'
import { readSubject } from '../adapters/checkout.ts'
import { requiredVariable } from '../adapters/environment.ts'
import { readPullRequestEvent } from '../adapters/event.ts'
import { inGroup } from '../adapters/github.ts'
import { runInOrder, stream } from '../adapters/processes.ts'
import { installDependencies } from '../adapters/program-install.ts'
import { programRoot } from '../adapters/relocation.ts'
import { prepareWrangler } from '../adapters/wrangler.ts'
import { ARTIFACT, migrationsOf } from '../domain/artifact.ts'
import { INSTALL } from '../domain/commands.ts'
import {
	bundle,
	deployableBuild,
	installProfileOf,
	pack,
} from '../domain/deploy-commands.ts'
import { bundlingConfig } from '../domain/wrangler-config.ts'

import { artifactDirectory, requestedDeployable } from './deploy-job.ts'

import type { WorkerDeclaration } from '../domain/declaration.ts'

type Staging = {
	readonly programRoot: string
	readonly name: string
	readonly directory: string
	readonly staged: string
}

// The job that runs the project's code: its install, its build, its bundling. It holds no
// credential, and what it leaves is plain files for the job that does.
export async function deployBuild(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const entry = requestedDeployable()
	const artifact = artifactDirectory(project)
	const root = programRoot()
	await installDependencies(root, installProfileOf(entry.kind))
	const subject = await readSubject(
		project,
		readPullRequestEvent().repository,
		entry.directory,
	)
	await inGroup('Install dependencies', () => stream(INSTALL, project))
	await runInOrder(deployableBuild(entry, subject.manifest.scripts), project)
	const staging = {
		programRoot: root,
		name: entry.name,
		directory: join(project, entry.directory),
		staged: scratchDirectory('artifact'),
	}
	await (subject.declaration.kind === 'package'
		? stagePackage(staging)
		: stageWorker(staging, subject.declaration))
	moveDirectory(staging.staged, artifact)
}

async function stagePackage(staging: Staging): Promise<void> {
	const destination = emptyDirectory(join(staging.staged, ARTIFACT.package))
	await inGroup('Pack the package', () =>
		stream(pack(destination), staging.directory),
	)
}

async function stageWorker(
	staging: Staging,
	declaration: WorkerDeclaration,
): Promise<void> {
	const { directory, staged } = staging
	await bundleWorker(staging, declaration)
	if (declaration.assets) {
		copyDirectory(
			confinedPath(directory, declaration.assets.directory),
			join(staged, ARTIFACT.assets),
		)
	}
	declaration.databases.forEach(database => {
		if (!database.migrationsDirectory) return
		copyDirectory(
			confinedPath(directory, database.migrationsDirectory),
			join(staged, migrationsOf(database.binding)),
		)
	})
}

// Wrangler bundles without uploading: the release uploads these files as they are, so
// the code that serves is the code this job built.
async function bundleWorker(
	staging: Staging,
	declaration: WorkerDeclaration,
): Promise<void> {
	if (!declaration.main) return
	const wrangler = prepareWrangler(
		staging.programRoot,
		scratchDirectory('wrangler'),
		bundlingConfig(
			staging.name,
			declaration,
			confinedPath(staging.directory, declaration.main),
		),
	)
	await inGroup('Bundle the Worker', () =>
		stream(
			bundle(
				wrangler.program,
				wrangler.config,
				join(staging.staged, ARTIFACT.bundle),
			),
			staging.directory,
			wrangler.environment,
		),
	)
}
