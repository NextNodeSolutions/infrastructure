export const ROOT_DIRECTORY = '.'

export function fileIn(directory: string, name: string): string {
	return directory === ROOT_DIRECTORY ? name : `${directory}/${name}`
}
