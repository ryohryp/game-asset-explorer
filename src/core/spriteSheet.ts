export interface SpriteCell { index: number; row: number; column: number; x: number; y: number; width: number; height: number; }

export function buildSpriteCells(width: number, height: number, rows: number, columns: number): SpriteCell[] {
  if (!Number.isInteger(rows) || !Number.isInteger(columns) || rows < 1 || columns < 1 || width < 1 || height < 1) return [];
  const cellWidth = width / columns, cellHeight = height / rows;
  const cells: SpriteCell[] = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    cells.push({ index: row * columns + column, row, column, x: column * cellWidth, y: row * cellHeight, width: cellWidth, height: cellHeight });
  }
  return cells;
}
