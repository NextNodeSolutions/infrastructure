import { declarationFile, deployableFor } from './deployable.ts'
import { decodeManifest, manifestFile } from './manifest.ts'
import { decodeNextnodeToml } from './nextnode-toml.ts'
import { refusal } from './refusal.ts'
import { NO_RESOURCES, resourcePlan } from './resources.ts'

import type { Declaration } from './declaration.ts'
import type { Deployable } from './deployable.ts'
import type { Manifest } from './manifest.ts'
import type { ResourcePlan } from './resources.ts'

export type Subject = {
	readonly deployable: Deployable
	readonly declaration: Declaration
	readonly manifest: Manifest
	readonly resources: ResourcePlan
}

export type Sources = {
	readonly toml: unknown
	readonly manifest: unknown
}

export type PublishedAs = {
	readonly name: string
	readonly version: string
}

// One nextnode.toml and the package.json beside it, decoded the same way whether a job
// read them from its checkout or from the commit through the API.
export function subjectOf(
	repository: string,
	directory: string,
	sources: Sources,
): Subject {
	const manifest = decodeManifest(sources.manifest, manifestFile(directory))
	const declaration = decodeNextnodeToml(
		sources.toml,
		declarationFile(directory),
	)
	const placement = { repository, directory, package: manifest.name ?? '' }
	const deployable = deployableFor(placement, declaration.kind)
	return {
		deployable,
		declaration,
		manifest,
		resources:
			declaration.kind === 'worker'
				? resourcePlan(deployable, declaration)
				: NO_RESOURCES,
	}
}

export function publishedAs(subject: Subject): PublishedAs {
	const file = manifestFile(subject.deployable.directory)
	const { name, version } = subject.manifest
	if (!name || !version) {
		throw refusal(
			file,
			`a package that is published needs a name and a version`,
		)
	}
	return { name, version }
}
