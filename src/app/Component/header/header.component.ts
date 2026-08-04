import { Component, Input } from '@angular/core';
import { PushNotificationService } from '../../services/push-notification.service';

@Component({
  selector: 'app-header',
  standalone: true,
  templateUrl: './header.component.html',
  styleUrl: './header.component.css'
})
export class HeaderComponent {
  @Input() title = 'Nimbus';

  constructor(private readonly pushNotificationService: PushNotificationService) {}

  get notificationsEnabled(): boolean {
    return this.pushNotificationService.permission === 'granted' && !!this.pushNotificationService.getStoredToken();
  }

  get notificationsSupported(): boolean {
    return this.pushNotificationService.isSupported();
  }

  async onToggleNotifications(): Promise<void> {
    if (this.notificationsEnabled) {
      return;
    }
    await this.pushNotificationService.enable();
  }
}
