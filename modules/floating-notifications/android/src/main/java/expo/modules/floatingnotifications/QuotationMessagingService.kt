package expo.modules.floatingnotifications

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.RemoteMessage
import com.google.firebase.messaging.FirebaseMessagingService
import org.json.JSONObject

/**
 * Receives the server's data-only "quotation awaiting approval" push natively,
 * so the persistent notification and the floating card appear even when the app
 * process is dead (swiped away) — no JavaScript has to start. Anything else, and
 * every message while the app is in the foreground, goes to expo-notifications
 * unchanged so the in-app popup keeps working.
 */
class QuotationMessagingService : FirebaseMessagingService() {

    // expo-notifications' own handler, reached by reflection so this module needs no
    // compile-time dependency on it (a project dependency breaks Expo autolinking).
    private val expoDelegate: Any? by lazy {
        try {
            Class.forName("expo.modules.notifications.service.delegates.FirebaseMessagingDelegate")
                .getConstructor(Context::class.java).newInstance(this)
        } catch (e: Exception) {
            Log.e(TAG, "expo-notifications delegate unavailable", e)
            null
        }
    }

    private fun callExpo(method: String, argType: Class<*>?, arg: Any?) {
        val d = expoDelegate ?: return
        try {
            if (argType == null) d.javaClass.getMethod(method).invoke(d)
            else d.javaClass.getMethod(method, argType).invoke(d, arg)
        } catch (e: Exception) {
            Log.e(TAG, "expo delegate $method failed", e)
        }
    }

    override fun onNewToken(token: String) = callExpo("onNewToken", String::class.java, token)
    override fun onDeletedMessages() = callExpo("onDeletedMessages", null, null)


    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        try {
            if (remoteMessage.notification == null && !isAppInForeground() && handleQuotation(remoteMessage)) return
        } catch (e: Exception) {
            Log.e(TAG, "native quotation handling failed, falling back", e)
        }
        callExpo("onMessageReceived", RemoteMessage::class.java, remoteMessage)
    }

    private fun isAppInForeground(): Boolean {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        return info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }

    private fun handleQuotation(message: RemoteMessage): Boolean {
        val data = message.data
        val payload = try {
            JSONObject(data["body"] ?: data["dataString"] ?: "{}")
        } catch (e: Exception) {
            JSONObject()
        }
        val title = data["title"] ?: payload.optString("title").ifEmpty { null }
        val text = data["message"] ?: payload.optString("message").ifEmpty { null }
        val id = data["id"] ?: payload.optString("id").ifEmpty { null }
        if (id == null || (title == null && text == null)) return false

        Log.i(TAG, "Quotation push received natively, id=$id")
        showNotification(title ?: "Quotation Awaiting Your Approval", text ?: "", id)

        val appIcon = try { packageManager.getApplicationIcon(packageName) } catch (e: Exception) { null }
        OverlayManager.show(
            applicationContext,
            OverlayManager.PopupData(
                appName = "White Sync",
                appIcon = appIcon,
                title = title ?: "Quotation Awaiting Your Approval",
                text = text ?: "",
                launchPackage = packageName,
                quotationId = id
            )
        )
        return true
    }

    private fun showNotification(title: String, text: String, quotationId: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL_ID) == null) {
            val channel = NotificationChannel(CHANNEL_ID, "Quotation Alerts", NotificationManager.IMPORTANCE_HIGH)
            nm.createNotificationChannel(channel)
        }

        val open = Intent(Intent.ACTION_VIEW, Uri.parse("whitesync://quotations/$quotationId")).apply {
            setPackage(packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val notificationId = quotationId.hashCode()
        val contentIntent = PendingIntent.getActivity(this, notificationId, open, flags)

        val iconRes = resources.getIdentifier("notification_icon", "drawable", packageName)
            .takeIf { it != 0 } ?: applicationInfo.icon

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(iconRes)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setContentIntent(contentIntent)
            .addAction(0, "View", contentIntent)
            .setAutoCancel(true)
            .build()
        nm.notify(notificationId, notification)
    }

    companion object {
        private const val TAG = "QuotationMsgService"
        private const val CHANNEL_ID = "quotation-alerts"
    }
}
