import { TURBO_FILE, WORKSPACE_FILE } from './executor.ts'
import { MANIFEST_FILE } from './manifest.ts'

export const ROOT_FILES: readonly string[] = [
	MANIFEST_FILE,
	'pnpm-lock.yaml',
	WORKSPACE_FILE,
	'tsconfig.json',
	TURBO_FILE,
	'.npmrc',
]

export type Selection =
	| { readonly scope: 'everything'; readonly reason: string }
	| {
			readonly scope: 'changed'
			readonly base: string
			readonly reason: string
	  }

export const SINGLE_PACKAGE: Selection = {
	scope: 'everything',
	reason: 'the single package',
}

export const WITHOUT_BASE: Selection = {
	scope: 'everything',
	reason: 'every package, because there is no base to compare with',
}

export function selectAgainstBase(
	base: string,
	hasRootFileChanged: boolean,
): Selection {
	if (hasRootFileChanged) {
		return {
			scope: 'everything',
			reason: 'every package, because a root file changed',
		}
	}
	return {
		scope: 'changed',
		base,
		reason: 'the packages changed since the base and their dependents',
	}
}

// Every package a change since the base reaches, through pnpm's own graph. A deployment
// ignores no file: Markdown is content for a site, so it selects like code does.
export function changedSince(base: string): readonly string[] {
	return ['--filter', `...[${base}]`]
}

// pnpm's own graph decides: Markdown never selects a package, and a change that
// only touches tests selects the package but not its dependents.
export function filterArguments(selection: Selection): readonly string[] {
	if (selection.scope === 'everything') return []
	return [
		...changedSince(selection.base),
		'--changed-files-ignore-pattern',
		'**/*.md',
		'--test-pattern',
		'**/*.{test,spec}.*',
	]
}
