# 0005 – TypeScript 6.0 instead of 7.0

- Status: Accepted
- Date: 2026-11-12

## Context

On 2026-11-12, TypeScript 7.0.2 is the latest version (`latest`). The linting package
`typescript-eslint` 8.72.2, however, declares the peer dependency `typescript >=4.8.4 <6.1.0`.
The newest supported version is TypeScript 6.0.3.

## Decision

- TypeScript **6.0.x**, pinned via the lockfile (`~6.0.3`).
- Switch only once `typescript-eslint` officially supports TypeScript 7.

## Alternatives

- **TypeScript 7 without typed linting:** important security and quality rules would be missing.
- **TypeScript 7 with a forced peer dependency:** unsupported and therefore unpredictable.

## Consequences

- Improvements from TypeScript 7 are not available for now.
- A switch is checked regularly (see [`OPEN-QUESTIONS.md`](../OPEN-QUESTIONS.md)).

## Sources

- npm registry, queried on 2026-11-12: [typescript](https://www.npmjs.com/package/typescript),
  [typescript-eslint](https://www.npmjs.com/package/typescript-eslint).
