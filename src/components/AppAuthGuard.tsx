import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAppAuth } from '@/hooks/useAppAuth';

export function AppAuthGuard() {
  const location = useLocation();
  const { hasActiveTenant, isAuthenticated, isLoading } = useAppAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="text-muted-foreground">Validando sesion...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !hasActiveTenant) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        to="/login"
      />
    );
  }

  return <Outlet />;
}
