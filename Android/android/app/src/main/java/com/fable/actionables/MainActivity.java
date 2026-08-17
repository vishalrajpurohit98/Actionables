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
