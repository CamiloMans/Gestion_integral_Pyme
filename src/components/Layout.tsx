import { ReactNode, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  Clock3,
  DollarSign,
  Landmark,
  Menu,
  Plus,
  Receipt,
  Settings,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AppSessionMenu } from '@/components/AppSessionMenu';
import { useAppAuth } from '@/hooks/useAppAuth';

interface LayoutProps {
  children: ReactNode;
  onNewGasto?: () => void;
}

const gastosNavItems = [
  { path: '/', label: 'Reportes', icon: BarChart3 },
  { path: '/gastos', label: 'Gastos', icon: Receipt },
  { path: '/empresas', label: 'Configuracion', icon: Settings },
];

const controlPagosNavItems = [
  { path: '/control-pagos/proyectos', label: 'Proyectos', icon: Settings },
  { path: '/control-pagos/documentos', label: 'Documentos', icon: Receipt },
  { path: '/control-pagos/hitos', label: 'Hitos', icon: BarChart3 },
];

const asistenciaNavItems = [
  { path: '/asistencia/registro', label: 'Registro individual', icon: Clock3 },
  { path: '/asistencia/personal', label: 'Personal', icon: Users, adminOnly: true },
];

export function Layout({ children, onNewGasto }: LayoutProps) {
  const location = useLocation();
  const { session } = useAppAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [gastosMenuOpen, setGastosMenuOpen] = useState(() =>
    gastosNavItems.some((item) => item.path === location.pathname),
  );
  const [controlPagosMenuOpen, setControlPagosMenuOpen] = useState(() =>
    controlPagosNavItems.some((item) => item.path === location.pathname),
  );
  const [asistenciaMenuOpen, setAsistenciaMenuOpen] = useState(() =>
    location.pathname === '/asistencia' || location.pathname.startsWith('/asistencia/'),
  );
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isAdmin = session?.role === 'admin';
  const visibleAsistenciaNavItems = asistenciaNavItems.filter((item) => !item.adminOnly || isAdmin);
  const SWIPE_THRESHOLD = 50;
  const EDGE_THRESHOLD = 30;
  const SWIPE_TIME_THRESHOLD = 300;

  useEffect(() => {
    const isMobile = () => window.innerWidth < 1024;

    const handleTouchStart = (event: TouchEvent) => {
      if (!isMobile() || mobileMenuOpen) {
        touchStartRef.current = null;
        return;
      }

      const touch = event.touches[0];

      if (touch.clientX <= EDGE_THRESHOLD) {
        touchStartRef.current = {
          x: touch.clientX,
          y: touch.clientY,
          time: Date.now(),
        };
      } else {
        touchStartRef.current = null;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchStartRef.current || !isMobile() || mobileMenuOpen) return;

      const touch = event.touches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

      if (deltaX > 10 && deltaY < 50 && touchStartRef.current.x <= EDGE_THRESHOLD) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (!touchStartRef.current || !isMobile() || mobileMenuOpen) {
        touchStartRef.current = null;
        return;
      }

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
      const deltaTime = Date.now() - touchStartRef.current.time;

      if (
        deltaX >= SWIPE_THRESHOLD
        && deltaY < 100
        && deltaTime < SWIPE_TIME_THRESHOLD
        && touchStartRef.current.x <= EDGE_THRESHOLD
      ) {
        setMobileMenuOpen(true);
      }

      touchStartRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (gastosNavItems.some((item) => item.path === location.pathname)) {
      setGastosMenuOpen(true);
    }

    if (controlPagosNavItems.some((item) => item.path === location.pathname)) {
      setControlPagosMenuOpen(true);
    }

    if (location.pathname === '/asistencia' || location.pathname.startsWith('/asistencia/')) {
      setAsistenciaMenuOpen(true);
    }
  }, [location.pathname]);

  const isGastosSectionActive = gastosNavItems.some((item) => item.path === location.pathname);
  const isControlPagosSectionActive = controlPagosNavItems.some((item) => item.path === location.pathname);
  const isAsistenciaSectionActive = location.pathname === '/asistencia' || location.pathname.startsWith('/asistencia/');

  return (
    <div className="min-h-screen bg-background flex">
      {!mobileMenuOpen && (
        <button
          className="fixed left-4 top-4 z-50 rounded-lg bg-card/40 p-2 shadow-md backdrop-blur-sm transition-colors hover:bg-card/60 lg:hidden"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu size={24} className="text-foreground/70" />
        </button>
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r border-sidebar-border bg-sidebar transition-transform duration-300 lg:static lg:transform-none',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="p-6">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-transparent">
              {!logoError ? (
                <img
                  src="/logo-rekosol.png"
                  alt="RekoSol Logo"
                  className="h-full w-full object-contain"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-xl bg-accent">
                  <DollarSign className="h-6 w-6 text-primary" />
                </div>
              )}
            </div>
          </div>

          <nav className="space-y-2">
            <button
              type="button"
              onClick={() => setGastosMenuOpen((prev) => !prev)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                isGastosSectionActive || gastosMenuOpen
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
              aria-expanded={gastosMenuOpen}
              aria-controls="gastos-submenu"
            >
              <DollarSign size={20} />
              <span className="flex-1 text-left">Gestion de Gastos</span>
              <ChevronDown
                size={16}
                className={cn('transition-transform duration-200', gastosMenuOpen && 'rotate-180')}
              />
            </button>

            {gastosMenuOpen && (
              <div id="gastos-submenu" className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                {gastosNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                      )}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setControlPagosMenuOpen((prev) => !prev)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                isControlPagosSectionActive || controlPagosMenuOpen
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
              aria-expanded={controlPagosMenuOpen}
              aria-controls="control-pagos-submenu"
            >
              <Landmark size={20} />
              <span className="flex-1 text-left">Control de Proyectos</span>
              <ChevronDown
                size={16}
                className={cn('transition-transform duration-200', controlPagosMenuOpen && 'rotate-180')}
              />
            </button>

            {controlPagosMenuOpen && (
              <div id="control-pagos-submenu" className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                {controlPagosNavItems.map((item) => {
                  const isActive = location.pathname === item.path;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                      )}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={() => setAsistenciaMenuOpen((prev) => !prev)}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                isAsistenciaSectionActive || asistenciaMenuOpen
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
              )}
              aria-expanded={asistenciaMenuOpen}
              aria-controls="asistencia-submenu"
            >
              <Clock3 size={20} />
              <span className="flex-1 text-left">Control de Asistencia</span>
              <ChevronDown
                size={16}
                className={cn('transition-transform duration-200', asistenciaMenuOpen && 'rotate-180')}
              />
            </button>

            {asistenciaMenuOpen && (
              <div id="asistencia-submenu" className="ml-4 space-y-1 border-l border-sidebar-border pl-3">
                {visibleAsistenciaNavItems.map((item) => {
                  const isActive = location.pathname === item.path || (item.path === '/asistencia/registro' && location.pathname === '/asistencia');
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent/50',
                      )}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </nav>

          <div className="mt-8 border-t border-sidebar-border pt-8">
            <AppSessionMenu />
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="flex-1 overflow-auto">
        <div className="p-4 lg:p-8">{children}</div>
      </main>

      {onNewGasto && (
        <Button
          onClick={onNewGasto}
          className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg lg:hidden"
        >
          <Plus size={24} />
        </Button>
      )}
    </div>
  );
}
