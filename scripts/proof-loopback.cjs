// TASK-1964 — proof that the display-media handler really captures the remote
// party's audio on THIS machine, in the real Electron runtime.
//
// Why a script and not a test: no unit test can prove loopback. The thing being
// proven is that Windows hands Chromium the system's own output mix and that
// MediaRecorder encodes it — a claim about the OS, the Electron build and the
// audio stack, none of which exist under vitest. english-companion settled the
// same question the same way for ADR-006; that script lived in C:\tmp and is
// now gone, which is why this one lives in the repo.
//
// It drives the REAL handler (electron/display-media.cjs), not a copy.
//
// RUN:
//   npx electron scripts/proof-loopback.cjs [--seconds 10] [--out C:\tmp\proof-1964]
//
// Play audio through the machine's speakers while it records — a meeting, a
// video, anything. Speak as well, to exercise the microphone track.
//
// EXIT CODES
//   0  loopback captured real audio above the -60 dBFS floor
//   1  the proof failed — the reason is printed, and a silent capture is a
//      failure, not a pass. That floor is the whole point: without it a
//      recording of nothing looks exactly like a recording of something.

const { app, BrowserWindow, session, desktopCapturer } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { createDisplayMediaHandler } = require("../electron/display-media.cjs");

// Anything at or below this is silence. A real recording of speech through
// system output sits far above it; an empty stream sits at the -999 sentinel.
const SILENCE_FLOOR_DBFS = -60;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const seconds = Number(arg("seconds", "10"));
const outDir = path.resolve(arg("out", path.join(require("node:os").tmpdir(), "proof-1964")));

function report(line) {
  process.stdout.write(`${line}\n`);
}

function formatTrack(track, label) {
  if (!track) return `${label}: NOT CAPTURED`;
  const level = track.peakDbfs <= -999 ? "digital silence" : `${track.peakDbfs.toFixed(1)} dBFS peak`;
  return `${label}: ${(track.bytes / 1024).toFixed(0)} KB · ${track.seconds.toFixed(1)}s · ${track.channels}ch @ ${track.sampleRate} Hz · ${level}`;
}

app.whenReady().then(async () => {
  // The same grant the shipped app installs. Proving a re-implementation here
  // would prove nothing about what main.cjs does.
  session.defaultSession.setDisplayMediaRequestHandler(createDisplayMediaHandler({ desktopCapturer }));

  // getUserMedia for the microphone needs an explicit grant in Electron; the
  // shipped app will need this too when TASK-1966 adds the recorder.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });

  const win = new BrowserWindow({
    width: 520,
    height: 220,
    title: "TASK-1964 loopback proof",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await win.loadFile(path.join(__dirname, "proof-loopback.html"));

  report(`▸ recording ${seconds}s — play audio through this machine's speakers NOW`);

  let result;
  try {
    result = await win.webContents.executeJavaScript(`window.runProof(${seconds * 1000})`);
  } catch (e) {
    report(`✗ renderer threw: ${e && e.message}`);
    app.exit(1);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const written = {};
  for (const name of ["loopback", "mic"]) {
    const t = result[name];
    if (!t || !t.b64) continue;
    const file = path.join(outDir, `${name}.webm`);
    fs.writeFileSync(file, Buffer.from(t.b64, "base64"));
    written[name] = file;
  }

  report("");
  report(`AC-1  audio tracks on the display stream: ${result.audioTrackCount} (must be 1; an ungranted handler gives 0)`);
  report(`AC-2  ${formatTrack(result.loopback, "loopback")}`);
  report(`AC-3  ${formatTrack(result.mic, "mic")}`);
  for (const [name, file] of Object.entries(written)) report(`      wrote ${name} → ${file}`);
  for (const e of result.errors) report(`  !   ${e}`);
  report("");

  // The verdict. Each line is one acceptance criterion, and each can fail.
  const ac1 = result.audioTrackCount === 1;
  const ac2 = !!result.loopback && result.loopback.peakDbfs > SILENCE_FLOOR_DBFS;
  const ac3 = !!result.mic && !!written.mic && !!written.loopback && written.mic !== written.loopback;

  report(`AC-1 exactly one audio track          ${ac1 ? "PASS" : "FAIL"}`);
  report(`AC-2 loopback above ${SILENCE_FLOOR_DBFS} dBFS          ${ac2 ? "PASS" : "FAIL"}`);
  report(`AC-3 two distinct decodable files     ${ac3 ? "PASS" : "FAIL"}`);

  if (!ac2 && result.loopback) {
    report("");
    report("  A silent loopback capture usually means no audio was actually playing");
    report("  during the window, not that loopback is unsupported. Re-run with audio on.");
  }

  app.exit(ac1 && ac2 && ac3 ? 0 : 1);
});
