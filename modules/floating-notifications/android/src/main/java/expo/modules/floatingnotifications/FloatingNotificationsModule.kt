package expo.modules.floatingnotifications

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FloatingNotificationsModule : Module() {
    private val context: Context
        get() = appContext.reactContext ?: throw IllegalStateException("React context unavailable")

    override fun definition() = ModuleDefinition {
        Name("FloatingNotifications")

        Function("isNotificationAccessGranted") {
            isNotificationAccessGranted()
        }

        Function("openNotificationAccessSettings") {
            val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        Function("isOverlayPermissionGranted") {
            Settings.canDrawOverlays(context)
        }

        Function("openOverlayPermissionSettings") {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        Function("isBatteryOptimizationIgnored") {
            val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            pm.isIgnoringBatteryOptimizations(context.packageName)
        }

        // Opens this app's settings page (Battery > Unrestricted); avoids the
        // sensitive REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission.
        Function("requestIgnoreBatteryOptimizations") {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${context.packageName}")
            )
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        }

        Function("isListenerServiceConnected") {
            AppNotificationListenerService.isConnected
        }

        // Lets the app show the same Truecaller-style floating card for its own
        // in-app events (e.g. quotation alerts), independent of the system-wide
        // notification listener feature — only needs the overlay permission, not
        // notification access.
        Function("showOverlay") { title: String, text: String, quotationId: String? ->
            Log.i("FloatingNotificationsModule", "showOverlay called from JS, title=$title")
            val appIcon = try {
                context.packageManager.getApplicationIcon(context.packageName)
            } catch (e: Exception) {
                null
            }
            OverlayManager.show(
                context,
                OverlayManager.PopupData(
                    appName = "White Sync",
                    appIcon = appIcon,
                    title = title,
                    text = text,
                    launchPackage = context.packageName,
                    quotationId = quotationId
                )
            )
        }

        Function("isFloatingNotificationsEnabled") {
            FloatingNotificationPrefs.isEnabled(context)
        }

        Function("setFloatingNotificationsEnabled") { enabled: Boolean ->
            FloatingNotificationPrefs.setEnabled(context, enabled)
            if (!enabled) {
                OverlayManager.remove()
            }
        }

        Function("getBlockedPackages") {
            FloatingNotificationPrefs.getBlockedPackages(context).toList()
        }

        Function("setBlockedPackages") { packages: List<String> ->
            FloatingNotificationPrefs.setBlockedPackages(context, packages.toSet())
        }

        Function("getKnownApps") {
            val pm = context.packageManager
            FloatingNotificationPrefs.getKnownApps(context).map { packageName ->
                val appName = try {
                    val appInfo = pm.getApplicationInfo(packageName, 0)
                    pm.getApplicationLabel(appInfo).toString()
                } catch (e: Exception) {
                    packageName
                }
                mapOf(
                    "packageName" to packageName,
                    "appName" to appName,
                    "blocked" to FloatingNotificationPrefs.isPackageBlocked(context, packageName)
                )
            }
        }
    }

    private fun isNotificationAccessGranted(): Boolean {
        val enabledPackages = NotificationManagerCompat.getEnabledListenerPackages(context)
        return enabledPackages.contains(context.packageName)
    }
}
