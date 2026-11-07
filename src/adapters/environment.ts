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
