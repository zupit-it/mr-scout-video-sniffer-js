/**
 * extract.ts
 * ----------
 * Adapter browser: legge i metadati di un File/Blob video usando mediainfo.js
 * (MediaInfo compilato in WebAssembly) SENZA alcuna dipendenza server-side, e
 * li restituisce nella forma ffprobe-like attesa da `classify()`.
 *
 * mediainfo.js NON e' importato staticamente qui, per non vincolare il bundler
 * del team frontend: l'istanza va passata dall'esterno (dependency injection).
 * Vedi `analyzeFile()` in index.ts e il demo per un esempio d'uso concreto.
 */

import { mediaInfoToProbe } from './normalize.js';
import type { MediaInfoInstance, Probe } from './types.js';

/**
 * Legge un File/Blob a chunk e ne estrae i metadati con un'istanza mediainfo.js.
 *
 * @param file il file video selezionato dall'utente
 * @param mediainfo istanza gia' creata via `mediaInfoFactory()`
 * @returns Probe ffprobe-like (`{ format, streams }`)
 */
export async function extractProbe(
  file: Blob,
  mediainfo: MediaInfoInstance,
): Promise<Probe> {
  const fileSize = file.size;

  // mediainfo.js richiede una funzione che legga `size` byte a partire da `offset`.
  const readChunk = (chunkSize: number, offset: number): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) =>
        resolve(new Uint8Array(event.target!.result as ArrayBuffer));
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
    });

  const result = await mediainfo.analyzeData(() => fileSize, readChunk);
  return mediaInfoToProbe(result);
}

export default extractProbe;
