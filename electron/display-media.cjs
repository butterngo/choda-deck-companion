// TASK-1964 — the display-media grant, extracted from main.cjs so the loopback
// proof (scripts/proof-loopback.cjs) exercises the REAL handler rather than a
// copy of it. A proof against a duplicated callback proves the duplicate works.
//
// History: TASK-1494 added this handler for screenshots and deliberately granted
// video only ("this is a screenshot, no audio"). TASK-1964 adds the audio half,
// because a meeting recording needs the remote party's voice and the only way to
// get it on Windows is the loopback of the system's own output.
//
// `audio: 'loopback'` (Electron >= 31) captures what the machine is PLAYING —
// the other participants — not what its microphone hears. The microphone is a
// separate getUserMedia stream the caller owns; the two are deliberately not
// mixed here, so the transcription phase can tell "them" from "me" without
// diarization.

/**
 * Build the `setDisplayMediaRequestHandler` callback.
 *
 * Injectable `desktopCapturer` so the unit test can drive the source list
 * (including the empty case) without an Electron runtime.
 *
 * @param {{ desktopCapturer: { getSources: (opts: object) => Promise<Array<object>> } }} deps
 * @returns {(request: object, callback: (grant?: object) => void) => void}
 */
function createDisplayMediaHandler({ desktopCapturer }) {
  return function handleDisplayMediaRequest(_request, callback) {
    desktopCapturer
      .getSources({ types: ["screen"] })
      .then((sources) => {
        // No source → reject cleanly. Calling back with nothing is how Electron
        // spells "denied"; the renderer's getDisplayMedia() promise rejects.
        if (!sources.length) return callback();
        callback({ video: sources[0], audio: "loopback" });
      })
      .catch(() => callback());
  };
}

module.exports = { createDisplayMediaHandler };
