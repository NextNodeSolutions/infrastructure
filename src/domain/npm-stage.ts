import { decoder } from './decode.ts'

// The empty version that creates a package, at a prerelease no release declares.
export const PLACEHOLDER = { version: '0.0.0-placeholder', tag: 'placeholder' }
const PENDING = 'staged'

const decode = decoder(message => new Error(`npm stage list: ${message}`))

export type Stage = {
	readonly id: string
	readonly version: string
	readonly status: string
}

export function decodeStageList(printed: string): readonly Stage[] {
	const parsed: unknown = JSON.parse(printed)
	return decode.recordList(parsed, 'the listing').map(fields => ({
		id: decode.string(fields, 'id'),
		version: decode.string(fields, 'version'),
		status: decode.string(fields, 'status'),
	}))
}

// npm refuses to stage a version twice, so a run stopped before its approval leaves the
// placeholder staged for the next run to approve.
export function pendingPlaceholder(
	stages: readonly Stage[],
): string | undefined {
	return stages.find(
		stage =>
			stage.version === PLACEHOLDER.version && stage.status === PENDING,
	)?.id
}
