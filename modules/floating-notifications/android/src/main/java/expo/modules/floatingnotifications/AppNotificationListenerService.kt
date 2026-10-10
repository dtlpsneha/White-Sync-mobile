package expo.modules.floatingnotifications

import android.app.Notification
import android.content.pm.PackageManager
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log

/**
 * Bound by the OS once the user grants notification access, independent of
 * whether the app's JS/React Native context is running — this is why all
 * decision-making here (enabled flag, app filter, popup display) is done
 * natively against SharedPreferences rather than hopping to JS.
 */
class AppNotificationListenerService : NotificationListenerService() {
    companion object {
        private const val TAG = "FloatingNotifListener"

        @Volatile
        var isConnected: Boolean = false
            private set

        // sbn.key -> last "title|text" shown, so repeated updates to the same
        // notification (e.g. a chat app bumping an unread counter) don't repeatedly
        // re-trigger the popup unless the actual content changed.
        private val lastContentByKey = HashMap<String, String>()
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
        Log.i(TAG, "Notification listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        Log.i(TAG, "Notification listener disconnected")
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        super.onNotificationRemoved(sbn)
        sbn?.key?.let { lastContentByKey.remove(it) }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        super.onNotificationPosted(sbn)
        if (sbn == null) return

        try {
            handleNotification(sbn)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to handle posted notification", e)
        }
    }

    private fun handleNotification(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return

        // Never re-show our own app's notifications (avoids recursive popups).
        if (packageName == applicationContext.packageName) return

        if (!FloatingNotificationPrefs.isEnabled(applicationContext)) return
        if (FloatingNotificationPrefs.isPackageBlocked(applicationContext, packageName)) return

        val notification = sbn.notification ?: return

        // Ongoing (e.g. music players, our own persistent quotation alert on other
        // devices, download progress) and group-summary notifications aren't
        // single discrete messages worth popping up.
        if (sbn.isOngoing) return
        if ((notification.flags and Notification.FLAG_GROUP_SUMMARY) != 0) return
        if ((notification.flags and Notification.FLAG_ONGOING_EVENT) != 0) return

        val extras = notification.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = (
            extras.getCharSequence(Notification.EXTRA_TEXT)
                ?: extras.getCharSequence(Notification.EXTRA_BIG_TEXT)
            )?.toString().orEmpty()

        if (title.isBlank() && text.isBlank()) return

        val dedupeKey = "$title|$text"
        if (lastContentByKey[sbn.key] == dedupeKey) return
        lastContentByKey[sbn.key] = dedupeKey

        FloatingNotificationPrefs.recordKnownApp(applicationContext, packageName)

        if (!OverlayManager.canShowOverlay(applicationContext)) return

        val pm = applicationContext.packageManager
        val appName = try {
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (e: PackageManager.NameNotFoundException) {
            packageName
        }
        val appIcon = try {
            pm.getApplicationIcon(packageName)
        } catch (e: PackageManager.NameNotFoundException) {
            null
        }

        OverlayManager.show(
            applicationContext,
            OverlayManager.PopupData(
                appName = appName,
                appIcon = appIcon,
                title = title,
                text = text,
                launchPackage = packageName
            )
        )
    }
}
