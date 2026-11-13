import { setTimeout as pause } from 'node:timers/promises'

export type Patience = {
	readonly everyMs: number
	readonly forMs: number
}

// Asks again until an answer comes or the patience runs out.
export async function until<Answer extends object>(
	ask: () => Promise<Answer | undefined>,
	patience: Patience,
): Promise<Answer | undefined> {
	const answer = await ask()
	if (answer || patience.forMs <= 0) return answer
	await pause(patience.everyMs)
	return until(ask, {
		everyMs: patience.everyMs,
		forMs: patience.forMs - patience.everyMs,
	})
}
