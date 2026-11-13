import type { Command } from './commands.ts'

// The CLI the Automation API drives, pinned like an action: by its version and by the
// digest Pulumi publishes for the runner's platform. It moves with @pulumi/pulumi.
const VERSION = '3.276.0'
const PLATFORM = 'linux-x64'

export const PULUMI_CLI = {
	platform: PLATFORM,
	archive: `https://github.com/pulumi/pulumi/releases/download/v${VERSION}/pulumi-v${VERSION}-${PLATFORM}.tar.gz`,
	sha256: '99f6b4626be083a3326517a46ba33b995f44812058143a018d9dffaa027ec3bf',
} as const

// The archive holds one pulumi directory; its binaries go where the SDK looks for them.
export function unpackPulumi(archive: string, binaries: string): Command {
	return {
		program: 'tar',
		args: [
			'--extract',
			'--gzip',
			'--file',
			archive,
			'--directory',
			binaries,
			'--strip-components=1',
		],
	}
}
