import { decoder } from '../domain/decode.ts'

import { takeVariable } from './environment.ts'
import {
	encodePath,
	fieldsOf,
	isSuccess,
	messageOf,
	NOT_FOUND,
	send,
} from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'
import type { Reply } from './http.ts'

const API = 'https://api.github.com'
const PER_PAGE = 100
const JSON_REPLY = 'application/vnd.github+json'
const RAW_REPLY = 'application/vnd.github.raw+json'

export type GitHub = {
	readonly get: (path: string, accept?: string) => Promise<Reply>
	readonly post: (path: string, body: Fields) => Promise<Reply>
}

// The REST API of the repository the run belongs to, with the job's own token, taken out
// of the environment so that no process the job starts afterwards inherits it.
export function takeGitHub(
	event: Pick<PullRequestEvent, 'owner' | 'repository'>,
): GitHub {
	const token = takeVariable('GITHUB_TOKEN')
	const root = `${API}/repos/${event.owner}/${event.repository}`
	const headers = (accept: string): Record<string, string> => ({
		authorization: `Bearer ${token}`,
		accept,
		'x-github-api-version': '2022-11-28',
	})
	return {
		get: (path, accept = JSON_REPLY) =>
			send({
				method: 'GET',
				url: `${root}${path}`,
				headers: headers(accept),
			}),
		post: (path, body) =>
			send({
				method: 'POST',
				url: `${root}${path}`,
				headers: headers(JSON_REPLY),
				body,
			}),
	}
}

export function refusedBy(reply: Reply, action: string): Error {
	return new Error(
		`GitHub refused to ${action} (HTTP ${reply.status}): ${messageOf(reply)}`,
	)
}

export type Listing = {
	readonly path: string
	readonly action: string
	readonly entries: (reply: Reply) => readonly Fields[]
}

// GitHub hands a long list page by page, and a page shorter than asked for is the last.
export async function findInPages<Found>(
	api: GitHub,
	listing: Listing,
	find: (entries: readonly Fields[]) => Promise<Found | undefined>,
	page = 1,
): Promise<Found | undefined> {
	const separator = listing.path.includes('?') ? '&' : '?'
	const reply = await api.get(
		`${listing.path}${separator}per_page=${PER_PAGE}&page=${page}`,
	)
	if (!isSuccess(reply)) throw refusedBy(reply, listing.action)
	const entries = listing.entries(reply)
	const found = await find(entries)
	if (found || entries.length < PER_PAGE) return found
	return findInPages(api, listing, find, page + 1)
}

export type BranchTip = {
	readonly commit: string
	readonly parent: string | undefined
}

export async function branchTip(
	api: GitHub,
	branch: string,
): Promise<BranchTip> {
	const reply = await api.get(`/commits/${encodeURIComponent(branch)}`)
	if (!isSuccess(reply)) throw refusedBy(reply, `read the tip of ${branch}`)
	const decode = decoder(message => new Error(`GitHub branch: ${message}`))
	const tip = fieldsOf(reply, 'the branch tip')
	const [parent] = decode.records(tip, 'parents')
	return {
		commit: decode.string(tip, 'sha'),
		parent: parent && decode.string(parent, 'sha'),
	}
}

// A file as the commit holds it, read through the API: the job that reads it this way
// needs no checkout of the project, so nothing of the project lands on its disk.
export async function readFileAt(
	api: GitHub,
	path: string,
	commit: string,
): Promise<string> {
	const reply = await api.get(
		`/contents/${encodePath(path)}?ref=${encodeURIComponent(commit)}`,
		RAW_REPLY,
	)
	if (reply.status === NOT_FOUND)
		throw new Error(`The commit ${commit} holds no ${path}`)
	if (!isSuccess(reply)) throw refusedBy(reply, `read ${path} at ${commit}`)
	return reply.text
}
