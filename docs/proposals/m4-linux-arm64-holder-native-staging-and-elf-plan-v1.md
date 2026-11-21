# Linux ARM64 holder native staging and ELF verification

Status `SOURCE_ONLY_HOLD`. This plan covers the compiler tools that would
produce the static fixture holder. The worker runtime, holder launch, and
independent native AMD64 builder qualification retain their own gates.

## Verified starting point

The [package-hash observation](m4-linux-arm64-holder-debian-package-hash-observation-v1.json)
binds the 35 archive matches to the [signed dependency candidate](m4-linux-arm64-holder-debian-dependency-candidate-v1.json)
as merged in PR #94 at `b4873a8e72f939e38fa89982ba4c4c515f7ec609`.
All 52,851,844 bytes were streamed for size and SHA-256. The retained local
receipt lists each observed size and hash. Its digest and the digest of the
sorted per-package projection are recorded in the proposal. The archives
were discarded after hashing. Future staging requires re-verifying the
exact bytes it consumes.
[Debian archive authentication](https://manpages.debian.org/trixie/apt/apt-secure.8.en.html#SIGNED_REPOSITORIES)

## Checkpoint 1. Establish the staging boundary

After separate authorization, qualify an isolated, disposable native
Linux ARM64 environment. Record the physical CPU and kernel architecture,
boot and root identity, mount topology, writer authority and exclusion,
and the exact source manifest, recipe, and dependency candidate digests.
Hold on an emulated target, ambiguous root or mount identity, or missing
writer exclusion. A dedicated writer may prepare the staging directory.
An independent verifier must read the sealed result and establish that
the aliases, objects, and observed root belong to that same generation.
The future tool invocation must be isolated from host paths, shared
package caches, ambient credentials, unrelated processes, and unrelated
writable mounts. Use a separately bounded workspace for explicitly
approved build outputs.

## Checkpoint 2. Verify and stage the minimum payload

Review an exact mapping from package member to staged path before any
payload is materialized. Each row must bind the archive name, version,
architecture, byte count, and archive digest, then the member path, type,
size, SHA-256 or relative alias target, and execution mode. Use that map
for the compiler tools, sysroot inputs, and native runtime files. Verify
archive hashes on the same open inputs consumed for staging. Inspect the
data archive without invoking the package manager or maintainer scripts.
Enforce bounds on archive expansion, members, output bytes, and paths.
Reject duplicate or overlapping paths, hard links, special files,
escaping or unresolved aliases, unreviewed normalization, and unexpected
file modes or metadata. Reject collisions across archives before staging
the selected subset. Preserve separate runtime and sysroot trees.
[Debian binary package format](https://manpages.debian.org/trixie/dpkg-dev/deb.5.en.html)

Once staging is sealed, independently read back its complete file and
alias census from pinned root-relative handles. Compare it with the
reviewed mapping and bind it to the v2 manifest and recipe using the
existing toolchain inventory contract. An extra, missing, changed, or
concurrently modified entry gives a no-go result. Record the full inventory
and sysroot digests and verify the root identity again at completion.

## Checkpoint 3. Prove the restricted ELF graph

Use an independently pinned and bounded ELF reader that examines bytes
from the same sealed files. The readback must identify ELF class, byte
order, machine, executable or shared-object role, `PT_INTERP`, `DT_NEEDED`,
`DT_SONAME`, version requirements and definitions, and unsupported tags or
flags. Treat parser warnings, truncation, malformed input, and undigested
objects as no-go conditions. The staged compiler, linker, loader, and
libraries are data at this checkpoint. Invoking `ldd` or the staged dynamic
loader is outside the check.
[GNU readelf](https://sourceware.org/binutils/docs/binutils/readelf.html) ·
[Debian ldd manual](https://manpages.debian.org/trixie/manpages/ldd.1.en.html#Security)

Version 1 admits five distinct dynamic tools (`aarch64-linux-gnu-gcc`,
`cc1`, `as`, `collect2`, `ld`) with little-endian AArch64 ELF64 and the
exact `/lib/ld-linux-aarch64.so.1` interpreter. Their absolute loader path
is interpreted inside the isolated native root. The runtime inventory
projects the loader and libraries under `toolchain/runtime`, with only
`/lib/aarch64-linux-gnu`, `/usr/lib/aarch64-linux-gnu`, `/lib`, and `/usr/lib`
as library search directories. Each required name must resolve through the
sealed census to one canonical staged object with the matching SONAME and
all required version definitions. Multiple aliases to that one object are
acceptable. Traverse every dependency of each tool, of the interpreter,
and of each library, accounting for cycles. Require no unreachable ELF
rows or unaccounted runtime files. Bind the graph digest to the exact
inventory digest and recheck the root and write fence before recording it.

This restricted profile requires evidence that the loader sees no cache,
preload, injected `LD_*` variables, hwcaps overrides, foreign mounts, or
ambient library directories. Reject any `RPATH`, `RUNPATH`, audit, filter,
auxiliary, pathname-valued dependency, search-altering flag, or other
unmodeled mechanism. If the actual Debian binaries need a different
profile, hold for a separately reviewed policy revision. Metadata closure
does not establish runtime relocations, late `dlopen` activity, or that GCC
finds its intended helpers, specs, plugin inputs, assembler, linker, and
sysroot. Later authorized functional evidence must cover compiler lookup
and the static output contract before the holder can be admitted.
[Debian dynamic loader search rules](https://manpages.debian.org/trixie/manpages/ld.so.8.en.html#DESCRIPTION)

## Offline go/no-go

The [fixture verifier](../../tools/local-coordination-pilot/m4-linux-arm64-guest-isolation-canary-holder-toolchain-closure.py)
exercises the graph contract on synthetic metadata bound to the existing
inventory verification. It returns a held digest on success. The raw
archive reader, physical staging collector, real ELF reader, and physical
writer proof remain separate implementation and authorization gates.
Keep the approved lock and artifact receipt unset until independent native
evidence and review. The fixture results carry no build, launch,
provisioning, or runtime authority.
