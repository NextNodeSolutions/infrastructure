import { readPullRequestEvent } from '../adapters/event.ts'
import { branchTip, takeGitHub } from '../adapters/github-api.ts'
import { writeOutputs, writeSummary } from '../adapters/github.ts'
import { takeRunIdentity } from '../adapters/run-identity.ts'
import { platformCredentials } from '../adapters/vault.ts'
import {
	isVaultVerification,
	refuseUnlessStanding,
} from '../domain/occasion.ts'

export async function deployVerifyVault(): Promise<void> {
	try {
		const event = readPullRequestEvent()
		if (!isVaultVerification(event)) {
			writeOutputs({ selected: 'false' })
			return
		}
		refuseUnlessStanding(event)
		writeOutputs({ selected: 'true' })
		const { commit } = await branchTip(
			takeGitHub(event),
			event.defaultBranch,
		)
		if (commit !== event.headSha) throw new Error('Stale run')
	} catch {
		throw new Error(
			'Vault verification requires the current standing pull request. Use the latest run.',
		)
	}
	try {
		await platformCredentials(takeRunIdentity(), () => {})
	} catch {
		throw new Error(
			'Vault verification failed. Ask the vault owner to check workflow admission and platform read access.',
		)
	}
	writeSummary('Platform vault access verified.\n')
}
