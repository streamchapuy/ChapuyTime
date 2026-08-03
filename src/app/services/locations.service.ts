import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface SavedLocation {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  updatedAt: number;
}

const STORAGE_KEY = 'nimbus.favoriteLocations.v1';
const MAX_FAVORITES = 5;

/**
 * Guarda ubicaciones favoritas en localStorage. La interfaz publica (Observable +
 * modelo con id/updatedAt) esta preparada para reemplazar el almacenamiento local por
 * un backend con cuenta de usuario (ej. Firestore) sin tener que tocar los consumidores:
 * solo habria que cambiar `readFromStorage`/`persist` por llamadas HTTP/SDK.
 */
@Injectable({ providedIn: 'root' })
export class LocationsService {
  private readonly locationsSubject = new BehaviorSubject<SavedLocation[]>(this.readFromStorage());
  readonly locations$ = this.locationsSubject.asObservable();

  list(): SavedLocation[] {
    return this.locationsSubject.value;
  }

  isFull(): boolean {
    return this.locationsSubject.value.length >= MAX_FAVORITES;
  }

  isSaved(latitude: number, longitude: number): boolean {
    return this.locationsSubject.value.some((loc) => this.isSameCoords(loc, latitude, longitude));
  }

  add(label: string, latitude: number, longitude: number): SavedLocation | null {
    if (this.isFull() || this.isSaved(latitude, longitude)) {
      return null;
    }

    const location: SavedLocation = {
      id: this.generateId(),
      label,
      latitude,
      longitude,
      updatedAt: Date.now()
    };

    this.persist([...this.locationsSubject.value, location]);
    return location;
  }

  remove(id: string): void {
    this.persist(this.locationsSubject.value.filter((loc) => loc.id !== id));
  }

  private isSameCoords(loc: SavedLocation, latitude: number, longitude: number): boolean {
    return Math.abs(loc.latitude - latitude) < 0.01 && Math.abs(loc.longitude - longitude) < 0.01;
  }

  private generateId(): string {
    return `loc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private persist(locations: SavedLocation[]): void {
    this.locationsSubject.next(locations);

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(locations));
    } catch {
      // localStorage puede fallar en modo privado/incognito; se pierde la persistencia pero no rompe la app.
    }
  }

  private readFromStorage(): SavedLocation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedLocation[]) : [];
    } catch {
      return [];
    }
  }
}
