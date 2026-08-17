package com.fable.actionables;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.content.ContextCompat;

import com.getcapacitor.BridgeActivity;

import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;

public class MainActivity extends BridgeActivity implements NativeBridge.Callbacks {

    private static final String TAG = "Actionables";

    // Pending save-file requests, keyed by requestId, waiting on the user to
    // pick a destination in the SAF picker (ACTION_CREATE_DOCUMENT).
    private final Map<String, PendingSave> pendingSaves = new HashMap<>();

    // CreateDocument's ActivityResultContract only returns a Uri, with no way to
    // pass our requestId through the round trip. Since saveFile() launches the
    // picker immediately and a user can only interact with one system picker at
    // a time, we track "which request is currently waiting on the picker" here
    // and correlate it when onDocumentPicked() fires.
    private String launchedRequestId;

    private String pendingMicRequestId;
    private SpeechRecognizer speechRecognizer;
    private String activeSpeechRequestId;

    private ActivityResultLauncher<String> createDocumentLauncher;
    private ActivityResultLauncher<String> micPermissionLauncher;
    private ActivityResultLauncher<String> notifPermissionLauncher;

    private static class PendingSave {
        final String base64;
        final String mimeType;
        PendingSave(String base64, String mimeType) {
            this.base64 = base64;
            this.mimeType = mimeType;
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        NotificationsHelper.ensureChannel(this);
        registerLaunchers();

        WebView webView = this.bridge.getWebView();
        webView.addJavascriptInterface(new NativeBridge(this), "Android");
    }

    @Override
    protected void onDestroy() {
        stopSpeechRecognition();
        super.onDestroy();
    }

    private void registerLaunchers() {
        createDocumentLauncher = registerForActivityResult(
                new ActivityResultContracts.CreateDocument("*/*"),
                this::onDocumentPicked
        );

        micPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> {
                    String reqId = pendingMicRequestId;
                    pendingMicRequestId = null;
                    notifyMicPermissionResult(reqId, granted);
                }
        );

        notifPermissionLauncher = registerForActivityResult(
                new ActivityResultContracts.RequestPermission(),
                granted -> notifyPermissionChanged()
        );
    }

    // ---------------------------------------------------------------
    // saveFile: SAF picker flow
    // ---------------------------------------------------------------

    @Override
    public void requestSaveFile(String base64, String filename, String mimeType, String requestId) {
        runOnUiThread(() -> {
            pendingSaves.put(requestId, new PendingSave(base64, mimeType));
            launchedRequestId = requestId;
            try {
                createDocumentLauncher.launch(filename);
            } catch (Exception e) {
                Log.e(TAG, "Failed to launch SAF picker", e);
                pendingSaves.remove(requestId);
                launchedRequestId = null;
                resolveSaveFile(requestId, false, "ERR_PICKER_UNAVAILABLE");
            }
        });
    }

