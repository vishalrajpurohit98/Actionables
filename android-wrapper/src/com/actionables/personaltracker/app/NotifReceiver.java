package com.actionables.personaltracker.app;

import android.app.*;
import android.content.*;
import android.os.Build;
import android.graphics.Color;
import android.net.Uri;

public class NotifReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent in) {
        String habit=in.getStringExtra("habit");
        String name=in.getStringExtra("name");
        String emoji=in.getStringExtra("emoji");
        String id=in.getStringExtra("id");
        Intent open=new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if(habit!=null)open.putExtra("habit",habit);
        PendingIntent pi=PendingIntent.getActivity(c,Math.abs((id==null?"n":id).hashCode()),open,
                PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0));
        Notification.Builder b=Build.VERSION.SDK_INT>=26
                ?new Notification.Builder(c,NativeAlarms.CHANNEL_ID)
                :new Notification.Builder(c);
        b.setSmallIcon(com.actionables.personaltracker.app.R.drawable.app_icon)
         .setContentTitle((emoji==null?"🔔":emoji)+" "+(name==null?"Reminder":name))
         .setContentText("Time for your habit — keep the chain alive.")
         .setAutoCancel(true).setContentIntent(pi).setCategory(Notification.CATEGORY_REMINDER)
         .setColor(Color.rgb(255,174,31));
        ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(
                Math.abs((id==null?String.valueOf(System.currentTimeMillis()):id).hashCode()),b.build());
    }
}
