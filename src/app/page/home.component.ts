import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject } from '@angular/core';
import { finalize } from 'rxjs/operators';

import { HeaderComponent } from '../Component/header.component';
import { HourlyForecast, WeatherService } from '../services/weather.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit {
  private readonly weatherService = inject(WeatherService);

  title = 'Nimbus';
  currentLocation = 'Obteniendo ubicacion precisa...';
  currentTemperature: number | null = null;
  minTemperature: number | null = null;
  maxTemperature: number | null = null;
  currentCondition = 'Loading weather...';
  weatherIconUrl: string | null = null;
  humidity: number | null = null;
  windSpeed: number | null = null;
  windDirection: string | null = null;
  windDirectionDegrees: number | null = null;
  uvIndex: number | null = null;
  forecast24h: HourlyForecast[] = [];
  errorMessage = '';
  isLoading = true;

  get forecastPreview(): HourlyForecast[] {
    return this.forecast24h.slice(0, 4);
  }

  get uvLevelLabel(): string {
    if (this.uvIndex === null) {
      return 'Sin datos';
    }

    if (this.uvIndex <= 2) {
      return 'Bajo';
    }

    if (this.uvIndex <= 5) {
      return 'Moderado';
    }

    if (this.uvIndex <= 7) {
      return 'Alto';
    }

    if (this.uvIndex <= 10) {
      return 'Muy alto';
    }

    return 'Extremo';
  }

  get uvProgress(): number {
    if (this.uvIndex === null) {
      return 0;
    }

    return Math.max(0, Math.min(100, (this.uvIndex / 11) * 100));
  }

  get weatherThemeClass(): string {
    const normalized = this.currentCondition.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    if (normalized.includes('tormenta') || normalized.includes('thunder')) {
      return 'theme-storm';
    }

    if (normalized.includes('lluvia') || normalized.includes('rain') || normalized.includes('drizzle')) {
      return 'theme-rain';
    }

    if (normalized.includes('nieve') || normalized.includes('snow') || normalized.includes('sleet')) {
      return 'theme-snow';
    }

    if (normalized.includes('nublado') || normalized.includes('cloud') || normalized.includes('overcast')) {
      return 'theme-cloudy';
    }

    if (normalized.includes('despejado') || normalized.includes('clear') || normalized.includes('sun')) {
      return 'theme-clear';
    }

    return 'theme-default';
  }

  ngOnInit(): void {
    if (!this.weatherService.hasApiKey()) {
      this.errorMessage = 'Configura endpoint, host y X-RapidAPI-Key en src/app/config/openweather.config.ts';
      this.currentCondition = 'RapidAPI config missing';
      this.isLoading = false;
      return;
    }

    if (!navigator.geolocation) {
      this.errorMessage = 'Tu navegador no soporta geolocalizacion.';
      this.currentCondition = 'Location unavailable';
      this.isLoading = false;
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.currentLocation = 'Ubicando...';

        this.weatherService
          .getCurrentWeather(coords.latitude, coords.longitude)
          .pipe(finalize(() => (this.isLoading = false)))
          .subscribe({
            next: (weather) => {
              this.currentLocation = weather.location;
              this.currentTemperature = weather.temperature;
              this.minTemperature = weather.minTemperature;
              this.maxTemperature = weather.maxTemperature;
              this.currentCondition = weather.condition;
              this.weatherIconUrl = weather.iconUrl;
              this.humidity = weather.humidity;
              this.windSpeed = weather.windSpeed;
              this.windDirection = weather.windDirection;
              this.windDirectionDegrees = weather.windDirectionDegrees;
              this.uvIndex = weather.uvIndex;
              this.forecast24h = weather.hourly24h;
              this.errorMessage = '';
            },
            error: (error: HttpErrorResponse) => {
              this.errorMessage = this.resolveErrorMessage(error);
              this.currentCondition = 'Weather unavailable';
              this.weatherIconUrl = null;
              this.humidity = null;
              this.windSpeed = null;
              this.windDirection = null;
              this.windDirectionDegrees = null;
              this.uvIndex = null;
              this.forecast24h = [];
            }
          });
      },
      () => {
        this.errorMessage = 'No fue posible obtener tu ubicacion actual.';
        this.currentCondition = 'Location unavailable';
        this.weatherIconUrl = null;
        this.humidity = null;
        this.windSpeed = null;
        this.windDirection = null;
        this.windDirectionDegrees = null;
        this.uvIndex = null;
        this.forecast24h = [];
        this.isLoading = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  private resolveErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 403) {
      return 'RapidAPI respondio 403: no estas suscrito a esta API o la clave no tiene acceso.';
    }

    if (typeof error.error === 'string' && error.error.trim().length > 0) {
      return error.error;
    }

    const apiMessage = error.error?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      return apiMessage;
    }

    return 'No se pudo consultar OpenWeather via RapidAPI.';
  }
}
