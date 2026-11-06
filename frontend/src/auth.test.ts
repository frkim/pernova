import { describe, expect, it } from 'vitest';
import { readAuthConfig } from './auth';

describe('optional enterprise authentication gate', () => {
  const tenant = '11111111-2222-3333-4444-555555555555';
  const client = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  it('does not enable MSAL or pretend to connect in the default demo', () => {
    expect(readAuthConfig({})).toMatchObject({ enabled: false, invalid: false });
  });

  it('fails closed for partial or malformed configuration', () => {
    expect(readAuthConfig({ VITE_ENTRA_TENANT_ID: tenant })).toMatchObject({
      enabled: false,
      invalid: true,
    });
    expect(
      readAuthConfig({
        VITE_ENTRA_TENANT_ID: 'not-a-tenant',
        VITE_ENTRA_CLIENT_ID: client,
        VITE_ENTRA_API_SCOPE: 'api://example/access_as_user',
      }),
    ).toMatchObject({ enabled: false, invalid: true });
  });

  it('enables real authentication only with all three public settings', () => {
    expect(
      readAuthConfig({
        VITE_ENTRA_TENANT_ID: tenant,
        VITE_ENTRA_CLIENT_ID: client,
        VITE_ENTRA_API_SCOPE: 'api://example/access_as_user',
      }),
    ).toMatchObject({ enabled: true, invalid: false });
  });
});
