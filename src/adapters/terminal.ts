export function isTerminal(): boolean {
	return Boolean(process.stdin.isTTY && process.stdout.isTTY)
}

export function say(lines: readonly string[]): void {
	process.stdout.write(`${lines.join('\n')}\n`)
}
