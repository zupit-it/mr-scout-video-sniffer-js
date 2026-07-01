/**
 * classify.ts
 * -----------
 * Porting fedele in TypeScript della logica di predizione di `video_sniffer.py`.
 *
 * Questa funzione NON accede a file, WASM o browser: e' pura logica di scoring.
 * Prende in input un oggetto con la stessa forma dell'output di `ffprobe`
 * (`{ format, streams }`) e restituisce la stessa struttura di risultato dello
 * script Python. Cosi' il porting e' verificabile 1:1 con l'originale e la
 * funzione e' riutilizzabile anche lato server (passandole direttamente il JSON
 * di ffprobe).
 *
 * Il layer che estrae i metadati dal file nel browser (mediainfo.js) e li
 * traduce in questa forma vive in `normalize.ts` / `extract.ts`.
 */

import type {
  Probe,
  ProbeStream,
  Tags,
  ClassifyResult,
  Classification,
} from './types.js';

// Encoder / muxer / software di editing che indicano una ri-codifica.
// Se una qualsiasi di queste stringhe compare nei metadati, il video non
// proviene "grezzo" dalla fotocamera.
export const SUSPICIOUS_ENCODERS: readonly string[] = [
  'lavf', // libavformat (ffmpeg muxer)
  'lavc', // libavcodec (ffmpeg encoder)
  'ffmpeg',
  'x264', // encoder H.264 software
  'x265', // encoder HEVC software
  'handbrake',
  'adobe',
  'premiere',
  'resolve',
  'davinci',
  'capcut',
  'openshot',
  'shotcut',
  'kdenlive',
  'imovie',
];

// Brand MP4 "generici": tipici di un file rimuxato/generato da tool, non dei
// brand proprietari che gli smartphone scrivono (es. Apple usa "qt  ").
export const GENERIC_BRANDS: readonly string[] = ['isom', 'mp41', 'mp42', 'iso2', 'avc1'];

// Soglie di classificazione finale (identiche allo script Python).
export const THRESHOLD_RECODED = 8; // score >= 8  -> PROBABILMENTE_RICODIFICATO
export const THRESHOLD_SUSPECT = 4; // score >= 4  -> SOSPETTO_RICODIFICA

/**
 * Converte una stringa "a/b" (es. "30000/1001") nel corrispondente float.
 * Ritorna null se il valore non e' parsabile. Equivalente di parse_ratio() in Python.
 */
export function parseRatio(value: string | undefined): number | null {
  try {
    const [a, b] = String(value).split('/');
    const ratio = parseFloat(a) / parseFloat(b);
    return Number.isFinite(ratio) ? ratio : null;
  } catch {
    return null;
  }
}

// Converte un oggetto di tag {Key: value} in {chiave_minuscola: "valore_stringa"},
// come fa lo script Python con format_tags / stream_tags.
function lowerCaseStringTags(tags: Tags | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags ?? {})) {
    out[k.toLowerCase()] = String(v);
  }
  return out;
}

/**
 * Analizza i metadati di un video e ne predice l'origine
 * (originale da fotocamera vs. ri-codificato).
 *
 * @param probe Oggetto con la forma dell'output di ffprobe (`{ format, streams }`).
 * @returns Classificazione, punteggio, dettagli tecnici e motivazioni.
 * @throws Se non e' presente alcuno stream video.
 */
