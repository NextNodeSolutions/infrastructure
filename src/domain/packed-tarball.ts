import { MANIFEST_FILE } from './manifest.ts'
import { refusal } from './refusal.ts'

import type { Command } from './commands.ts'

const PACKAGE_ROOT = 'package'
const PACKED_MANIFEST = `${PACKAGE_ROOT}/${MANIFEST_FILE}`
const UNSAFE_SEGMENTS: ReadonlySet<string> = new Set(['', '.', '..'])
const TRAILING_SLASH = /\/$/
const SHOWN_MEMBERS = 3

export function listPackedMembers(tarball: string): Command {
	return { program: 'tar', args: ['-tzf', tarball] }
}

// The manifest a tarball carries, printed without unpacking anything.
export function printPackedManifest(tarball: string): Command {
	return { program: 'tar', args: ['-xzOf', tarball, PACKED_MANIFEST] }
}

function membersOf(listing: string): readonly string[] {
	return listing
		.split('\n')
		.filter(member => member !== '')
		.map(member => member.replace(TRAILING_SLASH, ''))
}

function isPlainUnderRoot(member: string): boolean {
	const [root, ...rest] = member.split('/')
	return (
		root === PACKAGE_ROOT &&
		!rest.some(segment => UNSAFE_SEGMENTS.has(segment))
	)
}

function shown(members: readonly string[]): string {
	const named = members
		.slice(0, SHOWN_MEMBERS)
		.map(member => JSON.stringify(member))
		.join(', ')
	const hidden = members.length - SHOWN_MEMBERS
	return hidden > 0 ? `${named} and ${hidden} more` : named
}

function strayLayout(members: readonly string[]): string | undefined {
	const stray = members.filter(member => !isPlainUnderRoot(member))
	if (stray.length > 0)
		return `holds paths that are not plain paths under ${PACKAGE_ROOT}/: ${shown(stray)}`
	const manifests = members.filter(
		member => member === PACKED_MANIFEST,
	).length
	if (manifests === 1) return undefined
	return `holds ${manifests} members named ${PACKED_MANIFEST} where pnpm pack writes one`
}

// npm publishes the manifest of whichever member lands last at the root once it drops the
// first directory of every path, so the release reads one only where a single member can.
export function refuseStrayMembers(listing: string, file: string): void {
	const reason = strayLayout(membersOf(listing))
	if (!reason) return
	throw refusal(
		file,
		`the tarball the build packed ${reason}, so npm could publish a manifest other than the one the release checked. Leave the tarball as pnpm pack writes it`,
	)
}
