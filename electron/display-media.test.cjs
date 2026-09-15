const { createDisplayMediaHandler } = require("./display-media.cjs");

function fakeCapturer(sources) {
  return {
    getSources: vi.fn(() => Promise.resolve(sources)),
  };
}

function grantFrom(desktopCapturer) {
  const handler = createDisplayMediaHandler({ desktopCapturer });
  return new Promise((resolve) => handler({}, resolve));
}

describe("createDisplayMediaHandler", () => {
  it("grants loopback audio alongside the screen — the whole point of TASK-1964", async () => {
    const grant = await grantFrom(fakeCapturer([{ id: "screen:0" }]));
    expect(grant).toEqual({ video: { id: "screen:0" }, audio: "loopback" });
  });

  it("grants the FIRST screen source when several exist", async () => {
    const grant = await grantFrom(fakeCapturer([{ id: "screen:0" }, { id: "screen:1" }]));
    expect(grant.video).toEqual({ id: "screen:0" });
  });

  it("denies with no argument when there is no screen source", async () => {
    const grant = await grantFrom(fakeCapturer([]));
    expect(grant).toBeUndefined();
  });

  it("denies rather than throwing when getSources rejects", async () => {
    const desktopCapturer = { getSources: vi.fn(() => Promise.reject(new Error("no display"))) };
    const grant = await grantFrom(desktopCapturer);
    expect(grant).toBeUndefined();
  });

  it("asks only for screen sources — a window source has no system audio to loop back", async () => {
    const desktopCapturer = fakeCapturer([{ id: "screen:0" }]);
    await grantFrom(desktopCapturer);
    expect(desktopCapturer.getSources).toHaveBeenCalledWith({ types: ["screen"] });
  });
});
