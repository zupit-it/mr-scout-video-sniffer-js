/**
 * types.ts — Tipi pubblici della libreria.
 *
 * La forma `Probe` rispecchia l'output di `ffprobe` (`{ format, streams }`),
 * cosi' `classify()` e' verificabile 1:1 con lo script Python di riferimento e
 * riutilizzabile anche lato server passando direttamente il JSON di ffprobe.
 */

/** Mappa di tag di container/stream, come li restituisce ffprobe. */
export type Tags = Record<string, string | number>;

/** Stream (traccia) nella forma ffprobe. Serve almeno lo stream video. */
export interface ProbeStream {
  codec_type: 'video' | 'audio' | 'subtitle' | 'data' | string;
  codec_name?: string;
  profile?: string;
  width?: number | string;
  height?: number | string;
  sample_aspect_ratio?: string;
  display_aspect_ratio?: string;
  bit_rate?: number | string;
  avg_frame_rate?: string;
  tags?: Tags;
}

/** Sezione `format` (container) nella forma ffprobe. */
export interface ProbeFormat {
  bit_rate?: number | string;
  tags?: Tags;
}

/** Oggetto completo in forma ffprobe accettato da `classify()`. */
export interface Probe {
  format?: ProbeFormat;
  streams?: ProbeStream[];
}

/** Le tre classi di esito, identiche allo script Python. */
export type Classification =
  | 'PROBABILMENTE_RICODIFICATO'
  | 'SOSPETTO_RICODIFICA'
  | 'COMPATIBILE_CON_ORIGINALE';

/** Dettagli tecnici video riportati nel risultato. */
export interface ClassifyVideoInfo {
  codec: string;
  profile: string;
  width: number;
  height: number;
  sample_aspect_ratio: string;
  display_aspect_ratio: string;
  fps: number | null;
  bitrate_mbps: number;
}

/** Metadati di container riportati nel risultato. */
export interface ClassifyMetadataInfo {
  encoder: string;
  major_brand: string;
  compatible: string;
}

/** Risultato completo della predizione. */
export interface ClassifyResult {
  classification: Classification;
  score: number;
  video: ClassifyVideoInfo;
  metadata: ClassifyMetadataInfo;
  reasons: string[];
}

/**
 * Sottoinsieme dell'output di `mediainfo.js` che consumiamo in `normalize`.
 * (`mediainfo.js` restituisce molti piu' campi; qui tipizziamo solo i nostri.)
 */
export interface MediaInfoTrack {
  '@type': 'General' | 'Video' | 'Audio' | string;
  [field: string]: unknown;
}

export interface MediaInfoResult {
  media?: {
    track?: MediaInfoTrack[];
  };
}

/**
 * Firma minima della factory di `mediainfo.js` (`mediaInfoFactory`).
 * La tipizziamo qui per non dipendere staticamente dal pacchetto.
 */
export interface MediaInfoInstance {
  analyzeData(
    getSize: () => number | Promise<number>,
    readChunk: (chunkSize: number, offset: number) => Uint8Array | Promise<Uint8Array>,
  ): Promise<MediaInfoResult>;
  close(): void;
}

export type MediaInfoFactory = (
  options?: Record<string, unknown>,
) => Promise<MediaInfoInstance>;
