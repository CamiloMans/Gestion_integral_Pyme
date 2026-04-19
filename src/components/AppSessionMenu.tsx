import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, ChevronsUpDown, LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppAuth } from '@/hooks/useAppAuth';

export function AppSessionMenu() {
  const location = useLocation();
  const { logout, selectTenant, session } = useAppAuth();
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null);

  if (!session) {
    return null;
  }

  const initials = session.user.nombre
    .split(' ')
    .map((segment) => segment[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'RS';

  async function handleTenantSwitch(tenantId: string) {
    if (tenantId === session.activeTenantId) {
      return;
    }

    setSwitchingTenantId(tenantId);

    try {
      await selectTenant(tenantId);
      window.location.assign(`${location.pathname}${location.search}${location.hash}`);
    } finally {
      setSwitchingTenantId(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="h-auto w-full justify-between gap-3 px-3 py-2" variant="ghost">
          <span className="flex min-w-0 items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-col text-left">
              <span className="truncate text-sm font-medium">{session.user.nombre}</span>
              <span className="truncate text-xs text-muted-foreground">
                {session.activeTenant?.nombre || session.user.email}
              </span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{session.user.nombre}</p>
            <p className="text-xs leading-none text-muted-foreground">{session.user.email}</p>
            {session.activeTenant && (
              <p className="pt-1 text-xs text-muted-foreground">
                Tenant activo: {session.activeTenant.nombre}
              </p>
            )}
          </div>
        </DropdownMenuLabel>

        {session.memberships.length > 1 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Cambiar tenant</DropdownMenuLabel>
            {session.memberships.map((membership) => (
              <DropdownMenuItem
                key={membership.id}
                disabled={switchingTenantId !== null}
                onClick={() => handleTenantSwitch(membership.tenantId)}
              >
                <span className="flex flex-1 items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span>{membership.tenant.nombre}</span>
                    <span className="text-xs text-muted-foreground">{membership.rol}</span>
                  </span>
                  {membership.tenantId === session.activeTenantId ? (
                    <Check className="h-4 w-4" />
                  ) : switchingTenantId === membership.tenantId ? (
                    <span className="text-xs text-muted-foreground">Cambiando...</span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void logout()}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar sesion</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
