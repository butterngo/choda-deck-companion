// Smoke wrapper: isolate userData (and so the single-instance lock) from the installed app.
const path = require("node:path");
const { app } = require("electron");
app.setPath("userData", path.resolve(__dirname, "..", "userdata"));
require("C:/dev/choda-deck-companion/electron/main.cjs");
