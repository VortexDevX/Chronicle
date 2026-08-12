package com.vortexdevx.chronicle

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.ProgressBar
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import androidx.core.net.toUri
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONObject
import java.util.UUID

class MainActivity : ComponentActivity() {
    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorPanel: View
    private val baseUri = BuildConfig.CHRONICLE_BASE_URL.toUri()
    private val preferences by lazy {
        getSharedPreferences(PushConstants.PREFERENCES, MODE_PRIVATE)
    }
    private var permissionPromptRequested = false
    private var pushSyncInFlight = false
    private var lastSyncedRegistration: String? = null
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        permissionPromptRequested = false
        preferences.edit {
            putBoolean(PushConstants.NOTIFICATION_PERMISSION_REQUESTED, true)
        }
        if (granted) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
            checkSignedInForPush()
        } else if (FirebaseApp.getApps(this).isNotEmpty()) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = false
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_main)
        createNotificationChannel()

        val root = findViewById<View>(R.id.root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        webView = findViewById(R.id.web_view)
        progressBar = findViewById(R.id.page_progress)
        errorPanel = findViewById(R.id.error_panel)
        findViewById<Button>(R.id.retry_button).setOnClickListener {
            errorPanel.visibility = View.GONE
            webView.reload()
        }

        configureWebView()
        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    if (webView.canGoBack()) {
                        webView.goBack()
                    } else {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            },
        )
        ensureInstallationCookie {
            loadPath(pathFromIntent(intent) ?: "/home")
        }
    }

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun configureWebView() {
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(webView, false)
        }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            safeBrowsingEnabled = true
            userAgentString = "$userAgentString ChronicleAndroid/${BuildConfig.VERSION_NAME}"
        }
        webView.addJavascriptInterface(NativeCallback(), "ChronicleNative")
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                progressBar.progress = newProgress
                progressBar.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                errorPanel.visibility = View.GONE
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                if (url?.let(::isTrustedUrl) == true) {
                    requestNotificationPermission(fromUser = false)
                    checkSignedInForPush()
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?,
            ): Boolean {
                val uri = request?.url ?: return false
                if (isTrustedUri(uri)) return false
                openExternal(uri)
                return true
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?,
            ) {
                if (request?.isForMainFrame == true) errorPanel.visibility = View.VISIBLE
            }
        }
        webView.setDownloadListener { url, _, _, _, _ ->
            runCatching { openExternal(url.toUri()) }
        }
    }

    private fun ensureInstallationCookie(onReady: () -> Unit) {
        val installationId = preferences.getString(PushConstants.INSTALLATION_ID, null)
            ?: UUID.randomUUID().toString().also {
                preferences.edit { putString(PushConstants.INSTALLATION_ID, it) }
            }
        val cookie = "chronicle_android_installation=$installationId; Path=/; Secure; HttpOnly; SameSite=Lax"
        CookieManager.getInstance().setCookie(BuildConfig.CHRONICLE_BASE_URL, cookie) {
            CookieManager.getInstance().flush()
            runOnUiThread(onReady)
        }
    }

    private fun checkSignedInForPush() {
        val script = """
            (() => {
              fetch('/api/auth', { cache: 'no-store', credentials: 'include' })
                .then(response => ChronicleNative.onAuthState(response.ok))
                .catch(() => ChronicleNative.onAuthState(false));
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun ensurePushPermissionAndSync() {
        if (FirebaseApp.getApps(this).isEmpty()) return

        if (!hasNotificationPermission()) {
            requestNotificationPermission(fromUser = false)
            return
        }

        FirebaseMessaging.getInstance().isAutoInitEnabled = true
        syncPushRegistration()
    }

    private fun hasNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED

    private fun requestNotificationPermission(fromUser: Boolean) {
        if (FirebaseApp.getApps(this).isEmpty()) return

        if (hasNotificationPermission()) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
            checkSignedInForPush()
            return
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || permissionPromptRequested) {
            return
        }

        val requestedBefore = preferences.getBoolean(
            PushConstants.NOTIFICATION_PERMISSION_REQUESTED,
            false,
        )
        if (!fromUser && requestedBefore) return

        if (
            fromUser &&
            requestedBefore &&
            !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS)
        ) {
            openNotificationSettings()
            return
        }

        permissionPromptRequested = true
        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun openNotificationSettings() {
        runCatching {
            startActivity(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                },
            )
        }.recoverCatching {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = "package:$packageName".toUri()
                },
            )
        }
    }

    private fun syncPushRegistration() {
        if (pushSyncInFlight) return
        val pendingRegistration = preferences.getString(
            PushConstants.PENDING_FCM_REGISTRATION,
            null,
        )
        if (!pendingRegistration.isNullOrBlank()) {
            pushSyncInFlight = true
            registerInstallationInWebSession(pendingRegistration)
            return
        }

        pushSyncInFlight = true
        FirebaseMessaging.getInstance().register()
            .addOnSuccessListener {
                FirebaseInstallations.getInstance().id
                    .addOnSuccessListener { installationId ->
                        if (
                            installationId.isNullOrBlank() ||
                            installationId == lastSyncedRegistration
                        ) {
                            pushSyncInFlight = false
                        } else {
                            registerInstallationInWebSession(installationId)
                        }
                    }
                    .addOnFailureListener { pushSyncInFlight = false }
            }
            .addOnFailureListener { pushSyncInFlight = false }
    }

    private fun registerInstallationInWebSession(registrationId: String) {
        val enableNotifications = !preferences.getBoolean(
            PushConstants.PUSH_ONBOARDED,
            false,
        )
        val body = JSONObject().apply {
            put("token", registrationId)
            put("appVersion", BuildConfig.VERSION_NAME)
            put("enableNotifications", enableNotifications)
        }.toString()
        val script = """
            (() => {
              fetch('/api/push/devices', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: ${JSONObject.quote(body)}
              })
                .then(response => ChronicleNative.onPushRegistrationResult(response.ok, ${JSONObject.quote(registrationId)}))
                .catch(() => ChronicleNative.onPushRegistrationResult(false, ''));
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pathFromIntent(intent)?.let(::loadPath)
    }

    override fun onResume() {
        super.onResume()
        if (!::webView.isInitialized || FirebaseApp.getApps(this).isEmpty()) return

        if (hasNotificationPermission()) {
            FirebaseMessaging.getInstance().isAutoInitEnabled = true
            checkSignedInForPush()
        }
    }

    override fun onDestroy() {
        webView.removeJavascriptInterface("ChronicleNative")
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    private fun loadPath(path: String) {
        webView.loadUrl(BuildConfig.CHRONICLE_BASE_URL + sanitizePath(path))
    }

    private fun pathFromIntent(intent: Intent?): String? =
        intent?.getStringExtra(EXTRA_PATH)?.let(::sanitizePath)

    private fun sanitizePath(value: String): String {
        if (!value.startsWith('/') || value.startsWith("//")) return "/home"
        return value
    }

    private fun isTrustedUrl(url: String): Boolean =
        runCatching { isTrustedUri(url.toUri()) }.getOrDefault(false)

    private fun isTrustedUri(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host.equals(baseUri.host, ignoreCase = true)

    private fun openExternal(uri: Uri) {
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
    }

    private inner class NativeCallback {
        @JavascriptInterface
        fun onAuthState(authenticated: Boolean) {
            if (authenticated) runOnUiThread(::ensurePushPermissionAndSync)
        }

        @JavascriptInterface
        fun onPushRegistrationResult(success: Boolean, registrationId: String) {
            runOnUiThread {
                pushSyncInFlight = false
                if (success) {
                    lastSyncedRegistration = registrationId
                    preferences.edit {
                        putBoolean(PushConstants.PUSH_ONBOARDED, true)
                        remove(PushConstants.PENDING_FCM_REGISTRATION)
                    }
                }
            }
        }

        @JavascriptInterface
        fun requestNotificationPermission() {
            runOnUiThread {
                requestNotificationPermission(fromUser = true)
            }
        }
    }

    companion object {
        const val EXTRA_PATH = "path"
    }

    private fun createNotificationChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                PushConstants.CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = getString(R.string.notification_channel_description)
                enableVibration(true)
            },
        )
    }
}
