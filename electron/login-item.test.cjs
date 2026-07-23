const { configureLoginItem, LOGIN_ITEM_NAME } = require("./login-item.cjs");

function fakeApp(initialSettings = { openAtLogin: false }) {
  let settings = initialSettings;
  return {
    setLoginItemSettings: vi.fn((opts) => {
      settings = { openAtLogin: opts.openAtLogin };
    }),
    getLoginItemSettings: vi.fn(() => settings),
  };
}

describe("configureLoginItem", () => {
  it("does nothing in dev (unpackaged) — never registers electron.exe . as a login item", () => {
    const app = fakeApp();
    const result = configureLoginItem({ app, isPackaged: false });
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("registers openAtLogin:true with a deterministic name when packaged", () => {
    const app = fakeApp();
    configureLoginItem({ app, isPackaged: true });
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, name: LOGIN_ITEM_NAME });
  });

  it("is idempotent — calling twice leaves openAtLogin true both times", () => {
    const app = fakeApp();
    configureLoginItem({ app, isPackaged: true });
    const second = configureLoginItem({ app, isPackaged: true });
    expect(second.openAtLogin).toBe(true);
    expect(app.setLoginItemSettings).toHaveBeenCalledTimes(2);
  });
});
