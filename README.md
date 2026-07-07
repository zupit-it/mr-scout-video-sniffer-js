# @zupit-it/mr-scout-video-sniffer-js

[![CI](https://github.com/zupit-it/mr-scout-video-sniffer-js/actions/workflows/ci.yml/badge.svg)](https://github.com/zupit-it/mr-scout-video-sniffer-js/actions/workflows/ci.yml)

Dice se un video è **originale da fotocamera** o è stato **ricodificato**
(WhatsApp, Telegram, ffmpeg, editor…), analizzandone i metadati **nel browser**.
Nessun backend.

> È un'euristica sui metadati: un indicatore di sospetto, non una prova.

## Installazione

Create o aggiornate `.npmrc` nel progetto consumer:

```ini
@zupit-it:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

```bash
npm i @zupit-it/mr-scout-video-sniffer-js
```

## Uso

```ts
import { analyzeFile } from '@zupit-it/mr-scout-video-sniffer-js';

// file: un File preso da <input type="file"> o drag & drop
const { result } = await analyzeFile(file);

result.classification; // 'COMPATIBILE_CON_ORIGINALE' | 'SOSPETTO_RICODIFICA' | 'PROBABILMENTE_RICODIFICATO'
result.score;          // number
result.reasons;        // string[] — perché
```

Funziona così com'è: il motore `.wasm` viene scaricato da CDN. Il **video non
lascia mai il browser**, si scarica solo il wasm (statico, pubblico).

## API

| | |
|---|---|
| `analyzeFile(file, options?)` | Analisi completa nel browser → `{ result, probe }`. |
| `isRecodedOrSuspect(probe)` | `true` se sospetto/ricodificato. |
| `classify(probe)` | Solo scoring, se i metadati li hai già (es. JSON di ffprobe lato server). |
