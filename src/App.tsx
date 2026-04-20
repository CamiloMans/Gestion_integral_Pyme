import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AppAuthGuard } from "@/components/AppAuthGuard";
import { AppAuthProvider } from "@/hooks/useAppAuth";
import Gastos from "./pages/Gastos";
import Empresas from "./pages/Empresas";
import Reportes from "./pages/Reportes";
import NotFound from "./pages/NotFound";
import CheckFields from "./pages/CheckFields";
import Login from "./pages/Login";
import ControlPagosProyectos from "./pages/control-pagos/ControlPagosProyectos";
import ControlPagosDocumentosPg from "./pages/control-pagos/ControlPagosDocumentosPg";
import ControlPagosHitos from "./pages/control-pagos/ControlPagosHitos";
import Asistencia from "./pages/Asistencia";

const queryClient = new QueryClient();

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<AppAuthGuard />}>
        <Route path="/" element={<Reportes />} />
        <Route path="/gastos" element={<Gastos />} />
        <Route path="/empresas" element={<Empresas />} />
        <Route path="/check-fields" element={<CheckFields />} />
        <Route path="/control-pagos/proyectos" element={<ControlPagosProyectos />} />
        <Route path="/control-pagos/documentos" element={<ControlPagosDocumentosPg />} />
        <Route path="/control-pagos/hitos" element={<ControlPagosHitos />} />
        <Route path="/asistencia/*" element={<Asistencia />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppAuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AppAuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
