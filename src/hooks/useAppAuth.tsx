import { useMsal } from '@azure/msal-react';
import { googleLogout } from '@react-oauth/google';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { loginRequest } from '@/lib/msalConfig';
import { ApiError, postgresApi, type AppSession } from '@/services/postgresApi';

const MICROSOFT_LOGIN_REQUESTED_KEY = 'rekosol_microsoft_login_requested';

type AppAuthContextValue = {
  account: ReturnType<typeof useMsal>['accounts'][number] | null;
  activeTenantId: string | null;
  error: string | null;
  hasActiveTenant: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  exchangeGoogleCredential: (idToken: string) => Promise<AppSession>;
  loginWithMicrosoft: () => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<AppSession | null>;
  selectTenant: (tenantId: string) => Promise<AppSession>;
  session: AppSession | null;
  clearError: () => void;
};

const AppAuthContext = createContext<AppAuthContextValue | null>(null);

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function markMicrosoftLoginRequested() {
  window.sessionStorage.setItem(MICROSOFT_LOGIN_REQUESTED_KEY, '1');
}

function clearMicrosoftLoginRequested() {
  window.sessionStorage.removeItem(MICROSOFT_LOGIN_REQUESTED_KEY);
}

function wasMicrosoftLoginRequested() {
  return window.sessionStorage.getItem(MICROSOFT_LOGIN_REQUESTED_KEY) === '1';
}

async function loadCurrentSession() {
  try {
    return await postgresApi.getSession();
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      return null;
    }

    throw error;
  }
}

export function AppAuthProvider({ children }: { children: ReactNode }) {
  const { instance, accounts, inProgress } = useMsal();
  const [session, setSession] = useState<AppSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const syncedAccountRef = useRef<string | null>(null);
  const account = accounts[0] || instance.getActiveAccount() || null;

  useEffect(() => {
    if (account) {
      instance.setActiveAccount(account);
    }
  }, [account, instance]);

  async function refreshSession() {
    try {
      const currentSession = await loadCurrentSession();
      setSession(currentSession);
      setError(null);
      return currentSession;
    } catch (nextError) {
      const message = getErrorMessage(nextError, 'No se pudo consultar la sesion actual.');
      setSession(null);
      setError(message);
      throw nextError;
    }
  }

  async function exchangeGoogleCredential(idToken: string) {
    try {
      setError(null);
      clearMicrosoftLoginRequested();
      const nextSession = await postgresApi.exchangeAuthToken({
        provider: 'google',
        idToken,
      });
      setSession(nextSession);
      return nextSession;
    } catch (nextError) {
      const message = getErrorMessage(nextError, 'No se pudo iniciar sesion con Google.');
      setSession(null);
      setError(message);
      throw nextError;
    }
  }

  useEffect(() => {
    let isCancelled = false;

    async function syncSession() {
      if (inProgress !== 'none') {
        return;
      }

      setIsLoading(true);

      try {
        const currentSession = await loadCurrentSession();

        if (isCancelled) {
          return;
        }

        if (currentSession) {
          clearMicrosoftLoginRequested();
          setSession(currentSession);
          setError(null);
          setIsLoading(false);
          return;
        }

        setSession(null);

        if (!account) {
          syncedAccountRef.current = null;
          setError(null);
          setIsLoading(false);
          return;
        }

        if (!wasMicrosoftLoginRequested()) {
          setError(null);
          setIsLoading(false);
          return;
        }

        const accountKey = account.homeAccountId || account.localAccountId || account.username;

        if (syncedAccountRef.current === accountKey) {
          setIsLoading(false);
          return;
        }

        clearMicrosoftLoginRequested();
        const tokenResult = await instance.acquireTokenSilent({
          account,
          scopes: loginRequest.scopes,
          redirectUri: window.location.origin,
        });
        const nextSession = await postgresApi.exchangeAuthToken({
          provider: 'microsoft',
          idToken: tokenResult.idToken,
        });

        if (isCancelled) {
          return;
        }

        syncedAccountRef.current = accountKey;
        setSession(nextSession);
        setError(null);
      } catch (nextError) {
        if (isCancelled) {
          return;
        }

        syncedAccountRef.current = null;
        setSession(null);
        setError(getErrorMessage(nextError, 'No se pudo restaurar tu sesion.'));
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void syncSession();

    return () => {
      isCancelled = true;
    };
  }, [account, account?.homeAccountId, account?.localAccountId, account?.username, inProgress, instance]);

  async function loginWithMicrosoft() {
    setError(null);
    markMicrosoftLoginRequested();
    await instance.loginRedirect({
      ...loginRequest,
      redirectUri: window.location.origin,
    });
  }

  async function logout() {
    const currentAuthProvider = session?.user.authProvider || null;

    setError(null);
    setSession(null);
    syncedAccountRef.current = null;
    clearMicrosoftLoginRequested();

    try {
      await postgresApi.logout();
    } catch (logoutError) {
      console.warn('No se pudo limpiar la sesion local antes del logout:', logoutError);
    }

    if (currentAuthProvider === 'google') {
      googleLogout();
      window.location.assign('/login');
      return;
    }

    if (currentAuthProvider === 'microsoft' || (!currentAuthProvider && account)) {
      await instance.logoutRedirect({
        postLogoutRedirectUri: `${window.location.origin}/login`,
      });
      return;
    }

    window.location.assign('/login');
  }

  async function selectTenant(tenantId: string) {
    try {
      setError(null);
      const nextSession = await postgresApi.setActiveTenant(tenantId);
      setSession(nextSession);
      return nextSession;
    } catch (nextError) {
      const message = getErrorMessage(nextError, 'No se pudo actualizar el tenant activo.');
      setError(message);
      throw nextError;
    }
  }

  return (
    <AppAuthContext.Provider
      value={{
        account,
        activeTenantId: session?.activeTenantId || null,
        clearError: () => setError(null),
        error,
        exchangeGoogleCredential,
        hasActiveTenant: Boolean(session?.activeTenantId),
        isAuthenticated: Boolean(session),
        isLoading,
        loginWithMicrosoft,
        logout,
        refreshSession,
        selectTenant,
        session,
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

export function useAppAuth() {
  const context = useContext(AppAuthContext);

  if (!context) {
    throw new Error('useAppAuth debe usarse dentro de AppAuthProvider');
  }

  return context;
}
