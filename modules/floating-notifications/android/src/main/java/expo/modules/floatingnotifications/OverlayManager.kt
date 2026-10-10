package expo.modules.floatingnotifications

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.util.Log
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import expo.modules.floatingnotifications.R

/**
 * Shows at most one floating popup at a time. A second notification arriving
 * while one is already on screen replaces its content and resets the
 * auto-dismiss timer, rather than stacking a second window — this is what
 * keeps rapid-fire notifications from overlapping or leaking views.
 */
object OverlayManager {
    private const val TAG = "FloatingOverlayManager"
    // 0 = stay on screen until the user taps the card or its dismiss (X) button.
    private const val AUTO_DISMISS_MS = 0L

    private val mainHandler = Handler(Looper.getMainLooper())
    private var windowManager: WindowManager? = null
    private var currentView: View? = null
    private var dismissRunnable: Runnable? = null

    data class PopupData(
        val appName: String,
        val appIcon: Drawable?,
        val title: String,
        val text: String,
        val launchPackage: String?,
        val quotationId: String? = null
    )

    fun canShowOverlay(context: Context): Boolean {
        return Settings.canDrawOverlays(context)
    }

    fun show(context: Context, data: PopupData) {
        mainHandler.post { showInternal(context.applicationContext, data) }
    }

    private fun showInternal(context: Context, data: PopupData) {
        Log.i(TAG, "showInternal title=${data.title} canShowOverlay=${canShowOverlay(context)} hasCurrentView=${currentView != null}")
        if (!canShowOverlay(context)) {
            Log.w(TAG, "Overlay permission not granted — skipping popup")
            return
        }

        try {
            if (currentView == null) {
                addNewView(context, data)
            } else {
                updateView(currentView!!, data)
            }
            scheduleAutoDismiss()
        } catch (e: Throwable) {
            // Overlay permission can be revoked mid-session, or the view can be in a
            // bad state after a display/orientation change — never crash the listener.
            Log.e(TAG, "Failed to show/update overlay", e)
            removeInternal()
        }
    }

    private fun addNewView(context: Context, data: PopupData) {
        val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        windowManager = wm

        val view = LayoutInflater.from(context).inflate(R.layout.view_floating_notification, null)
        bindView(view, data)

        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        )
        params.gravity = Gravity.TOP
        params.y = dpToPx(context, 40)
        val horizontalMargin = dpToPx(context, 12)
        params.x = horizontalMargin

        Log.i(TAG, "Adding overlay view via WindowManager, type=$type")
        wm.addView(view, params)
        currentView = view
        Log.i(TAG, "Overlay view added successfully")
    }

    private fun updateView(view: View, data: PopupData) {
        bindView(view, data)
    }

    private fun bindView(view: View, data: PopupData) {
        val icon = view.findViewById<ImageView>(R.id.floating_notification_icon)
        val title = view.findViewById<TextView>(R.id.floating_notification_title)
        val text = view.findViewById<TextView>(R.id.floating_notification_text)
        val dismiss = view.findViewById<android.widget.ImageButton>(R.id.floating_notification_dismiss)

        if (data.appIcon != null) {
            icon.setImageDrawable(data.appIcon)
            icon.visibility = View.VISIBLE
        } else {
            icon.visibility = View.GONE
        }
        title.text = if (data.title.isNotBlank()) data.title else data.appName
        text.text = data.text

        dismiss.setOnClickListener { removeInternal() }

        view.setOnClickListener {
            removeInternal()
            val quotationId = data.quotationId
            if (!quotationId.isNullOrEmpty()) {
                try {
                    val deepLink = android.content.Intent(android.content.Intent.ACTION_VIEW)
                        .setData(android.net.Uri.parse("whitesync://quotations/${android.net.Uri.encode(quotationId)}"))
                        .setPackage(view.context.packageName)
                        .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    view.context.startActivity(deepLink)
                } catch (_: Exception) {
                }
                return@setOnClickListener
            }
            val pkg = data.launchPackage
            if (!pkg.isNullOrEmpty()) {
                try {
                    val launchIntent = view.context.packageManager.getLaunchIntentForPackage(pkg)
                    launchIntent?.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                    if (launchIntent != null) view.context.startActivity(launchIntent)
                } catch (_: Exception) {
                    // Nothing we can do if the target app can't be launched; just dismiss.
                }
            }
        }
    }

    private fun scheduleAutoDismiss() {
        dismissRunnable?.let { mainHandler.removeCallbacks(it) }
        val runnable = Runnable { removeInternal() }
        dismissRunnable = runnable
        if (AUTO_DISMISS_MS > 0) mainHandler.postDelayed(runnable, AUTO_DISMISS_MS)
    }

    fun remove() {
        mainHandler.post { removeInternal() }
    }

    private fun removeInternal() {
        dismissRunnable?.let { mainHandler.removeCallbacks(it) }
        dismissRunnable = null
        val view = currentView
        currentView = null
        if (view != null) {
            try {
                windowManager?.removeView(view)
            } catch (_: Exception) {
                // View already detached (e.g. activity/display teardown) — safe to ignore.
            }
        }
    }

    private fun dpToPx(context: Context, dp: Int): Int {
        val density = context.resources.displayMetrics.density
        return (dp * density).toInt()
    }
}
