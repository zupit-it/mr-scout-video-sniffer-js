/**
 * Test di parita' con lo script Python (eseguiti con vitest).
 * Verifica che classify() produca gli score/classificazioni attesi su casi noti.
 */
import { describe, it, expect } from 'vitest';
import { classify, isRecodedOrSuspect } from '../src/index.js';
import { mediaInfoToProbe, decimalAspectToRatio } from '../src/normalize.js';
import type { Probe } from '../src/index.js';

describe('classify', () => {
  it('originale iPhone 1080p H.264 -> COMPATIBILE (0)', () => {
    const probe: Probe = {
      format: {
        bit_rate: '17000000',
        tags: {
          major_brand: 'qt  ',
          'com.apple.quicktime.make': 'Apple',
          'com.apple.quicktime.model': 'iPhone 14',
        },
      },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          profile: 'High',
          width: 1920,
          height: 1080,
          sample_aspect_ratio: '1:1',
          display_aspect_ratio: '16:9',
          bit_rate: '17000000',
          avg_frame_rate: '30/1',
        },
      ],
    };
    const r = classify(probe);
    expect(r.score).toBe(0);
    expect(r.classification).toBe('COMPATIBILE_CON_ORIGINALE');
    expect(isRecodedOrSuspect(probe)).toBe(false);
  });

  it('ffmpeg 1080p H.264 low-bitrate senza make/model -> RICODIFICATO', () => {
    const probe: Probe = {
      format: {
        bit_rate: '2000000',
        tags: { encoder: 'Lavf58.76.100', major_brand: 'isom', compatible_brands: 'isom mp42' },
      },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          profile: 'Main',
          width: 1920,
          height: 1080,
          sample_aspect_ratio: '1:1',
          display_aspect_ratio: '16:9',
          bit_rate: '2000000',
          avg_frame_rate: '25/1',
        },
      ],
    };
    const r = classify(probe);
    // +4 encoder +1 major_brand +1 compatible +4 bitrate<5 +2 fps<27 +1 no-camera = 13
    expect(r.score).toBe(13);
    expect(r.classification).toBe('PROBABILMENTE_RICODIFICATO');
  });

  it('encoder sospetto ma resto ok -> SOSPETTO (>=4)', () => {
    const probe: Probe = {
      format: { bit_rate: '20000000', tags: { encoder: 'x264', 'com.apple.quicktime.make': 'Apple' } },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          profile: 'High',
          width: 1920,
          height: 1080,
          sample_aspect_ratio: '1:1',
          display_aspect_ratio: '16:9',
          bit_rate: '20000000',
          avg_frame_rate: '30/1',
        },
      ],
    };
    const r = classify(probe);
    expect(r.score).toBe(4); // solo +4 encoder
    expect(r.classification).toBe('SOSPETTO_RICODIFICA');
  });

  it('caso reale: video Telegram 720p (h264, 3.05 Mbps, no make/model) -> SOSPETTO (4)', () => {
    // Metadati reali di IMG_0551.mov (copia Telegram di un originale iPhone).
    const probe: Probe = {
      format: {
        bit_rate: '3118532',
        tags: { major_brand: 'mp42', compatible_brands: 'isommp41mp42' },
      },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'h264',
          profile: 'High',
          width: 1280,
          height: 720,
          bit_rate: '3050246',
          avg_frame_rate: '75450/2513',
        },
      ],
    };
    const r = classify(probe);
    // +1 major_brand(mp42) +2 bitrate<4 720p +1 no-camera = 4. compatible "isommp41mp42"
    // e' un unico token (senza spazi come da ffprobe) -> regola compatible NON scatta.
    expect(r.score).toBe(4);
    expect(r.classification).toBe('SOSPETTO_RICODIFICA');
  });
});

describe('mediaInfoToProbe', () => {
  it('mappa correttamente i campi mediainfo.js', () => {
    const probe = mediaInfoToProbe({
      media: {
        track: [
          {
            '@type': 'General',
            CodecID: 'isom',
            CodecID_Compatible: 'isom/iso2/avc1/mp41',
            Encoded_Application: 'Lavf60.16.100',
          },
          {
            '@type': 'Video',
            Format: 'AVC',
            Format_Profile: 'High@L4',
            Width: '1920',
            Height: '1080',
            BitRate: '3000000',
            FrameRate: '25.000',
            PixelAspectRatio: '1.000',
            DisplayAspectRatio: '1.778',
          },
        ],
      },
    });
    expect(probe.streams![0].codec_name).toBe('h264');
    expect(probe.streams![0].sample_aspect_ratio).toBe('1:1');
    expect(probe.streams![0].display_aspect_ratio).toBe('16:9');
    // I compatible_brands sono valutati correttamente (separati da spazio).
    expect(probe.format!.tags!.compatible_brands).toBe('isom iso2 avc1 mp41');

    const r = classify(probe);
    // +4 encoder +1 major_brand +1 compatible(tutti generici) +4 bitrate<5 +2 fps<27 +1 no-camera = 13
    expect(r.score).toBe(13);
  });
});

describe('decimalAspectToRatio', () => {
  it('riconosce pixel quadrati e rapporti comuni', () => {
    expect(decimalAspectToRatio('1.000')).toBe('1:1');
    expect(decimalAspectToRatio('1.778', true)).toBe('16:9');
    expect(decimalAspectToRatio('1.333', true)).toBe('4:3');
    expect(decimalAspectToRatio('', true)).toBe('');
  });
});
