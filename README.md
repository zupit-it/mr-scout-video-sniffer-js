# video-sniffer-js

[![CI](https://github.com/simone-lopez-zupit/video-sniffer-js/actions/workflows/ci.yml/badge.svg)](https://github.com/simone-lopez-zupit/video-sniffer-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/video-sniffer-js.svg)](https://www.npmjs.com/package/video-sniffer-js)

Dice se un video è **originale da fotocamera** o è stato **ricodificato**
(WhatsApp, Telegram, ffmpeg, editor…), analizzandone i metadati **nel browser**.
Nessun backend.

> È un'euristica sui metadati: un indicatore di sospetto, non una prova.

## Installazione

```bash
npm i video-sniffer-js
```

## Uso

```ts
import { analyzeFile } from 'video-sniffer-js';

// file: un File preso da <input type="file"> o drag & drop
const { result } = await analyzeFile(file);

result.classification; // 'COMPATIBILE_CON_ORIGINALE' | 'SOSPETTO_RICODIFICA' | 'PROBABILMENTE_RICODIFICATO'
result.score;          // number
result.reasons;        // string[] — perché
```

### Un passo di setup: il file WASM

L'analisi usa un file `.wasm`. Il bundler deve servirlo come asset statico e tu
indichi dove si trova con `locateFile`.

**Angular** — in `angular.json`, sotto `architect.build.options.assets`:

```jsonc
{ "glob": "*.wasm", "input": "node_modules/mediainfo.js/dist", "output": "assets/mediainfo" }
```

```ts
const { result } = await analyzeFile(file, {
  locateFile: (path) => `/assets/mediainfo/${path}`,
});
```

## API

| | |
|---|---|
| `analyzeFile(file, options?)` | Analisi completa nel browser → `{ result, probe }`. |
| `isRecodedOrSuspect(probe)` | `true` se sospetto/ricodificato. |
| `classify(probe)` | Solo scoring, se i metadati li hai già (es. JSON di ffprobe lato server). |

MIT
