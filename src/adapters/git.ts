import { capture } from './processes.ts'

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
