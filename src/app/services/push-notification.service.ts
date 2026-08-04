import { Injectable } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Messaging, getMessaging, getToken, onMessage } from 'firebase/messaging';
import { Functions, getFunctions, httpsCallable } from 'firebase/functions';
import { FIREBASE_CONFIG, FIREBASE_VAPID_KEY } from '../config/firebase.config';
import { LocationsService } from './locations.service';

const FCM_TOKEN_STORAGE_KEY = 'nimbus.fcmToken.v1';
const FCM_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

export type PushPermissionState = NotificationPermission | 'unsupported';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private app: FirebaseApp | null = null;
  private messaging: Messaging | null = null;
  private functions: Functions | null = null;

  constructor(private readonly locationsService: LocationsService) {
    // Si el usuario ya activo notificaciones, mantiene el backend al dia cuando cambian sus favoritos.
    this.locationsService.locations$.subscribe(() => this.syncLocationsIfEnabled());
  }

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
  }

  get permission(): PushPermissionState {
    return this.isSupported() ? Notification.permission : 'unsupported';
  }

  // Pide permiso al usuario, registra el service worker de mensajería y devuelve el token FCM del dispositivo.
  async enable(): Promise<string | null> {
    if (!this.isSupported() || !FIREBASE_VAPID_KEY) {
      return null;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return null;
    }

    // Scope propio para no chocar con ngsw-worker.js (registrado en "/" por Angular Service Worker).
    const registration = await navigator.serviceWorker.register('firebase-messaging-sw.js', {
      scope: FCM_SW_SCOPE
    });

    const messaging = this.getMessagingInstance();
    const token = await getToken(messaging, {
      vapidKey: FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (token) {
      localStorage.setItem(FCM_TOKEN_STORAGE_KEY, token);
      await this.registerDevice(token);
    }

    onMessage(messaging, (payload) => this.showForegroundNotification(payload));

    return token;
  }

  getStoredToken(): string | null {
    return localStorage.getItem(FCM_TOKEN_STORAGE_KEY);
  }

  private async syncLocationsIfEnabled(): Promise<void> {
    const token = this.getStoredToken();
    if (token) {
      await this.registerDevice(token);
    }
  }

  private async registerDevice(token: string): Promise<void> {
    const registerDeviceFn = httpsCallable(this.getFunctionsInstance(), 'registerDevice');
    const locations = this.locationsService.list().map((loc) => ({
      label: loc.label,
      latitude: loc.latitude,
      longitude: loc.longitude
    }));

    try {
      await registerDeviceFn({ token, locations });
    } catch (error) {
      console.error('No se pudo registrar el dispositivo para notificaciones push', error);
    }
  }

  private getFunctionsInstance(): Functions {
    if (!this.functions) {
      this.functions = getFunctions(this.getAppInstance());
    }
    return this.functions;
  }

  private getMessagingInstance(): Messaging {
    if (!this.messaging) {
      this.messaging = getMessaging(this.getAppInstance());
    }
    return this.messaging;
  }

  private getAppInstance(): FirebaseApp {
    if (!this.app) {
      this.app = initializeApp(FIREBASE_CONFIG);
    }
    return this.app;
  }

  private showForegroundNotification(payload: { notification?: { title?: string; body?: string } }): void {
    if (Notification.permission !== 'granted') {
      return;
    }
    const title = payload.notification?.title ?? 'Nimbus';
    const body = payload.notification?.body ?? '';
    new Notification(title, { body, icon: 'icons/icon-192x192.png' });
  }
}