    private void onDocumentPicked(Uri uri) {
        String requestId = launchedRequestId;
        launchedRequestId = null;
        if (requestId == null) return;

        PendingSave pending = pendingSaves.remove(requestId);
        if (pending == null) return;

        if (uri == null) {
            // User cancelled the picker.
            resolveSaveFile(requestId, false, "ERR_CANCELLED");
            return;
        }

        try {
            byte[] bytes = Base64.decode(pending.base64, Base64.DEFAULT);
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) {
                    resolveSaveFile(requestId, false, "ERR_CANNOT_OPEN_OUTPUT");
                    return;
                }
                out.write(bytes);
                out.flush();
            }
            String displayName = queryDisplayName(uri);
            resolveSaveFile(requestId, true, displayName != null ? displayName : "file");
        } catch (IllegalArgumentException e) {
            Log.e(TAG, "Base64 decode failed", e);
            resolveSaveFile(requestId, false, "ERR_INVALID_BASE64");
        } catch (Exception e) {
            Log.e(TAG, "Failed writing file via SAF", e);
            resolveSaveFile(requestId, false, "ERR_WRITE_FAILED");
        }
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor cursor = getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) return cursor.getString(idx);
            }
        } catch (Exception ignored) {}
        return null;
    }

    /** Resolves the pending JS Promise-like callback created in the app.js deliverFile() patch. */
    private void resolveSaveFile(String requestId, boolean success, String messageOrName) {
        String js = "window.__actionablesResolveSave && window.__actionablesResolveSave("
                + jsString(requestId) + "," + success + "," + jsString(messageOrName) + ")";
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    // ---------------------------------------------------------------
    // Microphone permission (requested only when the user taps the AI mic button)
    // ---------------------------------------------------------------

    @Override
    public void requestMicPermission(String requestId) {
        runOnUiThread(() -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    == PackageManager.PERMISSION_GRANTED) {
                notifyMicPermissionResult(requestId, true);
                return;
            }
            pendingMicRequestId = requestId;
            micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO);
        });
    }

    private void notifyMicPermissionResult(String requestId, boolean granted) {
        if (requestId == null) return;
        String js = "window.__actionablesResolvePermission && window.__actionablesResolvePermission("
                + jsString("mic") + "," + jsString(requestId) + "," + granted + ")";
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    // ---------------------------------------------------------------
    // Native speech recognition
    // ---------------------------------------------------------------

    @Override
    public void startSpeechRecognition(String requestId, String language) {
        runOnUiThread(() -> {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                    != PackageManager.PERMISSION_GRANTED) {
                notifyVoiceError(requestId, "Microphone permission was denied.");
                return;
            }
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                notifyVoiceError(requestId, "Speech recognition is not available on this device.");
                return;
            }

            stopSpeechRecognitionInternal();
            activeSpeechRequestId = requestId;
            if (speechRecognizer == null) {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            }
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { notifyVoiceState(requestId, true); }
                @Override public void onBeginningOfSpeech() { notifyVoiceState(requestId, true); }
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { notifyVoiceState(requestId, false); }
                @Override public void onError(int error) {
                    notifyVoiceState(requestId, false);
                    String msg;
                    switch (error) {
                        case SpeechRecognizer.ERROR_NO_MATCH: msg = "No speech detected. Try again."; break;
                        case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: msg = "Microphone permission was denied."; break;
                        case SpeechRecognizer.ERROR_NETWORK:
                        case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: msg = "Speech recognition needs a network connection."; break;
                        case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: msg = "Speech recognition is busy. Try again."; break;
                        default: msg = "Voice input failed. Try again.";
                    }
                    notifyVoiceError(requestId, msg);
                    activeSpeechRequestId = null;
                }
                @Override public void onResults(Bundle results) {
                    notifyVoiceState(requestId, false);
                    java.util.ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) notifyVoiceResult(requestId, matches.get(0), true);
                    activeSpeechRequestId = null;
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    java.util.ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) notifyVoiceResult(requestId, matches.get(0), false);
                }
                @Override public void onEvent(int eventType, Bundle params) {}
            });

            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null || language.isEmpty() ? "en-IN" : language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            try {
                speechRecognizer.startListening(intent);
            } catch (Exception e) {
                notifyVoiceState(requestId, false);
                notifyVoiceError(requestId, "Could not start microphone.");
                activeSpeechRequestId = null;
            }
        });
    }

    @Override
    public void stopSpeechRecognition() {
        runOnUiThread(this::stopSpeechRecognitionInternal);
    }

    private void stopSpeechRecognitionInternal() {
        if (speechRecognizer != null) {
            try { speechRecognizer.stopListening(); } catch (Exception ignored) {}
            try { speechRecognizer.cancel(); } catch (Exception ignored) {}
        }
        if (activeSpeechRequestId != null) {
            notifyVoiceState(activeSpeechRequestId, false);
            activeSpeechRequestId = null;
        }
    }

    private void notifyVoiceState(String requestId, boolean listening) {
        if (requestId == null) return;
        String js = "window.__actionablesVoiceState && window.__actionablesVoiceState(" + jsString(requestId) + "," + listening + ")";
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    private void notifyVoiceResult(String requestId, String text, boolean isFinal) {
        if (requestId == null) return;
        String js = "window.__actionablesVoiceResult && window.__actionablesVoiceResult(" + jsString(requestId) + "," + jsString(text) + "," + isFinal + ")";
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    private void notifyVoiceError(String requestId, String message) {
        if (requestId == null) return;
        String js = "window.__actionablesVoiceError && window.__actionablesVoiceError(" + jsString(requestId) + "," + jsString(message) + ")";
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    // ---------------------------------------------------------------
    // Notification permission
    // notifState() is synchronous (matches app.js's existing expectation);
    // requestNotif() is fire-and-forget and notifies JS via
    // window.__permChanged() (already defined in app.js) once resolved.
    // ---------------------------------------------------------------

    @Override
    public String currentNotifState() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // No runtime prompt exists before Android 13 -- treat as "not applicable",
            // matching the 'na' case app.js already renders as "On - manage in system settings".
            return "na";
        }
        boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        return granted ? "granted" : "denied";
    }

    @Override
    public void requestNotificationPermission() {
        runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                notifyPermissionChanged();
                return;
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED) {
                notifyPermissionChanged();
                return;
            }
            notifPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
        });
    }

    @Override
    public void showTestNotification() {
        NotificationsHelper.showTest(this);
    }

    @Override
    public void openAppSettings() {
        runOnUiThread(() -> {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.fromParts("package", getPackageName(), null));
            startActivity(intent);
        });
    }

    /** Tells JS (via the __permChanged hook already defined in app.js) to re-check notifState(). */
    private void notifyPermissionChanged() {
        String js = "window.__permChanged && window.__permChanged()";
        runOnUiThread(() -> bridge.getWebView().evaluateJavascript(js, null));
    }

    private static String jsString(String s) {
        if (s == null) return "null";
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }
}
