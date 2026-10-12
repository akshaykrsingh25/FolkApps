package com.incuspaze.assetregister.test;
import android.app.*;
import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;
import android.view.ViewGroup;
import java.util.concurrent.*;
public final class LaunchChecks extends Instrumentation {
 @Override public void onCreate(Bundle args){super.onCreate(args);start();}
 @Override public void onStart(){Bundle result=new Bundle();try{
  Intent launch=getTargetContext().getPackageManager().getLaunchIntentForPackage(getTargetContext().getPackageName());if(launch==null)throw new AssertionError("Launcher missing");launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
  Activity activity=startActivitySync(launch);WebView[] view=new WebView[1];runOnMainSync(()->{ViewGroup content=activity.findViewById(android.R.id.content);view[0]=(WebView)content.getChildAt(0);});
  String[] output={""};boolean ready=false;
  for(int n=0;n<40;n++){CountDownLatch latch=new CountDownLatch(1);runOnMainSync(()->view[0].evaluateJavascript("JSON.stringify({ready:!!document.querySelector('.workspace'),text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,image:!!document.querySelector('.workspace-photo img')&&document.querySelector('.workspace-photo img').complete})",value->{output[0]=value;latch.countDown();}));latch.await(3,TimeUnit.SECONDS);if(output[0].contains("\\\"ready\\\":true")){ready=true;break;}Thread.sleep(500);}
  if(!ready)throw new AssertionError("App did not render: "+output[0]);if(output[0].contains("DEMO"))throw new AssertionError("Demo branding present");if(output[0].contains("\\\"overflow\\\":true"))throw new AssertionError("Horizontal overflow");
  result.putString("result","PASS: APK launch, packaged UI, no demo banner, viewport fit.");result.putString("observation",output[0].substring(0,Math.min(output[0].length(),1400)));finish(Activity.RESULT_OK,result);
 }catch(Throwable error){result.putString("result","FAIL: "+error.toString());finish(Activity.RESULT_CANCELED,result);}}
}
