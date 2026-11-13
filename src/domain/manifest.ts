import { decoder } from './decode.ts'
import { fileIn } from './directory.ts'
import { refusal } from './refusal.ts'

import type { Decoder } from './decode.ts'

export type Manifest = {
	readonly name: string | undefined
	readonly version: string | undefined
	readonly packageManager: string | undefined
	readonly nodeRange: string | undefined
	readonly scripts: readonly string[]
}

export const MANIFEST_FILE = 'package.json'

export function manifestFile(directory: string): string {
	return fileIn(directory, MANIFEST_FILE)
}

export function decodeManifest(parsed: unknown, file: string): Manifest {
	const decode = decoder(message => refusal(file, message))
	const fields = decode.record(parsed, file)
	return {
		name: decode.optionalString(fields, 'name'),
		version: decode.optionalString(fields, 'version'),
		packageManager: decode.optionalString(fields, 'packageManager'),
		nodeRange: nodeRangeOf(fields, decode),
		scripts: decode.keysOf(fields, 'scripts'),
	}
}

function nodeRangeOf(
	fields: Record<string, unknown>,
	decode: Decoder,
): string | undefined {
	if (!('engines' in fields)) return undefined
	return decode.optionalString(
		decode.record(fields.engines, 'engines'),
		'node',
	)
}
