export type Executor = 'single' | 'pnpm' | 'turbo'

export const EXECUTORS: readonly Executor[] = ['single', 'pnpm', 'turbo']

export const WORKSPACE_FILE = 'pnpm-workspace.yaml'
export const TURBO_FILE = 'turbo.json'

export type RepositoryShape = {
	readonly hasWorkspaceFile: boolean
	readonly hasTurboFile: boolean
}

export function executorFor(shape: RepositoryShape): Executor {
	if (!shape.hasWorkspaceFile) return 'single'
	return shape.hasTurboFile ? 'turbo' : 'pnpm'
}
