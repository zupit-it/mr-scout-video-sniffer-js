/**
 * index.ts — API pubblica della libreria video-sniffer-js.
 *
 * Due livelli d'uso:
 *
 *   1. Logica pura (nessuna dipendenza, riutilizzabile ovunque):
 *        import { classify, isRecodedOrSuspect } from 'video-sniffer-js';
 *        const result = classify(ffprobeLikeObject);
 *
 *   2. Analisi end-to-end di un File nel browser (usa mediainfo.js):
 *        import mediaInfoFactory from 'mediainfo.js';
 *        import { analyzeFile } from 'video-sniffer-js';
 *        const { result } = await analyzeFile(file, mediaInfoFactory);
 */

import { classify } from './classify.js';
import { extractProbe } from './extract.js';
import type { ClassifyResult, MediaInfoFactory, Probe } from './types.js';

export {
  classify,
  isRecodedOrSuspect,
  parseRatio,
  SUSPICIOUS_ENCODERS,
  GENERIC_BRANDS,
  THRESHOLD_RECODED,
  THRESHOLD_SUSPECT,
} from './classify.js';

export { mediaInfoToProbe, decimalAspectToRatio } from './normalize.js';
export { extractProbe } from './extract.js';

export type {
  Probe,
  ProbeFormat,
  ProbeStream,
  Tags,
  Classification,
  ClassifyResult,
  ClassifyVideoInfo,
  ClassifyMetadataInfo,
  MediaInfoResult,
  MediaInfoTrack,
  MediaInfoInstance,
  MediaInfoFactory,
} from './types.js';

/** Esito di `analyzeFile`: predizione + metadati grezzi normalizzati. */
export interface AnalyzeFileOutput {
  result: ClassifyResult;
  probe: Probe;
}

/** Opzioni di `analyzeFile` (inoltrate a mediainfo.js). */
export interface AnalyzeFileOptions {
  /**
   * Dove trovare il file `.wasm` di mediainfo.js. In un'app con bundler il WASM
   * va servito come asset statico e indicato qui.
   * Es. Angular: `(path) => '/assets/mediainfo/' + path`.
   */
  locateFile?: (path: string) => string;
  [key: string]: unknown;
}

/**
 * Analizza un file video nel browser e ne predice l'origine.
 * mediainfo.js e' importato internamente: non serve passarlo.
 *
 * @param file il file video (es. da un `<input type="file">`)
 * @param options opzioni per il WASM (vedi `locateFile`)
 * @returns `result` = output di classify(); `probe` = metadati grezzi normalizzati.
 */
export async function analyzeFile(
  file: Blob,
  options: AnalyzeFileOptions = {},
): Promise<AnalyzeFileOutput> {
  // Cast al nostro tipo (volutamente piu' largo): mediainfo.js ha tipi piu'
  // stretti, ma noi leggiamo campi arbitrari dalle tracce.
  const { default: mediaInfoFactory } = (await import('mediainfo.js')) as unknown as {
    default: MediaInfoFactory;
  };
  const mediainfo = await mediaInfoFactory({ format: 'object', ...options });
  try {
    const probe = await extractProbe(file, mediainfo);
    return { result: classify(probe), probe };
  } finally {
    // Libera l'istanza WASM per evitare memory leak su analisi ripetute.
    mediainfo.close();
  }
}
