# 0002 – Serverseitiges Rendering mit React Router (Framework-Modus)

- Status: Akzeptiert; gilt erst als **validiert**, wenn die 6 Kriterien aus AP 0.4 automatisiert grün sind
- Datum: 2026-11-12

## Kontext

Öffentliche Projekt- und Kampagnenseiten sollen über Suchmaschinen auffindbar sein und beim Teilen Link-Vorschauen zeigen. So wurde es in der Planung entschieden. Google empfiehlt serverseitiges Rendering, statisches Rendering oder Hydration und bezeichnet Dynamic Rendering nur als Workaround. Nicht alle Bots führen JavaScript aus.

## Entscheidung

- React Router im Framework-Modus mit `ssr: true` (Vite-basiert, React und TypeScript).
- Ein Node-24-SSR-Server rendert die Seiten und holt die Daten über die Django-API.
- Gleicher Origin hinter einem Reverse Proxy; Django bleibt die einzige Quelle für Daten und Berechtigungen.
- Experimentelle Funktionen (RSC, `unstable_*`) werden nicht genutzt.

## Alternativen

- **Django-Templates für öffentliche Seiten und eine React-SPA für den Rest:** kein Node im Betrieb, aber zwei getrennte Darstellungen mit doppelter Pflege.
- **Next.js:** weicht vom vorgegebenen Vite-Stack ab und bindet stärker an ein Framework.
- **Reine SPA:** schlechte Auffindbarkeit und schlechte Link-Vorschauen.

## Konsequenzen

- Ein zusätzlicher Node-Dienst im Betrieb.
- Kritische Punkte sind Cookie- und `Set-Cookie`-Weitergabe, CSRF, geschützte SSR-Seiten und Cache-Header. Sie werden in AP 0.4 mit 6 automatisierten Kriterien geprüft.
- Schlägt die Validierung fehl, wird gestoppt und eine Alternative zur Entscheidung vorgelegt.

## Quellen

- [Google: JavaScript-SEO-Grundlagen](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: Dynamic Rendering als Workaround](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)
- [React Router: Rendering-Strategien](https://reactrouter.com/start/framework/rendering)
- [React Router: `react-router.config.ts`](https://reactrouter.com/api/framework-conventions/react-router.config.ts)
- npm-Registry, abgefragt am 2026-11-12: `react-router` 8.5.1 verlangt Node >= 22.22.0; `@react-router/dev` 8.5.1 akzeptiert Vite ^7 oder ^8 und TypeScript ^5, ^6 oder ^7.
