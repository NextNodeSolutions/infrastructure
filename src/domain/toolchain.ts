import { MANIFEST_FILE } from './manifest.ts'
import { Refusal } from './refusal.ts'

import type { Manifest } from './manifest.ts'

export type Toolchain = {
	readonly pnpmVersion: string
	readonly nodeMajor: number
}

const PNPM_DECLARATION = /^pnpm@(\d+\.\d+\.\d+)(?:\+sha\d+\.[0-9a-f]+)?$/
const LEADING_MAJOR = /^\D*(\d+)/
// The check jobs run this program with the project's Node, and Node strips types
// from 22 on; every earlier major has also left maintenance.
const LOWEST_NODE_MAJOR = 22

export function readToolchain(manifest: Manifest): Toolchain {
	const pnpmVersion = PNPM_DECLARATION.exec(
		manifest.packageManager ?? '',
	)?.[1]
	if (!pnpmVersion) {
		throw new Refusal(
			MANIFEST_FILE,
			'packageManager must pin pnpm as pnpm@X.Y.Z',
		)
	}
	const major = LEADING_MAJOR.exec(manifest.nodeRange ?? '')?.[1]
	const nodeMajor = major ? Number(major) : Number.NaN
	if (Number.isNaN(nodeMajor)) {
		throw new Refusal(
			MANIFEST_FILE,
			'engines.node must name the Node major',
		)
	}
	if (nodeMajor < LOWEST_NODE_MAJOR) {
		throw new Refusal(
			MANIFEST_FILE,
			`engines.node must name Node ${LOWEST_NODE_MAJOR} or later`,
		)
	}
	return { pnpmVersion, nodeMajor }
}
