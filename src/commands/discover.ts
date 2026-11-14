import { join } from 'node:path'

import { readCheckout } from '../adapters/checkout.ts'
import { optionalVariable, requiredVariable } from '../adapters/environment.ts'
import { hasFile, readManifest } from '../adapters/files.ts'
import { hasChangesIn, mergeBase, revisionAt } from '../adapters/git.ts'
import { writeOutputs, writeSummary } from '../adapters/github.ts'
import { listWorkspace } from '../adapters/pnpm.ts'
import { programRoot } from '../adapters/relocation.ts'
import { ROOT_DIRECTORY } from '../domain/directory.ts'
import { MANIFEST_FILE, manifestFile } from '../domain/manifest.ts'
import { NOTHING_TO_CHECK, outputsFor } from '../domain/outputs.ts'
import { planFor } from '../domain/plan.ts'
import {
	filterArguments,
	ROOT_FILES,
	selectAgainstBase,
	SINGLE_PACKAGE,
	WITHOUT_BASE,
} from '../domain/selection.ts'
import { NO_MANIFEST_SUMMARY, renderSummary } from '../domain/summary.ts'

import type { Package } from '../domain/plan.ts'
import type { Selection } from '../domain/selection.ts'

const PULL_REQUEST = 'pull_request'

export async function discover(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	if (!hasFile(join(project, MANIFEST_FILE))) {
		writeOutputs(NOTHING_TO_CHECK)
		writeSummary(NO_MANIFEST_SUMMARY)
		return
	}
	const { manifest, toolchain, executor } = readCheckout(project)
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
	writeOutputs(outputsFor(toolchain, plan))
	writeSummary(
		renderSummary({
			selection,
			executor,
			packages,
			programRevision: await revisionAt(programRoot()),
		}),
	)
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
	const listing = await listWorkspace(
		project,
		pnpmVersion,
		filterArguments(selection),
	)
	const members = listing.filter(
		member => member.directory !== ROOT_DIRECTORY,
	)
	return members.map(member => ({
		name: member.name,
		directory: member.directory,
		scripts: readManifest(project, manifestFile(member.directory)).scripts,
	}))
}
