package com.verity.mobile;

import android.app.Activity;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.LinearLayout;

import org.mozilla.geckoview.GeckoRuntime;
import org.mozilla.geckoview.GeckoSession;
import org.mozilla.geckoview.GeckoView;

/**
 * Verity Browser Mobile – auf GeckoView (Mozillas Firefox-Engine).
 * Schlanker Browser mit Adressleiste, Suche und Zurück-Navigation.
 */
public class MainActivity extends Activity {

    private static GeckoRuntime sRuntime;
    private GeckoSession session;
    private EditText bar;
    private boolean canGoBack = false;

    private static final int BG = 0xFF14161B;
    private static final int SURFACE = 0xFF1B2230;
    private static final int FG = 0xFFECEFF4;
    private static final int MUTED = 0xFF8D99AD;
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

        GeckoView view = new GeckoView(this);
        root.addView(view, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        if (sRuntime == null) {
            sRuntime = GeckoRuntime.create(this);
        }
        session = new GeckoSession();
        session.setNavigationDelegate(new GeckoSession.NavigationDelegate() {
            @Override
            public void onCanGoBack(GeckoSession s, boolean value) {
                canGoBack = value;
            }
            @Override
            public void onLocationChange(GeckoSession s, String url,
                    java.util.List<GeckoSession.PermissionDelegate.ContentPermission> perms,
                    Boolean userGesture) {
                if (url != null && !bar.hasFocus()) bar.setText(url);
            }
        });
        session.open(sRuntime);
        view.setSession(session);
        session.loadUri(HOME);

        bar.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_GO) {
                go(bar.getText().toString());
                return true;
            }
            return false;
        });
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
        session.loadUri(url);
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(bar.getWindowToken(), 0);
        bar.clearFocus();
    }

    @Override
    public void onBackPressed() {
        if (canGoBack) {
            session.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
