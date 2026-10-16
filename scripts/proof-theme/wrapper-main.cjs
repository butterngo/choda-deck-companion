// TASK-2482 proof wrapper: run the real electron/main.cjs with its own userData
// (SMOKE_USERDATA), so it does not collide with an installed Companion's
// single-instance lock in the shared default %APPDATA%\choda-deck-companion.
const path = require("node:path");
const { app } = require("electron");

app.setPath("userData", path.resolve(process.env.SMOKE_USERDATA));
require(path.join(__dirname, "..", "..", "electron", "main.cjs"));
