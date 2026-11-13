export type Fields = Record<string, unknown>

export type Decoder = {
	readonly record: (parsed: unknown, what: string) => Fields
	readonly string: (fields: Fields, key: string) => string
	readonly stringRecord: (
		parsed: unknown,
		what: string,
	) => Readonly<Record<string, string>>
	readonly optionalString: (fields: Fields, key: string) => string | undefined
	readonly oneOf: <Value extends string>(
		fields: Fields,
		key: string,
		accepted: readonly Value[],
		label?: string,
	) => Value
	readonly optionalRecord: (fields: Fields, key: string) => Fields | undefined
	readonly strings: (fields: Fields, key: string) => readonly string[]
	readonly recordList: (parsed: unknown, what: string) => readonly Fields[]
	readonly records: (fields: Fields, key: string) => readonly Fields[]
	readonly keysOf: (fields: Fields, key: string) => readonly string[]
	readonly onlyKeys: (
		fields: Fields,
		accepted: readonly string[],
		what: string,
	) => void
}

type Invalid = (message: string) => Error
type Scalars = Pick<
	Decoder,
	| 'record'
	| 'string'
	| 'stringRecord'
	| 'optionalString'
	| 'oneOf'
	| 'optionalRecord'
>
type Lists = Omit<Decoder, keyof Scalars>

const JSON_OBJECT = 'a JSON object'

function scalars(invalid: Invalid, container: string): Scalars {
	const record = (parsed: unknown, what: string): Fields => {
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			throw invalid(`${what} must be ${container}`)
		}
		const fields: Fields = { ...parsed }
		return fields
	}
	const string = (fields: Fields, key: string): string => {
		if (!(key in fields)) throw invalid(`${key} is missing`)
		const field = fields[key]
		if (typeof field !== 'string') throw invalid(`${key} must be a string`)
		return field
	}
	return {
		record,
		string,
		stringRecord: (parsed, what) => {
			const fields = record(parsed, what)
			return Object.fromEntries(
				Object.keys(fields).map(key => [key, string(fields, key)]),
			)
		},
		optionalString: (fields, key) =>
			key in fields ? string(fields, key) : undefined,
		oneOf: (fields, key, accepted, label = key) => {
			const field = string(fields, key)
			const found = accepted.find(choice => choice === field)
			if (!found)
				throw invalid(`${label} must be one of ${accepted.join(', ')}`)
			return found
		},
		optionalRecord: (fields, key) =>
			key in fields ? record(fields[key], key) : undefined,
	}
}

function lists(invalid: Invalid, { record, optionalRecord }: Scalars): Lists {
	const listed = (parsed: unknown, what: string): readonly unknown[] => {
		if (!Array.isArray(parsed)) throw invalid(`${what} must be a list`)
		const entries: readonly unknown[] = parsed
		return entries
	}
	const list = (fields: Fields, key: string): readonly unknown[] =>
		key in fields ? listed(fields[key], key) : []
	const recordList = (parsed: unknown, what: string): readonly Fields[] =>
		listed(parsed, what).map(entry => record(entry, `an entry of ${what}`))
	return {
		strings: (fields, key) =>
			list(fields, key).map(entry => {
				if (typeof entry !== 'string')
					throw invalid(`${key} must list strings`)
				return entry
			}),
		recordList,
		records: (fields, key) =>
			key in fields ? recordList(fields[key], key) : [],
		keysOf: (fields, key) => Object.keys(optionalRecord(fields, key) ?? {}),
		onlyKeys: (fields, accepted, what) => {
			const refused = Object.keys(fields).filter(
				key => !accepted.includes(key),
			)
			if (!refused.length) return
			throw invalid(
				`${what} does not take ${refused.join(', ')}. It takes: ${accepted.join(', ')}`,
			)
		},
	}
}

export function decoder(
	invalid: Invalid,
	container: string = JSON_OBJECT,
): Decoder {
	const scalar = scalars(invalid, container)
	return { ...scalar, ...lists(invalid, scalar) }
}
