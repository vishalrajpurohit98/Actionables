package com.actionables.personaltracker.app;

import android.app.*;
import android.content.*;
import android.os.*;
import org.json.*;
import java.util.*;

public class NativeAlarms {
 public static final String CHANNEL_ID="habit_reminders_v1";
 static final String PREF="scheduled_alarms_json";
 static final String ACTION="com.actionables.personaltracker.ACTION_REMINDER";
 static final int TEST_CODE=0x7F00AA11;

 static AlarmManager am(Context c){return (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);}
 static PendingIntent pi(Context c,int code,JSONObject a){
   Intent i=new Intent(c,NotifReceiver.class).setAction(ACTION);
   try{i.putExtra("habit",a.optString("h",""));i.putExtra("name",a.optString("n","Reminder"));i.putExtra("emoji",a.optString("e","🔔"));i.putExtra("id",a.optString("c",String.valueOf(code)));}catch(Exception ignored){}
   return PendingIntent.getBroadcast(c,code,i,PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0));
 }
 static void cancelStored(Context c){
   String old=c.getSharedPreferences(PREF,0).getString("json","[]");
   try{JSONArray arr=new JSONArray(old); for(int i=0;i<arr.length();i++){JSONObject a=arr.getJSONObject(i);int code=a.optInt("c",0); if(code!=0)am(c).cancel(pi(c,code,a));}}catch(Exception ignored){}
 }
 public static void schedule(Context c,String json){
   cancelStored(c);
   if(json==null)json="[]";
   c.getSharedPreferences(PREF,0).edit().putString("json",json).apply();
   try{
     JSONArray arr=new JSONArray(json);
     for(int i=0;i<arr.length();i++){
       JSONObject a=arr.getJSONObject(i); long t=a.optLong("t",0); int code=a.optInt("c",0);
       if(code==0||t<=System.currentTimeMillis())continue;
       set(c,code,a,t);
     }
   }catch(Exception ignored){}
 }
 static void set(Context c,int code,JSONObject a,long t){
   PendingIntent p=pi(c,code,a);
   AlarmManager x=am(c);
   if(Build.VERSION.SDK_INT>=31 && x.canScheduleExactAlarms())
      x.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,t,p);
   else if(Build.VERSION.SDK_INT>=23)
      x.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,t,p);
   else x.set(AlarmManager.RTC_WAKEUP,t,p);
 }
 public static void restore(Context c){
   String json=c.getSharedPreferences(PREF,0).getString("json","[]");
   try{
     JSONArray arr=new JSONArray(json);
     for(int i=0;i<arr.length();i++){JSONObject a=arr.getJSONObject(i);long t=a.optLong("t",0);if(t>System.currentTimeMillis())set(c,a.optInt("c",0),a,t);}
   }catch(Exception ignored){}
 }
 public static void test(Context c){
   JSONObject a=new JSONObject();try{a.put("h","test");a.put("n","Test reminder");a.put("e","🔔");a.put("c",TEST_CODE);}catch(Exception ignored){}
   set(c,TEST_CODE,a,System.currentTimeMillis()+5000);
 }
}
