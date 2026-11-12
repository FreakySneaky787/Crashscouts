# 0014 – Licence catalog from the SPDX License List

- Status: Accepted
- Date: 2026-11-12

## Context

Projects name their licence; the platform labels them "open source" or not automatically (PRD,
section 3). Users must pick from a well-defined list instead of typing free text.

## Decision

1. The licence table is filled from the **official SPDX License List**, release **3.29.0**
   (2026-09-16), file `json/licenses.json` of the repository `spdx/license-list-data`. Only
   non-deprecated licences are taken (708), and only identifier, name and the OSI-approval flag
   (no licence texts). The trimmed data lives in `backend/apps/catalog/data/spdx-licenses.json`
   with its source and version.
2. **"Open source" means OSI-approved** (141 of the 708). Source-available licences such as
   BUSL-1.1 or SSPL-1.0 are therefore labelled as not open source.
3. Closed-source software uses `LicenseRef-Proprietary` (SPDX syntax for licences that are not on
   the list).
4. Updates: replace the data file with a newer release and run
   `manage.py sync_spdx_licenses` (insert or update; existing references stay intact).
5. Programming languages are a curated fixed list like the other catalogs (editable by staff).

## Consequences

- The open-source label is derived, never entered by hand.
- Legal note: neither SPDX repository states a licence for the list data in a file; we only use
  factual data (identifiers, names, a flag). To be confirmed in the legal review before the beta.

## Sources

- SPDX License List data, tag v3.29.0: https://github.com/spdx/license-list-data
- SPDX License List: https://spdx.org/licenses/
- SPDX `LicenseRef-` identifiers: https://spdx.github.io/spdx-spec/v2.3/other-licensing-information-detected/
