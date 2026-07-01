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

/**
 * Pipeline completa nel browser: File video -> metadati (mediainfo.js) -> predizione.
 *
 * @param file il file video da analizzare
 * @param mediaInfoFactory la factory di default di mediainfo.js (`import mediaInfoFactory from 'mediainfo.js'`)
 * @param factoryOptions opzioni per mediaInfoFactory (es. `locateFile` per il WASM)
 * @returns `result` = output di classify(); `probe` = metadati grezzi normalizzati.
 */
export async function analyzeFile(
  file: Blob,
  mediaInfoFactory: MediaInfoFactory,
  factoryOptions: Record<string, unknown> = {},
): Promise<AnalyzeFileOutput> {
  const mediainfo = await mediaInfoFactory({ format: 'object', ...factoryOptions });
  try {
    const probe = await extractProbe(file, mediainfo);
    return { result: classify(probe), probe };
  } finally {
    // Libera l'istanza WASM per evitare memory leak su analisi ripetute.
    mediainfo.close();
  }
}
