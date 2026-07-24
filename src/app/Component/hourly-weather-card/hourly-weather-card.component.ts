import { Component, EventEmitter, Input, Output } from '@angular/core';

import { HourlyForecast } from '../../services/weather.service';

@Component({
  selector: 'app-hourly-weather-card',
  standalone: true,
  templateUrl: './hourly-weather-card.component.html',
  styleUrl: './hourly-weather-card.component.css'
})
export class HourlyWeatherCardComponent {
  @Input({ required: true }) forecast!: HourlyForecast;
  @Input() isSelected = false;
  @Input() isPressed = false;
  @Output() forecastSelected = new EventEmitter<void>();

  select(): void {
    this.forecastSelected.emit();
  }
}
