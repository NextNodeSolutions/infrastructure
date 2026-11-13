import { join } from 'node:path'

import { packedTarball, scratchDirectory } from '../adapters/artifact-files.ts'
import { inGroup } from '../adapters/github.ts'
import {
	hasVersion,
	latestVersion,
	packedManifest,
	preparePublisher,
	publishToken,
} from '../adapters/npm.ts'
import { stream } from '../adapters/processes.ts'
import { until } from '../adapters/wait.ts'
import { ARTIFACT } from '../domain/artifact.ts'
import { publish } from '../domain/deploy-commands.ts'
import { short } from '../domain/deploy-selection.ts'
import { distTagFor } from '../domain/dist-tag.ts'
import { manifestFile } from '../domain/manifest.ts'
import { NPM_PACKAGE_PAGE, NPM_REGISTRY } from '../domain/platform.ts'
import { publishedAs } from '../domain/subject.ts'

import type { PackageDeclaration } from '../domain/declaration.ts'
import type { Released } from '../domain/deploy-summary.ts'
import type { PublishedAs, Subject } from '../domain/subject.ts'
import type { ReleaseContext } from './deploy-job.ts'

// The registry lists a version a moment after it accepts it.
const PATIENCE = { everyMs: 3000, forMs: 60_000 }

// The registry trusts the workflow for every package of the repository, so the release
// publishes a tarball only as the package and version the commit declares here.
async function refuseForeignTarball(
	tarball: string,
	subject: Subject,
	cwd: string,
): Promise<void> {
	const published = publishedAs(subject)
	const packed = await packedManifest(
		tarball,
		cwd,
		manifestFile(subject.deployable.directory),
	)
	if (packed.name === published.name && packed.version === published.version)
		return
	throw new Error(
		`The commit publishes ${published.name}@${published.version}, and the build packed ${packed.name ?? 'a nameless package'}@${packed.version ?? 'no version'}`,
	)
}

// The version is published once npm accepted it, so a registry that fails to answer
// while the release waits has only not listed it yet.
async function listing(
	published: PublishedAs,
): Promise<PublishedAs | undefined> {
	const isListed = await hasVersion(published).catch(() => false)
	if (!isListed) return undefined
	return published
}

export async function releasePackage(
	subject: Subject,
	declaration: PackageDeclaration,
	context: ReleaseContext,
): Promise<Released> {
	const published = publishedAs(subject)
	const tarball = packedTarball(join(context.artifact, ARTIFACT.package))
	const scratch = scratchDirectory('npm')
	await refuseForeignTarball(tarball, subject, scratch)
	const tag = distTagFor(
		published.version,
		await latestVersion(published.name),
	)
	const publisher = preparePublisher(
		scratch,
		await publishToken(context.identity, published.name),
	)
	await inGroup('Publish the package', () =>
		stream(
			publish(tarball, {
				name: published.name,
				access: declaration.access,
				tag,
				registry: NPM_REGISTRY,
				configuration: publisher.configuration,
			}),
			publisher.directory,
			publisher.environment,
		),
	)
	const listed = await until(() => listing(published), PATIENCE)
	const visibility = listed
		? 'accepted by the registry'
		: 'accepted by the registry, not listed yet'
	const url = `${NPM_PACKAGE_PAGE}/${published.name}/v/${published.version}`
	return {
		name: subject.deployable.name,
		url,
		facts: [
			['Package', `\`${published.name}@${published.version}\``],
			['Page', url],
			['Tag', `\`${tag}\``],
			['Commit', `\`${short(context.commit)}\``],
			['Registry', visibility],
		],
	}
}
