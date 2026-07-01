/**
 * normalize.ts
 * ------------
 * Traduce l'output di mediainfo.js (`result.media.track[]`) nella forma
 * "ffprobe-like" (`Probe`) attesa da `classify()`.
 *
 * Qui vengono gestiti i pochi GAP tra ffprobe (usato dallo script Python) e
 * mediainfo.js (usato nel browser):
 *
 *   - Aspect ratio: ffprobe fornisce stringhe tipo "16:9" / "1:1"; mediainfo
 *     fornisce decimali tipo "1.778" / "1.000". Qui li ri-convertiamo in
 *     stringhe rapporto approssimate.
 *   - Brand MP4: ffprobe li mette in format.tags.major_brand /
 *     compatible_brands; mediainfo li espone come General.CodecID /
 *     CodecID_Compatible.
 *   - make/model: mediainfo li colloca spesso in `track.extra` con chiavi
 *     sanitizzate (es. "com_apple_quicktime_make"): li riportiamo tra i tag.
 *   - Codec: mediainfo usa "AVC"/"HEVC"; ffprobe usa "h264"/"hevc".
 */

import type { MediaInfoResult, MediaInfoTrack, Probe, Tags } from './types.js';

/** Legge un campo stringa da una traccia in modo type-safe. */
function str(track: MediaInfoTrack | undefined, field: string): string {
  const v = track?.[field];
  return v == null ? '' : String(v);
}

/** Trova la prima traccia di un dato @type ("General", "Video", ...). */
function findTrack(
  tracks: MediaInfoTrack[],
  type: string,
): MediaInfoTrack | undefined {
  return tracks.find((t) => t['@type'] === type);
}

/** Mappa il nome Format di mediainfo sul codec_name di ffprobe. */
function normalizeCodecName(format: string): string {
  const f = format.toLowerCase();
  if (f === 'avc' || f === 'h264' || f.includes('avc')) return 'h264';
  if (f === 'hevc' || f === 'h265' || f.includes('hevc')) return 'hevc';
  return f;
}

/**
 * Converte un aspect ratio decimale (stringa mediainfo, es. "1.000") nella
 * forma rapporto usata da ffprobe. Deliberatamente conservativo: mira solo a
 * distinguere pixel quadrati ("1:1") da non quadrati e a riconoscere il 16:9,
 * che e' tutto cio' che la regola 4 di classify() controlla.
 *
 * @param value valore decimale (stringa o numero)
 * @param isDisplay true per il DAR (mappa ~1.778 -> "16:9")
 * @returns rapporto approssimato, o '' se non determinabile
 */
export function decimalAspectToRatio(
  value: string | number | undefined,
  isDisplay = false,
): string {
  const n = parseFloat(String(value));
  if (!Number.isFinite(n) || n <= 0) return '';

  // Pixel quadrati: SAR = 1.0 -> "1:1".
  if (Math.abs(n - 1) < 0.02) return '1:1';

  if (isDisplay) {
    if (Math.abs(n - 16 / 9) < 0.02) return '16:9';
    if (Math.abs(n - 4 / 3) < 0.02) return '4:3';
  }

  // Altrimenti: pixel NON quadrati. Il valore esatto non e' usato dallo
  // scoring, ma restituiamo un rapporto informativo diverso da "1:1".
  return `${n.toFixed(3)}:1`;
}

