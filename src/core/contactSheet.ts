export interface ContactSheetItem {
  fileName: string;
  dataUri: string;
}

export interface ContactSheetOptions {
  columns: number;
  cellSize: number;
}

export function renderContactSheetSvg(items: readonly ContactSheetItem[], options: ContactSheetOptions): string {
  if (items.length < 2) throw new Error("Select at least two images.");
  if (!Number.isInteger(options.columns) || options.columns < 1 || options.columns > 12) throw new Error("Columns must be between 1 and 12.");
  if (!Number.isInteger(options.cellSize) || options.cellSize < 64 || options.cellSize > 1024) throw new Error("Cell size must be between 64 and 1024 pixels.");
  const labelHeight = 28;
  const rows = Math.ceil(items.length / options.columns);
  const width = options.columns * options.cellSize;
  const height = rows * (options.cellSize + labelHeight);
  const cells = items.map((item, index) => {
    const column = index % options.columns;
    const row = Math.floor(index / options.columns);
    const x = column * options.cellSize;
    const y = row * (options.cellSize + labelHeight);
    return `<g transform="translate(${x} ${y})"><rect width="${options.cellSize}" height="${options.cellSize + labelHeight}" fill="white" stroke="#ccc"/><image href="${escapeXml(item.dataUri)}" x="8" y="8" width="${options.cellSize - 16}" height="${options.cellSize - 16}" preserveAspectRatio="xMidYMid meet"/><text x="8" y="${options.cellSize + 19}" font-family="sans-serif" font-size="13">${escapeXml(item.fileName)}</text></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${cells}</svg>`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
