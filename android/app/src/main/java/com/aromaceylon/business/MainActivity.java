package com.aromaceylon.business;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.RandomAccessFile;

import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

public class MainActivity extends Activity {
    static final String NOTIFICATION_CHANNEL_ID = "aroma_messages";
    static final String PUSH_PREFS = "aroma_push";
    static final String PUSH_TOKEN_KEY = "fcm_token";

    static final String UPLOAD_PREFS = "aroma_pending_upload";
    static final String UPLOAD_PATH_KEY = "path";
    static final String UPLOAD_NAME_KEY = "name";
    static final String UPLOAD_TYPE_KEY = "type";
    static final String UPLOAD_SIZE_KEY = "size";

    private static final int FILE_CHOOSER_REQUEST = 2101;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 2103;

    private WebView webView;
    private ProgressBar progressBar;
    private ValueCallback<Uri[]> fileChooserCallback;
    private boolean webReady = false;
    private String pendingView;
private String pendingThreadId;
private String pendingPayrollId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(255, 253, 248));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(255, 253, 248));
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        FrameLayout.LayoutParams progressParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
        );
        progressBar.setLayoutParams(progressParams);
        root.addView(progressBar);

        setContentView(root);
        createNotificationChannel();
        consumeNotificationIntent(getIntent());
        configureWebView();
        initializePushMessaging();

        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/www/index.html");
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void configureWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString(settings.getUserAgentString() + " AromaCeylonAndroid/1.1");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }

        CookieManager cookieManager = CookieManager.getInstance();
        cookieManager.setAcceptCookie(true);
        cookieManager.setAcceptThirdPartyCookies(webView, true);

        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );

        webView.addJavascriptInterface(new AndroidBridge(), "AromaAndroid");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(Uri.parse(url));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                webReady = true;
                dispatchStoredPushToken();
                dispatchPendingPushOpen();
                dispatchPendingUploadReady();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(MainActivity.this,
                            "Connection problem. Check your internet and try again.",
                            Toast.LENGTH_LONG).show();
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                progressBar.setProgress(newProgress);
                progressBar.setVisibility(newProgress >= 100 ? View.GONE : View.VISIBLE);
            }

            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = filePathCallback;
                clearPendingUpload();

                Intent chooserIntent;
                try {
                    chooserIntent = fileChooserParams.createIntent();
                    chooserIntent.addCategory(Intent.CATEGORY_OPENABLE);
                    startActivityForResult(chooserIntent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (ActivityNotFoundException error) {
                    fileChooserCallback = null;
                    Toast.makeText(MainActivity.this,
                            "No file picker is available on this device.",
                            Toast.LENGTH_LONG).show();
                    return false;
                }
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });

        webView.setDownloadListener(createDownloadListener());
    }

    private void cachePendingUpload(Uri uri) {
        if (uri == null) return;

        String displayName = "bill-photo";
        String mimeType = getContentResolver().getType(uri);

        try (Cursor cursor = getContentResolver().query(
                uri,
                new String[]{OpenableColumns.DISPLAY_NAME},
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (nameIndex >= 0) {
                    String candidate = cursor.getString(nameIndex);
                    if (candidate != null && !candidate.trim().isEmpty()) {
                        displayName = candidate.trim();
                    }
                }
            }
        } catch (Exception ignored) {
        }

        String extension = "jpg";
        int dot = displayName.lastIndexOf('.');
        if (dot >= 0 && dot < displayName.length() - 1) {
            extension = displayName.substring(dot + 1).replaceAll("[^A-Za-z0-9]", "");
        } else if (mimeType != null) {
            String guessed = MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType);
            if (guessed != null && !guessed.isEmpty()) extension = guessed;
        }
        if (extension.isEmpty()) extension = "jpg";

        File uploadDir = new File(getCacheDir(), "pending-uploads");
        if (!uploadDir.exists() && !uploadDir.mkdirs()) return;

        clearPendingUpload();
        File cachedFile = new File(uploadDir, "pending-" + System.currentTimeMillis() + "." + extension);

        try (InputStream input = getContentResolver().openInputStream(uri);
             FileOutputStream output = new FileOutputStream(cachedFile)) {
            if (input == null) return;
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
        } catch (Exception error) {
            if (cachedFile.exists()) cachedFile.delete();
            return;
        }

        getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .edit()
                .putString(UPLOAD_PATH_KEY, cachedFile.getAbsolutePath())
                .putString(UPLOAD_NAME_KEY, displayName)
                .putString(UPLOAD_TYPE_KEY, mimeType == null ? "image/jpeg" : mimeType)
                .putLong(UPLOAD_SIZE_KEY, cachedFile.length())
                .apply();
    }

    private String pendingUploadJson() {
        String path = getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .getString(UPLOAD_PATH_KEY, "");
        if (path == null || path.isEmpty()) return "";

        File file = new File(path);
        if (!file.exists()) {
            clearPendingUpload();
            return "";
        }

        String name = getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .getString(UPLOAD_NAME_KEY, file.getName());
        String type = getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .getString(UPLOAD_TYPE_KEY, "image/jpeg");
        long size = getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .getLong(UPLOAD_SIZE_KEY, file.length());

        try {
            JSONObject payload = new JSONObject();
            payload.put("name", name == null ? file.getName() : name);
            payload.put("type", type == null ? "image/jpeg" : type);
            payload.put("size", size);
            return payload.toString();
        } catch (Exception ignored) {
            return "";
        }
    }

    private String readPendingUploadChunk(int offset, int length) {
        if (offset < 0 || length <= 0) return "";

        String path = getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .getString(UPLOAD_PATH_KEY, "");
        if (path == null || path.isEmpty()) return "";

        File file = new File(path);
        if (!file.exists() || offset >= file.length()) return "";

        int safeLength = Math.min(length, 128 * 1024);
        try (RandomAccessFile input = new RandomAccessFile(file, "r")) {
            input.seek(offset);
            byte[] buffer = new byte[safeLength];
            int read = input.read(buffer);
            if (read <= 0) return "";
            return Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
        } catch (Exception ignored) {
            return "";
        }
    }

    private void dispatchPendingUploadReady() {
        if (!webReady || webView == null) return;
        String payload = pendingUploadJson();
        if (payload == null || payload.isEmpty()) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('aroma-upload-ready',{detail:{}}));",
                null
        ));
    }

    private void clearPendingUpload() {
        String path = getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE)
                .getString(UPLOAD_PATH_KEY, "");
        if (path != null && !path.isEmpty()) {
            try {
                File file = new File(path);
                if (file.exists()) file.delete();
            } catch (Exception ignored) {
            }
        }
        getSharedPreferences(UPLOAD_PREFS, MODE_PRIVATE).edit().clear().apply();
    }

    private void initializePushMessaging() {
        try {
            FirebaseApp app = FirebaseApp.initializeApp(this);
            if (app == null && FirebaseApp.getApps(this).isEmpty()) {
                return;
            }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) return;
                savePushToken(task.getResult());
                dispatchPushToken(task.getResult());
            });
        } catch (Exception ignored) {
            // The APK can still run without Firebase configuration. Push becomes active
            // automatically once google-services.json is provided at build time.
        }
    }

    private void savePushToken(String token) {
        getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                .edit()
                .putString(PUSH_TOKEN_KEY, token)
                .apply();
    }

    private String getStoredPushToken() {
        return getSharedPreferences(PUSH_PREFS, MODE_PRIVATE)
                .getString(PUSH_TOKEN_KEY, "");
    }

    private void dispatchStoredPushToken() {
        String token = getStoredPushToken();
        if (token != null && !token.isEmpty()) dispatchPushToken(token);
    }

    private void dispatchPushToken(String token) {
        if (!webReady || webView == null || token == null || token.isEmpty()) return;
        String script = "window.dispatchEvent(new CustomEvent('aroma-push-token',{detail:{token:" +
                JSONObject.quote(token) + "}}));";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private void consumeNotificationIntent(Intent intent) {
    if (intent == null) return;

    String view = intent.getStringExtra("view");
    String threadId = intent.getStringExtra("thread_id");
    String payrollId = intent.getStringExtra("payroll_id");

    if ((pendingView != null && !pendingView.isEmpty())
            || (pendingThreadId != null && !pendingThreadId.isEmpty())
            || (pendingPayrollId != null && !pendingPayrollId.isEmpty())) {
        dispatchPendingPushOpen();
    }
}
    private void dispatchPendingPushOpen() {
    if (!webReady || webView == null) return;

    boolean hasView = pendingView != null && !pendingView.isEmpty();
    boolean hasThread = pendingThreadId != null && !pendingThreadId.isEmpty();
    boolean hasPayroll = pendingPayrollId != null && !pendingPayrollId.isEmpty();

    if (!hasView && !hasThread && !hasPayroll) return;

    String view = hasView
            ? pendingView
            : hasThread
                ? "messages"
                : "payslips";

    String threadId = hasThread ? pendingThreadId : null;
    String payrollId = hasPayroll ? pendingPayrollId : null;

    String script =
            "window.dispatchEvent(new CustomEvent('aroma-push-open',{detail:{" +
                    "view:" + JSONObject.quote(view) + "," +
                    "threadId:" + (threadId == null ? "null" : JSONObject.quote(threadId)) + "," +
                    "payrollId:" + (payrollId == null ? "null" : JSONObject.quote(payrollId)) +
                    "}}));";

    pendingView = null;
    pendingThreadId = null;
    pendingPayrollId = null;

    webView.post(() -> webView.evaluateJavascript(script, null));
}
    private void createNotificationChannel() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Aroma Ceylon messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Messages, replies and company announcements");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
            );
        }
    }

    private void openNotificationSettings() {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        startActivity(intent);
    }

    private boolean handleUrl(Uri uri) {
        String scheme = uri.getScheme();
        if (scheme == null) return false;

        if (scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https") || scheme.equalsIgnoreCase("file")) {
            webView.loadUrl(uri.toString());
            return true;
        }

        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException error) {
            Toast.makeText(this, "No app can open this link.", Toast.LENGTH_SHORT).show();
        }
        return true;
    }

    private DownloadListener createDownloadListener() {
        return (url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (url != null && url.startsWith("blob:")) {
                Toast.makeText(this,
                        "This PDF opens inside the app. Use the PDF viewer's save option.",
                        Toast.LENGTH_LONG).show();
                return;
            }

            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setMimeType(mimeType);
                request.addRequestHeader("User-Agent", userAgent);

                String cookies = CookieManager.getInstance().getCookie(url);
                if (cookies != null) request.addRequestHeader("Cookie", cookies);

                String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
                request.setTitle(fileName);
                request.setDescription("Downloading from Aroma Ceylon");
                request.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                );
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);

                DownloadManager manager = (DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                manager.enqueue(request);
                Toast.makeText(this, "Download started.", Toast.LENGTH_SHORT).show();
            } catch (Exception error) {
                Toast.makeText(this, "Download could not be started.", Toast.LENGTH_LONG).show();
            }
        };
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST) return;

        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        if (result != null && result.length > 0 && result[0] != null) {
            cachePendingUpload(result[0]);
        }

        if (fileChooserCallback != null) {
            fileChooserCallback.onReceiveValue(result);
            fileChooserCallback = null;
        }
        dispatchPendingUploadReady();
    }

    @Override
    protected void onResume() {
        super.onResume();
        dispatchStoredPushToken();
        dispatchPendingPushOpen();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        consumeNotificationIntent(intent);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }

    private class AndroidBridge {
        @JavascriptInterface
        public String getPushToken() {
            return getStoredPushToken();
        }

        @JavascriptInterface
        public String consumePendingThreadId() {
            String current = pendingThreadId == null ? "" : pendingThreadId;
            pendingThreadId = null;
            return current;
        }

        @JavascriptInterface
public String consumePendingView() {
    String current = pendingView == null ? "" : pendingView;
    pendingView = null;
    return current;
}

@JavascriptInterface
public String consumePendingPayrollId() {
    String current = pendingPayrollId == null ? "" : pendingPayrollId;
    pendingPayrollId = null;
    return current;
}
        @JavascriptInterface
        public String getAppVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception ignored) {
                return "android";
            }
        }

        @JavascriptInterface
        public String peekPendingUpload() {
            return pendingUploadJson();
        }

        @JavascriptInterface
        public String readPendingUploadChunk(int offset, int length) {
            return MainActivity.this.readPendingUploadChunk(offset, length);
        }

        @JavascriptInterface
        public void clearPendingUpload() {
            MainActivity.this.clearPendingUpload();
        }

        @JavascriptInterface
        public void requestNotificationPermission() {
            runOnUiThread(MainActivity.this::requestNotificationPermission);
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            runOnUiThread(MainActivity.this::openNotificationSettings);
        }
    }
}
