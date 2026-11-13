import { renameSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { requiredVariable } from './environment.ts'

const LOADED_FROM = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const HOME_NAME = 'nextnode-checks'

// The root of the copy this module was loaded from: the checkout before the move, the
// runner's scratch directory after it.
export function programRoot(): string {
	return LOADED_FROM
}

// A checkout can only land inside the workspace, where the project's tools walk. The
// program moves to the runner's scratch directory before it loads the rest of itself:
// a module resolves what it imports from the place it was loaded from, so a module
// loaded before the move would look for an installed dependency where nothing is left.
export function leaveWorkspace(): string {
	const workspace = requiredVariable('GITHUB_WORKSPACE')
	if (!LOADED_FROM.startsWith(`${workspace}${sep}`)) return LOADED_FROM
	const home = join(requiredVariable('RUNNER_TEMP'), HOME_NAME)
	renameSync(LOADED_FROM, home)
	return home
}
