import { registerPlugin } from '@capacitor/core';

export interface WeatherWidgetUpdatePayload {
  location: string;
  temperature: string;
  condition: string;
  updatedAt: string;
}

export interface WeatherWidgetPlugin {
  update(payload: WeatherWidgetUpdatePayload): Promise<void>;
}

// Solo tiene implementacion nativa en Android; en web queda como no-op silencioso.
export const WeatherWidget = registerPlugin<WeatherWidgetPlugin>('WeatherWidget');
