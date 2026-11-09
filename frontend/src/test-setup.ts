import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.stubEnv('VITE_ENTRA_TENANT_ID', '');
vi.stubEnv('VITE_ENTRA_CLIENT_ID', '');
vi.stubEnv('VITE_ENTRA_API_SCOPE', '');
configure({ asyncUtilTimeout: 5000 });

window.matchMedia = vi.fn((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(() => true),
}));

afterEach(cleanup);
