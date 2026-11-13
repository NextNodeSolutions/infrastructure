import { setTimeout as pause } from 'node:timers/promises'

export type Patience = {
	readonly everyMs: number
	readonly forMs: number
}

// Asks again until an answer comes or the patience runs out on the clock, however long
// each question took.
export async function until<Answer extends object>(
	ask: () => Promise<Answer | undefined>,
	patience: Patience,
): Promise<Answer | undefined> {
	return askUntil(ask, patience.everyMs, Date.now() + patience.forMs)
}

async function askUntil<Answer extends object>(
	ask: () => Promise<Answer | undefined>,
	everyMs: number,
	deadline: number,
): Promise<Answer | undefined> {
	const answer = await ask()
	const remainingMs = deadline - Date.now()
	if (answer || remainingMs <= 0) return answer
	await pause(Math.min(everyMs, remainingMs))
	return askUntil(ask, everyMs, deadline)
}
