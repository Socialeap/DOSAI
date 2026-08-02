export interface RuntimeVersions {
  readonly chromium: string;
  readonly electron: string;
  readonly node: string;
  readonly v8: string;
}

export interface RuntimeSnapshot {
  readonly application: 'DOSAI';
  readonly architecture: 'arm64';
  readonly platform: 'darwin';
  readonly platformProfile: 'MACOS_ARM64_V1';
  readonly versions: RuntimeVersions;
}
