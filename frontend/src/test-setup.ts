import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.stubEnv('VITE_ENTRA_TENANT_ID', '');
vi.stubEnv('VITE_ENTRA_CLIENT_ID', '');
vi.stubEnv('VITE_ENTRA_API_SCOPE', '');
configure({ asyncUtilTimeout: 5000 });

afterEach(cleanup);
