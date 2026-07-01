# video-sniffer-js

[![CI](https://github.com/simone-lopez-zupit/video-sniffer-js/actions/workflows/ci.yml/badge.svg)](https://github.com/simone-lopez-zupit/video-sniffer-js/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)

Predizione **client-side** (browser, WebAssembly) di video **originale da
fotocamera** vs. **ricodificato** (ffmpeg, editing, app di messaggistica…),
analizzandone i metadati — **senza alcun backend**.

Libreria **TypeScript framework-agnostica**: la logica di predizione è portata
1:1 dallo script Python di riferimento (`video_sniffer.py`) ed è usabile da
**Angular**, React o vanilla JS. Include un demo browser e un esempio di
integrazione Angular.

> ⚠️ È un'**euristica sui metadati**, non una prova forense. Segnala indizi di
> ricodifica, non certezze. Vedi §5.

---

## Installazione

```bash
npm i video-sniffer-js
# per l'analisi di file nel browser serve anche l'estrattore di metadati:
npm i mediainfo.js
```

`mediainfo.js` è una **peerDependency opzionale**: serve solo per la pipeline
`analyzeFile()` (File → metadati). La logica pura `classify()` non ha dipendenze.

---

## 1. Perché è fattibile (sintesi della valutazione)

Il porting si divide in due problemi indipendenti:

| Componente | Difficoltà nel browser | Esito |
|---|---|---|
| **Logica di scoring** (6 controlli + soglie) | Nessuna: pura aritmetica | ✅ Portata 1:1 in TS |
| **Estrazione metadati** (ruolo di `ffprobe`) | Il vero punto da valutare | ✅ Coperta da `mediainfo.js` (WASM) |

`mediainfo.js` (build WebAssembly di MediaInfoLib) è l'equivalente più fedele di
`ffprobe` in browser ed espone tutti i campi necessari: encoder/muxer, codec,
risoluzione, bitrate, fps, aspect ratio, brand MP4 e make/model. `MP4Box.js` da
solo non espone encoder/make-model; `ffmpeg.wasm` darebbe parità totale ma pesa
decine di MB (fallback teorico).

### Gap gestiti in `normalize.ts`

1. **Aspect ratio decimale** (`"1.778"`) → convertito in rapporto (`"16:9"`).
2. **make/model** in `track.extra` → rimappati alle chiavi attese.
3. **Brand MP4** in `CodecID` / `CodecID_Compatible` → rimappati a
   `major_brand` / `compatible_brands`.
4. **Nomi codec** `AVC`/`HEVC` → `h264`/`hevc`.

### Divergenza nota (voluta) rispetto allo script Python

Sulla regola **compatible_brands generici** il JS/TS può assegnare **+1 punto in
più** del Python: `ffprobe` restituisce i brand concatenati senza separatori
(`"isommp41mp42"`) e lo script Python, facendo `split()` sugli spazi, di fatto
non li valuta mai (bug latente). Questa libreria li valuta **correttamente**.
Scelta consapevole: la reference non replica il bug. Effetto pratico: la
classificazione coincide quasi sempre; la differenza può contare solo per
punteggi al confine di soglia (3↔4 o 7↔8).

---

## 2. Uso della libreria

### a) Logica pura — nessuna dipendenza

`classify()` accetta un oggetto con la **stessa forma dell'output di ffprobe**
(`{ format, streams }`): verificabile 1:1 col Python e riusabile anche lato
server passando direttamente il JSON di ffprobe.

```ts
import { classify, isRecodedOrSuspect, type Probe } from 'video-sniffer-js';

const probe: Probe = {
  format: { bit_rate: '2000000', tags: { encoder: 'Lavf58.76.100', major_brand: 'isom' } },
  streams: [{
    codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080,
    bit_rate: '2000000', avg_frame_rate: '25/1',
    sample_aspect_ratio: '1:1', display_aspect_ratio: '16:9',
  }],
};

const result = classify(probe);
// result.classification -> 'PROBABILMENTE_RICODIFICATO'
// result.score, result.reasons, result.video, result.metadata

isRecodedOrSuspect(probe); // boolean (equivalente del flag --boolean del Python)
```

### b) Analisi end-to-end nel browser (con `mediainfo.js`)

```ts
import mediaInfoFactory from 'mediainfo.js';
import { analyzeFile } from 'video-sniffer-js';

const { result, probe } = await analyzeFile(file, mediaInfoFactory, {
  locateFile: (path) => `/assets/mediainfo/${path}`, // dove trovare il .wasm
});
console.log(result.classification, result.score, result.reasons);
```

### API esportata

| Funzione | Descrizione |
|---|---|
| `classify(probe)` | Logica pura → risultato completo. |
| `isRecodedOrSuspect(probe)` | Booleano: `true` se sospetto/ricodificato. |
| `analyzeFile(file, factory, opts?)` | Pipeline browser: `File` → mediainfo → predizione. |
| `mediaInfoToProbe(result)` | Adatta l'output di `mediainfo.js` alla forma ffprobe. |
| `extractProbe(file, mediainfo)` | Legge un `File` con un'istanza mediainfo già creata. |
| `decimalAspectToRatio(v, isDisplay?)` | Helper aspect ratio decimale → rapporto. |
| Costanti | `SUSPICIOUS_ENCODERS`, `GENERIC_BRANDS`, `THRESHOLD_RECODED`, `THRESHOLD_SUSPECT` |

Tutti i tipi (`Probe`, `ClassifyResult`, …) sono esportati.

---

## 3. Integrazione Angular (client-side)

Esempio completo in [`examples/angular/`](examples/angular/).

1. Installa: `npm i video-sniffer-js mediainfo.js`
2. **Copia il WASM come asset statico** (il punto critico). In `angular.json`,
   sotto `architect.build.options.assets`:
   ```jsonc
   {
     "glob": "*.wasm",
     "input": "node_modules/mediainfo.js/dist",
     "output": "assets/mediainfo"
   }
   ```
3. Usa un service con `locateFile` che punta a quell'asset (vedi
   [`video-sniffer.service.ts`](examples/angular/video-sniffer.service.ts)).

**SSR (Angular Universal):** `FileReader`/WASM sono solo-browser → esegui
l'analisi solo lato client (guardia `isPlatformBrowser`, già presente nel
service d'esempio). Ricopia il `.wasm` a ogni upgrade di `mediainfo.js`.

---

## 4. Demo standalone

[`demo/index.html`](demo/index.html): pagina che carica un video (drag & drop) e
mostra classificazione, punteggio e motivazioni, usando la libreria buildata.

```bash
npm install
npm run build      # genera dist/ (il demo importa da ../dist/index.js)
npx serve .        # o: python -m http.server
# apri http://localhost:3000/demo/
```

Va servito via HTTP (i moduli ES + WASM non funzionano su `file://`).

---

## 5. Sviluppo

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (test di parità con lo script Python)
npm run build       # tsup -> dist/ (ESM + CJS + .d.ts)
```

Struttura:

```
video-sniffer-js/
├── src/
│   ├── types.ts        # tipi pubblici (Probe, ClassifyResult, …)
│   ├── classify.ts     # porting fedele della logica Python (puro, no deps)
│   ├── normalize.ts    # mediainfo.js -> forma ffprobe (gestisce i gap)
│   ├── extract.ts      # adapter browser: File -> metadati (mediainfo.js)
│   └── index.ts        # API pubblica + analyzeFile()
├── examples/angular/   # service + component d'esempio per Angular
├── demo/index.html     # demo standalone
├── test/               # vitest (parità con lo script Python)
└── ...                 # tsup, tsconfig, CI, ecc.
```

---

## 6. Affidabilità e limiti

- **Cosa fa bene:** rileva ricompressioni di app di messaggistica (Telegram,
  WhatsApp) ed export da editor/ffmpeg; metadati fotocamera assenti; bitrate
  troppo basso per la risoluzione.
- **Falsi positivi:** telefoni economici che girano davvero a bassa
  risoluzione/bitrate e non scrivono make/model, screen recording, riprese con
  impostazioni basse.
- **Falsi negativi:** una ri-codifica curata (bitrate alto + metadati
  falsificati) passa liscia. I metadati si strippano e si falsificano facilmente.
- Le soglie sono **tarate a mano** sull'idea di "smartphone moderno": dashcam,
  action-cam, telefoni vecchi possono essere mal classificati.

Usala come **primo filtro / indicatore di sospetto**, non come prova di
autenticità.

## Fuori scope (come da storia originale)

- Integrazione in un prodotto / flusso di produzione.
- Modifiche alla logica dello script Python originale.
- Benchmark sistematici / performance su larga scala.
