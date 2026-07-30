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
import {
  ApexAnnotations,
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexMarkers,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule
} from 'ng-apexcharts';

import { FooterComponent } from '../Component/footer/footer.component';
import { HeaderComponent } from '../Component/header/header.component';
import { HourlyWeatherCardComponent } from '../Component/hourly-weather-card/hourly-weather-card.component';
import { RainRadarComponent } from '../Component/rain-radar/rain-radar.component';
import { DailyForecast, HourlyForecast, SunEvent, WeatherService } from '../services/weather.service';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

type TimeFilterKey = 'all' | 'morning' | 'afternoon' | 'night';

interface TemperatureChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  stroke: ApexStroke;
  fill: ApexFill;
  dataLabels: ApexDataLabels;
  markers: ApexMarkers;
  grid: ApexGrid;
  tooltip: ApexTooltip;
  colors: string[];
  annotations: ApexAnnotations;
}

interface PrecipitationBlock {
  label: string;
  probability: number;
  heightPercent: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [FooterComponent, HeaderComponent, HourlyWeatherCardComponent, RainRadarComponent, NgApexchartsModule],
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
  sunEvents: SunEvent[] = [];
  showFeelsLikeInChart = false;
  selectedForecastIndex = 0;
  activeInteractionIndex: number | null = null;
  selectedTimeFilter: TimeFilterKey = 'all';
  isDailyDetailsOpen = false;
  isRadarPageOpen = false;
  errorMessage = '';
  isLoading = true;
  canInstallApp = false;
  isInstallPromptVisible = false;

