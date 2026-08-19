package com.actionables.personaltracker.app;
import android.content.*;
public class BootReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context c,Intent i){ NativeAlarms.restore(c); }
}
