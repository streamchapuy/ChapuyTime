import { HttpErrorResponse } from '@angular/common/http';
import { Component, HostListener, OnInit, AfterViewInit, ViewChild, ElementRef, inject } from '@angular/core';
import { finalize } from 'rxjs/operators';
import Chart from 'chart.js/auto';

import { HeaderComponent } from '../Component/header.component';
import { HourlyForecast, WeatherService } from '../services/weather.service';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit {
  @ViewChild('temperatureChart') temperatureChartCanvas!: ElementRef<HTMLCanvasElement>;

  private readonly weatherService = inject(WeatherService);
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private temperatureChart: Chart | null = null;

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
  canInstallApp = false;
  isInstallPromptVisible = false;

  get forecastPreview(): HourlyForecast[] {
    return this.forecast24h.slice(0, 4);
  }

  get next24hMinTemperature(): number | null {
    if (this.forecast24h.length === 0) {
      return null;
    }

    return Math.min(...this.forecast24h.map((item) => item.temperature));
  }

  get next24hMaxTemperature(): number | null {
    if (this.forecast24h.length === 0) {
      return null;
    }

    return Math.max(...this.forecast24h.map((item) => item.temperature));
  }

  get next24hDominantCondition(): string {
    if (this.forecast24h.length === 0) {
      return 'Sin datos';
    }

    const counts = new Map<string, number>();

    for (const item of this.forecast24h) {
      counts.set(item.condition, (counts.get(item.condition) ?? 0) + 1);
    }

    let dominantCondition = this.forecast24h[0].condition;
    let highestCount = 0;

    for (const [condition, count] of counts.entries()) {
      if (count > highestCount) {
        dominantCondition = condition;
        highestCount = count;
      }
    }

    return dominantCondition;
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

  get temperatureRangeProgress(): number {
    if (
      this.currentTemperature === null
      || this.minTemperature === null
      || this.maxTemperature === null
      || this.maxTemperature === this.minTemperature
    ) {
      return 0;
    }

    const normalized = ((this.currentTemperature - this.minTemperature) / (this.maxTemperature - this.minTemperature)) * 100;
    return Math.max(0, Math.min(100, normalized));
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

  get weatherOutlookLabel(): string {
    const normalized = this.currentCondition.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    if (normalized.includes('tormenta') || normalized.includes('thunder')) {
      return 'Tormentoso';
    }

    if (normalized.includes('lluvia') || normalized.includes('rain') || normalized.includes('drizzle')) {
      return 'Lluvioso';
    }

    if (normalized.includes('nieve') || normalized.includes('snow') || normalized.includes('sleet')) {
      return 'Nevado';
    }

    if (
      normalized.includes('nublado')
      || normalized.includes('nuboso')
      || normalized.includes('nubes')
      || normalized.includes('cloud')
      || normalized.includes('overcast')
    ) {
      return 'Nublado';
    }

    if (normalized.includes('despejado') || normalized.includes('clear') || normalized.includes('sun')) {
      return 'Soleado';
    }

    if (this.isLoading) {
      return 'Cargando';
    }

    return 'Sin datos';
  }

  @HostListener('window:beforeinstallprompt', ['$event'])
  onBeforeInstallPrompt(event: Event): void {
    event.preventDefault();
    this.deferredInstallPrompt = event as BeforeInstallPromptEvent;
    this.canInstallApp = true;
    this.isInstallPromptVisible = true;
  }

  @HostListener('window:appinstalled')
  onAppInstalled(): void {
    this.deferredInstallPrompt = null;
    this.canInstallApp = false;
    this.isInstallPromptVisible = false;
  }

  ngOnInit(): void {
    this.isInstallPromptVisible = !this.isRunningStandalone();

    if (!this.weatherService.hasApiKey()) {
      this.errorMessage = 'No se encontro configurado el endpoint de Open-Meteo.';
      this.currentCondition = 'Weather config missing';
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
        const latitude = coords.latitude;
        const longitude = coords.longitude;
        this.currentLocation = 'Ubicando...';

        this.weatherService
          .getCurrentWeather(latitude, longitude)
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

  ngAfterViewInit(): void {
    if (this.forecast24h.length > 0) {
      this.initializeTemperatureChart();
    }
  }

  private initializeTemperatureChart(): void {
    if (!this.temperatureChartCanvas?.nativeElement || !this.forecast24h.length) {
      return;
    }

    const ctx = this.temperatureChartCanvas.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    // Destruir gráfico anterior si existe
    if (this.temperatureChart) {
      this.temperatureChart.destroy();
    }

    const labels = this.forecast24h.map((item) => {
      if (item.hour === 'Ahora') {
        return 'Ahora';
      }
      return item.hour || '--';
    });

    const temperatures = this.forecast24h.map((item) => item.temperature);

    this.temperatureChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Temperatura (°C)',
            data: temperatures,
            borderColor: '#4ade80',
            backgroundColor: 'rgba(74, 222, 128, 0.08)',
            borderWidth: 3,
            fill: true,
            pointRadius: 6,
            pointBackgroundColor: '#ffffff',
            pointBorderColor: '#4ade80',
            pointBorderWidth: 2,
            pointHoverRadius: 8,
            tension: 0.4,
            segment: {
              borderColor: (ctx) => (ctx.p1DataIndex === 0 ? '#ffffff' : '#4ade80'),
              borderWidth: (ctx) => (ctx.p1DataIndex === 0 ? 4 : 3)
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 12,
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: '#4ade80',
            borderWidth: 1,
            displayColors: false,
            callbacks: {
              label: (context) => `${context.parsed.y}°C`
            }
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            min: Math.min(...temperatures) - 2,
            max: Math.max(...temperatures) + 2,
            grid: {
              color: 'rgba(255, 255, 255, 0.08)',
              display: true
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: {
                size: 11
              }
            }
          },
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: 'rgba(255, 255, 255, 0.6)',
              font: {
                size: 11
              }
            }
          }
        }
      }
    });
  }

  async installApp(): Promise<void> {
    if (!this.deferredInstallPrompt) {
      return;
    }

    await this.deferredInstallPrompt.prompt();
    const { outcome } = await this.deferredInstallPrompt.userChoice;

    if (outcome === 'accepted') {
      this.canInstallApp = false;
      this.isInstallPromptVisible = false;
    }

    this.deferredInstallPrompt = null;
  }

  private isRunningStandalone(): boolean {
    const standaloneDisplay = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = 'standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    return standaloneDisplay || iosStandalone;
  }

  private resolveErrorMessage(error: HttpErrorResponse): string {
    if (typeof error.error === 'string' && error.error.trim().length > 0) {
      return error.error;
    }

    const apiMessage = error.error?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim().length > 0) {
      return apiMessage;
    }

    return 'No se pudo consultar Open-Meteo.';
  }
}
