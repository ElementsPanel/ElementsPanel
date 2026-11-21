export const DESKTOP_ICON_WIDTH = 90;
export const DESKTOP_ICON_HEIGHT = 104;
export const DESKTOP_ICON_GAP = 12;

export interface IconPoint {
  x: number;
  y: number;
}

export interface IconCell {
  col: number;
  row: number;
}

export interface IconGrid {
  width: number;
  height: number;
  startX: number;
  startY: number;
  colWidth: number;
  rowHeight: number;
  iconWidth: number;
  iconHeight: number;
  columns: number;
  rows: number;
  scale: number;
}

export function createIconGrid(width: number, height: number, count: number): IconGrid {
  width = Number.isFinite(width) ? Math.max(1, width) : 1;
  height = Number.isFinite(height) ? Math.max(1, height) : 1;
  const minimumX = Math.min(16, width / 4);
  const startY = Math.min(16, height / 4);
  const usableWidth = width - minimumX * 2;
  const usableHeight = height - startY * 2;
  const needed = Number.isFinite(count) ? Math.max(1, Math.ceil(count)) : 1;
  const capacity = (scale: number) => ({
    columns: Math.max(
      1,
      Math.floor(
        (usableWidth / scale + DESKTOP_ICON_GAP) / (DESKTOP_ICON_WIDTH + DESKTOP_ICON_GAP) + 1e-8
      )
    ),
    rows: Math.max(
      1,
      Math.floor(
        (usableHeight / scale + DESKTOP_ICON_GAP) / (DESKTOP_ICON_HEIGHT + DESKTOP_ICON_GAP) + 1e-8
      )
    )
  });
  let scale = Math.min(1, usableWidth / DESKTOP_ICON_WIDTH, usableHeight / DESKTOP_ICON_HEIGHT);
  const initial = capacity(scale);
  if (initial.columns * initial.rows < needed) {
    let lower = 0;
    let upper = scale;
    for (let i = 0; i < 36; i++) {
      const middle = (lower + upper) / 2;
      const cells = capacity(middle);
      if (cells.columns * cells.rows >= needed) lower = middle;
      else upper = middle;
    }
    scale = lower;
  }
  const { columns, rows } = capacity(scale);
  const colWidth = (DESKTOP_ICON_WIDTH + DESKTOP_ICON_GAP) * scale;
  const rowHeight = (DESKTOP_ICON_HEIGHT + DESKTOP_ICON_GAP) * scale;
  const iconWidth = DESKTOP_ICON_WIDTH * scale;
  return {
    width,
    height,
    startX: (width - (columns - 1) * colWidth - iconWidth) / 2,
    startY,
    colWidth,
    rowHeight,
    iconWidth,
    iconHeight: DESKTOP_ICON_HEIGHT * scale,
    columns,
    rows,
    scale
  };
}

export function getIconCell(point: IconPoint, grid: IconGrid): IconCell {
  const x = Number.isFinite(point.x) ? point.x : grid.startX;
  const y = Number.isFinite(point.y) ? point.y : grid.startY;
  return {
    col: Math.max(
      0,
      Math.min(grid.columns - 1, Math.round((x - grid.startX) / grid.colWidth + 1e-8))
    ),
    row: Math.max(0, Math.min(grid.rows - 1, Math.round((y - grid.startY) / grid.rowHeight + 1e-8)))
  };
}

export function getIconPosition(cell: IconCell, grid: IconGrid): IconPoint {
  const col = Math.max(
    0,
    Math.min(grid.columns - 1, Number.isFinite(cell.col) ? Math.round(cell.col) : 0)
  );
  const row = Math.max(
    0,
    Math.min(grid.rows - 1, Number.isFinite(cell.row) ? Math.round(cell.row) : 0)
  );
  return {
    x: grid.startX + col * grid.colWidth,
    y: grid.startY + row * grid.rowHeight
  };
}

export function findIconCell(
  cell: IconCell,
  occupied: ReadonlySet<string>,
  grid: IconGrid
): IconCell {
  cell = getIconCell(getIconPosition(cell, grid), grid);
  if (!occupied.has(`${cell.col},${cell.row}`)) return cell;
  let closest = cell;
  let distance = Infinity;
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      if (occupied.has(`${col},${row}`)) continue;
      const nextDistance = (col - cell.col) ** 2 + (row - cell.row) ** 2;
      if (nextDistance < distance) {
        closest = { col, row };
        distance = nextDistance;
      }
    }
  }
  return closest;
}

export function arrangeDesktopIcons(
  ids: readonly string[],
  positions: ReadonlyMap<string, IconPoint>,
  grid: IconGrid
): Map<string, IconPoint> {
  const arranged = new Map<string, IconPoint>();
  const occupied = new Set<string>();
  const pending: { id: string; cell: IconCell }[] = [];
  ids.forEach((id, index) => {
    const position = positions.get(id);
    const cell = position
      ? getIconCell(position, grid)
      : { col: index % grid.columns, row: Math.floor(index / grid.columns) };
    const key = `${cell.col},${cell.row}`;
    if (
      position &&
      position.x >= grid.startX &&
      position.y >= grid.startY &&
      position.x + grid.iconWidth <= grid.width - grid.startX + 1e-6 &&
      position.y + grid.iconHeight <= grid.height - grid.startY + 1e-6 &&
      !occupied.has(key)
    ) {
      arranged.set(id, getIconPosition(cell, grid));
      occupied.add(key);
    } else pending.push({ id, cell });
  });
  for (const { id, cell } of pending) {
    const available = findIconCell(cell, occupied, grid);
    arranged.set(id, getIconPosition(available, grid));
    occupied.add(`${available.col},${available.row}`);
  }
  return arranged;
}
