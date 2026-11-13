import {
	cpSync,
	existsSync,
	lstatSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	realpathSync,
	renameSync,
	rmSync,
} from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'

import { refusal } from '../domain/refusal.ts'

import { requiredVariable } from './environment.ts'

const TARBALL = '.tgz'

// A directory of the runner's scratch space, outside the project tree: what is staged
// there is seen by no tool of the project.
export function scratchDirectory(purpose: string): string {
	return mkdtempSync(join(requiredVariable('RUNNER_TEMP'), `${purpose}-`))
}

export function emptyDirectory(path: string): string {
	mkdirSync(path, { recursive: true })
	return path
}

// A path the file declares, read after the build ran: it must exist and stay inside the
// deployable, links resolved.
export function confinedPath(
	directory: string,
	declared: string,
	file: string,
): string {
	const source = join(directory, declared)
	if (!existsSync(source)) {
		throw refusal(
			file,
			`${declared} does not exist after the build. Name a path the repository holds or the build writes`,
		)
	}
	const resolved = relative(realpathSync(directory), realpathSync(source))
	if (
		isAbsolute(resolved) ||
		resolved === '..' ||
		resolved.startsWith(`..${sep}`)
	) {
		throw refusal(
			file,
			`${declared} resolves outside the deployable's directory. Use a path inside it`,
		)
	}
	return source
}

// Preserving links during the copy lets Release refuse one a concurrent build created.
export function copyDirectory(source: string, destination: string): void {
	refuseAnythingButFiles(source)
	cpSync(source, destination, { recursive: true, dereference: false })
}

export function moveDirectory(source: string, destination: string): void {
	rmSync(destination, { recursive: true, force: true })
	renameSync(source, destination)
}

// A build ran the project's code, so what it left is data to the release: plain files and
// directories, nothing that points elsewhere.
export function refuseAnythingButFiles(root: string): void {
	if (!lstatSync(root).isDirectory()) {
		throw new Error(
			`${root} must be a directory, not a link or special file`,
		)
	}
	const foreign = readdirSync(root, {
		withFileTypes: true,
		recursive: true,
	}).find(entry => !entry.isFile() && !entry.isDirectory())
	if (!foreign) return
	throw new Error(
		`The build left ${join(foreign.parentPath, foreign.name)}, which is neither a file nor a directory`,
	)
}

export function packedTarball(directory: string): string {
	const tarballs = readdirSync(directory).filter(name =>
		name.endsWith(TARBALL),
	)
	const [tarball, ...others] = tarballs
	if (!tarball || others.length) {
		throw new Error(
			`The build must leave one package tarball and left ${tarballs.length}`,
		)
	}
	return join(directory, tarball)
}
