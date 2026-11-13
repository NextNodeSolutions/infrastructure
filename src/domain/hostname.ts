import { Refusal } from './refusal.ts'

export type Zone = {
	readonly id: string
	readonly name: string
}

export type HostnameClaim = {
	readonly hostname: string
	readonly worker: string
	readonly holder: string | undefined
	readonly zone: Zone | undefined
	readonly recordTypes: readonly string[]
}

// The zone is the longest registered name of the account that the hostname belongs to.
export function zoneFor(
	hostname: string,
	zones: readonly Zone[],
): Zone | undefined {
	return zones
		.filter(
			zone =>
				hostname === zone.name || hostname.endsWith(`.${zone.name}`),
		)
		.toSorted((left, right) => right.name.length - left.name.length)[0]
}

// Wrangler attaches a hostname by replacing whatever answers there. The platform looks
// first and takes a hostname only when nothing holds it, so a file cannot take over an
// address that serves another Worker or another service.
export function refuseTakenHostname(claim: HostnameClaim, file: string): void {
	const { hostname, worker, holder } = claim
	if (holder === worker) return
	if (holder) {
		throw new Refusal(
			file,
			`${file}: ${hostname} already serves the Worker ${holder}. Choose another domain, or detach it from ${holder} in Cloudflare first`,
		)
	}
	if (!claim.zone) {
		throw new Refusal(
			file,
			`${file}: no zone of the Cloudflare account holds ${hostname}. Choose a domain under a zone of the account`,
		)
	}
	if (claim.recordTypes.length) {
		throw new Refusal(
			file,
			`${file}: ${hostname} already has a DNS record (${claim.recordTypes.join(', ')}). Choose another domain, or delete the record in Cloudflare first`,
		)
	}
}
