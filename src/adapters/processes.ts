import { spawn } from 'node:child_process'

import type { Command } from '../domain/commands.ts'

type Output = 'captured' | 'streamed'

function describe(command: Command): string {
	return [command.program, ...command.args].join(' ')
}

// Arguments reach the child as an array: no shell ever reads a value the project wrote.
function spawnCommand(
	command: Command,
	cwd: string,
	output: Output,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command.program, command.args, {
			cwd,
			stdio:
				output === 'captured'
					? ['ignore', 'pipe', 'inherit']
					: 'inherit',
		})
		const chunks: Buffer[] = []
		child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk))
		child.on('error', reject)
		child.on('close', code => {
			if (code === 0) {
				resolve(Buffer.concat(chunks).toString('utf8'))
				return
			}
			reject(
				new Error(
					`${describe(command)} exited with ${code ?? 'a signal'}`,
				),
			)
		})
	})
}

export function capture(command: Command, cwd: string): Promise<string> {
	return spawnCommand(command, cwd, 'captured')
}

export async function stream(command: Command, cwd: string): Promise<void> {
	await spawnCommand(command, cwd, 'streamed')
}

export async function runInOrder(
	commands: readonly Command[],
	cwd: string,
): Promise<void> {
	const [first, ...rest] = commands
	if (!first) return
	await stream(first, cwd)
	await runInOrder(rest, cwd)
}
