import { basename, resolve } from 'node:path'

import {
	declaringDirectories,
	readCheckout,
	readSubject,
} from '../adapters/checkout.ts'
import { directoriesTracking, originUrl } from '../adapters/git.ts'
import {
	publishPlaceholder,
	signedInAs,
	trustDeployWorkflow,
	trustedPublishers,
} from '../adapters/npm-account.ts'
import { hasVersion, isRegistered } from '../adapters/npm.ts'
import { isTerminal, say } from '../adapters/terminal.ts'
import { until } from '../adapters/wait.ts'
import { NEXTNODE_FILE } from '../domain/declaration.ts'
import {
	APPROVAL_HINT,
	githubRepository,
	refuseStagingVersion,
	setupIntro,
	setupReport,
	TERMINAL_REQUIRED,
} from '../domain/npm-setup.ts'
import { NPM_SETUP, occupiedTrust, trustsDeploy } from '../domain/npm-trust.ts'
import { publishedAs } from '../domain/subject.ts'

import type { SetupOutcome } from '../domain/npm-setup.ts'
import type { PublishedAs } from '../domain/subject.ts'

// npm lists a package a minute or more after it publishes it.
const PATIENCE = { everyMs: 3000, forMs: 180_000 }

async function declaredPackages(
	project: string,
	repository: string,
): Promise<readonly PublishedAs[]> {
	const directories = await declaringDirectories(
		readCheckout(project),
		checkout => directoriesTracking(NEXTNODE_FILE, checkout.project),
	)
	const subjects = await Promise.all(
		directories.map(directory =>
			readSubject(project, basename(repository), directory),
		),
	)
	return subjects
		.filter(subject => subject.declaration.kind === 'package')
		.map(publishedAs)
}

async function isTrusted(name: string, repository: string): Promise<boolean> {
	const publishers = await trustedPublishers(name)
	if (publishers.some(publisher => trustsDeploy(publisher, repository)))
		return true
	if (publishers.length) throw new Error(occupiedTrust(name, publishers))
	return false
}

async function createPackage(
	published: PublishedAs,
	repository: string,
): Promise<void> {
	refuseStagingVersion(published)
	const { name } = published
	await publishPlaceholder(name, repository)
	const registered = await until(
		async () => ((await isRegistered(name)) ? { name } : undefined),
		PATIENCE,
	)
	if (!registered) {
		throw new Error(
			`npm published ${name} and does not list it yet: run this command again in a few minutes`,
		)
	}
}

async function setUp(
	published: PublishedAs,
	repository: string,
): Promise<SetupOutcome> {
	const isCreated = !(await isRegistered(published.name))
	if (isCreated) await createPackage(published, repository)
	if (await isTrusted(published.name, repository))
		return { kind: 'trusted already', published }
	// Asked again after npm's approval, which can take minutes, so a version published meanwhile gets no trust to let expire.
	if (await hasVersion(published))
		return { kind: 'nothing to publish', published }
	await trustDeployWorkflow(published.name, repository)
	if (!(await isTrusted(published.name, repository))) {
		throw new Error(
			`npm does not list ${repository} as a trusted publisher of ${published.name} after setting it`,
		)
	}
	return { kind: 'trusted now', published, isCreated }
}

function inOrder(
	packages: readonly PublishedAs[],
	repository: string,
): Promise<readonly SetupOutcome[]> {
	return packages.reduce<Promise<readonly SetupOutcome[]>>(
		async (done, published) => [
			...(await done),
			await setUp(published, repository),
		],
		Promise.resolve([]),
	)
}

// A trust is set only for a version that the next release publishes, since that first
// publication is what keeps npm from dropping the trust two days after it was set.
async function pendingOf(
	packages: readonly PublishedAs[],
): Promise<readonly PublishedAs[]> {
	const published = await Promise.all(packages.map(hasVersion))
	return packages.filter((_, index) => !published[index])
}

// Run by a person, never by a workflow: it holds their npm session.
export async function setupNpm(argument: string | undefined): Promise<void> {
	if (!argument)
		throw new Error(`usage: ${NPM_SETUP} <checkout of the repository>`)
	if (!isTerminal()) throw new Error(TERMINAL_REQUIRED)
	const project = resolve(argument)
	const repository = githubRepository(await originUrl(project))
	const packages = await declaredPackages(project, repository)
	say([setupIntro(repository, packages)])
	const pending = await pendingOf(packages)
	const unchanged = packages
		.filter(published => !pending.includes(published))
		.map((published): SetupOutcome => ({
			kind: 'nothing to publish',
			published,
		}))
	if (pending.length)
		say([`npm session: ${await signedInAs()}`, APPROVAL_HINT])
	const outcomes = [...unchanged, ...(await inOrder(pending, repository))]
	say(setupReport(outcomes, repository, new Date()))
}
