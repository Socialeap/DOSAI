# ADR 0014: Linux MicroVM Isolation Backend

- **Status:** Accepted
- **Date:** 2026-08-01
- **Status updated:** 2026-08-01T14:23:28-04:00
- **Decision owner:** Repository owner
- **Related controls:** F02, F05, F06
- **Related plan phase:** P3
- **Extends:** ADR 0003

## Context

ADR 0003 requires arbitrary repository code to run only in a disposable
isolation backend that can deny ambient host authority, enforce declared
resources, terminate the whole isolation unit, and prove cleanup. It explicitly
rejects a process group, shared terminal, or container label as sufficient.

DOSAI supports Apple silicon on macOS 15.0 and later. The current development
host is arm64 macOS 26.5.2 with the Virtualization and Hypervisor frameworks in
the installed SDK. Apple's Containerization package provides useful VM-backed
container machinery but requires macOS 26 and is not present on this host. Making
it the only backend would silently raise the accepted DOSAI platform floor.

The backend must also support the independent reduce-only watchdog. Electron
main cannot own VM handles, general process launch, or arbitrary filesystem and
network authority without violating the accepted process boundaries.

## Decision

Use Apple's Virtualization.framework directly as the baseline arbitrary-code
isolation backend. Run one ephemeral arm64 Linux
microVM for each execution capsule through a dedicated packaged Swift execution
service. Do not enable arbitrary repository execution until every required proof
in this ADR passes.

### Service Boundary

- A signed `dosai-execution-service` native helper owns VM construction,
  `VZVirtualMachine` handles, guest control, output limits, and destruction.
- Electron main communicates only through a future strict authenticated control
  contract. It never receives a generic spawn, shell, VM, file, socket, or PID
  interface.
- A reserved priority queue in the service accepts only inspect, stop-one, and
  stop-all operations. Normal output and general persistence cannot block this
  queue.
- Loss of the authenticated coordinator connection reduces authority by
  beginning cancellation of all active capsules. It cannot authorize new work.
- Service crash behavior, operating-system VM teardown, and restart
  reconciliation must be proven; they are not inferred from API availability.

### Guest Identity and Supply Chain

- Boot only a repository-governed kernel, initramfs, immutable root filesystem,
  and guest agent whose exact digests, build inputs, licenses, SBOM, and supported
  host range are recorded in a versioned manifest.
- Package accepted guest artifacts with DOSAI. Runtime downloading, mutable
  `latest` references, host package managers, and user-selected kernels or images
  are unavailable.
- Give each capsule a fresh VM identity and fixed-size disposable writable disk.
  Never reuse a writable guest state or a previous capsule identity.
- The guest agent exposes fixed protocol operations over virtio socket. It has
  no generic host callback, credential API, host socket forwarding, or image
  management operation.

### Device and Authority Configuration

- Configure exact CPU and memory ceilings before start. Enforce process, file,
  output, disk, and wall-time limits through both the host service and guest
  cgroup/rlimit controls.
- Configure no network device by default. Networked arbitrary-code operations
  remain unavailable until a later contract proves destination restriction and
  absence of ambient credentials; NAT alone is insufficient.
- Expose only the exact canonical leased worktree and explicitly approved cache
  directories through `VZSharedDirectory`, each with a declared read-only or
  read-write mode. Do not expose the user home, other repositories, application
  data, Keychain material, credential agents, browser profiles, host sockets, or
  signing state.
- Configure no graphics, audio, keyboard, pointing, USB, clipboard, or host
  integration device. Add no device merely because Virtualization.framework
  supports it.
- Use a fixed non-root guest identity, fixed working directory, exact
  environment, and no guest login or interactive shell.

### Lifecycle and Cancellation

- Persist the complete immutable capsule and isolation identity before VM start.
  Bind the record to the accepted guest manifest and exact device configuration.
- Treat the VM object and guest identity as the owned isolation unit. A caller
  cannot identify a target by PID, process name, path, or unverified VM label.
