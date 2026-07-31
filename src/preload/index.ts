import { contextBridge } from 'electron';

import { createRuntimeBridge } from './runtime-bridge';

contextBridge.exposeInMainWorld('dosai', createRuntimeBridge());
