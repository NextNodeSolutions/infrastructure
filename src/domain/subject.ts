import { declarationFile, deployableFor } from './deployable.ts'
import { decodeManifest, manifestFile } from './manifest.ts'
import { decodeNextnodeToml } from './nextnode-toml.ts'
import { Refusal } from './refusal.ts'

import type { Declaration } from './declaration.ts'
import type { Deployable } from './deployable.ts'
import type { Manifest } from './manifest.ts'

export type Subject = {
	readonly deployable: Deployable
	readonly declaration: Declaration
	readonly manifest: Manifest
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
	return {
		deployable: deployableFor(placement, declaration.kind),
		declaration,
		manifest,
	}
}

export function publishedAs(subject: Subject): PublishedAs {
	const file = manifestFile(subject.deployable.directory)
	const { name, version } = subject.manifest
	if (!name || !version) {
		throw new Refusal(
			file,
			`${file}: a package that is published needs a name and a version`,
		)
	}
	return { name, version }
}
