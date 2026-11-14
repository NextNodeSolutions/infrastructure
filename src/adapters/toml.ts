import { Refusal } from '../domain/refusal.ts'

// The parser is loaded when called: the Checks commands run with nothing installed, so no
// module they load may import a dependency.
export async function parseToml(text: string, file: string): Promise<unknown> {
	const { parse } = await import('smol-toml')
	try {
		const parsed: unknown = parse(text)
		return parsed
	} catch (failure: unknown) {
		const [reason = 'it cannot be read'] =
			failure instanceof Error ? failure.message.split('\n') : []
		throw new Refusal(file, `${file} is not valid TOML: ${reason}`, {
			cause: failure,
		})
	}
}
