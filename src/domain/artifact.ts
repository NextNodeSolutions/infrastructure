// What a build hands to a release, as plain files: the release job runs nothing of the
// project, it uploads what these directories hold.
export const ARTIFACT = {
	bundle: 'bundle',
	assets: 'assets',
	migrations: 'migrations',
	package: 'package',
} as const

const EXTENSION = /\.[^./]+$/

// Wrangler writes the bundle of src/index.ts as index.js.
export function bundleEntry(main: string): string {
	const file = main.slice(main.lastIndexOf('/') + 1)
	return `${file.replace(EXTENSION, '')}.js`
}

export function migrationsOf(binding: string): string {
	return `${ARTIFACT.migrations}/${binding}`
}
