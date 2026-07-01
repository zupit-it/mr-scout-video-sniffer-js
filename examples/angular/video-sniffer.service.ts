/**
 * ESEMPIO DI INTEGRAZIONE ANGULAR (client-side).
 *
 * Copia questo service nel tuo progetto Angular dopo aver installato:
 *   npm i video-sniffer-js
 *
 * e aver configurato la copia del WASM come asset statico (vedi README, sezione
 * "Integrazione Angular"). Questo file e' solo un riferimento, non viene
 * compilato dalla libreria.
 */
import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { analyzeFile, type AnalyzeFileOutput } from 'video-sniffer-js';

@Injectable({ providedIn: 'root' })
export class VideoSnifferService {
  private readonly platformId = inject(PLATFORM_ID);

  /**
   * Analizza un file video e restituisce predizione + metadati.
   * @throws se invocato lato server (SSR): l'analisi e' solo-browser.
   */
  async analyze(file: File): Promise<AnalyzeFileOutput> {
    if (!isPlatformBrowser(this.platformId)) {
      throw new Error('VideoSnifferService.analyze e\' disponibile solo nel browser.');
    }

    return analyzeFile(file, {
      // Il .wasm e' servito come asset statico (vedi angular.json).
      locateFile: (path: string) => `/assets/mediainfo/${path}`,
    });
  }
}
