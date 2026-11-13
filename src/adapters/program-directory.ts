import { capture } from './processes.ts'
import { programRoot } from './relocation.ts'

export async function programRevision(): Promise<string> {
	const revision = await capture(
		{ program: 'git', args: ['rev-parse', 'HEAD'] },
		programRoot(),
	)
	return revision.trim()
}
