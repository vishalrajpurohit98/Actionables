# Native Android Capabilities — What Was Built

## 1. File Save (PDF / Excel export) — `A.saveFile`

**Files:** `NativeBridge.java`, `MainActivity.java`, `app.js` (`deliverFile()` only)

### How it works
1. `app.js` still calls `jsPDF`/`XLSX` exactly as before — **zero changes** to the
   generation code. The only touched function is `deliverFile()`, the single
   bridging point all 6 export call sites already funnel through.
2. `A.saveFile(base64, filename, mimeType)` decodes/validates the Base64 up
   front and returns `"PENDING:<requestId>"` immediately.
3. This opens Android's system file picker (`Storage Access Framework`,
   `ACTION_CREATE_DOCUMENT`) pre-filled with your filename. The user picks
   any folder they want (Downloads, Drive, a specific app, etc.) — the app
   never needs broad storage access to do this.
4. Once the user picks a location, native code decodes the Base64 to bytes
   and writes them via `ContentResolver.openOutputStream(uri)`.
5. The result is sent back into the WebView via `evaluateJavascript()`,
   resolving a small callback registry added to `app.js` — this is what
   turns the native `PENDING` result into the `toast('Saved → …')` /
   `toast('Export failed — …')` message you already had.

### Why no `WRITE_EXTERNAL_STORAGE` / `MANAGE_EXTERNAL_STORAGE`
SAF's `ACTION_CREATE_DOCUMENT` is the permission — the system grants
per-file write access the moment the user picks a location. No blanket
storage permission is requested or declared.

### Supported MIME types
Both `application/pdf` and
`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (and
really any MIME type, since the picker is MIME-agnostic — JSON backups and
the Excel template import also flow through the same path).

---

## 2. Microphone — AI voice input

**Files:** `NativeBridge.java`, `MainActivity.java`, `app.js` (`aiStartVoice()`)

### What was implemented (matches your spec exactly)
- `RECORD_AUDIO` declared in the manifest.
- Requested **only** when the user taps the mic button (`aiStartVoice()`),
  never at app startup — confirmed by reading `onCreate()`, which does not
  touch mic permission at all.
- If denied, the rest of the app is unaffected — the AI chat still works by
  typing; only the mic button shows an error toast.

### ⚠️ Important limitation you should know about
Your existing voice code (`window.SpeechRecognition` /
`window.webkitSpeechRecognition`) is the **browser's** Web Speech API.
Desktop Chrome implements it; the **standard Android System WebView does
not** — this is a platform gap, not something this permission fix can
close. So even with `RECORD_AUDIO` granted, `SpeechRecognition` will still
be `undefined` inside the installed app, and voice input will show
*"Voice input is not supported in this app build."*

Your spec's test step 3 ("Microphone → permission → speech transcription")
will pass the **permission** part but not the **transcription** part with
what's built here. To get actual speech-to-text working inside the WebView,
the next step would be wiring Android's native `SpeechRecognizer` API
through this same bridge (a materially larger addition — happy to build it
next if you confirm you want it).

---

## 3. Notifications

**Files:** `NativeBridge.java`, `MainActivity.java`, uses existing `app.js` hooks

Your `app.js` already had a fully-formed expectation for this API
(`A.notifState()`, `A.requestNotif()`, `A.testNotification()`,
`A.openAppSettings()`, `window.__permChanged()`) — so this implementation
matches that contract exactly rather than inventing a new one.

- `POST_NOTIFICATIONS` declared, only relevant on Android 13+.
- Requested only when the user turns on the daily-brief toggle or taps
  "Allow" in Settings → Permissions — never at startup.
- `notifState()` reports `'granted' | 'denied' | 'na'` (`'na'` = pre-Android
  13, no runtime prompt needed, matches your Settings screen's existing
  `"On · manage in system settings"` label).
- "Send test notification" now fires a real local notification through a
  dedicated `actionables_reminders` notification channel.

---

## Manifest permissions — final list

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```
No `WRITE_EXTERNAL_STORAGE`, no `MANAGE_EXTERNAL_STORAGE`.

---

## Test checklist

Build the APK first (see `BUILD-APK-INSTRUCTIONS.md` — push to GitHub,
Actions tab builds it automatically). Then, on a real Android device:

| # | Test | Expected result |
|---|------|------------------|
| 1 | Open a project → Export → PDF | System file picker opens with a `.pdf` filename pre-filled. Pick a folder → toast "Saved → …". Open the file from Files app — it's a valid PDF. |
| 2 | Export → Excel | Same flow, `.xlsx` file, opens correctly in Excel/Sheets. |
| 3 | Cancel the picker instead of picking a folder | Toast "Save cancelled" — no crash, no partial file. |
| 4 | AI chat → tap mic button (fresh install) | Android's permission dialog appears **only now**, not on app launch. |
| 5 | Deny mic permission | Toast "Microphone permission denied"; typing into AI chat still works normally. |
| 6 | Grant mic permission | Currently: no crash, but transcription won't start (see limitation above) — confirms permission gating works even though native STT itself isn't wired up yet. |
| 7 | Settings → enable daily brief toggle (fresh install, Android 13+) | Notification permission dialog appears **only now**. |
| 8 | Settings → "Send test notification" after granting | A real notification appears in the system tray. |
| 9 | Deny notification permission | Settings screen shows "Not allowed" with an "Allow" button; rest of the app (tasks, projects, exports) works normally. |
| 10 | Force-close and reopen app after denying any permission | App opens straight to normal use — no permission prompts on startup, no crash loops. |

## Files changed/added in this update
- `android/app/src/main/AndroidManifest.xml` — permissions
- `android/app/src/main/java/com/fable/actionables/MainActivity.java` — rewritten
- `android/app/src/main/java/com/fable/actionables/NativeBridge.java` — new
- `android/app/src/main/java/com/fable/actionables/NotificationsHelper.java` — new
- `android/app/build.gradle` — added `androidx.activity`, `androidx.core`,
  Java 8 `compileOptions`
- `app.js` — only `deliverFile()` and the voice-input block (`aiStartVoice`
  split into permission-check + `aiStartVoiceAfterPermission`) — PDF/Excel
  generation code itself untouched


## 4. Web-app audit fixes included in v7.5.9

The Android package now carries the audited web build in all runtime/source copies (`www/app.js`, root `app.js`, and `android/app/src/main/assets/public/app.js`). The audit fixes include wiring for actionable delete/restore, comments, follow-ups, manual restore points, SPOC/category edits, and Excel report export.

All `data-act` UI actions in the audited `app.js` were checked against their event handlers; no unhandled `data-act` values were found. JavaScript syntax checks also pass.
