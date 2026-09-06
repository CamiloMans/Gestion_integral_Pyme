import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppAuthGuard } from "@/components/AppAuthGuard";
import { AppAuthProvider, useAppAuth } from "@/hooks/useAppAuth";
import Gastos from "./pages/Gastos";
import GastosPorPagar from "./pages/GastosPorPagar";
import GastosCargaMasiva from "./pages/GastosCargaMasiva";
import Empresas from "./pages/Empresas";
import NotFound from "./pages/NotFound";
import CheckFields from "./pages/CheckFields";
import Login from "./pages/Login";
import ControlPagosProyectos from "./pages/control-pagos/ControlPagosProyectos";
import ControlPagosDocumentosPg from "./pages/control-pagos/ControlPagosDocumentosPg";
import ControlPagosHitos from "./pages/control-pagos/ControlPagosHitos";
import Asistencia from "./pages/Asistencia";
import Horas from "./pages/Horas";
import NoAccess from "./pages/NoAccess";
import { getDefaultRoute, hasAnyPermission, PERMISSIONS, type PermissionKey } from "@/lib/access-control";

const queryClient = new QueryClient();
const Reportes = lazy(() => import("./pages/Reportes"));

const PermissionRoute = ({ children, permissions }: { children: ReactNode; permissions: PermissionKey[] }) => {
  const { session } = useAppAuth();

  if (!hasAnyPermission(session, permissions)) {
    return <Navigate to={getDefaultRoute(session)} replace />;
  }

  return <>{children}</>;
};

const SuperAdminRoute = ({ children }: { children: ReactNode }) => {
  const { session } = useAppAuth();
  return session?.role === 'super_admin' ? <>{children}</> : <Navigate to={getDefaultRoute(session)} replace />;
};

const HomeRedirect = () => {
  const { session } = useAppAuth();
  return <Navigate to={getDefaultRoute(session)} replace />;
};

const HoursRedirect = () => {
  const { session } = useAppAuth();

  if (hasAnyPermission(session, [PERMISSIONS.HOURS_PERSONAL])) {
    return <Navigate to="/horas/carga" replace />;
  }

  if (hasAnyPermission(session, [PERMISSIONS.HOURS_DASHBOARD])) {
    return <Navigate to="/horas/dashboard" replace />;
  }

  return <Navigate to={getDefaultRoute(session)} replace />;
};

const SETTINGS_PERMISSIONS = [
  PERMISSIONS.SETTINGS_COMPANIES,
  PERMISSIONS.SETTINGS_PROJECTS,
  PERMISSIONS.SETTINGS_COLLABORATORS,
  PERMISSIONS.SETTINGS_USERS,
  PERMISSIONS.SETTINGS_EXPENSE_CATEGORIES,
  PERMISSIONS.SETTINGS_EXPENSE_DOCUMENT_TYPES,
  PERMISSIONS.SETTINGS_PROJECT_DOCUMENT_TYPES,
] as PermissionKey[];

const AppRoutes = () => {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background p-8 text-sm text-muted-foreground">Cargando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppAuthGuard />}>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/sin-acceso" element={<NoAccess />} />
          <Route path="/reportes" element={<PermissionRoute permissions={[PERMISSIONS.REPORTS_DASHBOARD]}><Reportes /></PermissionRoute>} />
          <Route path="/gastos" element={<PermissionRoute permissions={[PERMISSIONS.EXPENSES_RECORDS]}><Gastos /></PermissionRoute>} />
          <Route path="/gastos/por-pagar" element={<PermissionRoute permissions={[PERMISSIONS.EXPENSES_RECORDS]}><GastosPorPagar /></PermissionRoute>} />
          <Route path="/gastos/carga-masiva" element={<PermissionRoute permissions={[PERMISSIONS.EXPENSES_BULK_UPLOAD]}><GastosCargaMasiva /></PermissionRoute>} />
          <Route path="/empresas" element={<PermissionRoute permissions={SETTINGS_PERMISSIONS}><Empresas /></PermissionRoute>} />
          <Route path="/check-fields" element={<SuperAdminRoute><CheckFields /></SuperAdminRoute>} />
          <Route path="/control-pagos/proyectos" element={<PermissionRoute permissions={[PERMISSIONS.PROJECT_CONTROL_PROJECTS]}><ControlPagosProyectos /></PermissionRoute>} />
          <Route path="/control-pagos/documentos" element={<PermissionRoute permissions={[PERMISSIONS.PROJECT_CONTROL_DOCUMENTS]}><ControlPagosDocumentosPg /></PermissionRoute>} />
          <Route path="/control-pagos/hitos" element={<PermissionRoute permissions={[PERMISSIONS.PROJECT_CONTROL_MILESTONES]}><ControlPagosHitos /></PermissionRoute>} />
          <Route path="/asistencia/*" element={<PermissionRoute permissions={[PERMISSIONS.ATTENDANCE_PERSONAL, PERMISSIONS.ATTENDANCE_TEAM]}><Asistencia /></PermissionRoute>} />
          <Route path="/horas" element={<HoursRedirect />} />
          <Route path="/horas/carga" element={<PermissionRoute permissions={[PERMISSIONS.HOURS_PERSONAL]}><Horas /></PermissionRoute>} />
          <Route path="/horas/dashboard" element={<PermissionRoute permissions={[PERMISSIONS.HOURS_DASHBOARD]}><Horas /></PermissionRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppAuthProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AppRoutes />
          </BrowserRouter>
        </AppAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
