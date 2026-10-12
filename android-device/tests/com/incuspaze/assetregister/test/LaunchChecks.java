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
  for(int n=0;n<40;n++){CountDownLatch latch=new CountDownLatch(1);runOnMainSync(()->view[0].evaluateJavascript("(()=>{const h=document.querySelector('.workspace-header')?.getBoundingClientRect();const n=document.querySelector('.workspace-nav')?.getBoundingClientRect();const c=document.querySelector('.mobile-scan-action')?.getBoundingClientRect();const logo=document.querySelector('.incuspaze-logo');return JSON.stringify({ready:!!document.querySelector('.workspace'),text:document.body.innerText,overflow:document.documentElement.scrollWidth>innerWidth,logo:!!logo&&logo.complete&&logo.naturalWidth>0,header:!!h&&h.top>=-1&&h.bottom<=innerHeight,nav:!!n&&n.top>=0&&n.bottom<=innerHeight+1,captureCentered:!!c&&Math.abs((c.left+c.width/2)-innerWidth/2)<12})})()",value->{output[0]=value;latch.countDown();}));latch.await(3,TimeUnit.SECONDS);if(output[0].contains("\\\"ready\\\":true")){ready=true;break;}Thread.sleep(500);}
  if(!ready)throw new AssertionError("App did not render: "+output[0]);if(output[0].contains("DEMO"))throw new AssertionError("Demo branding present");if(output[0].contains("\\\"overflow\\\":true"))throw new AssertionError("Horizontal overflow");if(!output[0].contains("\\\"logo\\\":true"))throw new AssertionError("Official logo missing");if(!output[0].contains("\\\"header\\\":true"))throw new AssertionError("Header outside safe viewport");if(!output[0].contains("\\\"nav\\\":true"))throw new AssertionError("Navigation outside safe viewport");if(!output[0].contains("\\\"captureCentered\\\":true"))throw new AssertionError("Capture action is not centred");
  runOnMainSync(()->view[0].evaluateJavascript("document.querySelector('.mobile-scan-action').click()",null));Thread.sleep(500);String[] capture={""};CountDownLatch captureLatch=new CountDownLatch(1);runOnMainSync(()->view[0].evaluateJavascript("JSON.stringify({workspace:!!document.querySelector('.unified-capture'),modes:document.querySelectorAll('.capture-mode-tabs [role=tab]').length,camera:!!document.querySelector('.asset-camera')})",value->{capture[0]=value;captureLatch.countDown();}));captureLatch.await(3,TimeUnit.SECONDS);if(!capture[0].contains("\\\"workspace\\\":true")||!capture[0].contains("\\\"modes\\\":3")||!capture[0].contains("\\\"camera\\\":true"))throw new AssertionError("Unified smart capture missing: "+capture[0]);
  result.putString("result","PASS: APK launch, official branding, safe header/footer, centred unified capture, three camera modes, no demo banner, viewport fit.");result.putString("observation",output[0].substring(0,Math.min(output[0].length(),1400)));finish(Activity.RESULT_OK,result);
 }catch(Throwable error){result.putString("result","FAIL: "+error.toString());finish(Activity.RESULT_CANCELED,result);}}
}
