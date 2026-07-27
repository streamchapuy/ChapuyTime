import { HttpClient } from '@angular/common/http';
import { Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject } from '@angular/core';
import * as L from 'leaflet';

interface RainViewerFrame {
  time: number;
  path: string;
}

interface RainViewerResponse {
  host: string;
  radar: {
    past: RainViewerFrame[];
    nowcast: RainViewerFrame[];
  };
}

const RAINVIEWER_API_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const FRAME_INTERVAL_MS = 800;

@Component({
  selector: 'app-rain-radar',
  standalone: true,
  templateUrl: './rain-radar.component.html',
  styleUrl: './rain-radar.component.css'
})
export class RainRadarComponent implements OnChanges, OnDestroy {
  private readonly http = inject(HttpClient);

  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;

  @ViewChild('radarMap', { static: true }) private radarMapRef!: ElementRef<HTMLDivElement>;

  isLoading = true;
  isPlaying = false;
  errorMessage = '';
  frameTimeLabel = '';

  private map: L.Map | null = null;
  private locationMarker: L.CircleMarker | null = null;
  private activeRadarLayer: L.TileLayer | null = null;
  private radarHost = '';
  private frames: RainViewerFrame[] = [];
  private frameIndex = 0;
  private playbackTimer: ReturnType<typeof setInterval> | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    const hasCoords = this.latitude !== null && this.longitude !== null;

    if (!hasCoords) {
      return;
    }

    if (!this.map) {
      this.initMap(this.latitude as number, this.longitude as number);
      this.loadRadarFrames();
      return;
    }

    if (changes['latitude'] || changes['longitude']) {
      this.map.setView([this.latitude as number, this.longitude as number], this.map.getZoom());
      this.locationMarker?.setLatLng([this.latitude as number, this.longitude as number]);
    }
  }

  ngOnDestroy(): void {
    this.stopPlayback();
    this.map?.remove();
    this.map = null;
  }

  togglePlayback(): void {
    if (this.frames.length === 0) {
      return;
    }

    this.isPlaying ? this.stopPlayback() : this.startPlayback();
  }

  private initMap(lat: number, lon: number): void {
    const map = L.map(this.radarMapRef.nativeElement, {
      zoomControl: false,
      attributionControl: true
    }).setView([lat, lon], 7);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    this.locationMarker = L.circleMarker([lat, lon], {
      radius: 6,
      color: '#9bdcff',
      weight: 2,
      fillColor: '#9bdcff',
      fillOpacity: 0.85
    }).addTo(map);

    this.map = map;

    setTimeout(() => map.invalidateSize(), 0);
  }

  private loadRadarFrames(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.get<RainViewerResponse>(RAINVIEWER_API_URL).subscribe({
      next: (response) => {
        this.radarHost = response.host;
        this.frames = response.radar?.past ?? [];

        if (this.frames.length === 0) {
          this.errorMessage = 'No hay datos de radar disponibles.';
          this.isLoading = false;
          return;
        }

        this.frameIndex = this.frames.length - 1;
        this.showFrame(this.frameIndex);
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'No fue posible cargar el radar de lluvia.';
        this.isLoading = false;
      }
    });
  }

  private showFrame(index: number): void {
    if (!this.map || this.frames.length === 0) {
      return;
    }

    const frame = this.frames[index];
    const tileUrl = `${this.radarHost}${frame.path}/256/{z}/{x}/{y}/2/1_1.png`;

    const nextLayer = L.tileLayer(tileUrl, {
      opacity: 0.65,
      zIndex: 5
    });

    nextLayer.addTo(this.map);

    if (this.activeRadarLayer) {
      const previousLayer = this.activeRadarLayer;
      this.map.removeLayer(previousLayer);
    }

    this.activeRadarLayer = nextLayer;
    this.frameTimeLabel = new Date(frame.time * 1000).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private startPlayback(): void {
    if (this.frames.length === 0) {
      return;
    }

    this.isPlaying = true;
    this.playbackTimer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
      this.showFrame(this.frameIndex);
    }, FRAME_INTERVAL_MS);
  }

  private stopPlayback(): void {
    this.isPlaying = false;

    if (this.playbackTimer) {
      clearInterval(this.playbackTimer);
      this.playbackTimer = null;
    }

    if (this.frames.length > 0) {
      this.frameIndex = this.frames.length - 1;
      this.showFrame(this.frameIndex);
    }
  }
}
