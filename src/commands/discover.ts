import { join, relative } from 'node:path'

import { optionalVariable, requiredVariable } from '../adapters/environment.ts'
import { hasFile, readJsonFile } from '../adapters/files.ts'
import { hasChangesIn, mergeBase } from '../adapters/git.ts'
import { writeOutputs, writeSummary } from '../adapters/github.ts'
import { decodeListing, throughNpm } from '../adapters/pnpm.ts'
import { capture } from '../adapters/processes.ts'
import { programRevision } from '../adapters/program-directory.ts'
import { listPackages } from '../domain/commands.ts'
import { ROOT_DIRECTORY } from '../domain/directory.ts'
import { executorFor, TURBO_FILE, WORKSPACE_FILE } from '../domain/executor.ts'
import {
	decodeManifest,
	MANIFEST_FILE,
	manifestFile,
} from '../domain/manifest.ts'
import { NOTHING_TO_CHECK, outputsFor } from '../domain/outputs.ts'
import { planFor } from '../domain/plan.ts'
import {
	ROOT_FILES,
	selectAgainstBase,
	SINGLE_PACKAGE,
	WITHOUT_BASE,
} from '../domain/selection.ts'
import { NO_MANIFEST_SUMMARY, renderSummary } from '../domain/summary.ts'
import { readToolchain } from '../domain/toolchain.ts'

import type { Manifest } from '../domain/manifest.ts'
import type { Package } from '../domain/plan.ts'
import type { Selection } from '../domain/selection.ts'

const PULL_REQUEST = 'pull_request'

export async function discover(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const manifestPath = join(project, MANIFEST_FILE)
	if (!hasFile(manifestPath)) {
		writeOutputs(NOTHING_TO_CHECK)
		writeSummary(NO_MANIFEST_SUMMARY)
		return
	}
	const manifest = readManifest(project, MANIFEST_FILE)
	const toolchain = readToolchain(manifest)
	const executor = executorFor({
		hasWorkspaceFile: hasFile(join(project, WORKSPACE_FILE)),
		hasTurboFile: hasFile(join(project, TURBO_FILE)),
	})
	const selection =
		executor === 'single'
			? SINGLE_PACKAGE
			: await workspaceSelection(project)
	const packages =
		executor === 'single'
			? [
					{
						name: manifest.name ?? '',
						directory: ROOT_DIRECTORY,
						scripts: manifest.scripts,
					},
				]
			: await workspacePackages(project, selection, toolchain.pnpmVersion)
	const plan = planFor(packages, executor)
	writeOutputs(outputsFor(toolchain, executor, plan))
	writeSummary(
		renderSummary({
			selection,
			executor,
			packages,
			programRevision: await programRevision(),
		}),
	)
}

function readManifest(project: string, file: string): Manifest {
	return decodeManifest(readJsonFile(join(project, file), file), file)
}

async function workspaceSelection(project: string): Promise<Selection> {
	if (optionalVariable('GITHUB_EVENT_NAME') !== PULL_REQUEST)
		return WITHOUT_BASE
	const base = await mergeBase(requiredVariable('GITHUB_BASE_REF'), project)
	return selectAgainstBase(
		base,
		await hasChangesIn(base, ROOT_FILES, project),
	)
}

async function workspacePackages(
	project: string,
	selection: Selection,
	pnpmVersion: string,
): Promise<readonly Package[]> {
	const command = throughNpm(pnpmVersion)(listPackages(selection))
	const listing = decodeListing(await capture(command, project))
	const members = listing
		.map(listed => ({
			name: listed.name,
			directory: relative(project, listed.path),
		}))
		.filter(member => member.directory !== '')
	return members.map(member => ({
		name: member.name,
		directory: member.directory,
		scripts: readManifest(project, manifestFile(member.directory)).scripts,
	}))
}
