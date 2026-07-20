import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { OPENMETEO_FORECAST_API_URL, OPENMETEO_REVERSE_GEOCODING_API_URL } from '../config/openweather.config';

interface OpenMeteoForecastResponse {
  current?: {
    temperature_2m?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    uv_index?: number;
    is_day?: number;
    time?: string;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    relative_humidity_2m?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
    precipitation_probability?: number[];
    is_day?: number[];
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
  };
}

interface WeatherCodeDescriptor {
  label: string;
  iconName: string;
}

interface OpenMeteoUvResponse {
  current?: {
    uv_index?: number;
  };
}

interface OpenMeteoReverseGeocodingResponse {
  results?: Array<{
    name?: string;
    admin1?: string;
    country?: string;
  }>;
}

interface OpenMeteoReverseGeocodingResult {
  name?: string;
  admin1?: string;
  country?: string;
}

export interface HourlyForecast {
  hour: string;
  temperature: number;
  iconUrl: string | null;
  condition: string;
  humidity: number | null;
  windSpeed: number | null;
  rainProbability: number | null;
}

export interface WeatherSnapshot {
  location: string;
  temperature: number;
  minTemperature: number;
  maxTemperature: number;
  condition: string;
  iconUrl: string | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  windDirectionDegrees: number | null;
  uvIndex: number | null;
  hourly24h: HourlyForecast[];
}

