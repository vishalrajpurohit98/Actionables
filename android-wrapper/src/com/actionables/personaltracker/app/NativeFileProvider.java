package com.actionables.personaltracker.app;

import android.content.*;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import java.io.*;
import java.util.*;

public class NativeFileProvider extends ContentProvider {
    static String AUTH;
    @Override public boolean onCreate(){ AUTH=getContext().getPackageName()+".fileprovider"; return true; }
    public static Uri getUriForFile(Context c,String authority,File f){
        return new Uri.Builder().scheme("content").authority(authority).appendPath("share").appendPath(f.getName()).build();
    }
    File resolve(Uri u)throws IOException{
        if(u.getPathSegments().size()!=2) throw new FileNotFoundException();
        if(!"share".equals(u.getPathSegments().get(0))) throw new FileNotFoundException();
        File root=new File(getContext().getCacheDir(),"share");
        File f=new File(root,u.getPathSegments().get(1));
        if(!f.getCanonicalPath().startsWith(root.getCanonicalPath()+File.separator)) throw new SecurityException();
        return f;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
        return ParcelFileDescriptor.open(resolve(uri),ParcelFileDescriptor.MODE_READ_ONLY);
    }
    @Override public String getType(Uri uri){ return "application/octet-stream"; }
    @Override public Cursor query(Uri uri,String[] projection,String sel,String[] args,String sort){
        File f; try{f=resolve(uri);}catch(Exception e){return null;}
        String[] cols=projection!=null?projection:new String[]{"_display_name","_size"};
        MatrixCursor c=new MatrixCursor(cols);
        Object[] row=new Object[cols.length];
        for(int i=0;i<cols.length;i++){if("_display_name".equals(cols[i]))row[i]=f.getName();else if("_size".equals(cols[i]))row[i]=f.length();}
        c.addRow(row); return c;
    }
    @Override public int delete(Uri u,String s,String[] a){try{return resolve(u).delete()?1:0;}catch(Exception e){return 0;}}
    @Override public int update(Uri u,ContentValues v,String s,String[] a){return 0;}
    @Override public int insert(Uri u,ContentValues v){throw new UnsupportedOperationException();}
}
