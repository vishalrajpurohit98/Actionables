package com.actionables.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class NotifReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        showNow(ctx, intent.getStringExtra("title") != null ? intent.getStringExtra("title") : "Actionables", intent.getStringExtra("body") != null ? intent.getStringExtra("body") : "Your daily brief is ready. Tap to review today's actionables.", intent.getIntExtra("notificationId", 100));
    }

    public static void showNow(Context ctx, String title, String body) { showNow(ctx,title,body,100); }

    public static void showNow(Context ctx, String title, String body, int notificationId) {
        Intent open = new Intent(ctx, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(ctx, 7, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            b = new Notification.Builder(ctx, MainActivity.FOLLOWUP_CHANNEL_ID);
        } else {
            b = new Notification.Builder(ctx);
        }
        b.setSmallIcon(android.R.drawable.ic_popup_reminder)
         .setContentTitle(title)
         .setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body))
         .setAutoCancel(true)
         .setContentIntent(pi);

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(notificationId, b.build());
    }
}
