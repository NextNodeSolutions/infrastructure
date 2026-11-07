import { existsSync, readFileSync } from 'node:fs'

import { Refusal } from '../domain/refusal.ts'

export function hasFile(path: string): boolean {
	return existsSync(path)
}

export function readJsonFile(path: string, file: string): unknown {
	try {
		const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
		return parsed
	} catch (failure: unknown) {
		throw new Refusal(file, `${file} is not valid JSON`, { cause: failure })
	}
}
