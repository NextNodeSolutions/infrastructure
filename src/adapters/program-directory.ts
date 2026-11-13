import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { capture } from './processes.ts'

const PROGRAM_ROOT = resolve(
	dirname(fileURLToPath(import.meta.url)),
	'..',
	'..',
)

// Where the program lives once the entry point has moved it out of the workspace.
export function programRoot(): string {
	return PROGRAM_ROOT
}

export async function programRevision(): Promise<string> {
	const revision = await capture(
		{ program: 'git', args: ['rev-parse', 'HEAD'] },
		PROGRAM_ROOT,
	)
	return revision.trim()
}
