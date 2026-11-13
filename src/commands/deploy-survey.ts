import { join } from 'node:path'

import {
	declaringDirectories,
	readCheckout,
	readSubject,
} from '../adapters/checkout.ts'
import { hasFile } from '../adapters/files.ts'
import { revisionAt } from '../adapters/git.ts'
import { installDependencies } from '../adapters/program-install.ts'
import { programRoot } from '../adapters/relocation.ts'
import { NEXTNODE_FILE } from '../domain/declaration.ts'
import { refuseSharedNames } from '../domain/deployable.ts'
import { MANIFEST_FILE } from '../domain/manifest.ts'
import { refusal } from '../domain/refusal.ts'

import { planRows } from './deploy-verdicts.ts'

import type { Checkout } from '../adapters/checkout.ts'
import type { GitHub } from '../adapters/github-api.ts'
import type { PlanRow } from '../domain/deploy-summary.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'

export type Survey = {
	readonly checkout: Checkout
	readonly rows: readonly PlanRow[]
}

function hasManifest(project: string): boolean {
	if (hasFile(join(project, MANIFEST_FILE))) return true
	if (!hasFile(join(project, NEXTNODE_FILE))) return false
	throw refusal(
		NEXTNODE_FILE,
		`a repository that deploys needs a ${MANIFEST_FILE} at its root, with packageManager and engines.node`,
	)
}

// What the checked-out commit declares and what each deployable does at it, or nothing
// when the repository declares none. Plan checks out the merge GitHub builds for the pull
// request, Discover the commit it deploys. It reads the project's files and runs its
// package manager, so the job that calls it holds a token that only reads.
export async function survey(
	project: string,
	event: PullRequestEvent,
	api: GitHub,
): Promise<Survey | undefined> {
	if (!hasManifest(project)) return undefined
	const checkout = readCheckout(project)
	const directories = await declaringDirectories(checkout)
	if (!directories.length) return undefined
	await installDependencies(programRoot(), 'plain')
	const subjects = await Promise.all(
		directories.map(directory =>
			readSubject(project, event.repository, directory),
		),
	)
	refuseSharedNames(subjects.map(subject => subject.deployable))
	const rows = await planRows(subjects, {
		api,
		checkout,
		checkedOut: await revisionAt(project),
	})
	return { checkout, rows }
}
