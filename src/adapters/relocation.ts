import { renameSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { requiredVariable } from './environment.ts'

const CHECKED_OUT_AT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
)
const HOME_NAME = 'nextnode-checks'

// A checkout can only land inside the workspace, where the project's tools walk. The
// program moves to the runner's scratch directory before it loads the rest of itself:
// a module resolves what it imports from the place it was loaded from, so a module
// loaded before the move would look for an installed dependency where nothing is left.
export function leaveWorkspace(): string {
	const workspace = requiredVariable('GITHUB_WORKSPACE')
	if (!CHECKED_OUT_AT.startsWith(`${workspace}${sep}`)) return CHECKED_OUT_AT
	const home = join(requiredVariable('RUNNER_TEMP'), HOME_NAME)
	renameSync(CHECKED_OUT_AT, home)
	return home
}
