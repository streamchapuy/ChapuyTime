import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  ElementRef,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  inject
} from '@angular/core';
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
  private readonly document = inject(DOCUMENT);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  @Input() latitude: number | null = null;
  @Input() longitude: number | null = null;
  @Input() fillHeight = false;

  @ViewChild('radarMap', { static: true }) private radarMapRef!: ElementRef<HTMLDivElement>;

  isLoading = true;
  isPlaying = false;
  isExpanded = false;
  errorMessage = '';
  frameTimeLabel = '';

  private map: L.Map | null = null;
  private locationMarker: L.CircleMarker | null = null;
  private activeRadarLayer: L.TileLayer | null = null;
  private radarHost = '';
  private frames: RainViewerFrame[] = [];
  private frameIndex = 0;
  private playbackTimer: ReturnType<typeof setInterval> | null = null;
  private originalParent: Node | null = null;
  private originalNextSibling: Node | null = null;

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
    this.restoreOriginalPosition();
    this.setBodyScrollLocked(false);
    this.map?.remove();
    this.map = null;
  }

  @HostListener('document:keydown.escape')
  onEscapePressed(): void {
    if (this.isExpanded) {
      this.setExpanded(false);
    }
  }

  @HostListener('document:fullscreenchange')
  onFullscreenChange(): void {
    const isBrowserFullscreen = !!this.document.fullscreenElement;

    if (!isBrowserFullscreen && this.isExpanded) {
      this.setExpanded(false);
    }
  }

  togglePlayback(): void {
    if (this.frames.length === 0) {
      return;
    }

    this.isPlaying ? this.stopPlayback() : this.startPlayback();
  }

  toggleExpand(): void {
    this.setExpanded(!this.isExpanded);
  }

  private setExpanded(expanded: boolean): void {
    this.isExpanded = expanded;
    const hostElement = this.hostRef.nativeElement;

    if (expanded) {
      this.originalParent = hostElement.parentNode;
      this.originalNextSibling = hostElement.nextSibling;
      this.document.body.appendChild(hostElement);
      hostElement.requestFullscreen?.().catch(() => {
        // Si la API de Fullscreen no está disponible o es rechazada, seguimos con el overlay CSS.
      });
    } else {
      if (this.document.fullscreenElement === hostElement) {
        this.document.exitFullscreen?.().catch(() => {});
      }
      this.restoreOriginalPosition();
    }

    this.setBodyScrollLocked(expanded);
    setTimeout(() => this.map?.invalidateSize(), 150);
  }

  private restoreOriginalPosition(): void {
    const hostElement = this.hostRef.nativeElement;

    if (this.originalParent && hostElement.parentNode === this.document.body) {
      this.originalParent.insertBefore(hostElement, this.originalNextSibling);
    }
  }

  private setBodyScrollLocked(locked: boolean): void {
    this.document.body.style.overflow = locked ? 'hidden' : '';
  }

  private initMap(lat: number, lon: number): void {
    const map = L.map(this.radarMapRef.nativeElement, {
      zoomControl: false,
      attributionControl: true
    }).setView([lat, lon], 7);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19
    }).addTo(map);

    this.locationMarker = L.circleMarker([lat, lon], {
      radius: 7,
      color: '#ffffff',
      weight: 2,
      fillColor: '#ff5a36',
      fillOpacity: 0.95
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
      opacity: 0.75,
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
