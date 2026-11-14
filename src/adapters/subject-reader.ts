import { declarationFile } from '../domain/deployable.ts'
import { manifestFile } from '../domain/manifest.ts'
import { subjectOf } from '../domain/subject.ts'

import { parseJson } from './files.ts'
import { parseToml } from './toml.ts'

import type { Subject } from '../domain/subject.ts'

export type ReadFile = (file: string) => Promise<string>

// One deployable from its nextnode.toml and the package.json beside it, whoever reads the
// two texts: the checkout for the jobs that hold one, the API for the release.
export async function subjectFrom(
	repository: string,
	directory: string,
	read: ReadFile,
): Promise<Subject> {
	const file = declarationFile(directory)
	const manifest = manifestFile(directory)
	const [tomlText, manifestText] = await Promise.all([
		read(file),
		read(manifest),
	])
	return subjectOf(repository, directory, {
		toml: await parseToml(tomlText, file),
		manifest: parseJson(manifestText, manifest),
	})
}
