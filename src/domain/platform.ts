// The one place that names the platform's own accounts. None of these is a secret: the
// vault admits a run by the claims of its GitHub token, never by knowing an id.
export const VAULT = {
	api: 'https://app.infisical.com/api',
	identity: '17af2913-5649-4771-b149-aa9bf50ff39d',
	project: '721a5f71-3801-40e2-a06d-a4a9b431e1c7',
	environment: 'main',
	audience: 'nextnode-deploy',
} as const

export const PLATFORM_SECRETS = {
	cloudflareToken: 'CLOUDFLARE_API_TOKEN',
	cloudflareAccount: 'CLOUDFLARE_ACCOUNT_ID',
	statePassphrase: 'PULUMI_CONFIG_PASSPHRASE',
} as const

export type PlatformCredentials = {
	readonly [Name in keyof typeof PLATFORM_SECRETS]: string
}

// Pulumi's state of every project, one stack per deployable. Whoever holds the platform's
// Cloudflare token reads it, and only the release job does.
export const STATE_BUCKET = 'nextnode-deploy-state'

export const NPM_REGISTRY = 'https://registry.npmjs.org'
export const NPM_PACKAGE_PAGE = 'https://www.npmjs.com/package'
