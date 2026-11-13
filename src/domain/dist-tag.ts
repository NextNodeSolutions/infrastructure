const LATEST = 'latest'
const PRERELEASE_TAG = 'next'
const VERSION = /^(\d+)\.(\d+)\.(\d+)(-[^+]+)?(?:\+.*)?$/

type Release = {
	readonly numbers: readonly [number, number, number]
	readonly isPrerelease: boolean
}

function releaseOf(version: string): Release {
	const parts = VERSION.exec(version)
	if (!parts) {
		throw new Error(
			`${version} is not a version npm publishes: write major.minor.patch`,
		)
	}
	const [, major, minor, patch, prerelease] = parts
	return {
		numbers: [Number(major), Number(minor), Number(patch)],
		isPrerelease: Boolean(prerelease),
	}
}

function isBelow(version: Release, latest: Release): boolean {
	const [major, minor, patch] = version.numbers
	const [latestMajor, latestMinor, latestPatch] = latest.numbers
	const differences = [
		major - latestMajor,
		minor - latestMinor,
		patch - latestPatch,
	]
	const first = differences.find(difference => difference !== 0) ?? 0
	return first < 0
}

// The tag a version is published under. `latest` is what an install takes, so it moves
// forward only: a prerelease goes to `next`, and a stable version below the one `latest`
// names goes to the tag of its major line, as npm names its own.
export function distTagFor(
	version: string,
	latest: string | undefined,
): string {
	const release = releaseOf(version)
	if (release.isPrerelease) return PRERELEASE_TAG
	if (!latest || !isBelow(release, releaseOf(latest))) return LATEST
	return `${LATEST}-${release.numbers[0]}`
}
