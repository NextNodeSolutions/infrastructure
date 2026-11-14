import { readFileSync } from 'node:fs'

import { decoder } from '../domain/decode.ts'
import { VISIBILITIES } from '../domain/occasion.ts'

import { requiredVariable } from './environment.ts'

import type { Fields } from '../domain/decode.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'

const NOT_A_PULL_REQUEST =
	'the Deploy workflow runs on pull request events only'

// GitHub leaves the head repository empty once a fork is deleted.
function isNamed(repository: unknown, fullName: string): boolean {
	if (typeof repository !== 'object' || repository === null) return false
	return 'full_name' in repository && repository.full_name === fullName
}

// The id outlives a rename, so ownership keys on it.
function idOf(repository: Fields): string {
	const { id } = repository
	if (!Number.isSafeInteger(id)) {
		throw new Error(
			`repository.id must be an integer: ${NOT_A_PULL_REQUEST}`,
		)
	}
	return String(id)
}

// The event GitHub wrote for this run. It is the one description of the pull request
// that the project cannot write: the jobs that hold a credential decide from it alone.
export function readPullRequestEvent(): PullRequestEvent {
	const decode = decoder(
		message => new Error(`${message}: ${NOT_A_PULL_REQUEST}`),
	)
	const parsed: unknown = JSON.parse(
		readFileSync(requiredVariable('GITHUB_EVENT_PATH'), 'utf8'),
	)
	const event = decode.record(parsed, 'the event')
	const pullRequest = decode.record(event.pull_request, 'pull_request')
	const repository = decode.record(event.repository, 'repository')
	const head = decode.record(pullRequest.head, 'pull_request.head')
	const base = decode.record(pullRequest.base, 'pull_request.base')
	return {
		owner: decode.string(decode.record(repository.owner, 'owner'), 'login'),
		repository: decode.string(repository, 'name'),
		repositoryId: idOf(repository),
		visibility: decode.oneOf(
			repository,
			'visibility',
			VISIBILITIES,
			'repository.visibility',
		),
		defaultBranch: decode.string(repository, 'default_branch'),
		baseRef: decode.string(base, 'ref'),
		headRef: decode.string(head, 'ref'),
		headSha: decode.string(head, 'sha'),
		origin: isNamed(head.repo, decode.string(repository, 'full_name'))
			? 'this repository'
			: 'a fork',
		sender: decode.string(decode.record(event.sender, 'sender'), 'login'),
	}
}
