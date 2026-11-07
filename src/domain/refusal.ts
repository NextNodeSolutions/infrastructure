export class Refusal extends Error {
	readonly file: string

	constructor(file: string, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = 'Refusal'
		this.file = file
	}
}
