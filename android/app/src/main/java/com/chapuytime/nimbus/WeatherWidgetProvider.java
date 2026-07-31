package com.chapuytime.nimbus;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

public class WeatherWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        updateWidgets(context, appWidgetManager, appWidgetIds);
    }

    public static void updateWidgets(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(WeatherWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        String location = prefs.getString(WeatherWidgetPlugin.KEY_LOCATION, "Nimbus");
        String temperature = prefs.getString(WeatherWidgetPlugin.KEY_TEMPERATURE, "--");
        String condition = prefs.getString(WeatherWidgetPlugin.KEY_CONDITION, "Abre la app para actualizar");
        String updatedAt = prefs.getString(WeatherWidgetPlugin.KEY_UPDATED_AT, "");

        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent pendingIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_weather);
            views.setTextViewText(R.id.widget_location, location);
            views.setTextViewText(R.id.widget_temperature, temperature);
            views.setTextViewText(R.id.widget_condition, condition);
            views.setTextViewText(R.id.widget_updated_at, updatedAt.isEmpty() ? "" : "Act. " + updatedAt);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
