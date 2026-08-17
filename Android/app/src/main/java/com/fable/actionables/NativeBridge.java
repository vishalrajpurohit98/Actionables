package com.fable.actionables;

import android.util.Base64;
import android.webkit.JavascriptInterface;

/**
 * Exposed to the WebView as window.Android (matches app.js: var A = window.Android || null).
 *
 * Method names/shapes below intentionally match what app.js already calls,
 * discovered by reading the existing code rather than inventing a new API:
 *   - A.notifState()          -> synchronous string: 'granted' | 'denied' | 'na'
 *   - A.requestNotif()        -> kick off the POST_NOTIFICATIONS prompt (13+)
 *   - A.testNotification()    -> fire a local test notification
 *   - A.openAppSettings()     -> open this app's system settings page
 *   - A.requestMicPermission(requestId) -> async RECORD_AUDIO prompt, resolved
 *     later via window.__actionablesResolvePermission('mic', requestId, granted)
 *   - A.saveFile(base64, filename, mimeType) -> see saveFile() doc below
 *
 * DESIGN NOTE ON saveFile():
 * app.js's deliverFile() calls this synchronously and originally expected an
 * immediate return value. The Storage Access Framework's "create document"
 * picker is inherently asynchronous (shows system UI, waits on the user), so
 * it cannot return a real result synchronously without freezing the WebView.
 * saveFile() here returns "PENDING:<requestId>" right away; the real result
 * is delivered later via window.__actionablesResolveSave(requestId, success,
 * messageOrName). deliverFile() in app.js was updated to handle this PENDING
 * case -- no other call site or the PDF/Excel generation code was touched.
 *
 * DESIGN NOTE ON notifState():
 * Unlike saveFile/mic, checking whether a permission is currently granted
 * (ContextCompat.checkSelfPermission) is a fast, synchronous, non-blocking
 * call -- no system UI involved -- so notifState() can safely return a
 * real value immediately, matching what app.js already expects.
 */
public class NativeBridge {

    public interface Callbacks {
        void requestSaveFile(String base64, String filename, String mimeType, String requestId);
        void requestMicPermission(String requestId);
        void startSpeechRecognition(String requestId, String language);
        void stopSpeechRecognition();
        void requestNotificationPermission();
        String currentNotifState();
        void showTestNotification();
        void openAppSettings();
    }

    private final Callbacks callbacks;

    public NativeBridge(Callbacks callbacks) {
        this.callbacks = callbacks;
    }

    @JavascriptInterface
    public String saveFile(String base64, String filename, String mimeType) {
        if (base64 == null || base64.isEmpty()) return "ERR_EMPTY_CONTENT";
        if (filename == null || filename.isEmpty()) return "ERR_NO_FILENAME";
        if (mimeType == null || mimeType.isEmpty()) return "ERR_NO_MIME";

        try {
            Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return "ERR_INVALID_BASE64";
        }

        String requestId = "sf_" + System.currentTimeMillis() + "_" + Math.round(Math.random() * 100000);
        callbacks.requestSaveFile(base64, filename, mimeType, requestId);
        return "PENDING:" + requestId;
    }

    /** Called only when the user taps the AI mic button -- never at startup. */
    @JavascriptInterface
    public void requestMicPermission(String requestId) {
        callbacks.requestMicPermission(requestId);
    }

    @JavascriptInterface
    public void startSpeechRecognition(String requestId, String language) {
        callbacks.startSpeechRecognition(requestId, language);
    }

    @JavascriptInterface
    public void stopSpeechRecognition() {
        callbacks.stopSpeechRecognition();
    }

    /** Synchronous: 'granted' | 'denied' | 'na' (na = no runtime prompt needed, pre-Android 13). */
    @JavascriptInterface
    public String notifState() {
        return callbacks.currentNotifState();
    }

    /** Called only when the user enables the daily-brief toggle or taps Allow. */
    @JavascriptInterface
    public void requestNotif() {
        callbacks.requestNotificationPermission();
    }

    @JavascriptInterface
    public void testNotification() {
        callbacks.showTestNotification();
    }

    @JavascriptInterface
    public void openAppSettings() {
        callbacks.openAppSettings();
    }

    /** Lets JS detect it's running inside the native wrapper vs a plain browser. */
    @JavascriptInterface
    public boolean isNative() {
        return true;
    }
}
