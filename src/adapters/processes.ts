import { spawn } from 'node:child_process'

import type { Command } from '../domain/commands.ts'
import type { ToolEnvironment } from './environment.ts'

type Output = 'captured' | 'streamed'

function describe(command: Command): string {
	return [command.program, ...command.args].join(' ')
}

// Arguments reach the child as an array: no shell ever reads a value the project wrote.
function spawnCommand(
	command: Command,
	cwd: string,
	output: Output,
	environment?: ToolEnvironment,
): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command.program, command.args, {
			cwd,
			env: environment,
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

// Without an environment the child inherits the job's. With one it gets that and no more.
export async function stream(
	command: Command,
	cwd: string,
	environment?: ToolEnvironment,
): Promise<void> {
	await spawnCommand(command, cwd, 'streamed', environment)
}

export type Attempt = {
	readonly isSuccess: boolean
	readonly printed: string
	readonly complaint: string
}

function collected(chunks: readonly Buffer[]): string {
	return Buffer.concat(chunks).toString('utf8')
}

// For a command that may fail as an answer: what it printed and what it complained about,
// with no terminal attached, so nothing it runs can prompt.
export function attempt(command: Command, cwd: string): Promise<Attempt> {
	return new Promise((resolve, reject) => {
		const child = spawn(command.program, command.args, {
			cwd,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		const printed: Buffer[] = []
		const complaint: Buffer[] = []
		child.stdout.on('data', (chunk: Buffer) => printed.push(chunk))
		child.stderr.on('data', (chunk: Buffer) => complaint.push(chunk))
		child.on('error', reject)
		child.on('close', code =>
			resolve({
				isSuccess: code === 0,
				printed: collected(printed),
				complaint: collected(complaint),
			}),
		)
	})
}

// For a command whose exit code is the answer.
export function succeeds(command: Command, cwd: string): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const child = spawn(command.program, command.args, {
			cwd,
			stdio: 'ignore',
		})
		child.on('error', reject)
		child.on('close', code => resolve(code === 0))
	})
}

export async function runInOrder(
	commands: readonly Command[],
	cwd: string,
	environment?: ToolEnvironment,
): Promise<void> {
	const [first, ...rest] = commands
	if (!first) return
	await stream(first, cwd, environment)
	await runInOrder(rest, cwd, environment)
}
