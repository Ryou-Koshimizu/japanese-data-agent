// Models sometimes put a small markdown table inside a finding. Split the text
// into plain lines and tables so the UI never shows raw "| a | b |" pipes.
export type FindingBlock =
  | { type: 'text'; text: string }
  | { type: 'table'; columns: string[]; rows: string[][] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());
const isTableLine = (line: string) => /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line: string) => /^\s*\|?[\s:|-]+\|?\s*$/.test(line);

export function findingBlocks(text: string): FindingBlock[] {
  const blocks: FindingBlock[] = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      isTableLine(line) &&
      i + 1 < lines.length &&
      isSeparator(lines[i + 1])
    ) {
      const columns = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i]))
        rows.push(cells(lines[i++]));
      i--;
      blocks.push({ type: 'table', columns, rows });
    } else if (line.trim()) {
      blocks.push({ type: 'text', text: line.trim() });
    }
  }
  return blocks;
}
