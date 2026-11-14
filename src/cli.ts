import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { leaveWorkspace } from './adapters/relocation.ts'

// The entry point moves the program out of the workspace, then loads it from where it
// stays. Nothing of the program runs, and nothing of the project, before the move.
await import(pathToFileURL(join(leaveWorkspace(), 'src', 'main.ts')).href)
