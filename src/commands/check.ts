import { jsonVariable, requiredVariable } from '../adapters/environment.ts'
import { inGroup } from '../adapters/github.ts'
import { runInOrder, stream } from '../adapters/processes.ts'
import { checkCommands, INSTALL } from '../domain/commands.ts'
import { decodeCheckEntry } from '../domain/plan.ts'

const CHECK = 'CHECK'

export async function check(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const entry = decodeCheckEntry(jsonVariable(CHECK), CHECK)
	await inGroup('Install dependencies', () => stream(INSTALL, project))
	await runInOrder(checkCommands(entry), project)
}
