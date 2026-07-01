/**
 * ESEMPIO DI COMPONENTE ANGULAR standalone che usa VideoSnifferService.
 * Riferimento d'uso: seleziona un file e mostra la classificazione.
 */
import { Component, signal, inject } from '@angular/core';
import { VideoSnifferService } from './video-sniffer.service';
import type { ClassifyResult } from 'video-sniffer-js';

@Component({
  selector: 'app-video-upload',
  standalone: true,
  template: `
    <input type="file" accept="video/*" (change)="onFile($event)" />

    @if (loading()) {
      <p>Analisi in corso…</p>
    }
    @if (result(); as r) {
      <p><strong>{{ r.classification }}</strong> (punteggio: {{ r.score }})</p>
      <ul>
        @for (reason of r.reasons; track reason) {
          <li>{{ reason }}</li>
        }
      </ul>
    }
    @if (error(); as e) {
      <p class="error">{{ e }}</p>
    }
  `,
})
export class VideoUploadComponent {
  private readonly sniffer = inject(VideoSnifferService);

  readonly result = signal<ClassifyResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  async onFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.result.set(null);
    this.error.set(null);
    this.loading.set(true);
    try {
      const { result } = await this.sniffer.analyze(file);
      this.result.set(result);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.loading.set(false);
    }
  }
}
