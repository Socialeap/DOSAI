# P3 Isolation Backend Evaluation

**Status:** `ACCEPTED`<br>
**Evaluated:** `2026-08-01T13:18:54-04:00`<br>
**Accepted:** `2026-08-01T14:23:28-04:00`<br>
**Decision:** `docs/decisions/0014-linux-microvm-isolation-backend.md`

## Governing Constraints

- Apple silicon `arm64` only.
- macOS 15.0 minimum without silently raising the accepted baseline.
- One disposable isolation unit per arbitrary-code capsule.
- No user home, ambient credentials, host sockets, undeclared mounts, or default
  network access.
- Whole-unit destructive stop and explicit cleanup verification.
- Independent reduce-only control outside Electron main and output processing.
- No host fallback when isolation is unavailable.

## Candidate Matrix

| Candidate | macOS 15 baseline | Whole-unit boundary | Network absent by construction | Exact host shares | Destructive stop | Added runtime trust | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Direct Virtualization.framework Linux microVM | Yes | One VM per capsule | Yes; configure no network device | Yes; `VZSharedDirectory` modes | Yes; `VZVirtualMachine.stop` | Governed Swift helper and guest image | Accepted |
| Apple Containerization / `container` | No; requires macOS 26 | One lightweight VM per container | Configurable, but broader network/image service exists | Supported | Supported by its service | External Swift package, service, OCI and registry stack | Revisit option |
| Hypervisor.framework | Yes | VM possible | DOSAI must implement devices | DOSAI must implement sharing | DOSAI must implement lifecycle | Large custom hypervisor surface | Rejected |
| External Docker/Podman daemon | Not package-controlled | Backend-dependent | Daemon-dependent | Daemon-dependent | Daemon-dependent | Installed daemon and privileged socket | Rejected |
| Host PID/process group or `sandbox-exec` | Yes | No | No complete proof | Host-visible | Incomplete descendants | Host process authority | Rejected |

## Local Platform Evidence

The evaluation host reports:

```text
macOS 26.5.2 build 25F84
arm64
Xcode SDK: /Applications/Xcode.app/.../MacOSX.sdk
Virtualization.framework: present
Hypervisor.framework: present
Containerization.framework: absent
container CLI: absent
```

The installed Virtualization.framework headers state that VM support begins at
macOS 11, destructive stop is available from macOS 12, device arrays including
network and directory sharing are empty by default, and shared directories carry
an explicit read-only flag. The accepted DOSAI floor of macOS 15 is therefore
compatible with the accepted framework surface.

## Primary References

- [Apple Virtualization framework](https://developer.apple.com/documentation/virtualization)
- [Apple VZVirtualMachine](https://developer.apple.com/documentation/virtualization/vzvirtualmachine)
- [Apple destructive VM stop](https://developer.apple.com/documentation/virtualization/vzvirtualmachine/stop%28completionhandler%3A%29)
- [Apple Virtio file-system sharing](https://developer.apple.com/documentation/virtualization/vzvirtiofilesystemdeviceconfiguration)
- [Apple virtualization entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.virtualization)
- [Apple Containerization source](https://github.com/apple/containerization)
- [Apple container tool source](https://github.com/apple/container)

## Limitations

- No VM was created or started during this evaluation.
- The virtualization entitlement and signed packaged helper are not yet proven.
- No guest kernel, image, agent, or supply-chain manifest has been selected.
- Service independence, XPC authentication, crash teardown, and priority stop
  remain design obligations rather than measured properties.
- Apple Containerization was evaluated from its published requirements; it is not
  installed locally and no administrative installation was attempted.
