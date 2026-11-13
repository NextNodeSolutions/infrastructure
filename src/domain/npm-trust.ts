import { decoder } from './decode.ts'
import { DEPLOY_WORKFLOW_FILE } from './platform.ts'

import type { Fields } from './decode.ts'

export const NPM_SETUP = 'pnpm setup-npm'
const GITHUB_PROVIDER = 'github'
const PUBLISH_PERMISSION = 'createPackage'
const APPROVAL_CODE = 'EOTP'
// With --json, npm prints one object per configuration, each starting on a line of its
// own, and prints nothing when the package has none.
const NEXT_OBJECT = /^(?=\{)/m

const decode = decoder(message => new Error(`npm trust list: ${message}`))

export type TrustedPublisher = {
	readonly id: string
	readonly provider: string
	readonly repository: string | undefined
	readonly file: string | undefined
	readonly environment: string | undefined
	readonly permissions: readonly string[] | undefined
}

function publisherOf(fields: Fields): TrustedPublisher {
	return {
		id: decode.string(fields, 'id'),
		provider: decode.string(fields, 'type'),
		repository: decode.optionalString(fields, 'repository'),
		file: decode.optionalString(fields, 'file'),
		environment: decode.optionalString(fields, 'environment'),
		permissions:
			'permissions' in fields
				? decode.strings(fields, 'permissions')
				: undefined,
	}
}

function parsedObjects(text: string): readonly unknown[] {
	if (text.startsWith('[')) {
		const parsed: unknown = JSON.parse(text)
		return decode.recordList(parsed, 'the listing')
	}
	return text.split(NEXT_OBJECT).map(chunk => {
		const parsed: unknown = JSON.parse(chunk)
		return parsed
	})
}

export function decodeTrustList(printed: string): readonly TrustedPublisher[] {
	const text = printed.trim()
	if (text === '') return []
	return parsedObjects(text).map(entry =>
		publisherOf(decode.record(entry, 'a configuration')),
	)
}

// A configuration made before npm listed permissions allows direct publishing only.
export function trustsDeploy(
	publisher: TrustedPublisher,
	repository: string,
): boolean {
	return (
		publisher.provider === GITHUB_PROVIDER &&
		publisher.repository === repository &&
		publisher.file === DEPLOY_WORKFLOW_FILE &&
		!publisher.environment &&
		(publisher.permissions?.includes(PUBLISH_PERMISSION) ?? true)
	)
}

function described(publisher: TrustedPublisher): string {
	const where = [publisher.repository, publisher.file, publisher.environment]
		.filter(Boolean)
		.join(' ')
	return `${publisher.provider} ${where} (id ${publisher.id})`
}

// npm keeps one trust per package, so another one is replaced only by a person who
// decides the Deploy workflow takes over.
export function occupiedTrust(
	name: string,
	publishers: readonly TrustedPublisher[],
): string {
	const revoke = publishers
		.map(({ id }) => `\`npm trust revoke --id ${id} ${name}\``)
		.join(' and ')
	return `npm trusts ${publishers.map(described).join(', ')} to publish ${name}, and keeps one trust per package. If the Deploy workflow replaces it, run ${revoke}, then this command again`
}

export function asksForApproval(complaint: string): boolean {
	return complaint.includes(APPROVAL_CODE)
}
