import { join } from 'node:path'

import { programInstall } from '../domain/deploy-commands.ts'
import { decodeManifest, MANIFEST_FILE } from '../domain/manifest.ts'
import { readToolchain } from '../domain/toolchain.ts'

import { readJsonFile } from './files.ts'
import { inGroup } from './github.ts'
import { throughNpm } from './pnpm.ts'
import { stream } from './processes.ts'

import type { InstallProfile } from '../domain/deploy-commands.ts'

// The deploy commands have dependencies, the check commands have none. They are installed
// from the program's own lockfile, by the pnpm its manifest pins, with no lifecycle
// script, once the program has left the project tree: no file of the project is read.
export async function installDependencies(
	programRoot: string,
	profile: InstallProfile,
): Promise<void> {
	const manifest = decodeManifest(
		readJsonFile(join(programRoot, MANIFEST_FILE), MANIFEST_FILE),
		MANIFEST_FILE,
	)
	const { pnpmVersion } = readToolchain(manifest)
	await inGroup(`Install the deploy program (${profile})`, () =>
		stream(throughNpm(pnpmVersion)(programInstall(profile)), programRoot),
	)
}
