package com.chapuytime.nimbus;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "WeatherWidget")
public class WeatherWidgetPlugin extends Plugin {

    public static final String PREFS_NAME = "com.chapuytime.nimbus.widget";
    public static final String KEY_LOCATION = "location";
    public static final String KEY_TEMPERATURE = "temperature";
    public static final String KEY_CONDITION = "condition";
    public static final String KEY_UPDATED_AT = "updatedAt";

    @PluginMethod
    public void update(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString(KEY_LOCATION, call.getString("location", ""))
            .putString(KEY_TEMPERATURE, call.getString("temperature", "--"))
            .putString(KEY_CONDITION, call.getString("condition", ""))
            .putString(KEY_UPDATED_AT, call.getString("updatedAt", ""))
            .apply();

        AppWidgetManager widgetManager = AppWidgetManager.getInstance(context);
        ComponentName componentName = new ComponentName(context, WeatherWidgetProvider.class);
        int[] widgetIds = widgetManager.getAppWidgetIds(componentName);
        WeatherWidgetProvider.updateWidgets(context, widgetManager, widgetIds);

        call.resolve(new JSObject());
    }
}
