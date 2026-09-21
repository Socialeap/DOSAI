# P3 Debian reference comparison diagnosis

Recorded 2026-09-21. The single authorized trust-root observation retrieved all
three bounded Debian key files and their primary fingerprints matched the
proposal. It then failed closed during the independent-reference comparison;
temporary bytes were deleted and the observation was not retried.

The source-only diagnosis found that the selected Debian developer announcement
documents the Debian 13 archive automatic and security archive automatic keys,
including the exact observed key-file SHA-256 values, but it does not document
the separate Debian 13 stable release key. The original comparison incorrectly
required all three fingerprints to appear on that one page.

The failed observation remains non-accepting. A repaired proposal must preserve
the announcement as the independent reference for the two automatic keys and
select a separate authoritative Debian source for stable release key
`41587F7DB8C774BCCF131416762F67A0B2C39DE4`. It must not substitute an
unreviewed bug report, host trust store, package manager, or the downloaded key
material itself as independent authority. No further key or metadata retrieval
is authorized by this diagnosis.

The owner subsequently authorized a corrected read-only observation. The v2
recommendation selects the immutable Debian Sources copy of
`debian-archive-keyring` 2025.1 `active-keys/add-trixie-stable` as the separate
official source-package reference for the stable key, while retaining the
developer announcement for the two automatic keys. The two sources now have
non-overlapping declared coverage; no page is required to attest a key it does
not contain.

No Lovable action is required. There is no backend activation or frontend
Publish step.
