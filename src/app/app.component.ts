import { Component, OnInit } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  constructor(private readonly swUpdate: SwUpdate) {}

  ngOnInit(): void {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    // Reactiva la app apenas hay una versión nueva lista, evitando quedar con assets viejos cacheados (ej. PWA instalada en el celular).
    this.swUpdate.versionUpdates
      .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'))
      .subscribe(() => {
        this.swUpdate.activateUpdate().then(() => document.location.reload());
      });

    this.swUpdate.checkForUpdate().catch(() => {});

    // La app instalada como PWA suele quedar en background sin cerrarse; al volver a primer plano,
    // forzamos otro chequeo para no depender solo del check inicial (que corre a los 30s de estable).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.swUpdate.checkForUpdate().catch(() => {});
      }
    });
  }
}
