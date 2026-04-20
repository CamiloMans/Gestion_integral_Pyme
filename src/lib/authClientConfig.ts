function readTrimmedEnv(name: string) {
  const value = import.meta.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function resolveBrowserOrigin() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.location.origin;
}

function normalizeUri(uri: string) {
  return uri.replace(/\/+$/, '');
}

const browserOrigin = resolveBrowserOrigin();
const configuredRedirectUri = readTrimmedEnv('VITE_AUTH_REDIRECT_URI');
const configuredPostLogoutRedirectUri = readTrimmedEnv('VITE_AUTH_POST_LOGOUT_REDIRECT_URI');

export const googleClientId = readTrimmedEnv('VITE_GOOGLE_CLIENT_ID');
export const authRedirectUri = normalizeUri(configuredRedirectUri || browserOrigin);
export const authPostLogoutRedirectUri = normalizeUri(
  configuredPostLogoutRedirectUri || `${browserOrigin}/login`,
);
