import { createSecretKey, randomBytes, randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { query } from './db.js';

const AUTH_PROVIDERS = Object.freeze({
  MICROSOFT: 'microsoft',
  GOOGLE: 'google',
});
const AUTH_PROVIDER_LABELS = Object.freeze({
  [AUTH_PROVIDERS.MICROSOFT]: 'Microsoft',
  [AUTH_PROVIDERS.GOOGLE]: 'Google',
});
const SESSION_COOKIE_NAME = 'rekosol_session';
const SESSION_AUDIENCE = 'rekosol-browser';
const SESSION_ISSUER = 'rekosol-app';
const SESSION_DURATION_SECONDS = 60 * 60 * 12;
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const isProduction = process.env.NODE_ENV === 'production';
const microsoftTenantId = String(process.env.VITE_AZURE_TENANT_ID || '').trim();
const microsoftClientId = String(process.env.VITE_AZURE_CLIENT_ID || '').trim();
const googleClientId = String(process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
const microsoftIssuer = microsoftTenantId
  ? `https://login.microsoftonline.com/${microsoftTenantId}/v2.0`
  : '';
const microsoftJwks = microsoftTenantId
  ? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${microsoftTenantId}/discovery/v2.0/keys`))
  : null;
const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
let sessionSecretKey = null;
let didWarnAboutEphemeralSecret = false;
let userAuthIdentitiesSchemaPromise = null;

function createAuthError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeAuthProvider(value) {
  const normalizedProvider = String(value || '').trim().toLowerCase();

  if (normalizedProvider === AUTH_PROVIDERS.MICROSOFT || normalizedProvider === AUTH_PROVIDERS.GOOGLE) {
    return normalizedProvider;
  }

  throw createAuthError('El proveedor de autenticacion solicitado no es valido.', 400);
}

function getProviderLabel(provider) {
  return AUTH_PROVIDER_LABELS[provider] || 'la cuenta';
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeAuthProviders(value) {
  let rawProviders = [];

  if (Array.isArray(value)) {
    rawProviders = value;
  } else if (typeof value === 'string') {
    try {
      rawProviders = JSON.parse(value || '[]');
    } catch (_error) {
      rawProviders = [];
    }
  }

  return Array.from(
    new Set(
      rawProviders
        .map((provider) => String(provider || '').trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

function isGoogleEmailVerified(value) {
  return value === true || value === 'true';
}

function requireMicrosoftConfig() {
  if (!microsoftTenantId || !microsoftClientId || !microsoftJwks) {
    throw createAuthError(
      'La autenticacion de Microsoft no esta configurada en el backend. Verifica VITE_AZURE_CLIENT_ID y VITE_AZURE_TENANT_ID.',
      500,
    );
  }
}

function requireGoogleConfig() {
  if (!googleClientId) {
    throw createAuthError(
      'La autenticacion de Google no esta configurada en el backend. Verifica VITE_GOOGLE_CLIENT_ID.',
      500,
    );
  }
}

function getSessionSecretKey() {
  if (sessionSecretKey) {
    return sessionSecretKey;
  }

  const configuredSecret = String(process.env.APP_SESSION_SECRET || '').trim();

  if (!configuredSecret) {
    if (isProduction) {
      throw createAuthError('APP_SESSION_SECRET no esta configurado en el backend.', 500);
    }

    if (!didWarnAboutEphemeralSecret) {
      didWarnAboutEphemeralSecret = true;
      console.warn('APP_SESSION_SECRET no esta configurado. Se usara una clave efimera solo para desarrollo.');
    }

    sessionSecretKey = createSecretKey(randomBytes(32));
    return sessionSecretKey;
  }

  sessionSecretKey = createSecretKey(Buffer.from(configuredSecret, 'utf-8'));
  return sessionSecretKey;
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex === -1) {
        return cookies;
      }

      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function serializeCookie(name, value, { maxAge, expires } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (typeof maxAge === 'number') {
    parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  }

  if (expires instanceof Date) {
    parts.push(`Expires=${expires.toUTCString()}`);
  }

  if (isProduction) {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function mapMembership(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    rol: row.rol,
    estado: row.estado,
    tenant: {
      id: row.tenant_id,
      slug: row.tenant_slug,
      nombre: row.tenant_nombre,
    },
  };
}

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    nombre: row.nombre || row.email,
    authProviders: normalizeAuthProviders(row.auth_providers),
  };
}

function resolveSessionAuthProvider(requestedProvider, linkedProviders) {
  if (requestedProvider && linkedProviders.includes(requestedProvider)) {
    return requestedProvider;
  }

  return linkedProviders.length === 1 ? linkedProviders[0] : null;
}

function buildSessionResponse({ user, memberships, activeTenantId, authProvider }) {
  const normalizedActiveTenantId = memberships.some((membership) => membership.tenantId === activeTenantId)
    ? activeTenantId
    : (memberships.length === 1 ? memberships[0].tenantId : null);
  const activeMembership = normalizedActiveTenantId
    ? memberships.find((membership) => membership.tenantId === normalizedActiveTenantId) || null
    : null;
  const linkedProviders = normalizeAuthProviders(user.authProviders);
  const sessionAuthProvider = resolveSessionAuthProvider(authProvider, linkedProviders);

  return {
    user: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      authProvider: sessionAuthProvider,
      authProviders: linkedProviders,
    },
    memberships,
    activeTenantId: normalizedActiveTenantId,
    activeTenant: activeMembership ? activeMembership.tenant : null,
    role: activeMembership?.rol || null,
  };
}

async function backfillLegacyAuthIdentities() {
  const legacyUsersResult = await query(
    `
      select id, auth_provider, auth_subject
      from users
      where auth_provider is not null
        and auth_subject is not null
    `,
  );

  for (const legacyUser of legacyUsersResult.rows) {
    const provider = normalizeAuthProvider(legacyUser.auth_provider);
    const subject = String(legacyUser.auth_subject || '').trim();

    if (!subject) {
      continue;
    }

    const existingByProviderSubject = await query(
      `
        select id, user_id
        from user_auth_identities
        where provider = $1
          and subject = $2
        limit 1
      `,
      [provider, subject],
    );
    const linkedIdentity = existingByProviderSubject.rows[0] || null;

    if (linkedIdentity) {
      if (linkedIdentity.user_id !== legacyUser.id) {
        throw createAuthError(
          `La identidad legada de ${getProviderLabel(provider)} ya esta vinculada a otro usuario.`,
          500,
        );
      }

      continue;
    }

    const existingByUserProvider = await query(
      `
        select id, subject
        from user_auth_identities
        where user_id = $1
          and provider = $2
        limit 1
      `,
      [legacyUser.id, provider],
    );
    const providerIdentity = existingByUserProvider.rows[0] || null;

    if (providerIdentity) {
      if (providerIdentity.subject !== subject) {
        throw createAuthError(
          `El usuario ya tiene una identidad distinta de ${getProviderLabel(provider)} vinculada.`,
          500,
        );
      }

      continue;
    }

    await query(
      `
        insert into user_auth_identities (
          id,
          user_id,
          provider,
          subject,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, now(), now())
      `,
      [randomUUID(), legacyUser.id, provider, subject],
    );
  }
}

async function ensureUserAuthIdentitiesSchema() {
  if (userAuthIdentitiesSchemaPromise) {
    return userAuthIdentitiesSchemaPromise;
  }

  userAuthIdentitiesSchemaPromise = (async () => {
    await query(
      `
        create table if not exists user_auth_identities (
          id uuid primary key,
          user_id uuid not null references users(id) on delete cascade,
          provider varchar not null,
          subject varchar not null,
          created_at timestamp with time zone not null default now(),
          updated_at timestamp with time zone not null default now()
        )
      `,
    );
    await query(
      `
        create unique index if not exists idx_user_auth_identities_provider_subject
        on user_auth_identities (provider, subject)
      `,
    );
    await query(
      `
        create unique index if not exists idx_user_auth_identities_user_provider
        on user_auth_identities (user_id, provider)
      `,
    );
    await query(
      `
        create index if not exists idx_user_auth_identities_user_id
        on user_auth_identities (user_id)
      `,
    );

    await backfillLegacyAuthIdentities();
  })().catch((error) => {
    userAuthIdentitiesSchemaPromise = null;
    throw error;
  });

  return userAuthIdentitiesSchemaPromise;
}

async function findUserById(userId) {
  await ensureUserAuthIdentitiesSchema();

  const result = await query(
    `
      select
        u.id,
        u.email,
        u.nombre,
        coalesce(
          (
            select json_agg(identity.provider order by identity.provider)
            from user_auth_identities identity
            where identity.user_id = u.id
          ),
          '[]'::json
        ) as auth_providers
      from users u
      where u.id = $1
      limit 1
    `,
    [userId],
  );

  return mapUser(result.rows[0]);
}

async function findUserByEmail(email) {
  await ensureUserAuthIdentitiesSchema();

  const result = await query(
    `
      select
        u.id,
        u.email,
        u.nombre,
        coalesce(
          (
            select json_agg(identity.provider order by identity.provider)
            from user_auth_identities identity
            where identity.user_id = u.id
          ),
          '[]'::json
        ) as auth_providers
      from users u
      where lower(u.email) = lower($1)
      limit 1
    `,
    [email],
  );

  return mapUser(result.rows[0]);
}

async function findIdentityByProviderSubject(provider, subject) {
  await ensureUserAuthIdentitiesSchema();

  const result = await query(
    `
      select id, user_id, provider, subject
      from user_auth_identities
      where provider = $1
        and subject = $2
      limit 1
    `,
    [provider, subject],
  );

  return result.rows[0] || null;
}

async function findIdentityByUserAndProvider(userId, provider) {
  await ensureUserAuthIdentitiesSchema();

  const result = await query(
    `
      select id, user_id, provider, subject
      from user_auth_identities
      where user_id = $1
        and provider = $2
      limit 1
    `,
    [userId, provider],
  );

  return result.rows[0] || null;
}

async function syncUserProfile(user, { nombre }) {
  const resolvedName = String(nombre || user.nombre || user.email).trim() || user.email;

  if (resolvedName === user.nombre) {
    return user;
  }

  await query(
    `
      update users
      set
        nombre = $2,
        updated_at = now()
      where id = $1
    `,
    [user.id, resolvedName],
  );

  return {
    ...user,
    nombre: resolvedName,
  };
}

async function ensureIdentityLinkedToUser(user, { provider, subject }) {
  const existingUserProviderIdentity = await findIdentityByUserAndProvider(user.id, provider);

  if (existingUserProviderIdentity) {
    if (existingUserProviderIdentity.subject !== subject) {
      throw createAuthError(
        `La cuenta invitada ya esta vinculada a otra identidad de ${getProviderLabel(provider)}.`,
        403,
      );
    }

    return existingUserProviderIdentity;
  }

  const existingIdentity = await findIdentityByProviderSubject(provider, subject);

  if (existingIdentity && existingIdentity.user_id !== user.id) {
    throw createAuthError(
      `La identidad recibida de ${getProviderLabel(provider)} ya esta vinculada a otra cuenta.`,
      403,
    );
  }

  if (existingIdentity) {
    return existingIdentity;
  }

  await query(
    `
      insert into user_auth_identities (
        id,
        user_id,
        provider,
        subject,
        created_at,
        updated_at
      )
      values ($1, $2, $3, $4, now(), now())
    `,
    [randomUUID(), user.id, provider, subject],
  );

  return findIdentityByUserAndProvider(user.id, provider);
}

async function loadActiveMemberships(userId) {
  const result = await query(
    `
      select
        tm.id,
        tm.tenant_id,
        tm.rol,
        tm.estado,
        t.slug as tenant_slug,
        t.nombre as tenant_nombre
      from tenant_memberships tm
      inner join tenants t
        on t.id = tm.tenant_id
      where tm.user_id = $1
        and tm.estado = 'activo'
        and t.estado = 'activo'
      order by t.nombre asc
    `,
    [userId],
  );

  return result.rows.map(mapMembership);
}

async function buildAppSessionForUser(userId, activeTenantId = null, authProvider = null) {
  const user = await findUserById(userId);

  if (!user) {
    throw createAuthError('La sesion ya no corresponde a un usuario valido.', 401);
  }

  const memberships = await loadActiveMemberships(user.id);

  if (memberships.length === 0) {
    throw createAuthError('Tu usuario no tiene tenants activos asignados.', 403);
  }

  return buildSessionResponse({ user, memberships, activeTenantId, authProvider });
}

async function signSessionToken({ userId, activeTenantId, authProvider }) {
  return new SignJWT({
    activeTenantId: activeTenantId || null,
    authProvider: authProvider || null,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionSecretKey());
}

export async function verifyMicrosoftIdToken(idToken) {
  requireMicrosoftConfig();

  const { payload } = await jwtVerify(idToken, microsoftJwks, {
    audience: microsoftClientId,
    issuer: microsoftIssuer,
  });

  const authSubject = String(payload.oid || payload.sub || '').trim();
  const email = normalizeEmail(payload.preferred_username || payload.email || payload.upn);
  const nombre = String(payload.name || payload.given_name || email).trim();

  if (!authSubject || !email) {
    throw createAuthError('No se pudo validar la identidad de Microsoft recibida.', 403);
  }

  return {
    provider: AUTH_PROVIDERS.MICROSOFT,
    authSubject,
    email,
    nombre: nombre || email,
  };
}

export async function verifyGoogleIdToken(idToken) {
  requireGoogleConfig();

  const { payload } = await jwtVerify(idToken, googleJwks, {
    audience: googleClientId,
    issuer: GOOGLE_ISSUERS,
  });

  const authSubject = String(payload.sub || '').trim();
  const email = normalizeEmail(payload.email);
  const nombre = String(payload.name || payload.given_name || email).trim();

  if (!authSubject || !email || !isGoogleEmailVerified(payload.email_verified)) {
    throw createAuthError('No se pudo validar la identidad de Google recibida.', 403);
  }

  return {
    provider: AUTH_PROVIDERS.GOOGLE,
    authSubject,
    email,
    nombre: nombre || email,
  };
}

async function verifyAuthIdToken(provider, idToken) {
  if (provider === AUTH_PROVIDERS.GOOGLE) {
    return verifyGoogleIdToken(idToken);
  }

  return verifyMicrosoftIdToken(idToken);
}

export async function exchangeAuthTokenForSession(provider, idToken) {
  const normalizedProvider = normalizeAuthProvider(provider);
  const authProfile = await verifyAuthIdToken(normalizedProvider, idToken);
  const existingIdentity = await findIdentityByProviderSubject(normalizedProvider, authProfile.authSubject);
  let user = existingIdentity ? await findUserById(existingIdentity.user_id) : null;

  if (!user) {
    user = await findUserByEmail(authProfile.email);

    if (!user) {
      throw createAuthError('Tu cuenta no tiene una invitacion activa en Rekosol.', 403);
    }
  }

  await ensureIdentityLinkedToUser(user, {
    provider: normalizedProvider,
    subject: authProfile.authSubject,
  });
  await syncUserProfile(user, { nombre: authProfile.nombre });

  const hydratedUser = await findUserById(user.id);
  const memberships = await loadActiveMemberships(user.id);

  if (memberships.length === 0) {
    throw createAuthError('Tu usuario no tiene tenants activos asignados.', 403);
  }

  return buildSessionResponse({
    user: hydratedUser,
    memberships,
    activeTenantId: memberships.length === 1 ? memberships[0].tenantId : null,
    authProvider: normalizedProvider,
  });
}

export async function resolveAppSessionFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  const sessionToken = cookies[SESSION_COOKIE_NAME];

  if (!sessionToken) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(sessionToken, getSessionSecretKey(), {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
    const userId = typeof payload.sub === 'string' ? payload.sub : '';
    const activeTenantId = typeof payload.activeTenantId === 'string'
      ? payload.activeTenantId
      : null;
    let authProvider = null;

    if (typeof payload.authProvider === 'string' && payload.authProvider) {
      try {
        authProvider = normalizeAuthProvider(payload.authProvider);
      } catch (_error) {
        authProvider = null;
      }
    }

    if (!userId) {
      return null;
    }

    return buildAppSessionForUser(userId, activeTenantId, authProvider);
  } catch (_error) {
    return null;
  }
}

export async function createSessionCookie(appSession) {
  const token = await signSessionToken({
    userId: appSession.user.id,
    activeTenantId: appSession.activeTenantId,
    authProvider: appSession.user.authProvider,
  });

  return serializeCookie(SESSION_COOKIE_NAME, token, {
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export function clearSessionCookie() {
  return serializeCookie(SESSION_COOKIE_NAME, '', {
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function changeSessionTenant(appSession, tenantId) {
  if (!appSession?.user?.id) {
    throw createAuthError('No hay una sesion activa para cambiar el tenant.', 401);
  }

  const memberships = appSession.memberships || [];
  const tenantMembership = memberships.find((membership) => membership.tenantId === tenantId);

  if (!tenantMembership) {
    throw createAuthError('No tienes acceso al tenant seleccionado.', 403);
  }

  return buildAppSessionForUser(appSession.user.id, tenantId, appSession.user.authProvider || null);
}

export { AUTH_PROVIDERS, createAuthError, ensureUserAuthIdentitiesSchema };
