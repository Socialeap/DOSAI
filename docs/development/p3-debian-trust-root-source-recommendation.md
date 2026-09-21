# P3 Debian 13 trust-root source recommendation

Recorded 2026-09-21. Contributor: unclassified assistant; no specialized role.
**This is a source-selection recommendation only. It retrieves, imports, or
trusts no key material and grants no network or builder authority.**

## Recommendation

Use the three directly published Debian 13 public certificates required by the
accepted snapshot declaration:

- `archive-key-13.asc` for `debian` and `trixie-updates`;
- `archive-key-13-security.asc` for `debian-security`; and
- `release-13.asc` as the per-release stable certificate.

The exact HTTPS URLs and expected 40-hex primary fingerprints are fixed in
`docs/architecture/p3-debian-archive-trust-root-source-recommendation.json`.
The Debian FTP team publishes the certificates and fingerprints on its
[archive signing key page](https://ftp-master.debian.org/keys.html). That page
also says it is informational and should not be the sole trust source, so the
recommendation separately fixes Debian's archived
[Debian 13 key announcement](https://lists.debian.org/debian-devel-announce/2025/04/msg00001.html)
as the independent fingerprint reference.

## Proposed observation boundary

After explicit owner acceptance and authorization, one read-only observation
may retrieve only those three public `.asc` files and the announcement into one
ignored temporary directory. The observer must cap each key at 64 KiB, record
SHA-256 and byte size, inspect without importing, compare all three primary
fingerprints against the separately retrieved announcement, and delete every
temporary byte on success or failure. Any redirect away from HTTPS, malformed
certificate, missing fingerprint, mismatch, oversized response, or unavailable
reference stops the observation.

The observation does not authorize snapshot metadata, package indexes,
packages, image layers, builder preparation, external hosts, compilation,
execution, VMs, or production use. A successful observation would only provide
the input for a later signature-verification proposal.

**Release classification:** governance and planning only. No Lovable action,
backend activation, frontend Publish, key retrieval, or runtime action is
required.
