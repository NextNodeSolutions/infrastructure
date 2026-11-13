export function requiredVariable(name: string): string {
	const found = process.env[name]
	if (!found) {
		throw new Error(
			`${name} is not set: this program runs inside a GitHub Actions job`,
		)
	}
	return found
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

// What a tool is started with when it must not inherit the job's variables: the named
// ones that exist, and nothing else.
export function onlyVariables(names: readonly string[]): ToolEnvironment {
	return Object.fromEntries(
		names.flatMap(name => {
			const found = process.env[name]
			return found === undefined ? [] : [[name, found] as const]
		}),
	)
}