@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly weatherCodeMap: Record<number, WeatherCodeDescriptor> = {
    0: { label: 'cielo despejado', iconName: 'clear-day' },
    1: { label: 'mayormente despejado', iconName: 'partly-cloudy-day' },
    2: { label: 'parcialmente nublado', iconName: 'partly-cloudy-day' },
    3: { label: 'nublado', iconName: 'overcast-day' },
    45: { label: 'niebla', iconName: 'fog-day' },
    48: { label: 'niebla escarchada', iconName: 'fog-day' },
    51: { label: 'llovizna ligera', iconName: 'drizzle' },
    53: { label: 'llovizna', iconName: 'drizzle' },
    55: { label: 'llovizna intensa', iconName: 'extreme-drizzle' },
    56: { label: 'llovizna helada ligera', iconName: 'sleet' },
    57: { label: 'llovizna helada', iconName: 'sleet' },
    61: { label: 'lluvia ligera', iconName: 'rain' },
    63: { label: 'lluvia', iconName: 'rain' },
    65: { label: 'lluvia intensa', iconName: 'extreme-rain' },
    66: { label: 'lluvia helada ligera', iconName: 'sleet' },
    67: { label: 'lluvia helada', iconName: 'sleet' },
    71: { label: 'nieve ligera', iconName: 'snow' },
    73: { label: 'nieve', iconName: 'snow' },
    75: { label: 'nieve intensa', iconName: 'extreme-snow' },
    77: { label: 'granos de nieve', iconName: 'hail' },
    80: { label: 'chubascos ligeros', iconName: 'rain' },
    81: { label: 'chubascos', iconName: 'rain' },
    82: { label: 'chubascos intensos', iconName: 'extreme-rain' },
    85: { label: 'chubascos de nieve', iconName: 'snow' },
    86: { label: 'chubascos de nieve intensos', iconName: 'extreme-snow' },
    95: { label: 'tormenta', iconName: 'thunderstorms-rain' },
    96: { label: 'tormenta con granizo', iconName: 'thunderstorms-extreme-rain' },
    99: { label: 'tormenta fuerte con granizo', iconName: 'thunderstorms-extreme-rain' }
  };

  getCurrentWeather(lat: number, lon: number): Observable<WeatherSnapshot> {
    const forecastParams = new HttpParams()
      .set('latitude', lat)
      .set('longitude', lon)
      .set('timezone', 'auto')
      .set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,uv_index,is_day')
      .set('hourly', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability,is_day')
      .set('daily', 'temperature_2m_max,temperature_2m_min')
      .set('forecast_days', '2');

    const reverseParams = new HttpParams()
      .set('latitude', lat)
      .set('longitude', lon)
      .set('count', '1')
      .set('language', 'es');

    return forkJoin({
      forecast: this.http.get<OpenMeteoForecastResponse>(OPENMETEO_FORECAST_API_URL, { params: forecastParams }),
      geocoding: this.http.get<OpenMeteoReverseGeocodingResponse>(OPENMETEO_REVERSE_GEOCODING_API_URL, { params: reverseParams }).pipe(
        catchError(() => of({ results: [] }))
      )
    }).pipe(
      map(({ forecast, geocoding }) => {
        const current = forecast.current;
        const windDirectionDegrees = this.normalizeDegrees(current?.wind_direction_10m);
        const currentTime = current?.time ?? null;
        const hourly24h = this.buildHourlyForecast(forecast, currentTime);
        const currentDescriptor = this.getWeatherDescriptor(current?.weather_code, current?.is_day);

        return {
          location: this.formatLocation(geocoding.results?.[0]),
          temperature: this.toRoundedValue(current?.temperature_2m),
          minTemperature: this.toRoundedValue(forecast.daily?.temperature_2m_min?.[0]),
          maxTemperature: this.toRoundedValue(forecast.daily?.temperature_2m_max?.[0]),
          condition: currentDescriptor.label,
          iconUrl: this.getIconUrl(currentDescriptor.iconName),
          humidity: current?.relative_humidity_2m ?? null,
          windSpeed: this.toRoundedValue(current?.wind_speed_10m),
          windDirection: this.toCardinalDirection(windDirectionDegrees),
          windDirectionDegrees,
          uvIndex: this.toNullableDecimal(current?.uv_index),
          hourly24h
        };
      })
    );
  }

  hasApiKey(): boolean {
    return OPENMETEO_FORECAST_API_URL.trim().length > 0;
  }

  private buildHourlyForecast(forecast: OpenMeteoForecastResponse, currentTime: string | null): HourlyForecast[] {
    const times = forecast.hourly?.time ?? [];
    const startIndex = currentTime ? Math.max(0, times.findIndex((time) => time >= currentTime)) : 0;

    return times.slice(startIndex, startIndex + 8).map((time, index) => {
      const absoluteIndex = startIndex + index;
      const weatherDescriptor = this.getWeatherDescriptor(
        forecast.hourly?.weather_code?.[absoluteIndex],
        forecast.hourly?.is_day?.[absoluteIndex]
      );

      return {
        hour: this.getHourLabel(time),
        temperature: this.toRoundedValue(forecast.hourly?.temperature_2m?.[absoluteIndex]),
        iconUrl: this.getIconUrl(weatherDescriptor.iconName),
        condition: weatherDescriptor.label,
        humidity: forecast.hourly?.relative_humidity_2m?.[absoluteIndex] ?? null,
        windSpeed: this.toRoundedValue(forecast.hourly?.wind_speed_10m?.[absoluteIndex]),
        rainProbability: forecast.hourly?.precipitation_probability?.[absoluteIndex] ?? null
      };
    });
  }

  private toRoundedValue(value: number | undefined): number {
    if (value === undefined) {
      return 0;
    }

    return Math.round(value);
  }

  private toNullableDecimal(value: number | undefined): number | null {
    if (value === undefined || Number.isNaN(value)) {
      return null;
    }

    return Math.round(value * 10) / 10;
  }

  private getWeatherDescriptor(weatherCode: number | undefined, isDay: number | undefined): WeatherCodeDescriptor {
    const fallback = this.weatherCodeMap[0];
    const descriptor = weatherCode !== undefined ? this.weatherCodeMap[weatherCode] : undefined;

    if (!descriptor) {
      return fallback;
    }

    if (isDay === 0 && descriptor.iconName.endsWith('-day')) {
      return {
        ...descriptor,
        iconName: descriptor.iconName.replace('-day', '-night')
      };
    }

    return descriptor;
  }

  private formatLocation(result?: OpenMeteoReverseGeocodingResult): string {
    return result?.name?.trim() || 'Tu ciudad';
  }

  private getIconUrl(iconName: string | undefined): string | null {
    if (!iconName) {
      return null;
    }

    return `https://cdn.jsdelivr.net/gh/basmilius/weather-icons/production/fill/all/${iconName}.svg`;
  }

  private toPercentage(value: number | undefined): number | null {
    if (value === undefined || Number.isNaN(value)) {
      return null;
    }

    return Math.round(value * 100);
  }

  private toCardinalDirection(degrees: number | null): string | null {
    if (degrees === null) {
      return null;
    }

    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  }

  private normalizeDegrees(degrees: number | undefined): number | null {
    if (degrees === undefined || Number.isNaN(degrees)) {
      return null;
    }

    return ((degrees % 360) + 360) % 360;
  }

  private getHourLabel(dateText: string | undefined): string {
    if (!dateText) {
      return '--:--';
    }

    const match = dateText.match(/(?:T|\s)(\d{2}:\d{2})/);
    return match ? match[1] : '--:--';
  }
}
