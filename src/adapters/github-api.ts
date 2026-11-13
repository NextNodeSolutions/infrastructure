import { isSuccess, messageOf, NOT_FOUND, send } from './http.ts'

import type { Fields } from '../domain/decode.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'
import type { Reply } from './http.ts'

const API = 'https://api.github.com'
const JSON_REPLY = 'application/vnd.github+json'
const RAW_REPLY = 'application/vnd.github.raw+json'

export type GitHub = {
	readonly get: (path: string, accept?: string) => Promise<Reply>
	readonly post: (path: string, body: Fields) => Promise<Reply>
}

// The REST API of the repository the run belongs to, with the job's own token.
export function gitHub(
	token: string,
	event: Pick<PullRequestEvent, 'owner' | 'repository'>,
): GitHub {
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

// A file as the commit holds it, read through the API: the job that reads it this way
// needs no checkout of the project, so nothing of the project lands on its disk.
export async function readFileAt(
	api: GitHub,
	path: string,
	commit: string,
): Promise<string> {
	const encoded = path.split('/').map(encodeURIComponent).join('/')
	const reply = await api.get(
		`/contents/${encoded}?ref=${encodeURIComponent(commit)}`,
		RAW_REPLY,
	)
	if (reply.status === NOT_FOUND)
		throw new Error(`The commit ${commit} holds no ${path}`)
	if (!isSuccess(reply)) throw refusedBy(reply, `read ${path} at ${commit}`)
	return reply.text
}
