# 0005 – TypeScript 6.0 statt 7.0

- Status: Akzeptiert
- Datum: 2026-11-12

## Kontext

Am 2026-11-12 ist TypeScript 7.0.2 die neueste Version (`latest`). Das Linting-Paket `typescript-eslint` 8.72.2 deklariert als Peer-Abhängigkeit aber `typescript >=4.8.4 <6.1.0`. Die neueste unterstützte Version ist TypeScript 6.0.3.

## Entscheidung

- TypeScript **6.0.x**, fixiert per Lockfile.
- Gewechselt wird erst, wenn `typescript-eslint` TypeScript 7 offiziell unterstützt.

## Alternativen

- **TypeScript 7 ohne typed linting:** Wichtige Sicherheits- und Qualitätsregeln würden fehlen.
- **TypeScript 7 mit erzwungener Peer-Abhängigkeit:** nicht unterstützt und damit unvorhersehbar.

## Konsequenzen

- Verbesserungen aus TypeScript 7 fehlen vorerst.
- Ein Wechsel wird regelmässig geprüft (siehe [`OPEN-QUESTIONS.md`](../OPEN-QUESTIONS.md)).

## Quellen

- npm-Registry, abgefragt am 2026-11-12: [typescript](https://www.npmjs.com/package/typescript), [typescript-eslint](https://www.npmjs.com/package/typescript-eslint).
