import { capture, succeeds } from './processes.ts'

import type { Since } from '../domain/deploy-selection.ts'

export async function revisionAt(cwd: string): Promise<string> {
	const revision = await capture(
		{ program: 'git', args: ['rev-parse', 'HEAD'] },
		cwd,
	)
	return revision.trim()
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
