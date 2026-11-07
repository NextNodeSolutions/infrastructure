import standardsConfig from '@nextnode-solutions/standards/oxlint'
import { defineConfig } from 'oxlint'

// The domain takes data and returns data: it reaches no file, no process and no
// network, and imports nothing outside itself. An adapter holds one kind of IO and may
// read the domain's types. A command wires both for one job, and nothing calls a command.
const DOMAIN_GLOBALS = [
	{ name: 'process', message: 'the domain takes its input from a command' },
	{ name: 'fetch', message: 'the network belongs to an adapter' },
]

export default defineConfig({
	extends: [standardsConfig],
	overrides: [
		{
			files: ['src/domain/**'],
			rules: {
				'no-restricted-globals': ['error', ...DOMAIN_GLOBALS],
				'no-restricted-imports': [
					'error',
					{
						patterns: [
							{
								group: ['**', '!./**'],
								message:
									'the domain imports nothing outside itself',
							},
						],
					},
				],
			},
		},
		{
			files: ['src/adapters/**'],
			rules: {
				'no-restricted-imports': [
					'error',
					{
						patterns: [
							{
								group: ['**/commands/**'],
								message:
									'a command calls an adapter, never the reverse',
							},
						],
					},
				],
			},
		},
	],
})
