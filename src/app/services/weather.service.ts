import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { NOMINATIM_REVERSE_GEOCODING_API_URL, OPENMETEO_FORECAST_API_URL } from '../config/openweather.config';

interface OpenMeteoForecastResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    weather_code?: number;
    wind_speed_10m?: number;
    wind_direction_10m?: number;
    uv_index?: number;
    cloud_cover?: number;
    is_day?: number;
    time?: string;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    apparent_temperature?: number[];
    relative_humidity_2m?: number[];
    weather_code?: number[];
    wind_speed_10m?: number[];
    precipitation_probability?: number[];
    precipitation?: number[];
    is_day?: number[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    apparent_temperature_max?: number[];
    apparent_temperature_min?: number[];
    weather_code?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
    wind_speed_10m_max?: number[];
    uv_index_max?: number[];
    sunrise?: string[];
    sunset?: string[];
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

interface NominatimReverseGeocodingResponse {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    hamlet?: string;
    suburb?: string;
    county?: string;
    state?: string;
  };
}

export interface HourlyForecast {
  hour: string;
  temperature: number;
  feelsLike: number | null;
  iconUrl: string | null;
  condition: string;
  humidity: number | null;
  windSpeed: number | null;
  rainProbability: number | null;
  rainMillimeters: number | null;
}

export interface SunEvent {
  index: number;
  time: string;
  type: 'sunrise' | 'sunset';
}

export interface DailyForecast {
  dayLabel: string;
  maxTemperature: number;
  minTemperature: number;
  condition: string;
  iconUrl: string | null;
  feelsLikeMax: number | null;
  feelsLikeMin: number | null;
  rainProbability: number | null;
  precipitationSum: number | null;
  windSpeedMax: number | null;
  uvIndexMax: number | null;
  sunrise: string;
  sunset: string;
}

