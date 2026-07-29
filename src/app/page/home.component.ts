import { HttpErrorResponse } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  QueryList,
  ViewChild,
  ViewChildren,
  inject
} from '@angular/core';
import { finalize } from 'rxjs/operators';

import { FooterComponent } from '../Component/footer/footer.component';
import { HeaderComponent } from '../Component/header/header.component';
import { HourlyWeatherCardComponent } from '../Component/hourly-weather-card/hourly-weather-card.component';
import { RainRadarComponent } from '../Component/rain-radar/rain-radar.component';
import { DailyForecast, HourlyForecast, WeatherService } from '../services/weather.service';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type TimeFilterKey = 'all' | 'morning' | 'afternoon' | 'night';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FooterComponent, HeaderComponent, HourlyWeatherCardComponent, RainRadarComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly weatherService = inject(WeatherService);
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private interactionResetTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('hourlyCarousel') private hourlyCarouselRef?: ElementRef<HTMLElement>;
  @ViewChildren('hourChipButton') private hourChipButtonRefs?: QueryList<ElementRef<HTMLElement>>;
  title = 'Nimbus';
  currentLocation = 'Obteniendo ubicacion precisa...';
  latitude: number | null = null;
  longitude: number | null = null;
  currentTemperature: number | null = null;
  feelsLikeTemperature: number | null = null;
  minTemperature: number | null = null;
  maxTemperature: number | null = null;
  currentCondition = 'Loading weather...';
  weatherIconUrl: string | null = null;
  humidity: number | null = null;
  windSpeed: number | null = null;
  windDirection: string | null = null;
  windDirectionDegrees: number | null = null;
  uvIndex: number | null = null;
  rainProbabilityToday: number | null = null;
  currentTimeLabel = '--:--';
  forecast24h: HourlyForecast[] = [];
  dailyForecast: DailyForecast[] = [];
  selectedForecastIndex = 0;
  activeInteractionIndex: number | null = null;
  selectedTimeFilter: TimeFilterKey = 'all';
  errorMessage = '';
  isLoading = true;
  canInstallApp = false;
  isInstallPromptVisible = false;

  readonly timeFilters: Array<{ key: TimeFilterKey; label: string }> = [
    { key: 'all', label: 'Ahora' },
    { key: 'morning', label: 'Manana' },
    { key: 'afternoon', label: 'Tarde' },
    { key: 'night', label: 'Noche' }
  ];

  get forecastPreview(): HourlyForecast[] {
    return this.forecast24h.slice(0, 4);
  }

  get filteredForecast24h(): HourlyForecast[] {
    if (this.selectedTimeFilter === 'all') {
      return this.forecast24h;
    }

    const filtered = this.forecast24h.filter((item) => {
      const hour = this.extractHourValue(item.hour);

      if (hour === null) {
        return false;
      }

      if (this.selectedTimeFilter === 'morning') {
        return hour >= 6 && hour < 12;
      }

      if (this.selectedTimeFilter === 'afternoon') {
        return hour >= 12 && hour < 18;
      }

      return hour >= 18 || hour < 6;
    });

    // Fallback: si no hay datos en ese tramo, se evita dejar la UI vacia.
    return filtered.length > 0 ? filtered : this.forecast24h;
  }

  get selectedForecast(): HourlyForecast | null {
    if (this.forecast24h.length === 0) {
      return null;
    }

    const boundedIndex = Math.max(0, Math.min(this.selectedForecastIndex, this.forecast24h.length - 1));
    return this.forecast24h[boundedIndex] ?? null;
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

  setTimeFilter(filter: TimeFilterKey): void {
    this.selectedTimeFilter = filter;
  }

  selectForecast(index: number): void {
    const boundedIndex = Math.max(0, Math.min(index, this.forecast24h.length - 1));

    this.selectedForecastIndex = boundedIndex;
    this.triggerInteractionFeedback(this.selectedForecastIndex);
    this.scrollSelectedHourIntoView('smooth');
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

  ngAfterViewInit(): void {
    this.hourChipButtonRefs?.changes.subscribe(() => {
      this.scrollSelectedHourIntoView('auto');
    });

    queueMicrotask(() => {
      this.scrollSelectedHourIntoView('auto');
    });
  }

  ngOnDestroy(): void {
    if (this.interactionResetTimeout) {
      clearTimeout(this.interactionResetTimeout);
      this.interactionResetTimeout = null;
    }
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
        this.latitude = latitude;
        this.longitude = longitude;
        this.currentLocation = 'Ubicando...';

        this.weatherService
          .getCurrentWeather(latitude, longitude)
          .pipe(finalize(() => (this.isLoading = false)))
          .subscribe({
            next: (weather) => {
              this.currentLocation = weather.location;
              this.currentTemperature = weather.temperature;
              this.feelsLikeTemperature = weather.feelsLikeTemperature;
              this.minTemperature = weather.minTemperature;
              this.maxTemperature = weather.maxTemperature;
              this.currentCondition = weather.condition;
              this.weatherIconUrl = weather.iconUrl;
              this.humidity = weather.humidity;
              this.windSpeed = weather.windSpeed;
              this.windDirection = weather.windDirection;
              this.windDirectionDegrees = weather.windDirectionDegrees;
              this.uvIndex = weather.uvIndex;
              this.rainProbabilityToday = weather.rainProbabilityToday;
              this.currentTimeLabel = weather.currentTimeLabel;
              this.forecast24h = weather.hourly24h;
              this.dailyForecast = weather.dailyForecast;
              this.selectedForecastIndex = 0;
              queueMicrotask(() => {
                this.scrollSelectedHourIntoView('auto');
              });
              this.errorMessage = '';
            },
            error: (error: HttpErrorResponse) => {
              this.errorMessage = this.resolveErrorMessage(error);
              this.currentCondition = 'Weather unavailable';
              this.weatherIconUrl = null;
              this.feelsLikeTemperature = null;
              this.humidity = null;
              this.windSpeed = null;
              this.windDirection = null;
              this.windDirectionDegrees = null;
              this.uvIndex = null;
              this.rainProbabilityToday = null;
              this.forecast24h = [];
              this.dailyForecast = [];
            }
          });
      },
      () => {
        this.errorMessage = 'No fue posible obtener tu ubicacion actual.';
        this.currentCondition = 'Location unavailable';
        this.weatherIconUrl = null;
        this.feelsLikeTemperature = null;
        this.humidity = null;
        this.windSpeed = null;
        this.windDirection = null;
        this.windDirectionDegrees = null;
        this.uvIndex = null;
        this.rainProbabilityToday = null;
        this.forecast24h = [];
        this.dailyForecast = [];
        this.isLoading = false;
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
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

  private extractHourValue(hourLabel: string): number | null {
    const match = hourLabel.match(/^(\d{1,2})/);

    if (!match) {
      return null;
    }

    const parsed = Number(match[1]);
    return Number.isNaN(parsed) ? null : parsed;
  }

  private triggerInteractionFeedback(index: number): void {
    this.activeInteractionIndex = index;

    if (this.interactionResetTimeout) {
      clearTimeout(this.interactionResetTimeout);
    }

    this.interactionResetTimeout = setTimeout(() => {
      this.activeInteractionIndex = null;
      this.interactionResetTimeout = null;
    }, 280);
  }

  private scrollSelectedHourIntoView(behavior: ScrollBehavior): void {
    const buttons = this.hourChipButtonRefs?.toArray() ?? [];
    const selectedButton = buttons[this.selectedForecastIndex]?.nativeElement;

    if (!selectedButton) {
      return;
    }

    selectedButton.scrollIntoView({
      behavior,
      block: 'nearest',
      inline: 'center'
    });

    if (this.hourlyCarouselRef?.nativeElement) {
      this.hourlyCarouselRef.nativeElement.classList.add('is-snapping');
      setTimeout(() => this.hourlyCarouselRef?.nativeElement.classList.remove('is-snapping'), 180);
    }
  }
}
