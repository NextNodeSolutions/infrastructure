import { relative } from 'node:path'

import { listPackages } from '../domain/commands.ts'
import { decoder } from '../domain/decode.ts'
import { ROOT_DIRECTORY } from '../domain/directory.ts'

import { capture } from './processes.ts'

import type { Command } from '../domain/commands.ts'

export type ListedPackage = {
	readonly name: string
	readonly directory: string
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
function decodeListing(
	printed: string,
	project: string,
): readonly ListedPackage[] {
	if (printed.trim() === '') return []
	const decode = decoder(message => new Error(`pnpm ls: ${message}`))
	const parsed: unknown = JSON.parse(printed)
	return decode.recordList(parsed, 'the listing').map(fields => ({
		name: decode.string(fields, 'name'),
		directory:
			relative(project, decode.string(fields, 'path')) || ROOT_DIRECTORY,
	}))
}

export async function listWorkspace(
	project: string,
	pnpmVersion: string,
	filter: readonly string[],
): Promise<readonly ListedPackage[]> {
	const printed = await capture(
		throughNpm(pnpmVersion)(listPackages(filter)),
		project,
	)
	return decodeListing(printed, project)
}
