import { PACKAGE_ACCESSES } from './declaration.ts'
import { decoder } from './decode.ts'
import { decodeWorker, WORKER_KEYS } from './nextnode-worker.ts'
import { refusal } from './refusal.ts'

import type { Declaration, PackageDeclaration } from './declaration.ts'
import type { Fields } from './decode.ts'
import type { Decoding } from './nextnode-worker.ts'
import type { Refusal } from './refusal.ts'

const PACKAGE_KEY = 'package'

export function decodeNextnodeToml(parsed: unknown, file: string): Declaration {
	const refuse = (message: string): Refusal => refusal(file, message)
	const decoding = { decode: decoder(refuse, 'a table'), refuse }
	const fields = decoding.decode.record(parsed, 'the file')
	decoding.decode.onlyKeys(fields, [...WORKER_KEYS, PACKAGE_KEY], 'the file')
	const packageFields = decoding.decode.optionalRecord(fields, PACKAGE_KEY)
	if (!packageFields) return decodeWorker(fields, decoding)
	return decodePackage(fields, packageFields, decoding)
}

function decodePackage(
	fields: Fields,
	packageFields: Fields,
	{ decode, refuse }: Decoding,
): PackageDeclaration {
	const foreign = Object.keys(fields).filter(key => key !== PACKAGE_KEY)
	if (foreign.length) {
		throw refuse(
			`a file with [${PACKAGE_KEY}] publishes a package and deploys nothing else: remove ${foreign.join(', ')}`,
		)
	}
	decode.onlyKeys(packageFields, ['access'], PACKAGE_KEY)
	return {
		kind: 'package',
		access: decode.oneOf(
			packageFields,
			'access',
			PACKAGE_ACCESSES,
			`${PACKAGE_KEY}.access`,
		),
	}
}
