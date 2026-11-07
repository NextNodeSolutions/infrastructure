import { renameSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { requiredVariable } from './environment.ts'
import { capture } from './processes.ts'

const PROGRAM_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
)
const HOME_NAME = 'nextnode-checks'

// The project's tools walk the tree they run in, so the program leaves that tree before
// any of them starts. Every module is loaded by then, so the move is invisible to it.
export function leaveProjectTree(project: string): string {
	if (!PROGRAM_ROOT.startsWith(`${project}${sep}`)) return PROGRAM_ROOT
	const home = join(requiredVariable('RUNNER_TEMP'), HOME_NAME)
	renameSync(PROGRAM_ROOT, home)
	return home
}

export async function programRevision(root: string): Promise<string> {
	const revision = await capture(
		{ program: 'git', args: ['rev-parse', 'HEAD'] },
		root,
	)
	return revision.trim()
}
