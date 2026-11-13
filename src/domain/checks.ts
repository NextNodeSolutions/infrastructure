export type Check = {
	readonly script: string
	readonly label: string
}

const KNOWN_CHECKS: readonly Check[] = [
	{ script: 'lint', label: 'Lint' },
	{ script: 'format:check', label: 'Format' },
	{ script: 'type-check', label: 'TypeScript' },
	{ script: 'test:unit', label: 'Unit tests' },
	{ script: 'test:integration', label: 'Integration tests' },
	{ script: 'test:e2e', label: 'End-to-end tests' },
]

export const BUILD_SCRIPT = 'build'

export function declaredChecks(scripts: readonly string[]): readonly Check[] {
	return KNOWN_CHECKS.filter(check => scripts.includes(check.script))
}

export function hasBuildScript(scripts: readonly string[]): boolean {
	return scripts.includes(BUILD_SCRIPT)
}
