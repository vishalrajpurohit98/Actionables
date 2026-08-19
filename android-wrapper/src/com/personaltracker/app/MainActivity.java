package com.personaltracker.app;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.OutputStream;

public class MainActivity extends Activity {

    private WebView web;
    private static final int REQ_NOTIF = 2001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        // notification channel for web notifications shown via the shim
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    "reminders", "Reminders", NotificationManager.IMPORTANCE_HIGH);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }

        // ask for POST_NOTIFICATIONS up front on Android 13+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }

        web = new WebView(this);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        WebView.setWebContentsDebuggingEnabled(true);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                String url = req.getUrl().toString();
                // keep app + firebase/google traffic inside the WebView
                if (url.startsWith("file://")
                        || url.contains("firebase")
                        || url.contains("googleapis")
                        || url.contains("gstatic")
                        || url.contains("google.com")) {
                    return false;
                }
                if (url.startsWith("http://") || url.startsWith("https://")
                        || url.startsWith("mailto:") || url.startsWith("tel:")) {
                    try {
                        startActivity(new android.content.Intent(
                                android.content.Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (Exception e) { return false; }
                }
                return false;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            // grant web feature permissions (notifications etc.) automatically
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(new Runnable() {
                    public void run() { request.grant(request.getResources()); }
                });
            }
        });

        web.addJavascriptInterface(new FileBridge(), "AndroidFile");

        // Downloads: WebView can't fetch blob: URLs natively. Intercept them and
        // re-read the blob in JS as base64, then hand to the native saver.
        web.setDownloadListener((url, ua, disp, mime, len) -> {
            if (url.startsWith("blob:")) {
                web.evaluateJavascript(blobReaderJs(url, mime), null);
            } else if (url.startsWith("data:")) {
                saveDataUrl(url, mime);
            } else {
                try {
                    startActivity(new android.content.Intent(
                            android.content.Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {}
            }
        });

        web.loadUrl("file:///android_asset/index.html");
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    // JS snippet: read a blob URL and pass base64 back to AndroidFile.save
    private String blobReaderJs(String blobUrl, String mime) {
        return "(function(){var x=new XMLHttpRequest();x.open('GET','" + blobUrl + "',true);"
             + "x.responseType='blob';x.onload=function(){var r=new FileReader();"
             + "r.onloadend=function(){AndroidFile.save(r.result,'" + mime + "');};"
             + "r.readAsDataURL(x.response);};x.send();})();";
    }

    private void saveDataUrl(String dataUrl, String mime) {
        try {
            int comma = dataUrl.indexOf(',');
            String b64 = dataUrl.substring(comma + 1);
            byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
            writeToDownloads(bytes, suggestName(mime));
        } catch (Exception e) {
            toast("Save failed: " + e.getMessage());
        }
    }

    private String suggestName(String mime) {
        String ext = "bin";
        if (mime != null) {
            if (mime.contains("spreadsheet") || mime.contains("excel")) ext = "xlsx";
            else if (mime.contains("csv")) ext = "csv";
            else if (mime.contains("pdf")) ext = "pdf";
            else if (mime.contains("html")) ext = "html";
            else if (mime.contains("json")) ext = "json";
        }
        return "PersonalTracker-" + System.currentTimeMillis() + "." + ext;
    }

    private void writeToDownloads(byte[] bytes, String name) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            android.content.ContentValues cv = new android.content.ContentValues();
            cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
            cv.put(android.provider.MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) { toast("Could not create file"); return; }
            OutputStream os = getContentResolver().openOutputStream(uri);
            os.write(bytes); os.close();
        } else {
            java.io.File dir = Environment.getExternalStoragePublicDirectory(
                    Environment.DIRECTORY_DOWNLOADS);
            if (!dir.exists()) dir.mkdirs();
            java.io.File f = new java.io.File(dir, name);
            java.io.FileOutputStream fos = new java.io.FileOutputStream(f);
            fos.write(bytes); fos.close();
        }
        toast("Saved to Downloads: " + name);
    }

    private void toast(final String m) {
        runOnUiThread(() -> Toast.makeText(this, m, Toast.LENGTH_LONG).show());
    }

    private class FileBridge {
        @JavascriptInterface
        public void save(String dataUrl, String mime) {
            saveDataUrl(dataUrl, mime);
        }
    }
}
