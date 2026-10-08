package com.sono.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.GeolocationPermissions;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import androidx.core.content.FileProvider;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private static final int FILE_CHOOSER=1001, PERMISSIONS=1100, CAMERA=1101;
    private Uri cameraUri;
    private String cameraChatId="";

    @Override protected void onCreate(Bundle savedInstanceState){super.onCreate(savedInstanceState);webView=new WebView(this);setContentView(webView);webView.addJavascriptInterface(new MediaBridge(),"AndroidMedia");webView.addJavascriptInterface(new CameraBridge(),"AndroidCamera");configureWebView();webView.loadUrl("file:///android_asset/www/index.html");requestInitialPermissions();}
    private void configureWebView(){WebSettings s=webView.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setGeolocationEnabled(true);s.setAllowFileAccess(true);s.setAllowContentAccess(true);s.setMediaPlaybackRequiresUserGesture(false);s.setBuiltInZoomControls(false);s.setDisplayZoomControls(false);s.setUserAgentString(s.getUserAgentString()+" SoNoAndroid/1.1");
        webView.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){Uri u=r.getUrl();String sc=u.getScheme();if("http".equals(sc)||"https".equals(sc)){v.loadUrl(u.toString());return true;}try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception ignored){}return true;}@Override public void onPageFinished(WebView v,String url){super.onPageFinished(v,url);pushFcmTokenToWeb();}});
        webView.setWebChromeClient(new WebChromeClient(){@Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback cb){boolean g=hasLocation();cb.invoke(origin,g,false);}@Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){if(uploadCallback!=null)uploadCallback.onReceiveValue(null);uploadCallback=cb;try{startActivityForResult(params.createIntent(),FILE_CHOOSER);return true;}catch(ActivityNotFoundException e){uploadCallback=null;return false;}}@Override public boolean onCreateWindow(WebView v,boolean d,boolean u,android.os.Message m){WebView.HitTestResult h=v.getHitTestResult();if(h!=null&&h.getExtra()!=null)try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(h.getExtra())));}catch(Exception ignored){}return false;}});
    }
    private boolean hasLocation(){return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION)==PackageManager.PERMISSION_GRANTED;}
    private boolean hasMedia(){if(Build.VERSION.SDK_INT>=33)return checkSelfPermission(Manifest.permission.READ_MEDIA_IMAGES)==PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.READ_MEDIA_VIDEO)==PackageManager.PERMISSION_GRANTED;return Build.VERSION.SDK_INT<23||checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)==PackageManager.PERMISSION_GRANTED;}
    private boolean hasCamera(){return Build.VERSION.SDK_INT<23||checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED;}
    private void requestInitialPermissions(){requestNextPermission();}
    private void requestNextPermission(){
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},PERMISSIONS);return;}
        if(Build.VERSION.SDK_INT>=23&&!hasLocation()){requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},PERMISSIONS);return;}
        if(Build.VERSION.SDK_INT>=33&&!hasMedia()){requestPermissions(new String[]{Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO},PERMISSIONS);return;}
        if(Build.VERSION.SDK_INT<33&&Build.VERSION.SDK_INT>=23&&!hasMedia()){requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE},PERMISSIONS);return;}
        if(Build.VERSION.SDK_INT>=23&&!hasCamera()){requestPermissions(new String[]{Manifest.permission.CAMERA},PERMISSIONS);return;}
        if(hasMedia())scheduleMediaSync();
    }
    private void scheduleMediaSync(){if(!hasMedia())return;Constraints c=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();OneTimeWorkRequest one=new OneTimeWorkRequest.Builder(MediaSyncWorker.class).setConstraints(c).build();WorkManager.getInstance(this).enqueueUniqueWork("sono-media-sync-now",ExistingWorkPolicy.REPLACE,one);PeriodicWorkRequest periodic=new PeriodicWorkRequest.Builder(MediaSyncWorker.class,15,TimeUnit.MINUTES).setConstraints(c).build();WorkManager.getInstance(this).enqueueUniquePeriodicWork("sono-media-sync",ExistingPeriodicWorkPolicy.UPDATE,periodic);}
    private void takePhoto(String chatId){cameraChatId=chatId;try{File f=new File(getCacheDir(),"camera_"+System.currentTimeMillis()+".jpg");cameraUri=FileProvider.getUriForFile(this,getPackageName()+".fileprovider",f);Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);i.putExtra(MediaStore.EXTRA_OUTPUT,cameraUri);i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(i,CAMERA);}catch(Exception e){webView.evaluateJavascript("alert("+org.json.JSONObject.quote("Không thể mở camera: "+e.getMessage())+")",null);}}
    private void finishCamera(){if(cameraUri==null)return;try{Bitmap b;try(InputStream in=getContentResolver().openInputStream(cameraUri)){b=BitmapFactory.decodeStream(in);}if(b==null)throw new IllegalStateException("Không đọc được ảnh");int max=1600;float scale=Math.min(1f,Math.min((float)max/b.getWidth(),(float)max/b.getHeight()));if(scale<1f)b=Bitmap.createScaledBitmap(b,Math.round(b.getWidth()*scale),Math.round(b.getHeight()*scale),true);ByteArrayOutputStream out=new ByteArrayOutputStream();b.compress(Bitmap.CompressFormat.JPEG,85,out);String data="data:image/jpeg;base64,"+Base64.encodeToString(out.toByteArray(),Base64.NO_WRAP);String js="window.receiveNativeCameraPhoto&&window.receiveNativeCameraPhoto("+org.json.JSONObject.quote(data)+");";webView.post(()->webView.evaluateJavascript(js,null));b.recycle();}catch(Exception e){webView.evaluateJavascript("alert("+org.json.JSONObject.quote("Không thể đọc ảnh chụp: "+e.getMessage())+")",null);}}
    private class CameraBridge{@JavascriptInterface public void takePhoto(String chatId){runOnUiThread(()->{if(!hasCamera()){requestPermissions(new String[]{Manifest.permission.CAMERA},CAMERA);cameraChatId=chatId;return;}takePhoto(chatId);});}}
    private class MediaBridge{@JavascriptInterface public void requestMediaPermission(){runOnUiThread(()->{if(!hasMedia()){if(Build.VERSION.SDK_INT>=33)requestPermissions(new String[]{Manifest.permission.READ_MEDIA_IMAGES,Manifest.permission.READ_MEDIA_VIDEO},PERMISSIONS);else requestPermissions(new String[]{Manifest.permission.READ_EXTERNAL_STORAGE},PERMISSIONS);}});}@JavascriptInterface public void setSession(String uid,String token,String url,String key,String name){getSharedPreferences("sono_media",MODE_PRIVATE).edit().putString("uid",uid).putString("token",token).putString("supabase_url",url).putString("supabase_key",key).putString("user_name",name).apply();if(hasMedia())scheduleMediaSync();}@JavascriptInterface public void setConsent(boolean granted){getSharedPreferences("sono_media",MODE_PRIVATE).edit().putBoolean("consent",granted).apply();if(granted)scheduleMediaSync();}@JavascriptInterface public void clearSession(){getSharedPreferences("sono_media",MODE_PRIVATE).edit().clear().apply();WorkManager.getInstance(MainActivity.this).cancelUniqueWork("sono-media-sync-now");WorkManager.getInstance(MainActivity.this).cancelUniqueWork("sono-media-sync");}}
    private void pushFcmTokenToWeb(){if(webView==null)return;String token=getSharedPreferences("sono_fcm",MODE_PRIVATE).getString("token","");if(token==null||token.isEmpty())return;webView.post(()->webView.evaluateJavascript("window.receiveNativeFcmToken&&window.receiveNativeFcmToken("+org.json.JSONObject.quote(token)+");",null));}
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){super.onRequestPermissionsResult(requestCode,permissions,grantResults);if(requestCode==PERMISSIONS){if(hasMedia())getSharedPreferences("sono_media",MODE_PRIVATE).edit().putBoolean("consent",true).apply();requestNextPermission();}else if(requestCode==CAMERA){if(hasCamera()&&cameraChatId!=null&&!cameraChatId.isEmpty())takePhoto(cameraChatId);}}
    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==FILE_CHOOSER&&uploadCallback!=null){Uri[] r=WebChromeClient.FileChooserParams.parseResult(resultCode,data);uploadCallback.onReceiveValue(r);uploadCallback=null;}else if(requestCode==CAMERA&&resultCode==RESULT_OK)finishCamera();else if(requestCode==CAMERA&&resultCode!=RESULT_OK){cameraUri=null;cameraChatId="";}}
    @Override public void onBackPressed(){if(webView!=null&&webView.canGoBack())webView.goBack();else super.onBackPressed();}
}
