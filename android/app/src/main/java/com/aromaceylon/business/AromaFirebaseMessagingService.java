package com.aromaceylon.business;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class AromaFirebaseMessagingService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        getSharedPreferences(MainActivity.PUSH_PREFS, MODE_PRIVATE)
                .edit()
                .putString(MainActivity.PUSH_TOKEN_KEY, token)
                .apply();
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        ensureChannel();

        Map<String, String> data = remoteMessage.getData();
        String title = data.get("title");
        String body = data.get("body");
        String threadId = data.get("thread_id");

        if (remoteMessage.getNotification() != null) {
            if (title == null || title.isEmpty()) title = remoteMessage.getNotification().getTitle();
            if (body == null || body.isEmpty()) body = remoteMessage.getNotification().getBody();
        }

        if (title == null || title.isEmpty()) title = "Aroma Ceylon";
        if (body == null || body.isEmpty()) body = "You have a new message.";

        Intent intent = new Intent(this, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (threadId != null && !threadId.isEmpty()) intent.putExtra("thread_id", threadId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                threadId == null ? 0 : threadId.hashCode(),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(this, MainActivity.NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_stat_aroma)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setColor(getColor(R.color.aroma_gold))
                .build();

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        int notificationId = threadId == null ? (int) System.currentTimeMillis() : threadId.hashCode();
        manager.notify(notificationId, notification);
    }

    private void ensureChannel() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
                MainActivity.NOTIFICATION_CHANNEL_ID,
                "Aroma Ceylon messages",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Messages, replies and company announcements");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
