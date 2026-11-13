// A run as its job variables name it. A deployment records the run's URL, and the next
// run reads the run id back from that URL to prove the release.
export type RunAddress = {
	readonly serverUrl: string
	readonly repository: string
	readonly runId: string
}

const RUN_ID = /\/actions\/runs\/(\d+)(?:\/attempts\/\d+)?$/

export function runUrl({ serverUrl, repository, runId }: RunAddress): string {
	return `${serverUrl}/${repository}/actions/runs/${runId}`
}

export function runIdIn(url: string): string | undefined {
	return RUN_ID.exec(url)?.[1]
}
