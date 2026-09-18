import { inflateSync } from "node:zlib";

export interface TransparentBounds {
  width: number; height: number; x: number; y: number; contentWidth: number; contentHeight: number;
}

export function readPngTransparentBounds(buffer: Buffer): TransparentBounds | undefined {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature)) return undefined;
  const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24], colorType = buffer[25], interlace = buffer[28];
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 4)) return undefined;
  const channels = colorType === 6 ? 4 : 2;
  const chunks: Buffer[] = [];
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset + 12 + length > buffer.length) return undefined;
    if (type === "IDAT") chunks.push(buffer.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!chunks.length) return undefined;
  let raw: Buffer;
  try { raw = inflateSync(Buffer.concat(chunks)); } catch { return undefined; }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return undefined;
  let previous = Buffer.alloc(stride), position = 0;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    const filter = raw[position++];
    const row = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? row[i - channels] : 0;
      const up = previous[i] ?? 0;
      const upLeft = i >= channels ? (previous[i - channels] ?? 0) : 0;
      const predictor = pngPredictor(filter, left, up, upLeft);
      if (predictor === undefined) return undefined;
      row[i] = (raw[position++] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) if (row[x * channels + channels - 1] !== 0) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
    previous = row;
  }
  if (maxX < 0) return { width, height, x: 0, y: 0, contentWidth: 0, contentHeight: 0 };
  return { width, height, x: minX, y: minY, contentWidth: maxX - minX + 1, contentHeight: maxY - minY + 1 };
}

function pngPredictor(filter: number, left: number, up: number, upLeft: number): number | undefined {
  if (filter === 0) return 0;
  if (filter === 1) return left;
  if (filter === 2) return up;
  if (filter === 3) return Math.floor((left + up) / 2);
  if (filter === 4) {
    const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
    return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
  }
  return undefined;
}
