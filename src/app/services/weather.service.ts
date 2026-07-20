import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import {
  OPENMETEO_UV_API_URL,
  OPENWEATHER_API_URL,
  OPENWEATHER_RAPIDAPI_HOST,
  OPENWEATHER_RAPIDAPI_KEY
} from '../config/openweather.config';

interface OpenWeatherForecastResponse {
  city: {
    name: string;
  };
  list: Array<{
    dt_txt?: string;
    weather: Array<{
      main: string;
      description: string;
      icon?: string;
    }>;
    main: {
      temp: number;
      temp_min: number;
      temp_max: number;
      humidity?: number;
    };
    wind?: {
      speed?: number;
      deg?: number;
    };
  }>;
}

interface OpenMeteoUvResponse {
  current?: {
    uv_index?: number;
  };
}

export interface HourlyForecast {
  hour: string;
  temperature: number;
  iconUrl: string | null;
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

  getCurrentWeather(lat: number, lon: number): Observable<WeatherSnapshot> {
    const params = new HttpParams()
      .set('latitude', lat)
      .set('longitude', lon)
      .set('lang', 'es');

    const headers = new HttpHeaders({
      'x-rapidapi-key': OPENWEATHER_RAPIDAPI_KEY,
      'x-rapidapi-host': OPENWEATHER_RAPIDAPI_HOST,
      'Content-Type': 'application/json'
    });

    const forecast$ = this.http.get<OpenWeatherForecastResponse>(OPENWEATHER_API_URL, { headers, params });
    const uv$ = this.getUvIndex(lat, lon);

    return forkJoin({ forecast: forecast$, uvIndex: uv$ }).pipe(
      map(({ forecast, uvIndex }) => {
        const currentForecast = forecast.list[0];
        const windDirectionDegrees = this.normalizeDegrees(currentForecast?.wind?.deg);
        const hourly24h = forecast.list
          .slice(0, 8)
          .map((item) => ({
            hour: this.getHourLabel(item.dt_txt),
            temperature: this.toCelsius(item.main?.temp),
            iconUrl: this.getIconUrl(item.weather[0]?.icon)
          }));

        return {
          location: forecast.city.name,
          temperature: this.toCelsius(currentForecast?.main.temp),
          minTemperature: this.toCelsius(currentForecast?.main.temp_min),
          maxTemperature: this.toCelsius(currentForecast?.main.temp_max),
          condition: this.translateCondition(currentForecast?.weather[0]?.description),
          iconUrl: this.getIconUrl(currentForecast?.weather[0]?.icon),
          humidity: currentForecast?.main.humidity ?? null,
          windSpeed: this.toKmPerHour(currentForecast?.wind?.speed),
          windDirection: this.toCardinalDirection(windDirectionDegrees),
          windDirectionDegrees,
          uvIndex,
          hourly24h
        };
      })
    );
  }

  hasApiKey(): boolean {
    return OPENWEATHER_RAPIDAPI_KEY.trim().length > 0
      && OPENWEATHER_RAPIDAPI_HOST.trim().length > 0
      && OPENWEATHER_API_URL.trim().length > 0;
  }

  private getUvIndex(lat: number, lon: number): Observable<number | null> {
    const params = new HttpParams()
      .set('latitude', lat)
      .set('longitude', lon)
      .set('current', 'uv_index');

    return this.http.get<OpenMeteoUvResponse>(OPENMETEO_UV_API_URL, { params }).pipe(
      map((response) => {
        const uvIndex = response.current?.uv_index;
        return typeof uvIndex === 'number' ? Math.round(uvIndex * 10) / 10 : null;
      }),
      catchError(() => of(null))
    );
  }

  private toCelsius(temperature: number | undefined): number {
    if (temperature === undefined) {
      return 0;
    }

    const normalized = temperature > 200 ? temperature - 273.15 : temperature;
    return Math.round(normalized);
  }

  private translateCondition(description: string | undefined): string {
    if (!description) {
      return 'Desconocido';
    }

    const dictionary: Record<string, string> = {
      'overcast clouds': 'nublado',
      'broken clouds': 'nubes dispersas',
      'scattered clouds': 'nubes aisladas',
      'few clouds': 'pocas nubes',
      'clear sky': 'cielo despejado'
    };

    const normalized = description.trim().toLowerCase();
    return dictionary[normalized] ?? description;
  }

  private getIconUrl(iconCode: string | undefined): string | null {
    if (!iconCode) {
      return null;
    }

    return `https://openweathermap.org/img/wn/${iconCode}@2x.png`;
  }

  private toKmPerHour(windSpeedMs: number | undefined): number | null {
    if (windSpeedMs === undefined) {
      return null;
    }

    return Math.round(windSpeedMs * 3.6);
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

    const match = dateText.match(/\d{2}:\d{2}/);
    return match ? match[0] : '--:--';
  }
}
