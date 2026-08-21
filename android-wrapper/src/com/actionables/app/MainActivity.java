package com.actionables.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.os.Bundle;
import java.util.ArrayList;
import android.widget.Toast;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Handler;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.BufferedReader;
import java.io.InputStreamReader;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Calendar;

public class MainActivity extends Activity {

    private WebView web;
    static final String PREFS = "actionables_prefs";
    static final String KEY_DATA = "act_data";
    public static final String CHANNEL_ID = "actionables_daily";
    public static final String FOLLOWUP_CHANNEL_ID = "actionables_followups";
    public static final String ALERT_CHANNEL_ID = "actionables_alerts";
    private static final int REQ_NOTIF = 1001;
    private static final int REQ_MIC = 1002;
    private SpeechRecognizer speechRecognizer;
    private boolean voicePending = false;
    private String pendingRemoteCommit = null;
    private static final String GITHUB_REPO = "vishalrajpurohit98/actionables";
    private static final String RELEASES_URL = "https://github.com/" + GITHUB_REPO + "/releases/latest";
    private static final String REMOTE_WEB_URL = "https://vishalrajpurohit98.github.io/actionables/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);

        createChannel();

        web = new WebView(this);
        setContentView(web);

        WebView.setWebContentsDebuggingEnabled(true);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setDatabaseEnabled(true);
        web.getSettings().setAllowFileAccess(true);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMediaPlaybackRequiresUserGesture(false);
        web.getSettings().setSupportZoom(false);
        web.getSettings().setBuiltInZoomControls(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(REMOTE_WEB_URL) && pendingRemoteCommit != null) {
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit()
                            .putBoolean("use_remote_web", true)
                            .putString("active_web_commit", pendingRemoteCommit)
                            .remove("dismissed_web_commit")
                            .apply();
                    pendingRemoteCommit = null;
                }
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                if (failingUrl != null && failingUrl.startsWith(REMOTE_WEB_URL)) {
                    pendingRemoteCommit = null;
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("use_remote_web", false).apply();
                    view.loadUrl("file:///android_asset/index.html");
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                // keep app URLs internal; open external http(s) links in browser
                if (url.startsWith("https://api.anthropic.com")
                        || url.contains("firebaseio")
                        || url.contains("googleapis")
                        || url.contains("firebasestorage")
                        || url.startsWith("file://")) {
                    return false;
                }
                if (url.startsWith("http://") || url.startsWith("https://")
                        || url.startsWith("mailto:") || url.startsWith("tel:")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                        return true;
                    } catch (Exception e) { return false; }
                }
                return false;
            }
        });

        web.addJavascriptInterface(new Bridge(), "Android");
        SharedPreferences updatePrefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        boolean useRemoteWeb = updatePrefs.getBoolean("use_remote_web", false);
        if (useRemoteWeb) {
            web.loadUrl(REMOTE_WEB_URL + "?cached=" + System.currentTimeMillis());
        } else {
            web.loadUrl("file:///android_asset/index.html");
        }
        new Handler().postDelayed(new Runnable() {
            @Override public void run() { checkForAndroidUpdate(); }
        }, 1800);
    }

    @Override
    protected void onDestroy() {
        stopNativeVoice(false);
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    private void jsCall(String script) {
        runOnUiThread(new Runnable() {
            @Override public void run() {
                try { if (web != null) web.evaluateJavascript(script, null); } catch (Exception ignored) {}
            }
        });
    }

    private String jsQuote(String value) {
        if (value == null) return "\"\"";
        return org.json.JSONObject.quote(value);
    }

    private void startNativeVoice() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            jsCall("window.__nativeVoiceError&&window.__nativeVoiceError('unsupported')");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            voicePending = true;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
            return;
        }
        stopNativeVoice(false);
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { jsCall("window.__nativeVoiceReady&&window.__nativeVoiceReady()"); }
            @Override public void onBeginningOfSpeech() { jsCall("window.__nativeVoiceBeginning&&window.__nativeVoiceBeginning()"); }
            @Override public void onRmsChanged(float rmsdB) {}
            @Override public void onBufferReceived(byte[] buffer) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onError(int error) {
                String code;
                if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) code = "not-allowed";
                else if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) code = "no-speech";
                else code = "voice-error";
                jsCall("window.__nativeVoiceError&&window.__nativeVoiceError(" + jsQuote(code) + ")");
            }
            @Override public void onResults(Bundle results) {
                ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                jsCall("window.__nativeVoiceResult&&window.__nativeVoiceResult(" + jsQuote(text) + ",true)");
            }
            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults == null ? null : partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                String text = (matches != null && !matches.isEmpty()) ? matches.get(0) : "";
                if (!text.isEmpty()) jsCall("window.__nativeVoiceResult&&window.__nativeVoiceResult(" + jsQuote(text) + ",false)");
            }
            @Override public void onEvent(int eventType, Bundle params) {}
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "en-IN");
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try {
            speechRecognizer.startListening(intent);
        } catch (Exception e) {
            jsCall("window.__nativeVoiceError&&window.__nativeVoiceError('voice-error')");
        }
    }

    private void stopNativeVoice(boolean notifyJs) {
        try { if (speechRecognizer != null) speechRecognizer.stopListening(); } catch (Exception ignored) {}
        try { if (speechRecognizer != null) speechRecognizer.cancel(); } catch (Exception ignored) {}
        try { if (speechRecognizer != null) speechRecognizer.destroy(); } catch (Exception ignored) {}
        speechRecognizer = null;
        voicePending = false;
        if (notifyJs) jsCall("window.__nativeVoiceEnd&&window.__nativeVoiceEnd()");
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_MIC) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                voicePending = false;
                startNativeVoice();
            } else {
                voicePending = false;
                jsCall("window.__nativeVoiceError&&window.__nativeVoiceError('not-allowed')");
            }
        }
    }

    private void checkForAndroidUpdate() {
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL("https://api.github.com/repos/" + GITHUB_REPO + "/commits/main");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("GET");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setRequestProperty("Accept", "application/vnd.github+json");
                    int code = conn.getResponseCode();
                    if (code != 200) return;
                    BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
                    StringBuilder body = new StringBuilder();
                    String line;
                    while ((line = br.readLine()) != null) body.append(line);
                    br.close();
                    String json = body.toString();
                    String latestSha = extractJsonString(json, "sha");
                    if (latestSha == null || latestSha.trim().isEmpty()) return;
                    latestSha = latestSha.trim();
                    SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
                    String currentSha = prefs.getString("active_web_commit", BuildInfo.WEB_COMMIT);
                    if ("dev".equals(currentSha) || latestSha.equals(currentSha)) return;
                    if (latestSha.equals(prefs.getString("dismissed_web_commit", ""))) return;
                    final String detectedSha = latestSha;
                    runOnUiThread(new Runnable() {
                        @Override public void run() { showWebUpdateDialog(detectedSha); }
                    });
                } catch (Exception ignored) {
                    // Update checks are best-effort and must never affect app startup.
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
        }).start();
    }

    private String extractJsonString(String json, String key) {
        String needle = "\"" + key + "\"";
        int i = json.indexOf(needle);
        if (i < 0) return null;
        int colon = json.indexOf(':', i + needle.length());
        if (colon < 0) return null;
        int q1 = json.indexOf('\"', colon + 1);
        if (q1 < 0) return null;
        int q2 = json.indexOf('\"', q1 + 1);
        if (q2 < 0) return null;
        return json.substring(q1 + 1, q2);
    }

    private void showWebUpdateDialog(final String latestSha) {
        String shortSha = latestSha.length() > 7 ? latestSha.substring(0, 7) : latestSha;
        new AlertDialog.Builder(this)
                .setTitle("New Actionables update available")
                .setMessage("A newer web version is available. Update now to load the latest tasks, AI assistant and UI changes?\n\nUpdate: " + shortSha)
                .setNegativeButton("Later", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface dialog, int which) {
                        rememberDismissedWebCommit(latestSha);
                    }
                })
                .setPositiveButton("Update now", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface dialog, int which) {
                        loadRemoteWeb(latestSha);
                    }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    @Override public void onCancel(DialogInterface dialog) {
                        rememberDismissedWebCommit(latestSha);
                    }
                })
                .show();
    }

    private void rememberDismissedWebCommit(String sha) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString("dismissed_web_commit", sha).apply();
    }

    private void loadRemoteWeb(String sha) {
        try {
            pendingRemoteCommit = sha;
            String separator = REMOTE_WEB_URL.contains("?") ? "&" : "?";
            web.loadUrl(REMOTE_WEB_URL + separator + "update=" + Uri.encode(sha.substring(0, Math.min(12, sha.length()))));
        } catch (Exception ignored) {
            web.loadUrl("file:///android_asset/index.html");
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Daily brief", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Actionables daily brief");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
            NotificationChannel fu = new NotificationChannel(FOLLOWUP_CHANNEL_ID, "Follow-up reminders", NotificationManager.IMPORTANCE_HIGH);
            fu.setDescription("Actionables follow-up reminders");
            nm.createNotificationChannel(fu);
            NotificationChannel al = new NotificationChannel(ALERT_CHANNEL_ID, "Custom alerts", NotificationManager.IMPORTANCE_HIGH);
            al.setDescription("Actionables custom notification rules");
            nm.createNotificationChannel(al);
        }
    }

    private void runOnJs(final Runnable r) { runOnUiThread(r); }

    /* ============ JS BRIDGE — window.Android.* ============ */
    private class Bridge {

        @JavascriptInterface
        public String version() { return BuildInfo.APP_VERSION; }

        @JavascriptInterface
        public boolean isVoiceSupported() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void startVoice() {
            runOnUiThread(new Runnable() { @Override public void run() { startNativeVoice(); } });
        }

        @JavascriptInterface
        public void stopVoice() {
            runOnUiThread(new Runnable() { @Override public void run() { stopNativeVoice(true); } });
        }

        @JavascriptInterface
        public String loadData() {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            return p.getString(KEY_DATA, "");
        }

        @JavascriptInterface
        public void saveData(String json) {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            p.edit().putString(KEY_DATA, json == null ? "" : json).apply();
        }

        @JavascriptInterface
        public void setStatusBar(final String bg, final boolean lightText) {
            runOnJs(new Runnable() {
                public void run() {
                    try {
                        int c = Color.parseColor(bg);
                        Window w = getWindow();
                        w.setStatusBarColor(c);
                        w.setNavigationBarColor(c);
                        View dv = w.getDecorView();
                        int flags = dv.getSystemUiVisibility();
                        if (lightText) {
                            // light text => clear the light-status-bar bit
                            flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        } else {
                            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                        }
                        dv.setSystemUiVisibility(flags);
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public String notifState() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                boolean granted = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
                return granted ? "granted" : "denied";
            }
            NotificationManager nm = getSystemService(NotificationManager.class);
            boolean enabled = nm != null && nm.areNotificationsEnabled();
            return enabled ? "granted" : "denied";
        }

        @JavascriptInterface
        public void requestNotif() {
            runOnJs(new Runnable() {
                public void run() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
                    } else {
                        openAppSettings();
                    }
                }
            });
        }

        @JavascriptInterface
        public void testNotification() {
            NotifReceiver.showNow(MainActivity.this,
                    "Actionables", "Test notification — daily brief is working.");
        }

        @JavascriptInterface
        public void scheduleDaily(final int hour, final int minute, final boolean enabled) {
            runOnJs(new Runnable() {
                public void run() { doSchedule(hour, minute, enabled); }
            });
        }

        @JavascriptInterface
        public void scheduleFollowUp(final String id, final long triggerAt, final String title, final String body, final boolean enabled) {
            runOnJs(new Runnable() { public void run() {
                try {
                    AlarmManager am=(AlarmManager)getSystemService(ALARM_SERVICE);
                    Intent i=new Intent(MainActivity.this, NotifReceiver.class);
                    i.putExtra("title", title); i.putExtra("body", body); i.putExtra("followup", true);
                    int request=Math.abs((id==null?"followup":id).hashCode());
                    PendingIntent pi=PendingIntent.getBroadcast(MainActivity.this,request,i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
                    if(!enabled){if(am!=null)am.cancel(pi);return;}
                    long when=Math.max(System.currentTimeMillis()+5000L,triggerAt);
                    if(am!=null){
                        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.M) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi); else am.set(AlarmManager.RTC_WAKEUP,when,pi);
                    }
                } catch(Exception ignored) {}
            }});
        }

        @JavascriptInterface
        public void cancelFollowUp(final String id) {
            scheduleFollowUp(id,0,"","",false);
        }

        @JavascriptInterface
        public void syncAlertRules(final String rulesJson) {
            runOnJs(new Runnable() { public void run() {
                AlertScheduler.sync(MainActivity.this, rulesJson);
            }});
        }

        @JavascriptInterface
        public void openAppSettings() {
            runOnJs(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                        i.setData(Uri.parse("package:" + getPackageName()));
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception ignored) {}
                }
            });
        }

        @JavascriptInterface
        public String saveFile(String b64, String name, String mime) {
            try {
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    android.content.ContentValues cv = new android.content.ContentValues();
                    cv.put(android.provider.MediaStore.Downloads.DISPLAY_NAME, name);
                    cv.put(android.provider.MediaStore.Downloads.MIME_TYPE,
                            mime == null ? "application/octet-stream" : mime);
                    cv.put(android.provider.MediaStore.Downloads.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = getContentResolver().insert(
                            android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri == null) return "ERRcould not create file";
                    OutputStream os = getContentResolver().openOutputStream(uri);
                    os.write(bytes);
                    os.close();
                    return "Downloads/" + name;
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File f = new File(dir, name);
                    FileOutputStream fos = new FileOutputStream(f);
                    fos.write(bytes);
                    fos.close();
                    return "Downloads/" + name;
                }
            } catch (Exception e) {
                return "ERR" + e.getMessage();
            }
        }
    }

    private void doSchedule(int hour, int minute, boolean enabled) {
        AlarmManager am = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        Intent i = new Intent(this, NotifReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(this, 42, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (am == null) return;
        am.cancel(pi);
        // persist so BootReceiver can reinstate
        SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
        p.edit().putInt("nh", hour).putInt("nm", minute).putBoolean("ne", enabled).apply();
        if (!enabled) return;

        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis()) {
            c.add(Calendar.DAY_OF_MONTH, 1);
        }
        try {
            am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(),
                    AlarmManager.INTERVAL_DAY, pi);
        } catch (Exception e) {
            Toast.makeText(this, "Could not schedule brief", Toast.LENGTH_SHORT).show();
        }
    }

}
