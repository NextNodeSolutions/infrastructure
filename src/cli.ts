import { annotateError } from './adapters/github.ts'
import { build } from './commands/build.ts'
import { check } from './commands/check.ts'
import { discover } from './commands/discover.ts'
import { Refusal } from './domain/refusal.ts'

const COMMANDS: Record<string, () => Promise<void>> = { discover, check, build }
const USAGE_ERROR = 2
const COMMAND_ARGUMENT = 2

function report(failure: unknown): void {
	if (failure instanceof Refusal) {
		annotateError(failure.message, failure.file)
		return
	}
	annotateError(failure instanceof Error ? failure.message : String(failure))
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