- Cancellation first blocks guest input and new brokered authority, requests a
  bounded graceful shutdown when available, then uses the framework's destructive
  stop operation for the whole VM.
- Report `STOPPED` only after the VM is stopped and all shares, temporary disks,
  sockets, leases, and service records are verified absent. Otherwise report
  `QUARANTINED`, retain evidence, and block affected resource reuse.
- Startup reconciles durable capsule records, service-owned VM state, disposable
  disks, and share leases before any new execution is admitted.

### Host Safe Operations

The two P3.5 fixed no-effect profiles remain separate host-handler candidates.
This ADR does not authorize them to launch. Any future host handler still needs
an exact typed implementation, executable identity revalidation immediately
before use, fixed environment and directory construction, output and wall-time
enforcement, and proof that it cannot load repository-controlled configuration
or detach children.

## Alternatives Considered

- **Apple Containerization or the `container` tool:** VM-backed isolation,
  process signaling, and OCI support are useful, but the current supported floor
  is macOS 26 while DOSAI's accepted floor is macOS 15. The stack also adds image,
  registry, networking, service, and dependency surfaces DOSAI does not yet need.
  Retain it as a revisit option rather than silently changing platform support.
- **Raise DOSAI's minimum to macOS 26:** rejected without a separate owner-approved
  baseline change and minimum/current physical release evidence.
- **Hypervisor.framework directly:** rejected because it is lower level and would
  require DOSAI to build more virtual hardware and lifecycle machinery without a
  compensating security benefit.
- **Docker, Podman, or another installed daemon:** rejected as a mandatory backend
  because installation, daemon policy, socket authority, image state, and update
  behavior are outside the packaged DOSAI trust boundary.
- **Host process groups, `sandbox-exec`, or PID-tree termination:** rejected by
  ADR 0003 because they do not prove complete containment or descendant cleanup.
- **A persistent shared VM:** rejected because state, credentials, processes, and
  compromise could cross capsule boundaries.

## Required Evidence Before Enablement

1. Accept a process-ownership generation that isolates the execution service and
   gives Electron main no execution imports or generic helper access.
2. Build and package the arm64 Swift helper for macOS 15 with only the required
   virtualization entitlement and verified code-signing identity.
3. Reproduce and verify the guest artifact manifest, including dependency closure,
   SBOM, vulnerability review, signatures or digests, and clean-room rebuild.
4. Prove exact VM configuration admission, absent devices, canonical shares,
   immutable image selection, fixed limits, and network absence.
5. Prove normal completion, output overflow, timeout, repeated cancellation,
   stop-during-start, guest hang, fork and detachment attempts, service crash,
   Electron crash, stale state, orphan cleanup, and storage exhaustion.
6. Prove bounded priority stop and complete VM teardown while renderer, Electron
   main, output handling, audit, and ordinary persistence are unavailable.
7. Prove unrelated host processes, files, networks, repositories, credentials,
   and user sessions remain untouched.
8. Run the packaged P3 acceptance suite on the current host and on physical
   macOS 15 hardware before claiming the full supported range.

Until these pass, arbitrary repository execution remains unavailable and the
capability matrix remains unchanged.

## Consequences

DOSAI gains an Apple-supported whole-machine isolation and destructive-stop
primitive that matches its existing macOS 15 arm64 baseline. The cost is a
governed Linux guest supply chain, a signed Swift service, entitlement and XPC
work, VM startup overhead, and a broad adversarial test matrix.

Networked arbitrary code remains unavailable. A failing VM configuration,
missing entitlement, unsupported host, guest-image mismatch, uncertain teardown,
or watchdog outage fails closed rather than falling back to host execution.

## Revisit Conditions

Revisit if DOSAI raises its minimum OS to macOS 26, Apple Containerization offers
a stable embeddable contract compatible with the required lifecycle and trust
boundary, Virtualization.framework cannot prove teardown or performance targets,
or Apple introduces a stronger supported containment primitive. Changing the
backend requires a superseding ADR and renewed P3 evidence.
