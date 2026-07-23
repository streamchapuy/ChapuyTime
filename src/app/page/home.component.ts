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

import { HeaderComponent } from '../Component/header.component';
import { HourlyForecast, WeatherService } from '../services/weather.service';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type TimeFilterKey = 'all' | 'morning' | 'afternoon' | 'night';

interface TemperatureChartPoint {
  index: number;
  x: number;
  y: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [HeaderComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly weatherService = inject(WeatherService);
  private deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
  private interactionResetTimeout: ReturnType<typeof setTimeout> | null = null;

  @ViewChild('hourlyCarousel') private hourlyCarouselRef?: ElementRef<HTMLElement>;
  @ViewChildren('hourChipButton') private hourChipButtonRefs?: QueryList<ElementRef<HTMLButtonElement>>;
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

  get temperatureChartPoints(): TemperatureChartPoint[] {
    if (this.forecast24h.length === 0) {
      return [];
    }

    const temperatures = this.forecast24h.map((item) => item.temperature);
    const minTemp = Math.min(...temperatures);
    const maxTemp = Math.max(...temperatures);
    const spread = Math.max(1, maxTemp - minTemp);

    return this.forecast24h.map((item, index) => {
      const x = this.forecast24h.length === 1 ? 50 : (index / (this.forecast24h.length - 1)) * 100;
      const normalized = (item.temperature - minTemp) / spread;
      const y = 82 - (normalized * 52);

      return {
        index,
        x,
        y
      };
    });
  }

  get temperatureChartLinePath(): string {
    const points = this.temperatureChartPoints;

    if (points.length === 0) {
      return '';
    }

    if (points.length === 1) {
      return `M ${points[0].x} ${points[0].y}`;
    }

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const current = points[i];
      const controlX = previous.x + ((current.x - previous.x) / 2);

      path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
    }

    return path;
  }

  get temperatureChartAreaPath(): string {
    const points = this.temperatureChartPoints;

    if (points.length === 0) {
      return '';
    }

    const line = this.temperatureChartLinePath;
    const first = points[0];
    const last = points[points.length - 1];
    return `${line} L ${last.x} 94 L ${first.x} 94 Z`;
  }

  get chartGradientStart(): string {
    const segment = this.getSelectedHourSegment();

    if (segment === 'morning') {
      return 'rgba(255, 198, 126, 0.38)';
    }

    if (segment === 'afternoon') {
      return 'rgba(128, 214, 255, 0.38)';
    }

    if (segment === 'night') {
      return 'rgba(111, 148, 255, 0.34)';
    }

    return 'rgba(155, 220, 255, 0.36)';
  }

  get chartGradientMiddle(): string {
    const segment = this.getSelectedHourSegment();

    if (segment === 'morning') {
      return 'rgba(140, 210, 255, 0.26)';
    }

    if (segment === 'afternoon') {
      return 'rgba(109, 189, 255, 0.24)';
    }

    if (segment === 'night') {
      return 'rgba(77, 126, 218, 0.24)';
    }

    return 'rgba(121, 205, 255, 0.24)';
  }

  get chartGradientEnd(): string {
    const segment = this.getSelectedHourSegment();

    if (segment === 'morning') {
      return 'rgba(76, 153, 236, 0.06)';
    }

    if (segment === 'afternoon') {
      return 'rgba(63, 130, 212, 0.06)';
    }

    if (segment === 'night') {
      return 'rgba(50, 88, 169, 0.06)';
    }

    return 'rgba(71, 141, 224, 0.06)';
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

  setTimeFilter(filter: TimeFilterKey): void {
    this.selectedTimeFilter = filter;
  }

  selectForecast(index: number): void {
    this.selectedForecastIndex = Math.max(0, Math.min(index, this.forecast24h.length - 1));
    this.triggerInteractionFeedback(this.selectedForecastIndex);
    this.scrollSelectedHourIntoView('smooth');
  }

  getRainRiskLabel(probability: number | null): string {
    if (probability === null) {
      return 'Riesgo bajo';
    }

    if (probability >= 60) {
      return 'Riesgo alto';
    }

    if (probability >= 30) {
      return 'Riesgo medio';
    }

    return 'Riesgo bajo';
  }

  getRainRiskClass(probability: number | null): string {
    if (probability === null || probability < 30) {
      return 'rain-risk-low';
    }

    if (probability < 60) {
      return 'rain-risk-medium';
    }

    return 'rain-risk-high';
  }

  getEstimatedFeelsLike(item: HourlyForecast | null): number | null {
    if (!item) {
      return null;
    }

    let estimated = item.temperature;

    if (item.humidity !== null && item.humidity >= 75) {
      estimated += 1;
    }

    if (item.windSpeed !== null && item.windSpeed >= 18) {
      estimated -= 1;
    }

    return Math.round(estimated);
  }

  getEstimatedUvForHour(item: HourlyForecast | null): number | null {
    if (!item || this.uvIndex === null) {
      return null;
    }

    const hour = this.extractHourValue(item.hour);

    if (hour === null || hour >= 20 || hour < 6) {
      return 0;
    }

    let factor = 0.45;

    if (hour >= 11 && hour <= 15) {
      factor = 1;
    } else if ((hour >= 9 && hour < 11) || (hour > 15 && hour <= 17)) {
      factor = 0.72;
    }

    return Math.min(11, Math.round(this.uvIndex * factor * 10) / 10);
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

  private getSelectedHourSegment(): TimeFilterKey {
    const selected = this.selectedForecast;

    if (!selected) {
      return 'all';
    }

    const hour = this.extractHourValue(selected.hour);

    if (hour === null) {
      return 'all';
    }

    if (hour >= 6 && hour < 12) {
      return 'morning';
    }

    if (hour >= 12 && hour < 18) {
      return 'afternoon';
    }

    return 'night';
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
