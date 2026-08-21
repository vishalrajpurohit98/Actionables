package com.actionables.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Digest model: schedules ONE repeating daily alarm per digest time. Each alarm
 * carries the full enabled-rules payload; when it fires, AlertReceiver evaluates
 * every rule against the saved data and posts a single combined notification.
 *
 * The whole payload {times:[...], rules:[...]} is persisted so BootReceiver can
 * reinstate the alarms after a reboot. Request codes derive from the time string
 * so re-syncing cleanly replaces the previous schedule.
 */
public class AlertScheduler {
    static final String PREF_PAYLOAD = "alert_payload_json";
    private static final int BASE = 5000;

    /** Called from JS via the bridge whenever config changes, and on app start. */
    public static void sync(Context ctx, String payloadJson) {
        SharedPreferences p = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        String prev = p.getString(PREF_PAYLOAD, "{}");
        cancelAll(ctx, prev);
        p.edit().putString(PREF_PAYLOAD, payloadJson == null ? "{}" : payloadJson).apply();
        scheduleAll(ctx, payloadJson);
    }

    /** Reinstate stored alarms (used by BootReceiver). */
    public static void reinstate(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        scheduleAll(ctx, p.getString(PREF_PAYLOAD, "{}"));
    }

    private static void scheduleAll(Context ctx, String payloadJson) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || payloadJson == null) return;
        try {
            JSONObject payload = new JSONObject(payloadJson);
            JSONArray times = payload.optJSONArray("times");
            JSONArray rules = payload.optJSONArray("rules");
            if (times == null || rules == null || rules.length() == 0) return;
            String rulesStr = rules.toString();
            for (int i = 0; i < times.length(); i++) {
                scheduleOne(ctx, am, times.optString(i, ""), rulesStr);
            }
        } catch (Exception ignored) {}
    }

    private static void scheduleOne(Context ctx, AlarmManager am, String hhmm, String rulesStr) {
        String[] parts = hhmm.split(":");
        if (parts.length != 2) return;
        int hour, minute;
        try { hour = Integer.parseInt(parts[0]); minute = Integer.parseInt(parts[1]); }
        catch (Exception e) { return; }

        Intent i = new Intent(ctx, AlertReceiver.class);
        i.putExtra("rules", rulesStr);
        i.putExtra("hhmm", hhmm);

        PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode(hhmm), i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 0);
        if (c.getTimeInMillis() <= System.currentTimeMillis()) c.add(Calendar.DAY_OF_MONTH, 1);

        am.setInexactRepeating(AlarmManager.RTC_WAKEUP, c.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pi);
    }

    private static void cancelAll(Context ctx, String payloadJson) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null || payloadJson == null) return;
        try {
            JSONObject payload = new JSONObject(payloadJson);
            JSONArray times = payload.optJSONArray("times");
            if (times == null) return;
            for (int i = 0; i < times.length(); i++) {
                String hhmm = times.optString(i, "");
                Intent i2 = new Intent(ctx, AlertReceiver.class);
                PendingIntent pi = PendingIntent.getBroadcast(ctx, reqCode(hhmm), i2,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                am.cancel(pi);
            }
        } catch (Exception ignored) {}
    }

    private static int reqCode(String hhmm) {
        return BASE + Math.abs(("digest@" + hhmm).hashCode() % 100000);
    }
}
