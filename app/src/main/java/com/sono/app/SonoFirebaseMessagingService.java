package com.sono.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.text.TextUtils;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public class SonoFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "sono_notifications";
    private static final AtomicInteger NEXT_ID = new AtomicInteger(1000);

    @Override
    public void onNewToken(@NonNull String token) {
        getSharedPreferences("sono_fcm", MODE_PRIVATE).edit().putString("token", token).apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        String title = message.getNotification() != null ? message.getNotification().getTitle() : null;
        String body = message.getNotification() != null ? message.getNotification().getBody() : null;
        Map<String, String> data = message.getData();
        if (TextUtils.isEmpty(title)) title = data.get("title");
        if (TextUtils.isEmpty(body)) body = data.get("body");
        if (TextUtils.isEmpty(title)) title = "Sổ Nợ";
        if (TextUtils.isEmpty(body)) body = "Bạn có thông báo mới.";
        showNotification(title, body, data.get("route"));
    }

    private void showNotification(String title, String body, String route) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Thông báo Sổ Nợ", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Thông báo tin nhắn, bạn bè và khoản nợ");
            nm.createNotificationChannel(channel);
        }

        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (!TextUtils.isEmpty(route)) intent.putExtra("notification_route", route);
        PendingIntent pending = PendingIntent.getActivity(this, NEXT_ID.get(), intent,
                PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pending);
        try { NotificationManagerCompat.from(this).notify(NEXT_ID.incrementAndGet(), b.build()); } catch (SecurityException ignored) {}
    }
}
