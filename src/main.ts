import { annotateError } from './adapters/github.ts'
import { build } from './commands/build.ts'
import { check } from './commands/check.ts'
import { deployAnchor } from './commands/deploy-anchor.ts'
import { deployBuild } from './commands/deploy-build.ts'
import { deployDiscover } from './commands/deploy-discover.ts'
import { deployPlan } from './commands/deploy-plan.ts'
import { deployRelease } from './commands/deploy-release.ts'
import { discover } from './commands/discover.ts'
import { causeOf, Refusal } from './domain/refusal.ts'

const COMMANDS: Record<string, () => Promise<void>> = {
	discover,
	check,
	build,
	'deploy-plan': deployPlan,
	'deploy-anchor': deployAnchor,
	'deploy-discover': deployDiscover,
	'deploy-build': deployBuild,
	'deploy-release': deployRelease,
}
const USAGE_ERROR = 2
const COMMAND_ARGUMENT = 2

function report(failure: unknown): void {
	if (failure instanceof Refusal) {
		annotateError(failure.message, failure.file)
		return
	}
	annotateError(causeOf(failure))
}

async function main(name: string | undefined): Promise<number> {
	const command = name ? COMMANDS[name] : undefined
	if (!command) {
		annotateError(
			`usage: node src/cli.ts <${Object.keys(COMMANDS).join('|')}>`,
		)
		return USAGE_ERROR
	}
	try {
		await command()
		return 0
	} catch (failure: unknown) {
		report(failure)
		return 1
	}
}

process.exitCode = await main(process.argv[COMMAND_ARGUMENT])