export function classify(probe: Probe): ClassifyResult {
  const fmt = probe.format ?? {};
  const streams = probe.streams ?? [];

  const video: ProbeStream | undefined = streams.find((s) => s.codec_type === 'video');
  if (!video) {
    throw new Error('Nessuno stream video trovato nei metadati.');
  }

  let score = 0;
  const reasons: string[] = [];

  const codec = String(video.codec_name ?? '').toLowerCase();
  const profile = video.profile ?? '';
  const width = parseInt(String(video.width ?? 0), 10) || 0;
  const height = parseInt(String(video.height ?? 0), 10) || 0;
  const sampleAspectRatio = video.sample_aspect_ratio ?? '';
  const displayAspectRatio = video.display_aspect_ratio ?? '';

  // bit_rate dello stream video, con fallback sul bit_rate di formato.
  const bitrate = parseInt(String(video.bit_rate ?? fmt.bit_rate ?? 0), 10) || 0;
  const bitrateMbps = bitrate / 1_000_000;

  const fps = parseRatio(video.avg_frame_rate ?? '0/0');

  const formatTags = lowerCaseStringTags(fmt.tags);
  const streamTags = lowerCaseStringTags(video.tags);

  const encoder = formatTags.encoder || streamTags.encoder || '';

  // Blob unico con tutti i valori dei tag, per la ricerca di encoder sospetti.
  const allMetadata = (
    Object.values(formatTags).join(' ') +
    ' ' +
    Object.values(streamTags).join(' ')
  ).toLowerCase();

  const majorBrand = (formatTags.major_brand || '').toLowerCase();
  const compatible = (formatTags.compatible_brands || '').toLowerCase();

  //
  // 1. Encoder / muxer sospetto
  //
  if (SUSPICIOUS_ENCODERS.some((x) => allMetadata.includes(x))) {
    score += 4;
    reasons.push(`Encoder/muxer sospetto: ${encoder}`);
  }

  //
  // 2. Brand MP4 generici
  //
  if (GENERIC_BRANDS.includes(majorBrand)) {
    score += 1;
    reasons.push(`major_brand generico (${majorBrand})`);
  }

  if (compatible) {
    const brands = compatible.split(/\s+/).filter(Boolean);
    if (brands.length && brands.every((b) => GENERIC_BRANDS.includes(b))) {
      score += 1;
      reasons.push(`compatible_brands generici (${compatible})`);
    }
  }

  //
  // 3. Bitrate troppo basso per la risoluzione (segno di ricompressione)
  //
  if (codec === 'h264') {
    // 1080p
    if (width >= 1900 && height >= 1000) {
      if (bitrateMbps < 5) {
        score += 4;
        reasons.push(`Bitrate molto basso per 1080p H.264 (${bitrateMbps.toFixed(2)} Mbps)`);
      } else if (bitrateMbps < 8) {
        score += 2;
        reasons.push(`Bitrate basso per 1080p H.264 (${bitrateMbps.toFixed(2)} Mbps)`);
      }
      // 720p
    } else if (width >= 1200 && height >= 700) {
      if (bitrateMbps < 2.5) {
        score += 4;
        reasons.push(`Bitrate molto basso per 720p H.264 (${bitrateMbps.toFixed(2)} Mbps)`);
      } else if (bitrateMbps < 4) {
        score += 2;
        reasons.push(`Bitrate basso per 720p H.264 (${bitrateMbps.toFixed(2)} Mbps)`);
      }
    }
  } else if (codec === 'hevc' || codec === 'h265') {
    // 1080p
    if (width >= 1900 && height >= 1000) {
      if (bitrateMbps < 3) {
        score += 3;
        reasons.push(`Bitrate molto basso per 1080p HEVC (${bitrateMbps.toFixed(2)} Mbps)`);
      } else if (bitrateMbps < 5) {
        score += 1;
        reasons.push(`Bitrate basso per 1080p HEVC (${bitrateMbps.toFixed(2)} Mbps)`);
      }
      // 720p
    } else if (width >= 1200 && height >= 700) {
      if (bitrateMbps < 1.5) {
        score += 3;
        reasons.push(`Bitrate molto basso per 720p HEVC (${bitrateMbps.toFixed(2)} Mbps)`);
      } else if (bitrateMbps < 2.5) {
        score += 1;
        reasons.push(`Bitrate basso per 720p HEVC (${bitrateMbps.toFixed(2)} Mbps)`);
      }
    }
  }

  //
  // 4. Risoluzione / aspect ratio anomali per uno smartphone
  //
  const isAnamorphicSD =
    ((width === 720 && height === 576) || (width === 720 && height === 480)) &&
    displayAspectRatio === '16:9' &&
    sampleAspectRatio !== '' &&
    sampleAspectRatio !== '1:1';

  if (isAnamorphicSD) {
    score += 2;
    reasons.push(
      `Risoluzione SD anamorfica non tipica da smartphone (${width}x${height}, SAR ${sampleAspectRatio}, DAR ${displayAspectRatio})`,
    );
  } else if (
    width <= 720 &&
    height <= 576 &&
    sampleAspectRatio !== '' &&
    sampleAspectRatio !== '1:1'
  ) {
    score += 1;
    reasons.push(
      `Risoluzione SD con pixel non quadrati non tipica da smartphone (${width}x${height}, SAR ${sampleAspectRatio})`,
    );
  }

  if (Math.max(width, height) < 1280 || Math.min(width, height) < 720) {
    score += 1;
    reasons.push(
      `Risoluzione inferiore a 720p, sospetta per un originale smartphone moderno (${width}x${height})`,
    );
  }

  //
  // 5. Frame rate medio anomalo
  //
  if (fps !== null) {
    if (fps < 27) {
      score += 2;
      reasons.push(`Frame rate medio anomalo (${fps.toFixed(2)} fps)`);
    } else if (fps < 29) {
      score += 1;
      reasons.push(`Frame rate medio leggermente basso (${fps.toFixed(2)} fps)`);
    }
  }

  //
  // 6. Assenza di metadati riconducibili alla fotocamera (make/model)
  //
  const smartphoneKeys = [
    'make',
    'model',
    'manufacturer',
    'com.apple.quicktime.make',
    'com.apple.quicktime.model',
    'com.android.version',
  ];

  const hasCameraMetadata = smartphoneKeys.some(
    (k) => k in formatTags || k in streamTags,
  );

  if (!hasCameraMetadata) {
    score += 1;
    reasons.push('Assenti metadati riconducibili alla fotocamera');
  }

  //
  // Classificazione finale
  //
  let classification: Classification;
  if (score >= THRESHOLD_RECODED) {
    classification = 'PROBABILMENTE_RICODIFICATO';
  } else if (score >= THRESHOLD_SUSPECT) {
    classification = 'SOSPETTO_RICODIFICA';
  } else {
    classification = 'COMPATIBILE_CON_ORIGINALE';
  }

  return {
    classification,
    score,
    video: {
      codec,
      profile,
      width,
      height,
      sample_aspect_ratio: sampleAspectRatio,
      display_aspect_ratio: displayAspectRatio,
      fps,
      bitrate_mbps: bitrateMbps,
    },
    metadata: {
      encoder,
      major_brand: majorBrand,
      compatible,
    },
    reasons,
  };
}

/**
 * Scorciatoia booleana equivalente al flag `--boolean` dello script Python:
 * true se il video e' sospetto/ricodificato, false se compatibile con l'originale.
 */
export function isRecodedOrSuspect(probe: Probe): boolean {
  return classify(probe).classification !== 'COMPATIBILE_CON_ORIGINALE';
}

export default classify;
