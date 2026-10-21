// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 NVIDIA Corporation

import { describe, expect, it, vi } from 'vitest';

const { registerRoute, registerSidebarEntry, getKartaWasm } = vi.hoisted(() => ({
  registerRoute: vi.fn(),
  registerSidebarEntry: vi.fn(),
  getKartaWasm: vi.fn(() => Promise.resolve({})),
}));

// Node 24 exposes its own localStorage, which shadows jsdom's and throws
// unless the process was started with a store file. The page's graph reaches
// Headlamp's redux store, which reads localStorage at import time
// (plugin/pluginConfigSlice.js), so the stub has to exist before that import.
vi.hoisted(() => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, String(value)),
      removeItem: (key: string) => void storage.delete(key),
      clear: () => storage.clear(),
    },
  });
});

vi.mock('@kinvolk/headlamp-plugin/lib', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  registerRoute,
  registerSidebarEntry,
}));
// The module production imports, not the barrel: useKartaWasm and kartaUtil
// both reach for lib/karta/karta directly, so mocking the barrel would watch a
// path nothing uses.
vi.mock('./lib/karta/karta', () => ({ getKartaWasm }));

// WorkloadsPage is deliberately not mocked: the point is that nothing in the
// page's import graph loads the engine at module scope either.
import './index';

// The plugin registers itself once, while this module is imported, and vitest
// clears mock calls before every test. What the import recorded is therefore
// captured here; reading the mocks inside a test would always find them empty.
const registered = {
  engineLoads: getKartaWasm.mock.calls.length,
  routes: registerRoute.mock.calls.map(([route]) => route),
  sidebarEntries: registerSidebarEntry.mock.calls.map(([entry]) => entry),
};

describe('plugin registration', () => {
  // The engine is ~19MB, and every Headlamp user would pay for it at startup
  // whether or not they open Karta. The page loads it when it mounts.
  it('does not load the engine when the plugin is registered', () => {
    expect(registered.engineLoads).toBe(0);
  });

  it('registers the workloads route and its sidebar entries', () => {
    expect(registered.routes).toContainEqual(
      expect.objectContaining({ path: '/karta/workloads', exact: true })
    );
    expect(registered.sidebarEntries).toContainEqual(
      expect.objectContaining({ name: 'karta-workloads', url: '/karta/workloads' })
    );
  });
});
