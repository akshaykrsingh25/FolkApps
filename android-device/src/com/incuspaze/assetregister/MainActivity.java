package com.incuspaze.assetregister;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.*;
import android.view.View;
import java.io.*;
import java.util.*;

/** Offline device edition. No company server credentials or remote pages are accepted. */
public final class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private WebView web;
 private ValueCallback<Uri[]> files;
 private PermissionRequest camera;
 private byte[] exportBytes;
 private String exportName;
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  web=new WebView(this);setContentView(web);
  // Keep the WebView inside the status/navigation bars on every handset. CSS fixed
  // app bars then use the complete safe content rectangle instead of sitting below
  // transparent system icons on cutout and edge-to-edge devices.
  if(android.os.Build.VERSION.SDK_INT>=30)getWindow().setDecorFitsSystemWindows(true);
  getWindow().setStatusBarColor(android.graphics.Color.WHITE);getWindow().setNavigationBarColor(android.graphics.Color.WHITE);
  web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  WebSettings settings=web.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setAllowFileAccess(false);settings.setAllowContentAccess(true);settings.setMediaPlaybackRequiresUserGesture(true);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){Uri uri=req.getUrl();return !"appassets.androidplatform.net".equals(uri.getHost())||!"https".equals(uri.getScheme());}
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();if(!"https".equals(uri.getScheme())||!"appassets.androidplatform.net".equals(uri.getHost()))return empty(403);
    String path=uri.getPath();if(path==null||path.equals("/"))path="/index.html";
    if(path.contains("..")||path.contains("\\")||path.indexOf('\0')>=0)return empty(403);
    try{String file=path.substring(1);String mime=MimeTypeMap.getSingleton().getMimeTypeFromExtension(MimeTypeMap.getFileExtensionFromUrl(file));if(file.endsWith(".js"))mime="application/javascript";if(file.endsWith(".wasm"))mime="application/wasm";if(file.endsWith(".tflite")||file.endsWith(".gz"))mime="application/octet-stream";
     WebResourceResponse response=new WebResourceResponse(mime==null?"application/octet-stream":mime,"UTF-8",getAssets().open(file));Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");response.setResponseHeaders(headers);return response;
    }catch(IOException e){return empty(404);}
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){runOnUiThread(()->{if(!ORIGIN.equals(request.getOrigin().toString().replaceAll("/$",""))){request.deny();return;}boolean video=false;for(String resource:request.getResources())if(PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource))video=true;if(!video){request.deny();return;}if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else{if(camera!=null)camera.deny();camera=request;requestPermissions(new String[]{Manifest.permission.CAMERA},71);}});}
   @Override public void onPermissionRequestCanceled(PermissionRequest request){if(camera==request)camera=null;}
   @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams params){if(files!=null)files.onReceiveValue(null);files=callback;Intent choose=new Intent(Intent.ACTION_GET_CONTENT);choose.setType("*/*");choose.addCategory(Intent.CATEGORY_OPENABLE);choose.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"image/*","application/pdf","image/svg+xml"});try{startActivityForResult(Intent.createChooser(choose,"Choose photo or invoice"),72);}catch(Exception e){files.onReceiveValue(null);files=null;}return true;}
  });
  web.addJavascriptInterface(new ExportBridge(),"IncuAssetNative");
  web.loadUrl(ORIGIN+"/");
 }
 private WebResourceResponse empty(int code){return new WebResourceResponse("text/plain","UTF-8",code,code==404?"Not Found":"Forbidden",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));}
 @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){super.onRequestPermissionsResult(requestCode,permissions,results);if(requestCode==71&&camera!=null){if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)camera.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else camera.deny();camera=null;}}
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);if(requestCode==72&&files!=null){files.onReceiveValue(resultCode==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);files=null;}if(requestCode==73&&exportBytes!=null){if(resultCode==RESULT_OK&&data!=null&&data.getData()!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){if(out!=null)out.write(exportBytes);}catch(IOException e){android.widget.Toast.makeText(this,"Could not save file. Please retry.",android.widget.Toast.LENGTH_LONG).show();}}exportBytes=null;exportName=null;}}
 public final class ExportBridge {
  @JavascriptInterface public void closeApp(){runOnUiThread(()->finish());}
  @JavascriptInterface public void printLabel(){runOnUiThread(()->{android.print.PrintManager manager=(android.print.PrintManager)getSystemService(PRINT_SERVICE);if(manager!=null)manager.print("IncuAsset QR label",web.createPrintDocumentAdapter("IncuAsset QR label"),new android.print.PrintAttributes.Builder().setMediaSize(new android.print.PrintAttributes.MediaSize("INCUASSET_LABEL","Asset label",3150,4331)).setMinMargins(android.print.PrintAttributes.Margins.NO_MARGINS).build());});}
  @JavascriptInterface public void saveFile(String name,String mime,String base64){if(base64==null||base64.length()>28000000)return;runOnUiThread(()->{if(web.getUrl()==null||!web.getUrl().startsWith(ORIGIN+"/")||exportBytes!=null)return;try{byte[] bytes=android.util.Base64.decode(base64,android.util.Base64.DEFAULT);if(bytes.length>20000000)return;exportBytes=bytes;exportName=name==null?"incuasset-file":name.replaceAll("[^a-zA-Z0-9._-]","_");if(exportName.length()>120)exportName=exportName.substring(0,120);Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);save.addCategory(Intent.CATEGORY_OPENABLE);save.setType(Arrays.asList("application/json","text/csv","image/png","image/jpeg","application/pdf").contains(mime)?mime:"application/octet-stream");save.putExtra(Intent.EXTRA_TITLE,exportName);startActivityForResult(save,73);}catch(Exception e){exportBytes=null;}});}
 }
 @Override public void onBackPressed(){web.evaluateJavascript("window.dispatchEvent(new CustomEvent('incuasset-back'));",null);}
 @Override protected void onPause(){super.onPause();web.onPause();web.evaluateJavascript("window.dispatchEvent(new Event('incuasset-background'));",null);}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){if(camera!=null)camera.deny();if(files!=null)files.onReceiveValue(null);web.removeJavascriptInterface("IncuAssetNative");web.destroy();super.onDestroy();}
}
