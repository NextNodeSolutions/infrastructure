import { until } from './wait.ts'

const REQUEST_TIMEOUT_MS = 10_000
const MS_PER_SECOND = 1000
const FIRST_CLIENT_ERROR = 400
// A hostname attached for the first time waits for its certificate.
const PATIENCE = { everyMs: 5000, forMs: 180_000 }

type Answered = { readonly status: number }
type Answer = Answered | { readonly failure: string }

async function ask(url: string): Promise<Answer> {
	try {
		const response = await fetch(url, {
			redirect: 'manual',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
		return { status: response.status }
	} catch (failure: unknown) {
		return {
			failure: failure instanceof Error ? failure.message : 'no answer',
		}
	}
}

function healthyOf(answer: Answer): Answered | undefined {
	if (!('status' in answer) || answer.status >= FIRST_CLIENT_ERROR)
		return undefined
	return answer
}

function describe(answer: Answer | undefined): string {
	if (!answer) return 'no answer'
	return 'status' in answer ? `HTTP ${answer.status}` : answer.failure
}

// A deployment is done when what was deployed answers: any answer below 400 counts, a
// redirect included. It is asked after the upload, so a failure here leaves the new
// version serving.
export async function waitUntilHealthy(url: string): Promise<number> {
	const answers: Answer[] = []
	const healthy = await until(async () => {
		const answer = await ask(url)
		answers.push(answer)
		return healthyOf(answer)
	}, PATIENCE)
	if (healthy) return healthy.status
	throw new Error(
		`${url} did not answer below ${FIRST_CLIENT_ERROR} within ${PATIENCE.forMs / MS_PER_SECOND} seconds: last answer ${describe(answers.at(-1))}. The new version is uploaded and serves: merge a fix, or roll back to the previous version in Cloudflare`,
	)
}
