import { setupNpm } from './commands/setup-npm.ts'
import { causeOf } from './domain/refusal.ts'

const PROJECT_ARGUMENT = 2

try {
	await setupNpm(process.argv[PROJECT_ARGUMENT])
} catch (failure: unknown) {
	process.stderr.write(`${causeOf(failure)}\n`)
	process.exitCode = 1
}
