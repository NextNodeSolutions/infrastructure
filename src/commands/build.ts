import { jsonVariable, requiredVariable } from '../adapters/environment.ts'
import { inGroup } from '../adapters/github.ts'
import { runInOrder, stream } from '../adapters/processes.ts'
import { buildCommands, INSTALL } from '../domain/commands.ts'
import { decodeBuildPlan } from '../domain/plan.ts'

const BUILD = 'BUILD'

export async function build(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const plan = decodeBuildPlan(jsonVariable(BUILD), BUILD)
	await inGroup('Install dependencies', () => stream(INSTALL, project))
	await runInOrder(buildCommands(plan), project)
}
