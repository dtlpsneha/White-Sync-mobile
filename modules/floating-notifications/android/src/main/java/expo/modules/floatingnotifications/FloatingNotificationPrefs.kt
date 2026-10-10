package expo.modules.floatingnotifications

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray

/**
 * All state is read directly by [AppNotificationListenerService], which runs
 * independently of the JS runtime (it stays bound by the OS even when the app's
 * JS context isn't running), so it cannot go through the RN bridge for settings.
 */
object FloatingNotificationPrefs {
    private const val PREFS_NAME = "floating_notifications_prefs"
    private const val KEY_ENABLED = "enabled"
    private const val KEY_BLOCKED_PACKAGES = "blocked_packages"
    private const val KEY_KNOWN_APPS = "known_apps"
    private const val MAX_KNOWN_APPS = 50

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, false)

    fun setEnabled(context: Context, enabled: Boolean) {
        prefs(context).edit().putBoolean(KEY_ENABLED, enabled).apply()
    }

    fun getBlockedPackages(context: Context): Set<String> =
        prefs(context).getStringSet(KEY_BLOCKED_PACKAGES, emptySet()) ?: emptySet()

    fun setBlockedPackages(context: Context, packages: Set<String>) {
        prefs(context).edit().putStringSet(KEY_BLOCKED_PACKAGES, packages).apply()
    }

    fun isPackageBlocked(context: Context, packageName: String): Boolean =
        getBlockedPackages(context).contains(packageName)

    /** Remembers which apps have actually posted a notification, so the settings
     * screen can offer a filter list without enumerating every installed app. */
    fun recordKnownApp(context: Context, packageName: String) {
        val p = prefs(context)
        val existing = p.getString(KEY_KNOWN_APPS, null)
        val set = LinkedHashSet<String>()
        if (existing != null) {
            try {
                val arr = JSONArray(existing)
                for (i in 0 until arr.length()) set.add(arr.getString(i))
            } catch (_: Exception) {
                // corrupt/old value, ignore and start fresh
            }
        }
        set.remove(packageName)
        set.add(packageName)
        val trimmed = set.toList().takeLast(MAX_KNOWN_APPS)
        p.edit().putString(KEY_KNOWN_APPS, JSONArray(trimmed).toString()).apply()
    }

    fun getKnownApps(context: Context): List<String> {
        val existing = prefs(context).getString(KEY_KNOWN_APPS, null) ?: return emptyList()
        return try {
            val arr = JSONArray(existing)
            (0 until arr.length()).map { arr.getString(it) }
        } catch (_: Exception) {
            emptyList()
        }
    }
}
