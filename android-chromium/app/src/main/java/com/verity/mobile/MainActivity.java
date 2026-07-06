package com.verity.mobile;

import android.app.Activity;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;

/**
 * Verity Browser Mobile – schlanker WebView-Browser mit Adressleiste,
 * Suche und Zurück-Navigation im Verity-Look. Bewusst minimal.
 */
public class MainActivity extends Activity {

    private WebView web;
    private EditText bar;
    private ProgressBar progress;

    private static final int BG = 0xFF0F0F11;
    private static final int SURFACE = 0xFF1B1B1F;
    private static final int FG = 0xFFE6E8EC;
    private static final int MUTED = 0xFF8B8D93;
    private static final int ACCENT = 0xFF7C5CFF;
    private static final String SEARCH = "https://duckduckgo.com/?q=";
    private static final String HOME = "https://duckduckgo.com/";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(BG);
        root.setFitsSystemWindows(true);

        bar = new EditText(this);
        bar.setSingleLine(true);
        bar.setHint("Suchen oder Adresse eingeben");
        bar.setImeOptions(EditorInfo.IME_ACTION_GO);
        bar.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_URI);
        bar.setTextColor(FG);
        bar.setHintTextColor(MUTED);
        bar.setBackgroundColor(SURFACE);
        bar.setPadding(36, 26, 36, 26);
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        barLp.setMargins(20, 20, 20, 12);
        root.addView(bar, barLp);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 6));

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        web.setBackgroundColor(BG);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                if (!bar.hasFocus()) bar.setText(url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int p) {
                progress.setProgress(p);
                progress.setVisibility(p < 100 ? View.VISIBLE : View.GONE);
            }
        });

        root.addView(web, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));

        setContentView(root);

        bar.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                go(bar.getText().toString());
                return true;
            }
            return false;
        });

        web.loadUrl(HOME);
    }

    private void go(String text) {
        String t = text.trim();
        String url;
        if (t.matches("^[a-zA-Z][a-zA-Z0-9+.-]*://.*")) {
            url = t;
        } else if (t.contains(".") && !t.contains(" ")) {
            url = "https://" + t;
        } else {
            url = SEARCH + Uri.encode(t);
        }
        web.loadUrl(url);
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(bar.getWindowToken(), 0);
        bar.clearFocus();
        web.requestFocus();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
