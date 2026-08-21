package com.actionables.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Fires once per digest time. Reads the saved app data, evaluates EVERY enabled
 * rule carried in the alarm, and posts a SINGLE combined notification listing the
 * conditions that currently have matches. Nothing is shown if all counts are zero.
 *
 * The matching logic MIRRORS alertMatches() in app.js. If you change a rule
 * definition there, update it here too, or the closed-app digest will drift.
 */
public class AlertReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String rulesJson = intent.getStringExtra("rules");
        if (rulesJson == null) return;

        SharedPreferences p = ctx.getSharedPreferences(MainActivity.PREFS, Context.MODE_PRIVATE);
        String data = p.getString(MainActivity.KEY_DATA, "");

        StringBuilder parts = new StringBuilder();
        int totalConds = 0;
        int grandTotal = 0;
        try {
            JSONArray rules = new JSONArray(rulesJson);
            JSONObject S = (data == null || data.isEmpty()) ? null : new JSONObject(data);
            JSONArray acts = (S == null) ? null : S.optJSONArray("actionables");
            String today = todayISO();
            for (int r = 0; r < rules.length(); r++) {
                JSONObject rule = rules.optJSONObject(r);
                if (rule == null) continue;
                String type = rule.optString("type", "");
                int param = rule.optInt("param", 0);
                String shortLabel = rule.optString("short", type);
                int count = (acts == null) ? 0 : countMatches(acts, type, param, today);
                if (count > 0) {
                    if (parts.length() > 0) parts.append("  \u00b7  ");
                    parts.append(count).append(" ").append(shortLabel);
                    totalConds++;
                    grandTotal += count;
                }
            }
        } catch (Exception ignored) {}

        if (totalConds == 0) return; // nothing to report — stay silent

        String title = "Actionables digest";
        String body = parts.toString();
        // Stable id per time so the same digest updates rather than stacking.
        String hhmm = intent.getStringExtra("hhmm");
        int nid = 300 + Math.abs((hhmm == null ? "d" : hhmm).hashCode() % 500);
        NotifReceiver.showNow(ctx, title, body, nid, MainActivity.ALERT_CHANNEL_ID);
    }

    /* ---------- data parsing + rule evaluation (mirrors app.js) ---------- */

    private int countMatches(JSONArray acts, String type, int param, String t) {
        int n = 0;
        for (int i = 0; i < acts.length(); i++) {
            JSONObject a = acts.optJSONObject(i);
            if (a == null) continue;
            if (matches(a, type, param, t)) n++;
        }
        return n;
    }

    private boolean matches(JSONObject a, String type, int param, String t) {
        String projectId = a.optString("projectId", "");
        if ("__personal".equals(projectId) || a.optBoolean("archived", false)) return false;
        String status = a.optString("status", "");
        boolean open = !"Completed".equals(status);

        if ("eta_breached".equals(type)) {
            if (!open) return false;
            String e = endEta(a);
            return e.length() > 0 && e.compareTo(t) < 0;
        } else if ("due_today".equals(type)) {
            if (!open) return false;
            String e = endEta(a);
            if (e.length() > 0) return e.equals(t);
            return "range".equals(a.optString("etaKind", "")) && coversDay(a, t);
        } else if ("due_week".equals(type)) {
            if (!open) return false;
            String e = endEta(a);
            if (e.length() == 0) return false;
            int k = diffDays(e, t);
            return k >= 0 && k <= 7;
        } else if ("no_update".equals(type)) {
            if (!open) return false;
            return staleDays(a, t) >= (param > 0 ? param : 3);
        } else if ("aging".equals(type)) {
            if (!open) return false;
            return agingDays(a, t) >= (param > 0 ? param : 15);
        } else if ("followup_due".equals(type)) {
            return remDue(a, t);
        } else if ("dependency".equals(type)) {
            return open && "Dependency".equals(status);
        } else if ("unassigned".equals(type)) {
            JSONArray sp = a.optJSONArray("spocIds");
            return open && (sp == null || sp.length() == 0);
        }
        return false;
    }

    private boolean remDue(JSONObject a, String t) {
        if ("Completed".equals(a.optString("status", ""))) return false;
        JSONObject r = a.optJSONObject("rem");
        if (r == null) return false;
        if (!r.optBoolean("on", false) || r.optBoolean("done", false)) return false;
        String d = r.optString("date", "");
        return d.length() > 0 && d.compareTo(t) <= 0;
    }

    private String endEta(JSONObject a) {
        String kind = a.optString("etaKind", "");
        if ("range".equals(kind)) {
            String ee = a.optString("etaEnd", "");
            if (ee.length() > 0) return ee;
            return a.optString("eta", "");
        }
        if ("date".equals(kind)) return a.optString("eta", "");
        return "";
    }

    private boolean coversDay(JSONObject a, String d) {
        String kind = a.optString("etaKind", "");
        String eta = a.optString("eta", "");
        String ee = a.optString("etaEnd", "");
        if ("date".equals(kind)) return eta.equals(d);
        if ("range".equals(kind)) {
            if (eta.length() > 0 && ee.length() > 0)
                return eta.compareTo(d) <= 0 && d.compareTo(ee) <= 0;
            return eta.equals(d) || ee.equals(d);
        }
        return false;
    }

    private int staleDays(JSONObject a, String asOf) {
        if ("Completed".equals(a.optString("status", ""))) return 0;
        String u = isoFromMs(a.optLong("updatedAt", 0));
        if (u.length() == 0) u = isoFromMs(a.optLong("createdAt", 0));
        if (u.length() == 0) return 0;
        return Math.max(0, diffDays(asOf, u));
    }

    private int agingDays(JSONObject a, String asOf) {
        String start = isoFromMs(a.optLong("assignedAt", 0));
        if (start.length() == 0) start = isoFromMs(a.optLong("createdAt", 0));
        if (start.length() == 0) start = asOf;
        return Math.max(0, diffDays(asOf, start));
    }

    /* ---------- date helpers (match app.js semantics) ---------- */

    private String todayISO() {
        Calendar c = Calendar.getInstance();
        return iso(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    private String isoFromMs(long ms) {
        if (ms <= 0) return "";
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return iso(c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    private String iso(int y, int m, int d) {
        return y + "-" + (m < 10 ? "0" + m : "" + m) + "-" + (d < 10 ? "0" + d : "" + d);
    }

    private int diffDays(String a, String b) {
        return (int) Math.round((toMs(a) - toMs(b)) / 86400000.0);
    }

    private long toMs(String iso) {
        String[] p = iso.split("-");
        if (p.length != 3) return System.currentTimeMillis();
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
        return c.getTimeInMillis();
    }
}
