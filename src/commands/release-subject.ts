import { readFileAt } from '../adapters/github-api.ts'
import { subjectFrom } from '../adapters/subject-reader.ts'

import type { GitHub } from '../adapters/github-api.ts'
import type { DeployEntry } from '../domain/deployable.ts'
import type { PullRequestEvent } from '../domain/occasion.ts'
import type { Subject } from '../domain/subject.ts'

// What the commit deploys from the requested directory, read through the API. The matrix
// entry is a request: the release goes on only when the commit derives the same
// deployable from that directory.
export async function committedSubject(
	api: GitHub,
	event: PullRequestEvent,
	requested: DeployEntry,
): Promise<Subject> {
	const { directory } = requested
	const subject = await subjectFrom(event.repository, directory, file =>
		readFileAt(api, file, event.headSha),
	)
	const { name, kind } = subject.deployable
	if (name === requested.name && kind === requested.kind) return subject
	throw new Error(
		`The commit deploys ${directory} as the ${kind} ${name}, and this job was asked for the ${requested.kind} ${requested.name}`,
	)
}
