import { scopeRegistry } from './deploy-commands.ts'
import { DEPLOY_WORKFLOW_FILE } from './platform.ts'

import type { Command } from './commands.ts'
import type { PublishedAs } from './subject.ts'

const HOUR_MS = 3_600_000
// npm drops a trusted publisher that has not published within two days of being set.
const VALIDATION_HOURS = 48
const GITHUB_REMOTE = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/
// Staged and never approved, so nothing installs it, at a prerelease no release declares.
const PLACEHOLDER = { version: '0.0.0-placeholder', tag: 'placeholder' }

export type SetupOutcome =
	| { readonly kind: 'nothing to publish'; readonly published: PublishedAs }
	| { readonly kind: 'trusted already'; readonly published: PublishedAs }
	| {
			readonly kind: 'trusted now'
			readonly published: PublishedAs
			readonly isStaged: boolean
	  }

export function githubRepository(remote: string): string {
	const parts = GITHUB_REMOTE.exec(remote.trim())
	if (!parts) {
		throw new Error(
			`origin is ${remote.trim()}, which is not a repository on GitHub, where the Deploy workflow runs`,
		)
	}
	const [, owner, name] = parts
	return `${owner}/${name}`
}

export function placeholderManifest(
	name: string,
	repository: string,
): Record<string, unknown> {
	return {
		name,
		version: PLACEHOLDER.version,
		description: `Reserved for the Deploy workflow of ${repository}`,
		repository: {
			type: 'git',
			url: `git+https://github.com/${repository}.git`,
		},
	}
}

function npm(registry: string, ...args: readonly string[]): Command {
	return { program: 'npm', args: [...args, `--registry=${registry}`] }
}

export function whoAmI(registry: string): Command {
	return npm(registry, 'whoami')
}

export function stagePlaceholder(name: string, registry: string): Command {
	return npm(
		registry,
		'stage',
		'publish',
		'--access',
		'public',
		'--tag',
		PLACEHOLDER.tag,
		'--ignore-scripts',
		...scopeRegistry(name, registry),
	)
}

export function listTrust(name: string, registry: string): Command {
	return npm(registry, 'trust', 'list', name, '--json')
}

// The same listing for the person to read, which npm runs only after its approval.
export function showTrust(name: string, registry: string): Command {
	return npm(registry, 'trust', 'list', name)
}

export function trustDeploy(
	name: string,
	repository: string,
	registry: string,
): Command {
	return npm(
		registry,
		'trust',
		'github',
		name,
		'--file',
		DEPLOY_WORKFLOW_FILE,
		'--repository',
		repository,
		'--allow-publish',
		'--yes',
	)
}

function minuteOf(moment: Date): string {
	const [day, time = ''] = moment.toISOString().split('T')
	return `${day} ${time.slice(0, time.lastIndexOf(':'))} UTC`
}

export function setupIntro(
	repository: string,
	packages: readonly PublishedAs[],
): string {
	return `npm for ${repository}: ${packages.map(({ name }) => name).join(', ') || 'no package is declared'}.`
}

export const APPROVAL_HINT =
	'npm asks for its approval in the browser once. On its page, tick the option that skips two-factor authentication for 5 minutes, so the other packages pass without asking again.'

function outcomeLine(
	outcome: SetupOutcome,
	repository: string,
	deadline: string,
): string {
	const { name, version } = outcome.published
	if (outcome.kind === 'nothing to publish')
		return `${name}: ${version} is on npm already and no release is pending, so nothing was set: npm would drop a trust that no release uses within ${VALIDATION_HOURS} hours. Run this again on the branch that raises the version.`
	if (outcome.kind === 'trusted already')
		return `${name}: npm already trusts ${repository} ${DEPLOY_WORKFLOW_FILE}. Nothing changed. A trust that never published within ${VALIDATION_HOURS} hours of being set has expired, and the release of ${version} refuses it: then delete it in the package's settings on npmjs.com and run this again.`
	const created = outcome.isStaged
		? `created with npm's public 0.0.0-stage placeholder (the staged ${PLACEHOLDER.version} behind it stays unapproved and installs nothing), `
		: ''
	return `${name}: ${created}npm now trusts ${repository} ${DEPLOY_WORKFLOW_FILE}. The next Deploy run that reaches it publishes ${version}: merge before ${deadline}. Past that the trust expires: delete it in the package's settings on npmjs.com, then run this again.`
}

export function setupReport(
	outcomes: readonly SetupOutcome[],
	repository: string,
	now: Date,
): readonly string[] {
	const deadline = minuteOf(
		new Date(now.getTime() + VALIDATION_HOURS * HOUR_MS),
	)
	return outcomes.map(outcome => outcomeLine(outcome, repository, deadline))
}

export const TERMINAL_REQUIRED =
	'npm asks for its approval in the browser only when it runs in a terminal. Open a terminal tab and run this command there.'
