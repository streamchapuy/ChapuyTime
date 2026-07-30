import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.css']
})
export class FooterComponent {
  @Output() forecastTabRequested = new EventEmitter<void>();
  @Output() radarTabRequested = new EventEmitter<void>();
}
