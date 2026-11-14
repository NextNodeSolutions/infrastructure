type Row = readonly string[]

function rowOf(cells: Row): string {
	return `| ${cells.join(' | ')} |`
}

export function markdownTable(headers: Row, rows: readonly Row[]): Row {
	return [rowOf(headers), rowOf(headers.map(() => '---')), ...rows.map(rowOf)]
}
