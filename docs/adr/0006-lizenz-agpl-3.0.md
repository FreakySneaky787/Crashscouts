# 0006 – Lizenz AGPL-3.0

- Status: Akzeptiert; **vor dem Öffentlichschalten erneut kritisch prüfen** (Vorgabe aus dem Master-Prompt)
- Datum: 2026-11-12

## Kontext

Die Plattform soll Open Source sein. Der Master-Prompt nennt AGPL-3.0 als bevorzugte Lizenz. Die Plattform wird als Netzwerkdienst betrieben.

## Entscheidung

- AGPL-3.0 (SPDX-Kennung `AGPL-3.0-only`). Die Wahl zwischen `-only` und `-or-later` wird vor dem Öffentlichschalten bestätigt.
- Der Volltext in `LICENSE` stammt aus GitHubs Lizenzvorlage (choosealicense.com) und ist gegen die SPDX-Lizenzliste geprüft. Einziger Unterschied: `https` statt `http` in drei URLs der Free Software Foundation.

## Begründung

- Die Netzwerkklausel (Abschnitt 13) verpflichtet jeden, der eine veränderte Version als Dienst betreibt, den Quellcode offenzulegen. Das schützt den Open-Source-Charakter auch bei gehosteten Kopien.

## Alternativen

- **GPL-3.0:** ohne Netzwerkklausel; gehostete Abwandlungen müssten nicht offengelegt werden.
- **MIT oder Apache-2.0:** sehr offen, erlauben aber geschlossene, gehostete Abwandlungen.

## Konsequenzen

- Die gehostete Plattform muss einen Link zum Quellcode bieten (Footer).
- Alle Abhängigkeiten müssen AGPL-kompatibel sein. Bisher geprüft: Django, DRF, Celery (BSD-3-Clause), django-allauth (MIT), psycopg (LGPL-3.0-only), django-tasks-db (BSD-3-Clause).
- Einige Firmen meiden AGPL-Software. Das kann Beiträge aus Unternehmen reduzieren; das wird bewusst in Kauf genommen.
- Das Beitragsmodell (DCO oder CLA) ist noch offen (offene Frage G).

## Quellen

- [choosealicense.com: AGPL-3.0](https://choosealicense.com/licenses/agpl-3.0/)
- [SPDX License List: AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html)
- PyPI-Metadaten der genannten Pakete, abgefragt am 2026-11-12.
