import type { DosaiBridge } from '../contracts/ipc';

declare global {
  interface Window {
    readonly dosai: DosaiBridge;
  }
}

export {};
