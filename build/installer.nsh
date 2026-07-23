; TASK-1439 AC-3 — electron-builder's generated uninstaller doesn't know about
; the HKCU Run-key entry Electron's app.setLoginItemSettings() registers
; (electron/login-item.cjs) since it's set at runtime by the app, not by the
; installer. Without this, uninstalling would leave an orphaned Run-key
; pointing at a now-deleted exe.
!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Choda Companion"
!macroend
