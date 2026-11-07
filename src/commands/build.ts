import { requiredVariable } from '../adapters/environment.ts'
import { inGroup } from '../adapters/github.ts'
import { runInOrder, stream } from '../adapters/processes.ts'
import { leaveProjectTree } from '../adapters/program-directory.ts'
import { buildCommands, INSTALL } from '../domain/commands.ts'
import { decodeBuildPlan } from '../domain/plan.ts'

const BUILD = 'BUILD'

export async function build(): Promise<void> {
	const project = requiredVariable('GITHUB_WORKSPACE')
	const plan = decodeBuildPlan(JSON.parse(requiredVariable(BUILD)), BUILD)
	leaveProjectTree(project)
	await inGroup('Install dependencies', () => stream(INSTALL, project))
	await runInOrder(buildCommands(plan), project)
}
