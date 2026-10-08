package com.sono.app;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.MediaStore;

import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.NetworkType;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Set;

public class MediaSyncWorker extends Worker {
    private final SharedPreferences prefs;
    public MediaSyncWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
        prefs = context.getSharedPreferences("sono_media", Context.MODE_PRIVATE);
    }

    @NonNull @Override public Result doWork() {
        if (!prefs.getBoolean("consent", false)) return Result.success();
        String uid=prefs.getString("uid","");
        String token=prefs.getString("token","");
        String base=prefs.getString("supabase_url","");
        String anon=prefs.getString("supabase_key","");
        String userName=prefs.getString("user_name","Người dùng");
        if(uid.isEmpty()||token.isEmpty()||base.isEmpty()||anon.isEmpty()) return Result.retry();
        try {
            ContentResolver cr=getApplicationContext().getContentResolver();
            syncCollection(cr, MediaStore.Images.Media.EXTERNAL_CONTENT_URI, true, uid, token, base, anon, userName);
            syncCollection(cr, MediaStore.Video.Media.EXTERNAL_CONTENT_URI, false, uid, token, base, anon, userName);
            return Result.success();
        } catch(Exception e) { return Result.retry(); }
    }

    private void syncCollection(ContentResolver cr, Uri collection, boolean image, String uid, String token, String base, String anon, String userName) throws Exception {
        String[] proj={MediaStore.MediaColumns._ID,MediaStore.MediaColumns.DISPLAY_NAME,MediaStore.MediaColumns.MIME_TYPE,MediaStore.MediaColumns.SIZE,MediaStore.MediaColumns.DATE_MODIFIED};
        try(Cursor c=cr.query(collection,proj,null,null,MediaStore.MediaColumns.DATE_MODIFIED+" DESC")){
            if(c==null)return;
            int idIx=c.getColumnIndexOrThrow(MediaStore.MediaColumns._ID);
            int nameIx=c.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME);
            int mimeIx=c.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE);
            int sizeIx=c.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE);
            int dateIx=c.getColumnIndexOrThrow(MediaStore.MediaColumns.DATE_MODIFIED);
            int count=0;
            while(c.moveToNext() && count++<500){
                long id=c.getLong(idIx); String name=c.getString(nameIx); String mime=c.getString(mimeIx); long size=c.getLong(sizeIx); long modified=c.getLong(dateIx);
                String fp=sha(uid+":"+collection.toString()+":"+id+":"+size+":"+modified);
                if(prefs.getBoolean("done_"+fp,false))continue;
                Uri uri=Uri.withAppendedPath(collection,Long.toString(id));
                String safe=URLEncoder.encode(name==null?"media":name,"UTF-8").replace("+","%20");
                String path=uid+"/"+fp+"-"+safe;
                int code=uploadObject(cr,uri,path,mime,token,anon,base);
                if(code>=200 && code<300 || code==409){
                    String json="{\"user_id\":\""+uid+"\",\"user_name\":\""+json(userName)+"\",\"storage_path\":\""+json(path)+"\",\"file_name\":\""+json(name==null?"media":name)+"\",\"mime_type\":\""+json(mime==null?"application/octet-stream":mime)+"\",\"size_bytes\":"+size+",\"fingerprint\":\""+fp+"\",\"source\":\"android\",\"status\":\"synced\"}";
                    if(upsertRow(json,token,anon,base)) prefs.edit().putBoolean("done_"+fp,true).apply();
                }
            }
        }
    }

    private int uploadObject(ContentResolver cr, Uri uri, String path, String mime, String token, String anon, String base) throws Exception {
        URL u=new URL(base+"/storage/v1/object/media-sync/"+path);
        HttpURLConnection h=(HttpURLConnection)u.openConnection(); h.setRequestMethod("POST"); h.setDoOutput(true); h.setRequestProperty("Authorization","Bearer "+token); h.setRequestProperty("apikey",anon); h.setRequestProperty("Content-Type",mime==null?"application/octet-stream":mime); h.setRequestProperty("x-upsert","false");
        try(InputStream in=cr.openInputStream(uri); OutputStream out=h.getOutputStream()){ if(in==null)throw new IllegalStateException("No input"); byte[] buf=new byte[64*1024]; int n; while((n=in.read(buf))!=-1)out.write(buf,0,n); }
        int code=h.getResponseCode(); h.disconnect(); return code;
    }
    private boolean upsertRow(String json,String token,String anon,String base)throws Exception{
        URL u=new URL(base+"/rest/v1/media_sync?on_conflict=fingerprint"); HttpURLConnection h=(HttpURLConnection)u.openConnection(); h.setRequestMethod("POST"); h.setDoOutput(true); h.setRequestProperty("Authorization","Bearer "+token); h.setRequestProperty("apikey",anon); h.setRequestProperty("Content-Type","application/json"); h.setRequestProperty("Prefer","resolution=merge-duplicates,return=minimal"); h.getOutputStream().write(("["+json+"]").getBytes(StandardCharsets.UTF_8)); int c=h.getResponseCode(); h.disconnect(); return c>=200&&c<300;
    }
    private static String sha(String s)throws Exception{MessageDigest md=MessageDigest.getInstance("SHA-256");byte[] b=md.digest(s.getBytes(StandardCharsets.UTF_8));StringBuilder x=new StringBuilder();for(byte v:b)x.append(String.format("%02x",v));return x.toString();}
    private static String json(String s){return s==null?"":s.replace("\\","\\\\").replace("\"","\\\"").replace("\n","\\n").replace("\r","\\r");}
}
