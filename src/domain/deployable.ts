import { NEXTNODE_FILE } from './declaration.ts'
import { decoder } from './decode.ts'
import { fileIn, ROOT_DIRECTORY } from './directory.ts'
import { isExecutor } from './executor.ts'
import { Refusal } from './refusal.ts'

import type { Declaration } from './declaration.ts'
import type { Executor } from './executor.ts'

// One nextnode.toml, named once: the name is the Worker, the GitHub environment that
// records its deployments, the Pulumi stack and the artifact that carries its build.
export type Deployable = {
	readonly name: string
	readonly kind: Declaration['kind']
	readonly directory: string
	readonly package: string
}

export type Placement = {
	readonly repository: string
	readonly directory: string
	readonly package: string
}

// What discovery hands to a job of the matrix. The release job reads the directory as a
// request and derives everything else from the commit.
export type DeployEntry = Deployable & { readonly executor: Executor }

const KINDS: readonly Declaration['kind'][] = ['worker', 'package']
const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const SCOPE = /^@[^/]+\//
const DIRECTORY = /^(?:\.|[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/

export function declarationFile(directory: string): string {
	return fileIn(directory, NEXTNODE_FILE)
}

export function deployableFor(
	placement: Placement,
	kind: Declaration['kind'],
): Deployable {
	const { repository, directory } = placement
	const file = declarationFile(directory)
	const isRoot = directory === ROOT_DIRECTORY
	if (!isRoot && placement.package === '') {
		throw new Refusal(
			file,
			`${file}: the package.json beside it must have a name, which names what is deployed`,
		)
	}
	const name = (
		isRoot
			? repository
			: `${repository}-${placement.package.replace(SCOPE, '')}`
	).toLowerCase()
	if (!NAME.test(name)) {
		throw new Refusal(
			file,
			`${file}: it would deploy as ${name}, and a name takes lowercase letters, digits and dashes, 63 at most. Rename the package or the repository`,
		)
	}
	return { name, kind, directory, package: placement.package }
}

function isKind(candidate: string): candidate is Declaration['kind'] {
	return KINDS.some(kind => kind === candidate)
}

export function decodeDeployEntry(
	parsed: unknown,
	source: string,
): DeployEntry {
	const invalid = (message: string): Error =>
		new Error(`${source}: ${message}`)
	const decode = decoder(invalid)
	const fields = decode.record(parsed, source)
	const kind = decode.string(fields, 'kind')
	const executor = decode.string(fields, 'executor')
	const directory = decode.string(fields, 'directory')
	if (!isKind(kind)) throw invalid(`${kind} is not a kind of deployable`)
	if (!isExecutor(executor)) throw invalid(`${executor} is not an executor`)
	if (!DIRECTORY.test(directory) || directory.split('/').includes('..'))
		throw invalid('directory must be a path inside the repository')
	return {
		name: decode.string(fields, 'name'),
		kind,
		directory,
		package: decode.string(fields, 'package'),
		executor,
	}
}
