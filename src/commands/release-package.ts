import { join } from 'node:path'

import { packedTarball, scratchDirectory } from '../adapters/artifact-files.ts'
import { inGroup } from '../adapters/github.ts'
import {
	latestVersion,
	packedManifest,
	preparePublisher,
	publishToken,
} from '../adapters/npm.ts'
import { stream } from '../adapters/processes.ts'
import { signProvenance } from '../adapters/provenance.ts'
import { ARTIFACT } from '../domain/artifact.ts'
import { publish } from '../domain/deploy-commands.ts'
import { short } from '../domain/deploy-selection.ts'
import { distTagFor } from '../domain/dist-tag.ts'
import { manifestFile } from '../domain/manifest.ts'
import { NPM_PACKAGE_PAGE, NPM_REGISTRY } from '../domain/platform.ts'
import { hasProvenance } from '../domain/provenance.ts'
import { publishedAs } from '../domain/subject.ts'

import type { Provenance } from '../adapters/provenance.ts'
import type { PackageDeclaration } from '../domain/declaration.ts'
import type { Released } from '../domain/deploy-summary.ts'
import type { PublishedAs, Subject } from '../domain/subject.ts'
import type { ReleaseContext } from './deploy-job.ts'

// npm lists a version only once it has processed it, a minute or more after accepting it,
// and nothing of the release depends on the listing, so the release does not wait for it.
const REGISTRY_FACT = 'accepted, listed once npm has processed it'

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

async function signed(
	tarball: string,
	published: PublishedAs,
	context: ReleaseContext,
	scratch: string,
): Promise<Provenance | undefined> {
	if (!hasProvenance(context.event.visibility)) return undefined
	return inGroup('Sign the provenance', () =>
		signProvenance(tarball, published, context.identity, scratch),
	)
}

function provenanceFact(provenance: Provenance | undefined): string {
	if (!provenance) return 'none: the repository is not public'
	return `signed, ${provenance.logEntry}`
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
	const provenance = await signed(tarball, published, context, scratch)
	await inGroup('Publish the package', () =>
		stream(
			publish(tarball, {
				name: published.name,
				access: declaration.access,
				tag,
				registry: NPM_REGISTRY,
				configuration: publisher.configuration,
				provenance: provenance?.file,
			}),
			publisher.directory,
			publisher.environment,
		),
	)
	const url = `${NPM_PACKAGE_PAGE}/${published.name}/v/${published.version}`
	return {
		name: subject.deployable.name,
		url,
		facts: [
			['Package', `\`${published.name}@${published.version}\``],
			['Page', url],
			['Tag', `\`${tag}\``],
			['Commit', `\`${short(context.event.headSha)}\``],
			['Registry', REGISTRY_FACT],
			['Provenance', provenanceFact(provenance)],
		],
	}
}
