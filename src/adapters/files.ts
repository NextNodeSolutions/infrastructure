import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { decodeManifest, MANIFEST_FILE } from '../domain/manifest.ts'
import { Refusal } from '../domain/refusal.ts'

import type { Manifest } from '../domain/manifest.ts'

export function hasFile(path: string): boolean {
	return existsSync(path)
}

export function parseJson(text: string, file: string): unknown {
	try {
		const parsed: unknown = JSON.parse(text)
		return parsed
	} catch (failure: unknown) {
		throw new Refusal(file, `${file} is not valid JSON`, { cause: failure })
	}
}

export function readJsonFile(path: string, file: string): unknown {
	return parseJson(readFileSync(path, 'utf8'), file)
}

export function readManifest(
	root: string,
	file: string = MANIFEST_FILE,
): Manifest {
	return decodeManifest(readJsonFile(join(root, file), file), file)
}
