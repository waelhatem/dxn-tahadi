package com.waelhatem.istighfar;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.Window;
import android.graphics.Color;

public class MainActivity extends Activity {
  @Override public void onCreate(Bundle b) {
    super.onCreate(b);
    Window w=getWindow(); w.setStatusBarColor(Color.rgb(7,60,45)); w.setNavigationBarColor(Color.rgb(7,60,45));
    WebView v=new WebView(this);
    v.setBackgroundColor(Color.rgb(8,47,37));
    v.setWebViewClient(new WebViewClient());
    WebSettings s=v.getSettings();
    s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true);
    s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false);
    v.loadUrl("file:///android_asset/index.html");
    setContentView(v);
  }
}
