export type Decoder = {
	readonly record: (parsed: unknown, what: string) => Record<string, unknown>
	readonly string: (fields: Record<string, unknown>, key: string) => string
	readonly optionalString: (
		fields: Record<string, unknown>,
		key: string,
	) => string | undefined
	readonly keysOf: (
		fields: Record<string, unknown>,
		key: string,
	) => readonly string[]
}

export function decoder(invalid: (message: string) => Error): Decoder {
	const record = (parsed: unknown, what: string): Record<string, unknown> => {
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			throw invalid(`${what} must be a JSON object`)
		}
		const fields: Record<string, unknown> = { ...parsed }
		return fields
	}
	const string = (fields: Record<string, unknown>, key: string): string => {
		if (!(key in fields)) throw invalid(`${key} is missing`)
		const field = fields[key]
		if (typeof field !== 'string') throw invalid(`${key} must be a string`)
		return field
	}
	const optionalString = (
		fields: Record<string, unknown>,
		key: string,
	): string | undefined => {
		if (!(key in fields)) return undefined
		return string(fields, key)
	}
	const keysOf = (
		fields: Record<string, unknown>,
		key: string,
	): readonly string[] => {
		if (!(key in fields)) return []
		return Object.keys(record(fields[key], key))
	}
	return { record, string, optionalString, keysOf }
}