/** Estrae tutti i campi make/model/manufacturer dai campi standard + `extra`. */
function extractCameraTags(general: MediaInfoTrack | undefined): Tags {
  const tags: Tags = {};
  if (!general) return tags;

  // I campi non standard (incluso com.apple.quicktime.*) finiscono in `extra`,
  // con chiavi sanitizzate da mediainfo (punti/spazi -> underscore).
  const extra = (general.extra as Record<string, unknown> | undefined) ?? {};
  const sources: Record<string, unknown> = { ...general, ...extra };

  for (const [rawKey, value] of Object.entries(sources)) {
    if (value == null) continue;
    // Normalizza la chiave nella forma usata dallo script Python.
    const key = String(rawKey).toLowerCase().replace(/_/g, '.');

    if (key === 'make' || key.endsWith('.make') || key.endsWith('quicktime.make')) {
      tags['make'] = String(value);
      tags['com.apple.quicktime.make'] = String(value);
    }
    if (key === 'model' || key.endsWith('.model') || key.endsWith('quicktime.model')) {
      tags['model'] = String(value);
      tags['com.apple.quicktime.model'] = String(value);
    }
    if (key === 'manufacturer') tags['manufacturer'] = String(value);
    if (key.includes('com.android.version')) tags['com.android.version'] = String(value);
  }
  return tags;
}

/**
 * Converte l'output di mediainfo.js nella forma ffprobe-like consumata da classify().
 * @throws Se il file non contiene una traccia video.
 */
export function mediaInfoToProbe(mediaInfoResult: MediaInfoResult): Probe {
  const tracks = mediaInfoResult?.media?.track ?? [];
  const general = findTrack(tracks, 'General');
  const videoTrack = findTrack(tracks, 'Video');

  if (!videoTrack) {
    throw new Error('Il file non contiene una traccia video analizzabile.');
  }

  // --- Encoder / writing library / application ---
  const encoder =
    str(videoTrack, 'Encoded_Library_Name') ||
    str(videoTrack, 'Encoded_Library') ||
    str(general, 'Encoded_Library') ||
    str(general, 'Encoded_Application') ||
    '';

  // --- Brand MP4 (major + compatible) da CodecID / CodecID_Compatible ---
  const majorBrand = str(general, 'CodecID').trim();
  // CodecID_Compatible usa "/" come separatore in mediainfo. Li valutiamo
  // correttamente (separati da spazio), a differenza dello script Python che,
  // per un bug di split, di fatto non li controlla. Vedi README ("Divergenza
  // nota"): scelta consapevole di non replicare il bug.
  const compatible = str(general, 'CodecID_Compatible')
    .split('/')
    .map((b) => b.trim())
    .filter(Boolean)
    .join(' ');

  // --- Bitrate (bps). Video track, con fallback sull'overall del container. ---
  const bitRate =
    parseInt(str(videoTrack, 'BitRate'), 10) ||
    parseInt(str(videoTrack, 'BitRate_Nominal'), 10) ||
    0;
  const overallBitRate = parseInt(str(general, 'OverallBitRate'), 10) || 0;

  // --- FPS: mediainfo lo da' come float diretto; lo esprimiamo come "n/1"
  //     cosi' parseRatio() in classify.ts lo gestisce come farebbe con ffprobe. ---
  const frameRate = parseFloat(str(videoTrack, 'FrameRate'));
  const avgFrameRate = Number.isFinite(frameRate) ? `${frameRate}/1` : '0/0';

  const formatTags: Tags = {
    encoder,
    major_brand: majorBrand,
    compatible_brands: compatible,
    ...extractCameraTags(general),
  };

  return {
    format: {
      bit_rate: overallBitRate ? String(overallBitRate) : '',
      tags: formatTags,
    },
    streams: [
      {
        codec_type: 'video',
        codec_name: normalizeCodecName(str(videoTrack, 'Format')),
        profile: str(videoTrack, 'Format_Profile'),
        width: parseInt(str(videoTrack, 'Width'), 10) || 0,
        height: parseInt(str(videoTrack, 'Height'), 10) || 0,
        sample_aspect_ratio: decimalAspectToRatio(str(videoTrack, 'PixelAspectRatio'), false),
        display_aspect_ratio: decimalAspectToRatio(str(videoTrack, 'DisplayAspectRatio'), true),
        bit_rate: bitRate ? String(bitRate) : '',
        avg_frame_rate: avgFrameRate,
        tags: {},
      },
    ],
  };
}

export default mediaInfoToProbe;