export interface WeatherSnapshot {
  location: string;
  temperature: number;
  feelsLikeTemperature: number | null;
  minTemperature: number;
  maxTemperature: number;
  condition: string;
  iconUrl: string | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: string | null;
  windDirectionDegrees: number | null;
  uvIndex: number | null;
  cloudCover: number | null;
  rainProbabilityToday: number | null;
  currentTimeLabel: string;
  hourly24h: HourlyForecast[];
  dailyForecast: DailyForecast[];
  sunEvents: SunEvent[];
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
    55: { label: 'llovizna intensa', iconName: 'drizzle' },
    56: { label: 'llovizna helada ligera', iconName: 'sleet' },
    57: { label: 'llovizna helada', iconName: 'sleet' },
    61: { label: 'lluvia ligera', iconName: 'rain' },
    63: { label: 'lluvia', iconName: 'rain' },
    65: { label: 'lluvia intensa', iconName: 'rain' },
    66: { label: 'lluvia helada ligera', iconName: 'sleet' },
    67: { label: 'lluvia helada', iconName: 'sleet' },
    71: { label: 'nieve ligera', iconName: 'snow' },
    73: { label: 'nieve', iconName: 'snow' },
    75: { label: 'nieve intensa', iconName: 'snow' },
    77: { label: 'granos de nieve', iconName: 'hail' },
    80: { label: 'chubascos ligeros', iconName: 'rain' },
    81: { label: 'chubascos', iconName: 'rain' },
    82: { label: 'chubascos intensos', iconName: 'rain' },
    85: { label: 'chubascos de nieve', iconName: 'snow' },
    86: { label: 'chubascos de nieve intensos', iconName: 'snow' },
    95: { label: 'tormenta', iconName: 'thunderstorms-rain' },
    96: { label: 'tormenta con granizo', iconName: 'thunderstorms-rain' },
    99: { label: 'tormenta fuerte con granizo', iconName: 'thunderstorms-rain' }
  };

  getCurrentWeather(lat: number, lon: number): Observable<WeatherSnapshot> {
    const forecastParams = new HttpParams()
      .set('latitude', lat)
      .set('longitude', lon)
      .set('timezone', 'auto')
      .set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,uv_index,cloud_cover,is_day')
      .set('hourly', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation_probability,precipitation,is_day')
      .set('daily', 'temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,weather_code,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset')
      .set('forecast_days', '7');

    const reverseParams = new HttpParams()
      .set('format', 'jsonv2')
      .set('lat', lat)
      .set('lon', lon)
      .set('zoom', '10')
      .set('addressdetails', '1')
      .set('accept-language', 'es');

    return forkJoin({
      forecast: this.http.get<OpenMeteoForecastResponse>(OPENMETEO_FORECAST_API_URL, { params: forecastParams }),
      geocoding: this.http.get<NominatimReverseGeocodingResponse>(NOMINATIM_REVERSE_GEOCODING_API_URL, { params: reverseParams }).pipe(
        catchError(() => of({ address: undefined } as NominatimReverseGeocodingResponse))
      )
    }).pipe(
      map(({ forecast, geocoding }) => {
        const current = forecast.current;
        const windDirectionDegrees = this.normalizeDegrees(current?.wind_direction_10m);
        const currentTime = current?.time ?? null;
        const hourly24h = this.buildHourlyForecast(forecast, currentTime);
        const dailyForecast = this.buildDailyForecast(forecast);
        const sunEvents = this.buildSunEvents(forecast, currentTime);
        const currentDescriptor = this.getWeatherDescriptor(current?.weather_code, current?.is_day);

        return {
          location: this.formatLocation(geocoding.address),
          temperature: this.toRoundedValue(current?.temperature_2m),
          feelsLikeTemperature: current?.apparent_temperature !== undefined ? this.toRoundedValue(current.apparent_temperature) : null,
          minTemperature: this.toRoundedValue(forecast.daily?.temperature_2m_min?.[0]),
          maxTemperature: this.toRoundedValue(forecast.daily?.temperature_2m_max?.[0]),
          condition: currentDescriptor.label,
          iconUrl: this.getIconUrl(currentDescriptor.iconName),
          humidity: current?.relative_humidity_2m ?? null,
          windSpeed: this.toRoundedValue(current?.wind_speed_10m),
          windDirection: this.toCardinalDirection(windDirectionDegrees),
          windDirectionDegrees,
          uvIndex: this.toNullableDecimal(current?.uv_index),
          cloudCover: current?.cloud_cover !== undefined ? Math.round(current.cloud_cover) : null,
          rainProbabilityToday: forecast.daily?.precipitation_probability_max?.[0] ?? null,
          currentTimeLabel: this.getTimeLabel(currentTime),
          hourly24h,
          dailyForecast,
          sunEvents
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

    return times.slice(startIndex, startIndex + 24).map((time, index) => {
      const absoluteIndex = startIndex + index;
      const weatherDescriptor = this.getWeatherDescriptor(
        forecast.hourly?.weather_code?.[absoluteIndex],
        forecast.hourly?.is_day?.[absoluteIndex]
      );

      return {
        hour: this.getHourLabel(time),
        temperature: this.toRoundedValue(forecast.hourly?.temperature_2m?.[absoluteIndex]),
        feelsLike: forecast.hourly?.apparent_temperature?.[absoluteIndex] !== undefined
          ? this.toRoundedValue(forecast.hourly?.apparent_temperature?.[absoluteIndex])
          : null,
        iconUrl: this.getIconUrl(weatherDescriptor.iconName),
        condition: weatherDescriptor.label,
        humidity: forecast.hourly?.relative_humidity_2m?.[absoluteIndex] ?? null,
        windSpeed: this.toRoundedValue(forecast.hourly?.wind_speed_10m?.[absoluteIndex]),
        rainProbability: forecast.hourly?.precipitation_probability?.[absoluteIndex] ?? null,
        rainMillimeters: this.toNullableDecimal(forecast.hourly?.precipitation?.[absoluteIndex])
      };
    });
  }

  private buildSunEvents(forecast: OpenMeteoForecastResponse, currentTime: string | null): SunEvent[] {
    const times = forecast.hourly?.time ?? [];
    const startIndex = currentTime ? Math.max(0, times.findIndex((time) => time >= currentTime)) : 0;
    const windowTimes = times.slice(startIndex, startIndex + 24);

    const events: SunEvent[] = [];
    const sunrises = forecast.daily?.sunrise ?? [];
    const sunsets = forecast.daily?.sunset ?? [];

    [...sunrises.map((time) => ({ time, type: 'sunrise' as const })), ...sunsets.map((time) => ({ time, type: 'sunset' as const }))]
      .forEach(({ time, type }) => {
        const nearestIndex = this.findNearestHourIndex(windowTimes, time);

        if (nearestIndex !== null) {
          events.push({ index: nearestIndex, time: this.getTimeLabel(time), type });
        }
      });

    return events.sort((a, b) => a.index - b.index);
  }

  private findNearestHourIndex(windowTimes: string[], targetTime: string): number | null {
    if (windowTimes.length === 0) {
      return null;
    }

    const target = new Date(targetTime).getTime();

    if (Number.isNaN(target)) {
      return null;
    }

    let closestIndex: number | null = null;
    let closestDiff = Infinity;

    windowTimes.forEach((time, index) => {
      const diff = Math.abs(new Date(time).getTime() - target);

      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = index;
      }
    });

    // Solo se muestra el evento si cae dentro de la ventana de 24hs (a menos de 1.5hs del extremo).
    return closestDiff <= 90 * 60 * 1000 ? closestIndex : null;
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

  private formatLocation(address?: NominatimReverseGeocodingResponse['address']): string {
    const city = address?.city?.trim()
      || address?.town?.trim()
      || address?.village?.trim()
      || address?.municipality?.trim()
      || address?.hamlet?.trim()
      || address?.suburb?.trim()
      || address?.county?.trim()
      || 'Tu ciudad';

    const state = address?.state?.trim();
    return state && state !== city ? `${city}, ${state}` : city;
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

  private getTimeLabel(dateText: string | null): string {
    if (!dateText) {
      return '--:--';
    }

    const match = dateText.match(/(\d{2}):(\d{2})/);

    if (!match) {
      return '--:--';
    }

    const hours24 = Number(match[1]);
    const minutes = match[2];
    const period = hours24 >= 12 ? 'PM' : 'AM';
    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;

    return `${String(hours12).padStart(2, '0')}:${minutes} ${period}`;
  }

  private buildDailyForecast(forecast: OpenMeteoForecastResponse): DailyForecast[] {
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
    const times = forecast.daily?.time ?? [];

    return times.map((date, index) => {
      const descriptor = this.getWeatherDescriptor(forecast.daily?.weather_code?.[index], 1);
      const parsedDate = new Date(`${date}T00:00:00`);
      const dayLabel = Number.isNaN(parsedDate.getTime()) ? '--' : dayLabels[parsedDate.getDay()];

      return {
        dayLabel,
        maxTemperature: this.toRoundedValue(forecast.daily?.temperature_2m_max?.[index]),
        minTemperature: this.toRoundedValue(forecast.daily?.temperature_2m_min?.[index]),
        condition: descriptor.label,
        iconUrl: this.getIconUrl(descriptor.iconName),
        feelsLikeMax: forecast.daily?.apparent_temperature_max?.[index] !== undefined
          ? this.toRoundedValue(forecast.daily.apparent_temperature_max[index])
          : null,
        feelsLikeMin: forecast.daily?.apparent_temperature_min?.[index] !== undefined
          ? this.toRoundedValue(forecast.daily.apparent_temperature_min[index])
          : null,
        rainProbability: forecast.daily?.precipitation_probability_max?.[index] ?? null,
        precipitationSum: this.toNullableDecimal(forecast.daily?.precipitation_sum?.[index]),
        windSpeedMax: forecast.daily?.wind_speed_10m_max?.[index] !== undefined
          ? this.toRoundedValue(forecast.daily.wind_speed_10m_max[index])
          : null,
        uvIndexMax: this.toNullableDecimal(forecast.daily?.uv_index_max?.[index]),
        sunrise: this.getTimeLabel(forecast.daily?.sunrise?.[index] ?? null),
        sunset: this.getTimeLabel(forecast.daily?.sunset?.[index] ?? null)
      };
    });
  }
}
