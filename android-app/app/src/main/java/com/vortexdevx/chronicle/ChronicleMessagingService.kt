package com.vortexdevx.chronicle

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.core.content.edit
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

object PushConstants {
    const val PREFERENCES = "chronicle_android"
    const val INSTALLATION_ID = "installation_id"
    const val NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested"
    const val PUSH_ONBOARDED = "push_onboarded"
    const val PENDING_FCM_REGISTRATION = "pending_fcm_registration"
    const val CHANNEL_ID = "chronicle_updates"
}

@SuppressLint("MissingFirebaseInstanceTokenRefresh")
class ChronicleMessagingService : FirebaseMessagingService() {
    override fun onRegistered(installationId: String) {
        getSharedPreferences(PushConstants.PREFERENCES, MODE_PRIVATE)
            .edit { putString(PushConstants.PENDING_FCM_REGISTRATION, installationId) }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) return

        val title = message.notification?.title ?: getString(R.string.notification_title)
        val body = message.notification?.body ?: getString(R.string.notification_body)
        val path = message.data[MainActivity.EXTRA_PATH] ?: "/updates"
        showNotification(title, body, path)
    }

    private fun showNotification(title: String, body: String, path: String) {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(
                PushConstants.CHANNEL_ID,
                getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT,
            ).apply {
                description = getString(R.string.notification_channel_description)
                enableVibration(true)
            },
        )

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra(MainActivity.EXTRA_PATH, path)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, PushConstants.CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(Color.rgb(244, 63, 94))
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(Notification.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        manager.notify((System.currentTimeMillis() and 0x0FFFFFFF).toInt(), notification)
    }
}
