import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { useSharePointAuth } from "@/hooks/useSharePoint";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, AlertCircle } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { authPostLogoutRedirectUri, authRedirectUri } from "@/lib/authClientConfig";
import { msalInstance, loginRequest } from "@/lib/msalConfig";

export function SharePointAuth() {
  const { instance, accounts } = useMsal();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Verificar configuración
  const clientId = import.meta.env.VITE_AZURE_CLIENT_ID;
  const tenantId = import.meta.env.VITE_AZURE_TENANT_ID;
  const isConfigured = clientId && tenantId;

  useEffect(() => {
    if (accounts.length > 0) {
      instance.setActiveAccount(accounts[0]);
      setIsAuthenticated(true);
    }
    setIsLoading(false);
  }, [accounts, instance]);

  const handleLogin = async () => {
    if (!isConfigured) {
      toast({
        title: "Error de configuración",
        description: "Las variables de entorno no están configuradas. Verifica el archivo .env",
        variant: "destructive",
      });
      return;
    }

    setLoginError(null);
    try {
      console.log("Iniciando login redirect...");
      console.log("Redirect URI:", authRedirectUri);
      console.log("Client ID:", clientId);
      console.log("Tenant ID:", tenantId);
      console.log("Scopes:", loginRequest.scopes);
      
      // Usar redirect en lugar de popup
      // Asegurarse de que solo se pasen los scopes de Graph, sin scopes estándar
      await instance.loginRedirect({
        scopes: loginRequest.scopes,
        redirectUri: authRedirectUri,
      });
      // Con redirect, la página se redirigirá a Microsoft y luego volverá
      // No necesitamos hacer nada más aquí
    } catch (error: any) {
      console.error("Error en login:", error);
      const errorMessage = error.message || "Error desconocido al iniciar sesión";
      setLoginError(errorMessage);
      toast({
        title: "Error al iniciar sesión",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleLogout = async () => {
    try {
      await instance.logoutRedirect({
        postLogoutRedirectUri: authPostLogoutRedirectUri,
      });
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  if (isLoading) {
    return (
      <Button variant="ghost" disabled>
        Cargando...
      </Button>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-2">
        {!isConfigured && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Configuración faltante</AlertTitle>
            <AlertDescription>
              Faltan las variables de entorno. Crea un archivo .env con VITE_AZURE_CLIENT_ID y VITE_AZURE_TENANT_ID
            </AlertDescription>
          </Alert>
        )}
        {loginError && (
          <Alert variant="destructive" className="mb-2">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error de autenticación</AlertTitle>
            <AlertDescription>{loginError}</AlertDescription>
          </Alert>
        )}
        <Button onClick={handleLogin} variant="default" disabled={!isConfigured}>
          <LogIn className="mr-2 h-4 w-4" />
          Iniciar Sesión
        </Button>
      </div>
    );
  }

  const account = accounts[0];
  const initials = account?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden md:inline">{account?.name || "Usuario"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{account?.name}</p>
            <p className="text-xs leading-none text-muted-foreground">{account?.username}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar Sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

