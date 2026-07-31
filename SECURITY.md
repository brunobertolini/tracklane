# Security Policy

## Supported versions

Only the latest published minor version receives security fixes.

## Reporting a vulnerability

Report privately through
[GitHub Security Advisories](https://github.com/brunobertolini/tracklane/security/advisories/new).
Please do not open a public issue.

Expect an acknowledgement within 7 days. Once a fix is released, the advisory is
published with credit unless you prefer otherwise.

## Supply chain

Releases are published from GitHub Actions using npm trusted publishing (OIDC) —
no long-lived npm tokens exist for this project. Every published version carries
provenance attestation, verifiable with:

```bash
npm audit signatures
```
