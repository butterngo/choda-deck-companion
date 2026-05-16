# Companion mobile (Expo Go)

iPhone/Android client over the companion server (`packages/server`). Pair via LAN URL + bearer token; reads tasks/inbox/conversations/queue, fires queue runs via `POST /api/queue/start`.

## Get started

1. Install dependencies (every fresh clone — `node_modules` is gitignored)

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

   If LAN does not work (firewall, multi-NIC, VPN segmentation), use tunnel mode:

   ```bash
   npx expo start --tunnel
   ```

Scan the QR with Expo Go (same WiFi for LAN, anywhere for tunnel).

## Connect to companion server

1. Start the server in LAN mode on the Windows host:

   ```powershell
   cd ../
   pnpm --filter server start -- --bind 0.0.0.0 --port 8788
   ```

   The CLI prints `Token: <32-chars>` — copy it.

2. Find the Windows LAN IP that your phone can reach:

   ```powershell
   Get-NetIPAddress -AddressFamily IPv4 -PrefixOrigin Dhcp | Select IPAddress, InterfaceAlias
   ```

   On a multi-NIC machine (work VPN + home WiFi) there may be several. Pick the one on the same subnet as the phone (typically `192.168.x.x` for home WiFi). `10.x.x.x` is usually corp VPN — the phone cannot reach that from a home network.

3. In the app, open Settings → enter `http://<LAN-IP>:8788` + token → pick project + workspace → Save.

## Troubleshooting

**`ConfigError: Cannot determine the project's Expo SDK version because the module 'expo' is not installed`**

`mobile/node_modules` is gitignored. Run `npm install` in this directory first. This trap also breaks `cd mobile && npx tsc --noEmit` AC steps in queued tasks — see `feedback_mobile_ac_needs_deps` in `~/.claude/projects/.../memory/`.

**"There was a problem running the requested app" in Expo Go**

The Metro bundler is unreachable or the bundle failed to compile. Inspect the Expo dev terminal for red/yellow lines. Common fixes (in order):

1. Restart with cache clear: `npx expo start --tunnel --clear`
2. Confirm phone is on the same WiFi (LAN mode) or that tunnel finished initializing (look for `Tunnel ready` line)
3. Stop any other tunnels/ngrok sessions hogging port 8081

**Tasks / Queue / Inbox list spins forever but Settings works**

Settings hits `/api/projects` and `/api/workspaces`; the other tabs hit different routes. If only Settings works, the app likely loaded an older bundle. Reload Expo Go to pick up the latest:

- Shake the device → tap **Reload**
- Or restart Metro: Ctrl+C the dev terminal, then `npx expo start --tunnel --clear`

**Tasks list shows but tap-into-detail spinner hangs**

Same root cause as above — stale bundle. Reload Expo Go. If still broken, confirm the server actually responds for the URL from Windows:

```powershell
$tok = '<your-token>'
curl "http://127.0.0.1:8788/api/tasks/TASK-XXX" -H "Authorization: Bearer $tok"
```

If curl returns 200 but the app hangs, it is bundle staleness 99% of the time.

**"Run in queue" button stays disabled**

Hover the hint under the button:

- "Pick a project in Settings to enable." — Settings has no project saved
- "Pick a workspace in Settings to enable." — picked a project but not workspace
- "Only READY tasks can be queued." — task is TODO/IN-PROGRESS/DONE/CANCELLED

The button is intentionally strict because the server endpoint rejects every missing-field case with 400.

## File-based routing

This project uses [file-based routing](https://docs.expo.dev/router/introduction). Routes live under `app/`:

- `app/(tabs)/{index,queue,inbox,conversations,settings}.tsx` — bottom tabs
- `app/{tasks,queue,inbox,conversations}/[id].tsx` — detail screens

You can start developing by editing files in `app/`.

> Do NOT run `npm run reset-project` — that script (left from `create-expo-app`) wipes the `app/` directory back to a blank scaffold and would destroy the entire mobile client.
