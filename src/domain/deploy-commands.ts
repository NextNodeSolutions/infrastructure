import { hasBuildScript } from './checks.ts'
import { buildCommands, pnpm } from './commands.ts'

import type { Command } from './commands.ts'
import type { Declaration, PackageAccess } from './declaration.ts'
import type { DeployEntry } from './deployable.ts'

// What a job installs of the program's own dependencies. The plain ones are the parser
// every reader of a nextnode.toml takes and the Sigstore client a package release signs
// with. Bundling, uploading and converging take the optional ones too.
export type InstallProfile = 'plain' | 'deploying'

const PROGRAM_INSTALL = [
	'install',
	'--frozen-lockfile',
	'--prod',
	'--ignore-scripts',
] as const

const INSTALL_PROFILES: Record<InstallProfile, Command> = {
	plain: pnpm(...PROGRAM_INSTALL, '--no-optional'),
	deploying: pnpm(...PROGRAM_INSTALL),
}

export function programInstall(profile: InstallProfile): Command {
	return INSTALL_PROFILES[profile]
}

// A job installs once, by the kind it was asked for: a profile installed after another
// makes pnpm discard the first and install everything again.
const PROFILE_OF_KIND: Record<Declaration['kind'], InstallProfile> = {
	worker: 'deploying',
	package: 'plain',
}

export function installProfileOf(kind: Declaration['kind']): InstallProfile {
	return PROFILE_OF_KIND[kind]
}

// The build of one deployable, through the same executor table the checks build with.
// A single package without a build script has nothing to build: its files are deployed.
export function deployableBuild(
	entry: DeployEntry,
	scripts: readonly string[],
): readonly Command[] {
	if (entry.executor === 'single' && !hasBuildScript(scripts)) return []
	return buildCommands({
		executor: entry.executor,
		packages: [entry.package],
	})
}

export function pack(destination: string): Command {
	return pnpm('pack', '--pack-destination', destination)
}

export function bundle(
	wrangler: string,
	config: string,
	directory: string,
): Command {
	return {
		program: wrangler,
		args: [
			'deploy',
			'--dry-run',
			'--config',
			config,
			'--outdir',
			directory,
		],
	}
}

export function applyMigrations(
	wrangler: string,
	config: string,
	database: string,
): Command {
	return {
		program: wrangler,
		args: [
			'd1',
			'migrations',
			'apply',
			database,
			'--remote',
			'--config',
			config,
		],
	}
}

export function upload(
	wrangler: string,
	config: string,
	message: string,
): Command {
	return {
		program: wrangler,
		args: ['deploy', '--config', config, '--message', message],
	}
}

// The manifest a tarball carries, printed without unpacking anything.
export function printPackedManifest(tarball: string): Command {
	return { program: 'tar', args: ['-xzOf', tarball, 'package/package.json'] }
}

export type Publishing = {
	readonly name: string
	readonly access: PackageAccess
	readonly tag: string
	readonly registry: string
	readonly configuration: string
	readonly provenance: string | undefined
}

export function scopeRegistry(
	name: string,
	registry: string,
): readonly string[] {
	if (!name.startsWith('@')) return []
	return [`--${name.slice(0, name.indexOf('/'))}:registry=${registry}`]
}

// The tarball's own lifecycle scripts stay off: the release job runs nothing of the
// project. The registry is named on the command line, for the package's scope too: a
// setting the tarball carries replaces no setting the command line names. A signed
// provenance is handed over as a file, so npm signs nothing itself.
export function publish(tarball: string, publishing: Publishing): Command {
	const { registry, provenance } = publishing
	return {
		program: 'npm',
		args: [
			'publish',
			tarball,
			'--access',
			publishing.access,
			'--tag',
			publishing.tag,
			'--ignore-scripts',
			'--userconfig',
			publishing.configuration,
			`--registry=${registry}`,
			...scopeRegistry(publishing.name, registry),
			...(provenance ? ['--provenance-file', provenance] : []),
		],
	}
}