  chartOptions: TemperatureChartOptions = {
    series: [{ name: 'Temperatura', data: [] }],
    chart: {
      type: 'area',
      width: '100%',
      height: 190,
      background: 'transparent',
      foreColor: 'rgba(228, 241, 255, 0.78)',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: 'easeinout', speed: 350 },
      events: {
        dataPointSelection: (_event: unknown, _chartContext: unknown, config: { dataPointIndex: number }) => {
          if (config && config.dataPointIndex >= 0) {
            this.selectForecast(config.dataPointIndex);
          }
        }
      }
    },
    xaxis: {
      categories: [],
      tickAmount: undefined,
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: {
        show: true,
        position: 'back',
        stroke: { color: 'rgba(201, 234, 255, 0.55)', width: 1, dashArray: 4 }
      },
      labels: {
        rotate: 0,
        hideOverlappingLabels: false,
        style: { colors: 'rgba(228, 241, 255, 0.7)', fontSize: '10px' }
      }
    },
    yaxis: {
      labels: {
        formatter: (value: number) => `${Math.round(value)}\u00b0`,
        style: { colors: 'rgba(228, 241, 255, 0.7)', fontSize: '10px' }
      },
      crosshairs: {
        show: true,
        position: 'back',
        stroke: { color: 'rgba(201, 234, 255, 0.55)', width: 1, dashArray: 4 }
      },
      tickAmount: 3
    },
    stroke: {
      curve: 'smooth',
      width: 3
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.45,
        opacityTo: 0.04,
        stops: [0, 90, 100]
      }
    },
    dataLabels: { enabled: false },
    markers: {
      size: 0,
      strokeWidth: 2,
      hover: { size: 5 }
    },
    grid: {
      show: true,
      borderColor: 'rgba(232, 243, 255, 0.12)',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { left: 8, right: 8 }
    },
    tooltip: {
      theme: 'dark',
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => this.buildChartTooltip(dataPointIndex)
    },
    colors: ['#9bdcff'],
    annotations: { points: [] }
  };

  readonly timeFilters: Array<{ key: TimeFilterKey; label: string }> = [
    { key: 'all', label: 'Ahora' },
    { key: 'morning', label: 'Manana' },
    { key: 'afternoon', label: 'Tarde' },
    { key: 'night', label: 'Noche' }
  ];

  get forecastPreview(): HourlyForecast[] {
    return this.forecast24h.slice(0, 4);
  }

  get precipitationBlocks(): PrecipitationBlock[] {
    const blockSize = 3;
    const blocks: PrecipitationBlock[] = [];

    for (let i = 0; i < this.forecast24h.length; i += blockSize) {
      const chunk = this.forecast24h.slice(i, i + blockSize);

      if (chunk.length === 0) {
        continue;
      }

      const probabilities = chunk.map((item) => item.rainProbability ?? 0);
      const probability = Math.max(...probabilities);
      blocks.push({
        label: chunk[0].hour,
        probability,
        heightPercent: Math.max(probability, 6)
      });
    }

    return blocks;
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

  openDailyDetails(): void {
    this.isDailyDetailsOpen = true;
  }

  closeDailyDetails(): void {
    this.isDailyDetailsOpen = false;
  }

  openRadarPage(): void {
    this.isRadarPageOpen = true;
  }

  closeRadarPage(): void {
    this.isRadarPageOpen = false;
  }

  @HostListener('document:keydown.escape')
  onEscapeKeydown(): void {
    if (this.isRadarPageOpen) {
      this.closeRadarPage();
      return;
    }

    if (this.isDailyDetailsOpen) {
      this.closeDailyDetails();
    }
  }

  toggleFeelsLikeInChart(): void {
    this.showFeelsLikeInChart = !this.showFeelsLikeInChart;
    this.refreshTemperatureChart();
  }

  onChartPointerMove(event: PointerEvent): void {
    if (this.forecast24h.length === 0) {
      return;
    }

    const container = event.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const offsetX = event.clientX - rect.left + container.scrollLeft;
    const proportion = Math.max(0, Math.min(1, offsetX / container.scrollWidth));
    const index = Math.round(proportion * (this.forecast24h.length - 1));

    this.previewForecastFromChart(index);
  }

  selectForecast(index: number): void {
    const boundedIndex = Math.max(0, Math.min(index, this.forecast24h.length - 1));

    this.selectedForecastIndex = boundedIndex;
    this.triggerInteractionFeedback(this.selectedForecastIndex);
    this.scrollSelectedHourIntoView('smooth');
    this.refreshTemperatureChart();
  }

  private previewForecastFromChart(index: number): void {
    if (this.forecast24h.length === 0) {
      return;
    }

    const boundedIndex = Math.max(0, Math.min(index, this.forecast24h.length - 1));

    if (boundedIndex === this.selectedForecastIndex) {
      return;
    }

    this.selectedForecastIndex = boundedIndex;
    this.scrollSelectedHourIntoView('smooth');
    this.refreshTemperatureChart();
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
              this.sunEvents = weather.sunEvents;
              this.selectedForecastIndex = 0;
              this.refreshTemperatureChart();
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
              this.sunEvents = [];
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
        this.sunEvents = [];
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

  private getChartAccentColor(): string {
    const hour = this.extractHourValue(this.selectedForecast?.hour ?? '');

    if (hour === null) {
      return '#9bdcff';
    }

    if (hour >= 6 && hour < 12) {
      return '#ffc67e';
    }

    if (hour >= 12 && hour < 18) {
      return '#80d6ff';
    }

    if (hour >= 18 || hour < 6) {
      return '#6f94ff';
    }

    return '#9bdcff';
  }

  private buildChartTooltip(dataPointIndex: number): string {
    const item = this.forecast24h[dataPointIndex];

    if (!item) {
      return '';
    }

    const temperature = this.showFeelsLikeInChart ? item.feelsLike ?? item.temperature : item.temperature;
    const rainMillimeters = item.rainMillimeters ?? 0;

    return `
      <div class="chart-tooltip">
        <span class="chart-tooltip-hour">${item.hour}</span>
        <span class="chart-tooltip-temp">${Math.round(temperature)}&deg;</span>
        <span class="chart-tooltip-rain">${rainMillimeters.toFixed(1)} mm</span>
      </div>
    `;
  }

  private buildSunAnnotationPoints(hours: string[], temperatures: number[]): NonNullable<ApexAnnotations['points']> {
    return this.sunEvents
      .filter((event) => event.index < temperatures.length)
      .map((event) => ({
        x: hours[event.index],
        y: temperatures[event.index],
        marker: {
          size: 0
        },
        label: {
          borderWidth: 0,
          offsetY: event.type === 'sunrise' ? -6 : -6,
          style: {
            background: 'transparent',
            color: '#ffd166',
            fontSize: '14px'
          },
          text: event.type === 'sunrise' ? '\u2600' : '\u{1F319}'
        }
      }));
  }

  private refreshTemperatureChart(): void {
    const hours = this.forecast24h.map((item) => item.hour);
    const temperatures = this.forecast24h.map((item) =>
      this.showFeelsLikeInChart ? item.feelsLike ?? item.temperature : item.temperature
    );
    const accentColor = this.getChartAccentColor();
    const chartWidth = hours.length > 0 ? Math.max(340, hours.length * 44) : '100%';
    const chart = this.chartOptions.chart.width === chartWidth
      ? this.chartOptions.chart
      : { ...this.chartOptions.chart, width: chartWidth };

    this.chartOptions = {
      ...this.chartOptions,
      chart,
      series: [{ name: this.showFeelsLikeInChart ? 'Sensacion termica' : 'Temperatura', data: temperatures }],
      xaxis: {
        ...this.chartOptions.xaxis,
        categories: hours,
        tickAmount: hours.length > 0 ? Math.min(hours.length - 1, 11) : undefined
      },
      colors: [accentColor],
      markers: {
        ...this.chartOptions.markers,
        discrete: temperatures.length > 0
          ? [{
              seriesIndex: 0,
              dataPointIndex: this.selectedForecastIndex,
              fillColor: '#ffffff',
              strokeColor: accentColor,
              size: 6
            }]
          : []
      },
      annotations: { points: this.buildSunAnnotationPoints(hours, temperatures) }
    };
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
