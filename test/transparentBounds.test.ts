import assert from "node:assert/strict";
import test from "node:test";
import { deflateSync } from "node:zlib";
import { readPngTransparentBounds } from "../src/core/transparentBounds";

function png(width: number, height: number, alpha: number[]): Buffer {
  const signature = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width,0); ihdr.writeUInt32BE(height,4); ihdr[8]=8; ihdr[9]=6;
  const rows: number[] = [];
  for(let y=0;y<height;y++){ rows.push(0); for(let x=0;x<width;x++) rows.push(0,0,0,alpha[y*width+x]); }
  return Buffer.concat([signature, chunk("IHDR",ihdr), chunk("IDAT",deflateSync(Buffer.from(rows))), chunk("IEND",Buffer.alloc(0))]);
}
function chunk(type:string,data:Buffer){ const out=Buffer.alloc(12+data.length); out.writeUInt32BE(data.length,0); out.write(type,4,"ascii"); data.copy(out,8); return out; }

test("calculates visible alpha bounds and transparent margins", () => {
  const result = readPngTransparentBounds(png(4,3,[0,0,0,0, 0,255,255,0, 0,0,255,0]));
  assert.deepEqual(result,{width:4,height:3,x:1,y:1,contentWidth:2,contentHeight:2});
});

test("reports an empty content box for a fully transparent PNG", () => {
  assert.deepEqual(readPngTransparentBounds(png(2,2,[0,0,0,0])),{width:2,height:2,x:0,y:0,contentWidth:0,contentHeight:0});
});
