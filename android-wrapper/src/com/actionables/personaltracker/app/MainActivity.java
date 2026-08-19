package com.actionables.personaltracker.app;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import android.provider.Settings;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.text.TextUtils;
import android.view.*;
import android.webkit.*;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import android.util.Base64;

public class MainActivity extends Activity {
    static final int MIN_SDK = 29;
    static final int REQ_NOTIF = 401;
    static final int REQ_EXACT = 402;
    static final int REQ_IMPORT = 403;
    static final int REQ_PHOTO = 404;
    static final int REQ_SPEECH = 405;

    static final String APP_HOST = "personal-tracker.local";
    WebView web;
    SharedPreferences prefs;
    String pendingSpeechId = null;
    String pendingImportCallback = "importNative";
    String pendingPhotoDir = "photos";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        prefs = getSharedPreferences("personal_tracker_native", MODE_PRIVATE);
        createNotificationChannel();
        configureWindow();
        web = new WebView(this);
        configureWebView(web);
        setContentView(web);
        web.addJavascriptInterface(new Bridge(), "Bridge");
        web.loadUrl("https://"+APP_HOST+"/index.html");
    }

    void configureWindow() {
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        if (Build.VERSION.SDK_INT >= 29) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }
    }

    void configureWebView(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        if (Build.VERSION.SDK_INT >= 26) s.setSafeBrowsingEnabled(true);
        w.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u=request.getUrl();
                if (APP_HOST.equalsIgnoreCase(u.getHost())) {
                    String path=u.getPath();
                    if (path==null || path.equals("/") || path.isEmpty()) path="/index.html";
                    if (path.startsWith("/")) path=path.substring(1);
                    if (path.contains("..")) return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,null);
                    try {
                        InputStream in=getAssets().open("web/"+path);
                        String mime;
                        String lower=path.toLowerCase(Locale.US);
                        if(lower.endsWith(".html")) mime="text/html";
                        else if(lower.endsWith(".js")) mime="application/javascript";
                        else if(lower.endsWith(".css")) mime="text/css";
                        else if(lower.endsWith(".json")||lower.endsWith(".map")) mime="application/json";
                        else if(lower.endsWith(".png")) mime="image/png";
                        else if(lower.endsWith(".jpg")||lower.endsWith(".jpeg")) mime="image/jpeg";
                        else if(lower.endsWith(".svg")) mime="image/svg+xml";
                        else if(lower.endsWith(".ttf")) mime="font/ttf";
                        else mime="application/octet-stream";
                        Map<String,String> headers=new HashMap<>();
                        headers.put("Cache-Control","no-cache");
                        return new WebResourceResponse(mime,"UTF-8",200,"OK",headers,in);
                    } catch(Exception e) {
                        return new WebResourceResponse("text/plain","UTF-8",404,"Not Found",null,null);
                    }
                }
                return super.shouldInterceptRequest(view,request);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u=request.getUrl();
                String scheme=u.getScheme();
                if ("mailto".equalsIgnoreCase(scheme) || "tel".equalsIgnoreCase(scheme) || "geo".equalsIgnoreCase(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW,u)); return true; } catch(Exception ignored) {}
                }
                return false;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) toast("Page could not be loaded");
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage m) {
                return true;
            }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                // The app's own import path uses Bridge.pickImport(). This also supports ordinary <input type=file>.
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                fileChooserCallback = cb;
                try { startActivityForResult(i, REQ_IMPORT); } catch (Exception e) { fileChooserCallback = null; return false; }
                return true;
            }
        });
        w.setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.setMimeType(mimeType);
                r.addRequestHeader("User-Agent", userAgent);
                r.setTitle(URLUtil.guessFileName(url, contentDisposition, mimeType));
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                if (Build.VERSION.SDK_INT >= 29) {
                    r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,
                            URLUtil.guessFileName(url, contentDisposition, mimeType));
                }
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            } catch (Exception e) { toast("Download failed"); }
        });
    }

    ValueCallback<Uri[]> fileChooserCallback;

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); }

    @Override public void onResume() {
        super.onResume();
        if (web != null) {
            web.postDelayed(() -> web.evaluateJavascript("window.onNativeResume&&window.onNativeResume()", null), 200);
        }
        NativeAlarms.restore(this);
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(
                    NativeAlarms.CHANNEL_ID, "Habit reminders", NotificationManager.IMPORTANCE_HIGH);
            c.setDescription("Scheduled habit and journal reminders");
            c.enableVibration(true);
            c.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
                    new android.media.AudioAttributes.Builder()
                            .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
                            .build());
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(c);
        }
    }

    void requestNotifications() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        } else toast("Notifications are enabled");
    }

    void requestExact() {
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = (AlarmManager)getSystemService(ALARM_SERVICE);
            if (!am.canScheduleExactAlarms()) {
                try {
                    startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                            Uri.parse("package:"+getPackageName())));
                    return;
                } catch (Exception ignored) {}
            }
        }
        toast("Exact timing is available");
    }

    void pickDate(int y, int m, int d) {
        DatePickerDialog dlg = new DatePickerDialog(this, (v, yy, mm, dd) ->
                js("window.dateResult&&window.dateResult('"+String.format(Locale.US,"%04d-%02d-%02d",yy,mm+1,dd)+"')"),
                y,m,d);
        dlg.show();
    }

    void pickTime(int h, int m) {
        TimePickerDialog dlg = new TimePickerDialog(this, (v, hh, mm) ->
                js("window.timeResult&&window.timeResult('"+String.format(Locale.US,"%02d:%02d",hh,mm)+"')"),
                h,m,true);
        dlg.show();
    }

    void js(String code) { if (web != null) web.post(() -> web.evaluateJavascript(code, null)); }

    void importFile() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("application/json");
        try { startActivityForResult(i, REQ_IMPORT); } catch (Exception e) { toast("File picker unavailable"); }
    }

    void pickPhoto() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("image/*");
        try { startActivityForResult(i, REQ_PHOTO); } catch (Exception e) { toast("Photo picker unavailable"); }
    }

    @Override public void onRequestPermissionsResult(int req, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(req, permissions, grants);
        if (req == REQ_SPEECH && pendingSpeechId != null) {
            String id = pendingSpeechId;
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) startSpeech(id);
            else { pendingSpeechId = null; js("window._speechResult&&window._speechResult("+JSONObject.quote(id)+",'','Microphone permission denied')"); }
        }
    }

    @Override protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req,result,data);
        if (req == REQ_IMPORT) {
            if (fileChooserCallback != null) {
                Uri[] uris = (result == RESULT_OK && data != null && data.getData()!=null) ? new Uri[]{data.getData()} : null;
                fileChooserCallback.onReceiveValue(uris); fileChooserCallback=null;
            } else if (result == RESULT_OK && data != null && data.getData()!=null) {
                try {
                    byte[] bytes = readAll(getContentResolver().openInputStream(data.getData()));
                    js("window.importNative&&window.importNative('"+Base64.encodeToString(bytes, Base64.NO_WRAP)+"')");
                } catch(Exception e){ toast("Could not read file"); }
            }
        } else if (req == REQ_PHOTO && result == RESULT_OK && data != null && data.getData()!=null) {
            try {
                String name = "photo_"+System.currentTimeMillis()+".jpg";
                File dir = new File(getFilesDir(), pendingPhotoDir); if(!dir.exists()) dir.mkdirs();
                File f = new File(dir,name);
                try(InputStream in=getContentResolver().openInputStream(data.getData());
                    OutputStream out=new FileOutputStream(f)) {
                    byte[] buf=new byte[8192]; int n; while((n=in.read(buf))>0) out.write(buf,0,n);
                }
                js("window.photoResult&&window.photoResult('"+name+"')");
            } catch(Exception e){ toast("Could not save photo"); }
        } else if (req == REQ_SPEECH) {
            if (result == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
                String text = r != null && !r.isEmpty() ? r.get(0) : "";
                js("window._speechResult&&window._speechResult("+JSONObject.quote(pendingSpeechId)+","+JSONObject.quote(text)+",null)");
            } else js("window._speechResult&&window._speechResult("+JSONObject.quote(pendingSpeechId)+",'','cancelled')");
            pendingSpeechId=null;
        }
    }

    static byte[] readAll(InputStream in) throws IOException {
        if(in==null) return new byte[0]; ByteArrayOutputStream b=new ByteArrayOutputStream();
        byte[] x=new byte[8192]; int n; while((n=in.read(x))>0)b.write(x,0,n); in.close(); return b.toByteArray();
    }

    void saveFile(String name, String mime, String b64) throws Exception {
        byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v=new ContentValues();
            v.put(MediaStore.Downloads.DISPLAY_NAME,name);
            v.put(MediaStore.Downloads.MIME_TYPE,mime);
            v.put(MediaStore.Downloads.RELATIVE_PATH,Environment.DIRECTORY_DOWNLOADS);
            v.put(MediaStore.Downloads.IS_PENDING,1);
            Uri u=getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,v);
            if(u==null) throw new IOException("MediaStore insert failed");
            try(OutputStream out=getContentResolver().openOutputStream(u)){out.write(bytes);}
            v.clear(); v.put(MediaStore.Downloads.IS_PENDING,0); getContentResolver().update(u,v,null,null);
            toast("Saved to Downloads/"+name);
        } else {
            File dir=Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if(!dir.exists())dir.mkdirs(); File f=new File(dir,name);
            try(FileOutputStream out=new FileOutputStream(f)){out.write(bytes);}
            toast("Saved to "+f.getAbsolutePath());
        }
    }

    Uri shareTemp(String name,String mime,String b64)throws Exception{
        File dir=new File(getCacheDir(),"share"); if(!dir.exists())dir.mkdirs();
        File f=new File(dir,name); try(FileOutputStream out=new FileOutputStream(f)){out.write(Base64.decode(b64,Base64.DEFAULT));}
        return androidxFileProviderUri(f);
    }

    // Avoid AndroidX: provider is declared as a native FileProvider implementation in this project.
    Uri androidxFileProviderUri(File f) throws Exception {
        return NativeFileProvider.getUriForFile(this, getPackageName()+".fileprovider", f);
    }

    void shareFile(String name,String mime,String b64)throws Exception{
        Uri u=shareTemp(name,mime,b64);
        Intent i=new Intent(Intent.ACTION_SEND); i.setType(mime); i.putExtra(Intent.EXTRA_STREAM,u);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); startActivity(Intent.createChooser(i,"Share file"));
    }

    void startSpeech(String id) {
        pendingSpeechId=id;
        Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"en-IN"); i.putExtra(RecognizerIntent.EXTRA_PROMPT,"Speak");
        try { startActivityForResult(i,REQ_SPEECH); } catch(Exception e) {
            js("window._speechResult&&window._speechResult("+JSONObject.quote(id)+",'','Speech input unavailable')");
        }
    }

    void toast(String s){ runOnUiThread(()->Toast.makeText(this,s,Toast.LENGTH_SHORT).show()); }

    public class Bridge {
        @JavascriptInterface public String getState(){return prefs.getString("state","");}
        @JavascriptInterface public void saveState(String s){if(s!=null)prefs.edit().putString("state",s).apply();}
        @JavascriptInterface public void setAlarms(String json){NativeAlarms.schedule(MainActivity.this,json);}
        @JavascriptInterface public boolean notifGranted(){return Build.VERSION.SDK_INT<33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;}
        @JavascriptInterface public boolean canExact(){if(Build.VERSION.SDK_INT<31)return true;return ((AlarmManager)getSystemService(ALARM_SERVICE)).canScheduleExactAlarms();}
        @JavascriptInterface public void reqNotif(){requestNotifications();}
        @JavascriptInterface public void reqExact(){requestExact();}
        @JavascriptInterface public void openChannelSettings(){try{Intent i=new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);i.putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());i.putExtra(Settings.EXTRA_CHANNEL_ID,NativeAlarms.CHANNEL_ID);startActivity(i);}catch(Exception e){}}
        @JavascriptInterface public void setBars(String color, boolean light){try{getWindow().setStatusBarColor(Color.parseColor(color));getWindow().setNavigationBarColor(Color.parseColor(color));if(Build.VERSION.SDK_INT>=23){int f=getWindow().getDecorView().getSystemUiVisibility();if(light)f|=View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;else f&=~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;getWindow().getDecorView().setSystemUiVisibility(f);}}catch(Exception ignored){}}
        @JavascriptInterface public String appVer(){return "1.0";}
        @JavascriptInterface public void toast(String s){MainActivity.this.toast(s);}
        @JavascriptInterface public void testReminder(){NativeAlarms.test(MainActivity.this);}
        @JavascriptInterface public String fsCheck(){return "{\"need\":false}";}
        @JavascriptInterface public void fsOpen(){}
        @JavascriptInterface public String autoBackup(String name,String state){try{saveFile(name,"application/json",Base64.encodeToString(state.getBytes(StandardCharsets.UTF_8),Base64.NO_WRAP));return "Downloads/"+name;}catch(Exception e){return "";}}
        @JavascriptInterface public String getLaunchAction(){Intent i=getIntent();JSONObject o=new JSONObject();try{if(i!=null){if(i.getStringExtra("habit")!=null)o.put("habit",i.getStringExtra("habit")); if(i.getStringExtra("tab")!=null)o.put("tab",i.getStringExtra("tab"));}}catch(Exception ignored){}return o.toString();}
        @JavascriptInterface public boolean bioAvail(){return false;}
        @JavascriptInterface public void bio(){}
        @JavascriptInterface public void pickDate(int y,int m,int d){MainActivity.this.pickDate(y,m,d);}
        @JavascriptInterface public void pickTime(int h,int m){MainActivity.this.pickTime(h,m);}
        @JavascriptInterface public void pickImport(){MainActivity.this.importFile();}
        @JavascriptInterface public void pickPhoto(){MainActivity.this.pickPhoto();}
        @JavascriptInterface public String readPhoto(String name){try{File f=new File(new File(getFilesDir(),pendingPhotoDir),name);if(!f.exists())return "";return Base64.encodeToString(readAll(new FileInputStream(f)),Base64.NO_WRAP);}catch(Exception e){return "";}}
        @JavascriptInterface public void deletePhoto(String name){try{new File(new File(getFilesDir(),pendingPhotoDir),name).delete();}catch(Exception ignored){}}
        @JavascriptInterface public void saveFile(String name,String mime,String b64)throws Exception{MainActivity.this.saveFile(name,mime,b64);}
        @JavascriptInterface public void shareFile(String name,String mime,String b64)throws Exception{MainActivity.this.shareFile(name,mime,b64);}
        @JavascriptInterface public void startSpeech(String id){MainActivity.this.startSpeech(id);}
    }
}
