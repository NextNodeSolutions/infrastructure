import { posix } from 'node:path'

import { capture, succeeds } from './processes.ts'

import type { Since } from '../domain/deploy-selection.ts'

export async function revisionAt(cwd: string): Promise<string> {
	const revision = await capture(
		{ program: 'git', args: ['rev-parse', 'HEAD'] },
		cwd,
	)
	return revision.trim()
}

export async function originUrl(cwd: string): Promise<string> {
	const url = await capture(
		{ program: 'git', args: ['remote', 'get-url', 'origin'] },
		cwd,
	)
	return url.trim()
}

// Read from git's index alone, so no tool of the project runs: the listing would otherwise
// run the program a checkout's own git config names as its fsmonitor.
export async function directoriesTracking(
	file: string,
	cwd: string,
): Promise<readonly string[]> {
	const listed = await capture(
		{
			program: 'git',
			args: [
				'-c',
				'core.fsmonitor=false',
				'ls-files',
				'-z',
				'--',
				`:(glob)**/${file}`,
			],
		},
		cwd,
	)
	return listed
		.split('\0')
		.filter(Boolean)
		.map(path => posix.dirname(path))
}

function isAncestor(
	ancestor: string,
	descendant: string,
	cwd: string,
): Promise<boolean> {
	return succeeds(
		{
			program: 'git',
			args: ['merge-base', '--is-ancestor', ancestor, descendant],
		},
		cwd,
	)
}

// Where a commit stands against the one checked out. A commit this history does not hold
// answers no to both questions, and so does one git has never seen.
export async function relationToHead(
	commit: string,
	head: string,
	cwd: string,
): Promise<Since['relation']> {
	if (commit === head) return 'same'
	if (await isAncestor(commit, head, cwd)) return 'older'
	return (await isAncestor(head, commit, cwd)) ? 'newer' : 'unrelated'
}

export async function mergeBase(baseRef: string, cwd: string): Promise<string> {
	const found = await capture(
		{ program: 'git', args: ['merge-base', `origin/${baseRef}`, 'HEAD'] },
		cwd,
	)
	return found.trim()
}

export async function hasChangesIn(
	base: string,
	paths: readonly string[],
	cwd: string,
): Promise<boolean> {
	const names = await capture(
		{
			program: 'git',
			args: ['diff', '--name-only', base, 'HEAD', '--', ...paths],
		},
		cwd,
	)
	return names.trim() !== ''
}
