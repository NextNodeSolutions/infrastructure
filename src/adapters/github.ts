import { appendFileSync } from 'node:fs'

import { requiredVariable } from './environment.ts'

type Escape = readonly [RegExp, string]

const DATA_ESCAPES: readonly Escape[] = [
	[/%/g, '%25'],
	[/\r/g, '%0D'],
	[/\n/g, '%0A'],
]
const PROPERTY_ESCAPES: readonly Escape[] = [
	...DATA_ESCAPES,
	[/:/g, '%3A'],
	[/,/g, '%2C'],
]

function escape(text: string, escapes: readonly Escape[]): string {
	return escapes.reduce(
		(escaped, [pattern, replacement]) =>
			escaped.replace(pattern, replacement),
		text,
	)
}

// An output is one line by construction: a second line would be read as another output.
export function writeOutputs(outputs: Record<string, string>): void {
	const lines = Object.entries(outputs).map(([name, content]) => {
		if (/[\r\n]/.test(content))
			throw new Error(`output ${name} must be one line`)
		return `${name}=${content}\n`
	})
	appendFileSync(requiredVariable('GITHUB_OUTPUT'), lines.join(''))
}

export function writeSummary(markdown: string): void {
	appendFileSync(requiredVariable('GITHUB_STEP_SUMMARY'), markdown)
}

// A secret of several lines is masked line by line: the runner masks what one command names.
export function maskSecret(secret: string): void {
	const lines = secret.split(/\r?\n/).filter(line => line !== '')
	process.stdout.write(
		lines
			.map(line => `::add-mask::${escape(line, DATA_ESCAPES)}\n`)
			.join(''),
	)
}

export function annotateWarning(message: string): void {
	process.stdout.write(`::warning::${escape(message, DATA_ESCAPES)}\n`)
}

export function annotateError(message: string, file?: string): void {
	const properties = file ? ` file=${escape(file, PROPERTY_ESCAPES)}` : ''
	process.stdout.write(
		`::error${properties}::${escape(message, DATA_ESCAPES)}\n`,
	)
}

export async function inGroup<T>(
	title: string,
	work: () => Promise<T>,
): Promise<T> {
	process.stdout.write(`::group::${escape(title, DATA_ESCAPES)}\n`)
	try {
		return await work()
	} finally {
		process.stdout.write('::endgroup::\n')
	}
}
