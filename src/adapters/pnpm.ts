import { decoder } from '../domain/decode.ts'

import type { Command } from '../domain/commands.ts'

export type ListedPackage = {
	readonly name: string
	readonly path: string
}

// pnpm arrives at the version the project declares, fetched by the npm that Node ships,
// so discovery needs no package manager installed ahead of it.
export function throughNpm(pnpmVersion: string): (command: Command) => Command {
	return command => ({
		program: 'npm',
		args: [
			'exec',
			'--yes',
			`--package=pnpm@${pnpmVersion}`,
			'--',
			command.program,
			...command.args,
		],
	})
}

// pnpm prints nothing, not an empty list, when no project matches the filter.
export function decodeListing(printed: string): readonly ListedPackage[] {
	if (printed.trim() === '') return []
	const decode = decoder(message => new Error(`pnpm ls: ${message}`))
	const parsed: unknown = JSON.parse(printed)
	if (!Array.isArray(parsed)) throw new Error('pnpm ls: expected a JSON list')
	const entries: readonly unknown[] = parsed
	return entries.map(entry => {
		const fields = decode.record(entry, 'a listed package')
		return {
			name: decode.string(fields, 'name'),
			path: decode.string(fields, 'path'),
		}
	})
}
