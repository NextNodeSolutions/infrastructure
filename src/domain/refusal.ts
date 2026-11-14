export class Refusal extends Error {
	readonly file: string

	constructor(file: string, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'Refusal'
		this.file = file
	}
}

export function causeOf(failure: unknown): string {
	return failure instanceof Error ? failure.message : String(failure)
}

export function refusal(file: string, reason: string): Refusal {
	return new Refusal(file, `${file}: ${reason}`)
}
