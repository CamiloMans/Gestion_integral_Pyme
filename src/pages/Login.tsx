import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAppAuth } from '@/hooks/useAppAuth';
import { googleClientId } from '@/lib/authClientConfig';

const googleClientConfigured = Boolean(googleClientId);
const socialButtonClassName = 'relative h-12 w-full justify-center rounded-md border border-[#d1d1d1] bg-white px-4 text-[15px] font-semibold text-[#1f1f1f] shadow-sm transition-all hover:border-[#b5b5b5] hover:bg-[#f7f7f7] hover:text-[#111111] focus-visible:ring-[#2563eb] disabled:border-[#d9d9d9] disabled:bg-[#f3f3f3] disabled:text-[#6b6b6b]';

function MicrosoftMark() {
  return (
    <span aria-hidden="true" className="grid h-4 w-4 grid-cols-2 grid-rows-2 gap-[2px]">
      <span className="bg-[#f25022]" />
      <span className="bg-[#7fba00]" />
      <span className="bg-[#00a4ef]" />
      <span className="bg-[#ffb900]" />
    </span>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 18 18">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.97 10.72A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.05l3.01-2.33Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.46 3.43 1.35l2.57-2.57C13.46.92 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33c.71-2.12 2.69-3.7 5.03-3.7Z"
        fill="#EA4335"
      />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    account,
    clearError,
    error,
    exchangeGoogleCredential,
    hasActiveTenant,
    isAuthenticated,
    isLoading,
    loginWithMicrosoft,
    logout,
    selectTenant,
    session,
  } = useAppAuth();
  const [logoError, setLogoError] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [tenantSelectionInFlight, setTenantSelectionInFlight] = useState<string | null>(null);
  const redirectPath = typeof location.state?.from === 'string' ? location.state.from : '/';

  useEffect(() => {
    if (isAuthenticated && hasActiveTenant) {
      navigate(redirectPath, { replace: true });
    }
  }, [hasActiveTenant, isAuthenticated, navigate, redirectPath]);

  async function handleMicrosoftLogin() {
    setIsMicrosoftLoading(true);
    setLocalError(null);
    clearError();

    try {
      await loginWithMicrosoft();
    } catch (loginError) {
      console.error('No se pudo iniciar el login de Microsoft:', loginError);
      setLocalError('No se pudo iniciar el acceso con Microsoft.');
      setIsMicrosoftLoading(false);
    }
  }

  async function handleGoogleSuccess(response: CredentialResponse) {
    const credential = String(response.credential || '').trim();

    if (!credential) {
      setLocalError('Google no devolvio una credencial valida para iniciar sesion.');
      setIsGoogleLoading(false);
      return;
    }

    setIsGoogleLoading(true);
    setLocalError(null);
    clearError();

    try {
      await exchangeGoogleCredential(credential);
    } catch (loginError) {
      console.error('No se pudo iniciar el login de Google:', loginError);
    } finally {
      setIsGoogleLoading(false);
    }
  }

  function handleGoogleError() {
    setLocalError('No se pudo iniciar el login con Google.');
    setIsGoogleLoading(false);
  }

  async function handleTenantSelection(tenantId: string) {
    setTenantSelectionInFlight(tenantId);
    setLocalError(null);
    clearError();

    try {
      await selectTenant(tenantId);
      navigate(redirectPath, { replace: true });
    } catch (tenantError) {
      console.error('No se pudo seleccionar el tenant activo:', tenantError);
    } finally {
      setTenantSelectionInFlight(null);
    }
  }

  if (isLoading && !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="text-muted-foreground">Validando acceso...</p>
        </div>
      </div>
    );
  }

  const requiresTenantSelection = Boolean(session && !session.activeTenantId);
  const displayError = error || localError;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-md space-y-8 rounded-xl border bg-card p-8 shadow-lg">
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center">
            {!logoError ? (
              <img
                src="/logo-rekosol.png"
                alt="RekoSol Logo"
                className="h-full w-full object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
                <span className="text-2xl font-bold text-primary">RS</span>
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">RekoSol</h1>
            <p className="mt-2 text-muted-foreground">Gestion de Gastos</p>
          </div>
        </div>

        {displayError && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
            <p className="text-center text-sm text-destructive">{displayError}</p>
          </div>
        )}

        {requiresTenantSelection ? (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="font-medium">Selecciona el tenant con el que quieres trabajar</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Tu usuario tiene acceso a varios espacios. Elige uno para continuar.
              </p>
            </div>

            <div className="space-y-3">
              {session.memberships.map((membership) => (
                <Button
                  key={membership.id}
                  className="flex h-auto w-full items-start justify-between gap-3 px-4 py-4 text-left"
                  disabled={tenantSelectionInFlight !== null}
                  onClick={() => handleTenantSelection(membership.tenantId)}
                  type="button"
                  variant="outline"
                >
                  <span className="flex items-start gap-3">
                    <Building2 className="mt-0.5 h-5 w-5 text-muted-foreground" />
                    <span className="flex flex-col">
                      <span className="font-medium">{membership.tenant.nombre}</span>
                      <span className="text-xs text-muted-foreground">{membership.tenant.slug}</span>
                    </span>
                  </span>
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {tenantSelectionInFlight === membership.tenantId ? 'Entrando...' : membership.rol}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/50 p-4">
              <p className="text-center text-sm text-muted-foreground">
                Para acceder a la aplicacion, usa tu cuenta invitada con Microsoft o Google.
              </p>
            </div>

            <Button
              className={socialButtonClassName}
              disabled={isLoading || isMicrosoftLoading || isGoogleLoading}
              onClick={handleMicrosoftLogin}
              size="lg"
              type="button"
            >
              <span className="absolute left-4 flex items-center justify-center">
                {isMicrosoftLoading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#5f5f5f] border-t-transparent" />
                ) : (
                  <MicrosoftMark />
                )}
              </span>

              {isMicrosoftLoading ? (
                'Redirigiendo a Microsoft...'
              ) : (
                'Iniciar sesion con Microsoft'
              )}
            </Button>

            <div className="flex justify-center">
              {googleClientConfigured ? (
                <div className="relative h-12 w-full">
                  <div
                    aria-hidden="true"
                    className={`${socialButtonClassName} pointer-events-none flex items-center ${
                      isGoogleLoading ? 'opacity-70' : ''
                    }`}
                  >
                    <span className="absolute left-4 flex items-center justify-center">
                      <GoogleMark />
                    </span>
                    Continuar con Google
                  </div>

                  <div className="absolute inset-0 z-10 overflow-hidden rounded-md [opacity:0.01]">
                    <div
                      className="h-[38px] origin-top-left [&>div]:!w-full [&_iframe]:!w-full"
                      style={{ transform: 'scaleY(1.2632)' }}
                    >
                      <GoogleLogin
                        onError={handleGoogleError}
                        onSuccess={(response) => {
                          void handleGoogleSuccess(response);
                        }}
                        shape="rectangular"
                        size="large"
                        text="continue_with"
                        theme="outline"
                        width="100%"
                      />
                    </div>
                  </div>

                  {isGoogleLoading && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-md bg-white/70">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#5f5f5f] border-t-transparent" />
                    </div>
                  )}
                </div>
              ) : (
                <Button className={socialButtonClassName} disabled type="button">
                  Google no configurado
                </Button>
              )}
            </div>

            {!googleClientConfigured && (
              <p className="text-center text-xs text-muted-foreground">
                Falta configurar <code>VITE_GOOGLE_CLIENT_ID</code> para habilitar el acceso con Google.
              </p>
            )}

            {account && (
              <Button className="w-full" onClick={() => void logout()} type="button" variant="outline">
                Salir de Microsoft
              </Button>
            )}
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            El acceso se habilita por invitacion previa y queda restringido a tus tenants asignados.
          </p>
        </div>
      </div>
    </div>
  );
}
