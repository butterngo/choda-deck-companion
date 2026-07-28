// Generates build/icon.ico (256px, PNG-encoded ICO) + public/icon.png.
// Renders the Choda "C" brand mark (app blue #2563eb, matching the shell's
// active-tab accent) headlessly and wraps the PNG in an ICO container (valid
// since Vista). Same approach as english-companion's make-icon.mjs — playwright
// isn't a project dep, so we borrow the english-companion checkout's copy
// (dev-only script, this machine only).
import { chromium } from "file:///C:/dev/english-companion/node_modules/playwright/index.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const html = `<!doctype html><body style="margin:0">
<div id="i" style="width:256px;height:256px;display:flex;align-items:center;justify-content:center;
  background:linear-gradient(135deg,#2563eb,#1d4ed8);border-radius:56px;
  font-family:Georgia,serif;font-weight:700;color:#fff;font-size:150px;letter-spacing:-4px">C</div>
</body>`;

const browser = await chromium.launch({ channel: "msedge" });
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
await page.setContent(html);
const png = await page.locator("#i").screenshot({ omitBackground: true });
await browser.close();

// ICO container: ICONDIR (6 bytes) + one ICONDIRENTRY (16 bytes) + PNG payload.
const header = Buffer.alloc(6 + 16);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // count
header.writeUInt8(0, 6); // width 256 → 0
header.writeUInt8(0, 7); // height 256 → 0
header.writeUInt8(0, 8); // palette
header.writeUInt8(0, 9); // reserved
header.writeUInt16LE(1, 10); // color planes
header.writeUInt16LE(32, 12); // bpp
header.writeUInt32LE(png.length, 14); // payload size
header.writeUInt32LE(22, 18); // payload offset

fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "icon.ico"), Buffer.concat([header, png]));
fs.writeFileSync(path.join(root, "public", "icon.png"), png);
console.log("wrote build/icon.ico + public/icon.png", png.length, "bytes png");
