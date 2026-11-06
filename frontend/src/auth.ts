import type { PublicClientApplication } from '@azure/msal-browser';

type AuthEnvironment = Record<string, string | boolean | undefined>;

export function readAuthConfig(env: AuthEnvironment) {
  const tenant = String(env.VITE_ENTRA_TENANT_ID ?? '').trim();
  const client = String(env.VITE_ENTRA_CLIENT_ID ?? '').trim();
  const scope = String(env.VITE_ENTRA_API_SCOPE ?? '').trim();
  const present = [tenant, client, scope].filter(Boolean).length;
  const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return {
    tenant,
    client,
    scope,
    enabled: present === 3 && guid.test(tenant) && guid.test(client),
    invalid: present > 0 && (present < 3 || !guid.test(tenant) || !guid.test(client)),
  };
}

export const authConfig = readAuthConfig(import.meta.env);
let clientPromise: Promise<PublicClientApplication> | undefined;

async function getClient(): Promise<PublicClientApplication> {
  if (!authConfig.enabled) throw new Error('La configuration Entra SPA est incomplète.');
  clientPromise ??= (async () => {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const client = new PublicClientApplication({
      auth: {
        clientId: authConfig.client,
        authority: `https://login.microsoftonline.com/${authConfig.tenant}`,
        redirectUri: window.location.origin,
        postLogoutRedirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'memoryStorage' },
    });
    await client.initialize();
    return client;
  })();
  return clientPromise;
}

export async function signIn(): Promise<string> {
  const client = await getClient();
  const result = await client.loginPopup({ scopes: [authConfig.scope] });
  client.setActiveAccount(result.account);
  return result.account?.name ?? result.account?.username ?? 'Session Entra';
}

export async function signOut(): Promise<void> {
  const client = await getClient();
  await client.logoutPopup({ account: client.getActiveAccount() });
}

export async function authHeaders(): Promise<Record<string, string>> {
  if (authConfig.invalid) {
    throw new Error(
      'Configuration Entra incomplète : tenant, client SPA et scope API sont tous requis.',
    );
  }
  if (!authConfig.enabled) return {};
  const client = await getClient();
  const account = client.getActiveAccount();
  if (!account) throw new Error('Connectez-vous avec Entra pour accéder à l’API du tenant.');
  try {
    const token = await client.acquireTokenSilent({ account, scopes: [authConfig.scope] });
    return { Authorization: `Bearer ${token.accessToken}` };
  } catch {
    throw new Error(
      'Votre session Entra nécessite une interaction. Utilisez « Se connecter avec Entra ».',
    );
  }
}
