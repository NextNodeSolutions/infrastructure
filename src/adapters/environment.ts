import type { RunAddress } from '../domain/run.ts'

export function requiredVariable(name: string): string {
	const found = process.env[name]
	if (!found) {
		throw new Error(
			`${name} is not set: this program runs inside a GitHub Actions job`,
		)
	}
	return found
}

// A job hands the program a matrix entry or an output as one variable holding JSON.
export function jsonVariable(name: string): unknown {
	const parsed: unknown = JSON.parse(requiredVariable(name))
	return parsed
}

export function currentRun(): RunAddress {
	return {
		serverUrl: requiredVariable('GITHUB_SERVER_URL'),
		repository: requiredVariable('GITHUB_REPOSITORY'),
		runId: requiredVariable('GITHUB_RUN_ID'),
	}
}

export function optionalVariable(name: string): string | undefined {
	return process.env[name]
}

// Read once, then gone: a tool started later does not inherit it.
export function takeVariable(name: string): string {
	const taken = requiredVariable(name)
	Reflect.deleteProperty(process.env, name)
	return taken
}

export type ToolEnvironment = Readonly<Record<string, string>>

const INHERITED = ['PATH', 'HOME']

// What a tool is started with when it must not inherit the job's variables: the ones
// it needs to run at all, the ones the program names, and nothing else.
export function toolEnvironment(named: ToolEnvironment): ToolEnvironment {
	const inherited = INHERITED.flatMap(name => {
		const found = process.env[name]
		return found === undefined ? [] : [[name, found] as const]
	})
	return { ...Object.fromEntries(inherited), ...named }
}
