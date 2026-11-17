# Security Policy

## Reporting a vulnerability

Please do **not** report vulnerabilities through public issues, discussions or pull requests.

- **Preferred:** GitHub's private vulnerability reporting: the "Security" tab of this repository →
  "Report a vulnerability".
- **Alternatively:** email `contact@crashscouts.org` with "Security" in the subject.

Please include what you found, how to reproduce it and what an attacker could do with it. You get
an answer within 7 days. Fixes follow the time frames in
[`docs/SECURITY.md`](docs/SECURITY.md) §10: critical 7 days, high 14, moderate 60, low 180.
We credit reporters in the fix unless you prefer otherwise.

Please test only against your own installation or your own accounts on crashscouts.org, never
against other people's data, and do not run load or denial-of-service tests against the live
service.

## Supported versions

Crashscouts is in a closed beta. Only the latest state of `main`, which runs on
[crashscouts.org](https://crashscouts.org), is supported.

## Security concept

The technical security concept is described in [`docs/SECURITY.md`](docs/SECURITY.md); the OWASP
ASVS level 1 review is in [`docs/ASVS-L1-REVIEW.md`](docs/ASVS-L1-REVIEW.md).
