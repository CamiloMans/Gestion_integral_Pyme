import { createRoot } from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import { GoogleOAuthProvider } from "@react-oauth/google";
import type { ReactNode } from "react";
import { googleClientId } from "./lib/authClientConfig";
import { msalInstance } from "./lib/msalConfig";
import App from "./App.tsx";
import "./index.css";

function GoogleProviderWrapper({ children }: { children: ReactNode }) {
  if (!googleClientId) {
    return <>{children}</>;
  }

  return (
    <GoogleOAuthProvider clientId={googleClientId}>
      {children}
    </GoogleOAuthProvider>
  );
}

// Inicializar MSAL y manejar el callback de redirect después del login
msalInstance.initialize().then(() => {
  // Manejar el callback de redirect después de que MSAL esté inicializado
  msalInstance.handleRedirectPromise().then((response) => {
    if (response) {
      console.log("Login exitoso desde redirect:", response);
    }
  }).catch((error) => {
    console.error("Error en redirect callback:", error);
  });
}).catch((error) => {
  console.error("Error al inicializar MSAL:", error);
});

createRoot(document.getElementById("root")!).render(
  <GoogleProviderWrapper>
    <MsalProvider instance={msalInstance}>
      <App />
    </MsalProvider>
  </GoogleProviderWrapper>
);
