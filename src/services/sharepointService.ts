import {
  getGraphClient,
  getGraphClientWithScopes,
  getSiteId,
  getAccessToken,
  getSharePointRestToken,
  getSharePointSiteUrl,
} from "@/lib/sharepointClient";
import { msalInstance } from "@/lib/msalConfig";
import type { Gasto, Empresa, Proyecto, Colaborador } from "@/data/mockData";

const SITE_ID_CACHE_KEY = "sharepoint_site_id";
const LIST_IDS_CACHE_KEY = "sharepoint_list_ids";

// Nombres de las listas en SharePoint
const LISTS = {
  GASTOS: "REGISTRO_GASTOS",
  EMPRESAS: "EMPRESAS",
  PROYECTOS: "PROYECTOS",
  COLABORADORES: "COLABORADORES",
  CATEGORIAS: "CATEGORIAS",
  TIPOS_DOCUMENTO: "TIPO_DOCUMENTO",
  DIM_TIPO_DOCUMENTO_PROY: "DIM_TIPO_DOCUMENTO_PROY",
  FCT_DOCUMENTOS_PROY: "FCT_DOCUMENTOS_PROY",
  FCT_HITOS_PAGO_PROY: "FCT_HITOS_PAGO_PROY",
};

// Document Library para archivos adjuntos
const DOCUMENT_LIBRARY = "DocumentosGastos";
const GASTOS_FETCH_LIMIT = 100;
type GastosFetchMode = "recent" | "all";
const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";
const GASTOS_LOCAL_PAGE_PREFIX = "local://gastos/";

type PaginatedGastosResponse = {
  items: Gasto[];
  nextLink: string | null;
};

type SharePointListItem = {
  id: string;
  fields: Record<string, any>;
  attachments?: Array<{ nombre: string; url: string; tipo: string }>;
};

let gastosLocalPaginationCache: SharePointListItem[] | null = null;
const CONTROL_PAGOS_SCHEMA_SCOPES = [
  "https://graph.microsoft.com/Sites.Manage.All",
  "https://graph.microsoft.com/Sites.ReadWrite.All",
];

async function getSchemaGraphClient() {
  return getGraphClientWithScopes(CONTROL_PAGOS_SCHEMA_SCOPES);
}

/**
 * Obtiene el Site ID (cacheado para mejor rendimiento)
 */
async function getCachedSiteId(): Promise<string> {
  const cached = sessionStorage.getItem(SITE_ID_CACHE_KEY);
  if (cached) {
    return cached;
  }
  
  const siteId = await getSiteId();
  sessionStorage.setItem(SITE_ID_CACHE_KEY, siteId);
  return siteId;
}

/**
 * Obtiene el ID de una lista por su nombre (con cachÃ© para mejor rendimiento)
 */
async function getListId(listName: string): Promise<string> {
  // Intentar obtener del cachÃ© primero
  try {
    const cachedListIds = sessionStorage.getItem(LIST_IDS_CACHE_KEY);
    if (cachedListIds) {
      const listIds = JSON.parse(cachedListIds);
      if (listIds[listName]) {
        return listIds[listName];
      }
    }
  } catch (e) {
    // Si hay error al parsear el cachÃ©, continuar con la bÃºsqueda
    console.warn("Error al leer cachÃ© de list IDs:", e);
  }
  
  const client = await getGraphClient();
  const siteId = await getCachedSiteId();
  
  try {
    // Obtener todas las listas de una vez para cachearlas
    const lists = await client
      .api(`/sites/${siteId}/lists`)
      .get();
    
    // Crear un mapa de nombre -> ID
    const listIdsMap: Record<string, string> = {};
    if (lists.value && lists.value.length > 0) {
      lists.value.forEach((list: any) => {
        if (list.displayName) {
          listIdsMap[list.displayName] = list.id;
        }
      });
    }
    
    // Guardar en cachÃ©
    try {
      sessionStorage.setItem(LIST_IDS_CACHE_KEY, JSON.stringify(listIdsMap));
    } catch (e) {
      console.warn("Error al guardar cachÃ© de list IDs:", e);
    }
    
    // Buscar la lista solicitada
    if (listIdsMap[listName]) {
      return listIdsMap[listName];
    }
    
    throw new Error(`Lista "${listName}" no encontrada en SharePoint`);
  } catch (error) {
    console.error(`Error al obtener List ID para ${listName}:`, error);
    throw error;
  }
}

function clearListIdsCache(): void {
  try {
    sessionStorage.removeItem(LIST_IDS_CACHE_KEY);
  } catch (e) {
    console.warn("Error al limpiar cachÃ© de listas:", e);
  }
}

async function getListByName(listName: string, useSchemaClient = false): Promise<any | null> {
  const client = useSchemaClient ? await getSchemaGraphClient() : await getGraphClient();
  const siteId = await getCachedSiteId();

  try {
    const lists = await client
      .api(`/sites/${siteId}/lists`)
      .get();

    if (!lists.value || lists.value.length === 0) {
      return null;
    }

    return lists.value.find((list: any) =>
      String(list.displayName || "").toUpperCase() === listName.toUpperCase()
    ) || null;
  } catch (error) {
    console.error(`Error al buscar lista ${listName}:`, error);
    throw error;
  }
}

async function ensureList(listName: string): Promise<string> {
  const client = await getSchemaGraphClient();
  const siteId = await getCachedSiteId();

  const existing = await getListByName(listName, true);
  if (existing?.id) {
    return existing.id;
  }

  try {
    const created = await client
      .api(`/sites/${siteId}/lists`)
      .post({
        displayName: listName,
        list: {
          template: "genericList",
        },
      });

    clearListIdsCache();
    return created.id;
  } catch (error) {
    console.error(`Error al crear lista ${listName}:`, error);
    throw error;
  }
}

function hasColumn(columns: any[], name: string): boolean {
  return columns.some((col: any) => {
    const displayName = String(col.displayName || "").toUpperCase();
    const internalName = String(col.name || "").toUpperCase();
    const target = name.toUpperCase();
    return displayName === target || internalName === target;
  });
}

async function ensureColumn(
  listId: string,
  name: string,
  definition: Record<string, any>,
): Promise<void> {
  const client = await getSchemaGraphClient();
  const siteId = await getCachedSiteId();

  const columns = await client
    .api(`/sites/${siteId}/lists/${listId}/columns`)
    .get();

  if (hasColumn(columns.value || [], name)) {
    return;
  }

  try {
    await client
      .api(`/sites/${siteId}/lists/${listId}/columns`)
      .post({
        name,
        ...definition,
      });
  } catch (error) {
    console.error(`Error al crear columna ${name} en lista ${listId}:`, error);
    throw error;
  }
}

async function ensureLookupColumn(
  listId: string,
  columnName: string,
  targetListId: string,
  targetColumnName: string,
): Promise<void> {
  const client = await getSchemaGraphClient();
  const siteId = await getCachedSiteId();

  const columns = await client
    .api(`/sites/${siteId}/lists/${listId}/columns`)
    .get();

  if (hasColumn(columns.value || [], columnName)) {
    return;
  }

  const payload = {
    name: columnName,
    lookup: {
      allowMultipleValues: false,
      listId: targetListId,
      columnName: targetColumnName,
    },
  };

  try {
    await client
      .api(`/sites/${siteId}/lists/${listId}/columns`)
      .post(payload);
  } catch (error) {
    // fallback tÃ­pico cuando la columna objetivo no coincide en todos los tenants
    if (targetColumnName.toUpperCase() !== "TITLE") {
      await client
        .api(`/sites/${siteId}/lists/${listId}/columns`)
        .post({
          ...payload,
          lookup: {
            ...payload.lookup,
            columnName: "Title",
          },
        });
      return;
    }

    console.error(`Error al crear lookup ${columnName}:`, error);
    throw error;
  }
}

/**
 * Obtiene el email del usuario logueado desde MSAL
 */
function getUserEmail(): string | null {
  try {
    const account = msalInstance.getActiveAccount();
    console.log("[INFO]¿½ Account completo:", account);
    
    if (account) {
      // Intentar diferentes propiedades donde puede estar el email
      const email = account.username || 
                   (account as any).mail || 
                   (account as any).email ||
                   account.name;
      
      if (email) {
        console.log(`ï¿½o. Email del usuario encontrado: ${email}`);
        console.log(`[INFO]¿½ Account.username: ${account.username}`);
        console.log(`[INFO]¿½ Account.name: ${account.name}`);
        console.log(`[INFO]¿½ Account.mail: ${(account as any).mail}`);
        return email;
      }
    }
    
    console.warn("ï¿½sï¿½ï¸ No se pudo obtener el email del usuario. Account:", account);
    return null;
  } catch (error) {
    console.error("Error al obtener email del usuario:", error);
    return null;
  }
}

/**
 * Busca un colaborador por su email en la lista COLABORADORES
 */
async function findColaboradorByEmail(email: string): Promise<string | null> {
  try {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.COLABORADORES);
    
    console.log(`[INFO]¿½ Buscando colaborador con email: ${email}`);
    console.log(`[INFO] List ID de COLABORADORES: ${listId}`);
    
    // Obtener todos los colaboradores y filtrar en memoria (mÃ¡s confiable que el filtro de Graph API)
    const response = await client
      .api(`/sites/${siteId}/lists/${listId}/items`)
      .expand("fields")
      .get();
    
    console.log(`[INFO] Total de colaboradores encontrados: ${response.value?.length || 0}`);
    
    if (response.value && response.value.length > 0) {
      // Mostrar todos los colaboradores para debugging
      response.value.forEach((item: any, index: number) => {
        const correo = item.fields?.CORREO || item.fields?.Correo || item.fields?.Email || item.fields?.correo || 'N/A';
        const nombre = item.fields?.NOMBRE || item.fields?.Nombre || item.fields?.Title || 'N/A';
        console.log(`  Colaborador ${index + 1}: ID=${item.id}, Nombre=${nombre}, Correo=${correo}`);
      });
      
      // Buscar por email (comparar en minÃºsculas para evitar problemas de mayÃºsculas/minÃºsculas)
      const emailLower = email.toLowerCase().trim();
      const colaborador = response.value.find((item: any) => {
        const correo = (item.fields?.CORREO || item.fields?.Correo || item.fields?.Email || item.fields?.correo || '').toLowerCase().trim();
        return correo === emailLower;
      });
      
      if (colaborador) {
        const colaboradorId = colaborador.id;
        const nombre = colaborador.fields?.NOMBRE || colaborador.fields?.Nombre || colaborador.fields?.Title || 'N/A';
        console.log(`ï¿½o. Colaborador encontrado por email ${email}: ID ${colaboradorId}, Nombre: ${nombre}`);
        return colaboradorId;
      }
    }
    
    console.warn(`ï¿½sï¿½ï¸ No se encontrÃ³ colaborador con email: ${email}`);
    console.warn(`ï¿½sï¿½ï¸ Emails disponibles en la lista:`);
    if (response.value) {
      response.value.forEach((item: any) => {
        const correo = item.fields?.CORREO || item.fields?.Correo || item.fields?.Email || item.fields?.correo || 'N/A';
        console.warn(`  - ${correo}`);
      });
    }
    return null;
  } catch (error) {
    console.error("ï¿½O Error al buscar colaborador por email:", error);
    if (error instanceof Error) {
      console.error("ï¿½O Mensaje de error:", error.message);
    }
    return null;
  }
}

/**
 * Obtiene el nombre interno de una columna por su nombre de visualizaciÃ³n
 */
async function getColumnInternalName(listId: string, displayName: string): Promise<string> {
  const client = await getGraphClient();
  const siteId = await getCachedSiteId();
  
  try {
    const columns = await client
      .api(`/sites/${siteId}/lists/${listId}/columns`)
      .get();
    
    // Buscar la columna por nombre de visualizaciÃ³n
    const column = columns.value.find((col: any) => 
      col.displayName === displayName || 
      col.name === displayName ||
      col.displayName?.toUpperCase() === displayName.toUpperCase() ||
      col.name?.toUpperCase() === displayName.toUpperCase()
    );
    
    if (column) {
      console.log(`[INFO] Columna encontrada:`, {
        displayName: column.displayName,
        name: column.name,
        type: column.text ? 'text' : column.lookup ? 'lookup' : column.type,
        lookup: column.lookup ? {
          allowMultipleValues: column.lookup.allowMultipleValues,
          isRelationship: column.lookup.isRelationship,
          relationshipDeleteBehavior: column.lookup.relationshipDeleteBehavior,
          listId: column.lookup.listId,
          columnName: column.lookup.columnName
        } : null
      });
      
      // Para campos lookup, SharePoint crea campos adicionales con sufijos
      // El nombre interno puede ser diferente, pero para actualizar necesitamos usar el formato correcto
      return column.name; // Nombre interno
    }
    
    // Si no se encuentra, devolver el nombre original
    console.warn(`ï¿½sï¿½ï¸ Columna "${displayName}" no encontrada, usando nombre original`);
    console.warn(`ï¿½sï¿½ï¸ Columnas disponibles:`, columns.value.map((c: any) => ({ displayName: c.displayName, name: c.name })));
    return displayName;
  } catch (error) {
    console.error(`Error al obtener nombre interno de columna "${displayName}":`, error);
    return displayName; // Fallback al nombre original
  }
}

function parseFecha(fecha: unknown): number {
  if (!fecha) return 0;
  const parsed = new Date(String(fecha)).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeNextLink(nextLink: string): string {
  return nextLink.startsWith(GRAPH_BASE_URL)
    ? nextLink.slice(GRAPH_BASE_URL.length)
    : nextLink;
}

function isNonIndexedFechaError(error: unknown): boolean {
  const orderByMessage = error instanceof Error ? error.message : String(error);
  return (
    orderByMessage.includes("cannot be referenced in filter or orderby") &&
    orderByMessage.toUpperCase().includes("FECHA")
  );
}

function sortGastosItemsByFechaDesc(items: SharePointListItem[]): SharePointListItem[] {
  return [...items].sort((a, b) => {
    const fechaA = a.fields?.FECHA || a.fields?.Fecha || a.fields?.fecha;
    const fechaB = b.fields?.FECHA || b.fields?.Fecha || b.fields?.fecha;
    return parseFecha(fechaB) - parseFecha(fechaA);
  });
}

function buildLocalPageToken(offset: number): string {
  return `${GASTOS_LOCAL_PAGE_PREFIX}${offset}`;
}

function parseLocalPageToken(nextLink: string): number | null {
  if (!nextLink.startsWith(GASTOS_LOCAL_PAGE_PREFIX)) return null;
  const rawOffset = nextLink.slice(GASTOS_LOCAL_PAGE_PREFIX.length);
  const offset = Number(rawOffset);
  if (!Number.isInteger(offset) || offset < 0) return null;
  return offset;
}

async function getAllGastosItemsWithoutServerOrdering(
  client: any,
  siteId: string,
  listId: string
): Promise<SharePointListItem[]> {
  const allItems: SharePointListItem[] = [];
  let page = await client
    .api(`/sites/${siteId}/lists/${listId}/items`)
    .expand("fields")
    .top(500)
    .get();

  if (page.value?.length) {
    allItems.push(...page.value);
  }

  let nextLink = page["@odata.nextLink"] as string | undefined;
  while (nextLink) {
    page = await client
      .api(normalizeNextLink(nextLink))
      .get();

    if (page.value?.length) {
      allItems.push(...page.value);
    }

    nextLink = page["@odata.nextLink"] as string | undefined;
  }

  return allItems;
}

async function loadAttachmentsForGastosItems(
  items: SharePointListItem[],
  includeAttachments: boolean
): Promise<SharePointListItem[]> {
  if (!includeAttachments || items.length === 0) {
    return items;
  }

  const siteUrl = getSharePointSiteUrl();
  const token = await getSharePointRestToken();

  return Promise.all(
    items.map(async (item) => {
      let attachments: Array<{ nombre: string; url: string; tipo: string }> = [];

      if (item.fields?.Attachments === true) {
        try {
          const listName = LISTS.GASTOS;
          const restApiUrl = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items(${item.id})/AttachmentFiles`;
          const attachmentsResponse = await fetch(restApiUrl, {
            method: "GET",
            headers: {
              Accept: "application/json;odata=verbose",
              Authorization: `Bearer ${token}`,
            },
          });

          if (attachmentsResponse.ok) {
            const data = await attachmentsResponse.json();
            if (data.d && data.d.results && data.d.results.length > 0) {
              attachments = data.d.results.map((att: any) => {
                const escapedUrl = att.ServerRelativeUrl.replace(/'/g, "''");
                const downloadUrl = `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${escapedUrl}')/$value`;

                return {
                  nombre: att.FileName,
                  url: downloadUrl,
                  tipo: att.ContentType || "application/octet-stream",
                };
              });
            }
          }
        } catch (attachmentsError) {
          console.warn(`ï¿½sï¿½ï¸ No se pudieron obtener attachments para item ${item.id}:`, attachmentsError);
        }
      }

      return {
        ...item,
        attachments,
      };
    })
  );
}

function mapSharePointGastoItem(item: SharePointListItem): Gasto {
  let categoriaId = "";
  const categoriaLookupId = item.fields.CATEGORIALookupId ||
    item.fields.CATEGORIA_x003a__x0020_IDLookupId ||
    item.fields.CATEGORIA;
  if (categoriaLookupId) {
    if (typeof categoriaLookupId === "object" && categoriaLookupId.LookupId) {
      categoriaId = String(categoriaLookupId.LookupId);
    } else {
      categoriaId = String(categoriaLookupId);
    }
  }

  let empresaId = "";
  const empresaLookupId = item.fields.EMPRESALookupId ||
    item.fields.EMPRESA_x003a__x0020_IDLookupId ||
    item.fields.EMPRESA;
  if (empresaLookupId) {
    empresaId = String(empresaLookupId);
  }

  let tipoDocumentoId = "";
  const tipoDocumentoLookupId = item.fields.TIPO_DOCUMENTOLookupId ||
    item.fields.TIPO_DOCUMENTO_x003a__x0020_IDLookupId ||
    item.fields.TIPO_DOCUMENTO;
  if (tipoDocumentoLookupId) {
    tipoDocumentoId = String(tipoDocumentoLookupId);
  }

  let proyectoId = "";
  const proyectoLookupId = item.fields.PROYECTOLookupId ||
    item.fields.PROYECTO_x003a__x0020_IDLookupId ||
    item.fields.PROYECTO;
  if (proyectoLookupId) {
    proyectoId = String(proyectoLookupId);
  }

  let colaboradorId = "";
  let colaboradorNombre = "";
  const personaLookupRaw = item.fields.PERSONA;
  const personaLookupId = item.fields.PERSONALookupId || item.fields.PERSONA_x003a__x0020_IDLookupId;

  if (personaLookupRaw) {
    if (typeof personaLookupRaw === "object") {
      const lookupId = (personaLookupRaw as any).LookupId;
      const lookupValue = (personaLookupRaw as any).LookupValue;
      const displayValue = (personaLookupRaw as any).Value;

      if (lookupId) {
        colaboradorId = String(lookupId);
      }
      if (typeof lookupValue === "string" && lookupValue.trim() !== "") {
        colaboradorNombre = lookupValue.trim();
      } else if (typeof displayValue === "string" && displayValue.trim() !== "") {
        colaboradorNombre = displayValue.trim();
      }
    } else if (typeof personaLookupRaw === "number") {
      colaboradorId = String(personaLookupRaw);
    } else if (typeof personaLookupRaw === "string") {
      const valorPersona = personaLookupRaw.trim();
      if (valorPersona !== "") {
        if (/^\d+$/.test(valorPersona)) {
          colaboradorId = valorPersona;
        } else {
          colaboradorNombre = valorPersona;
        }
      }
    }
  }

  if (!colaboradorId && personaLookupId) {
    colaboradorId = String(personaLookupId);
  }

  const baseGasto: Gasto = {
    id: item.id,
    fecha: item.fields.FECHA || item.fields.Fecha || item.fields.fecha || "",
    empresaId,
    categoria: categoriaId,
    tipoDocumento: tipoDocumentoId || "Factura",
    numeroDocumento: item.fields.NUMERO_DOCUMENTO || item.fields.NumeroDocumento || item.fields.numeroDocumento || "",
    montoTotal: item.fields.MONTO_TOTAL || item.fields.MontoTotal || item.fields.montoTotal || item.fields.MONTO || item.fields.Monto || item.fields.monto || 0,
    monto: item.fields.MONTO_TOTAL || item.fields.MontoTotal || item.fields.montoTotal || item.fields.MONTO || item.fields.Monto || item.fields.monto || 0,
    montoNeto: item.fields.MONTO_NETO || item.fields.MontoNeto || item.fields.montoNeto || undefined,
    iva: item.fields.IVA || item.fields.Iva || item.fields.iva || undefined,
    detalle: item.fields.DETALLE || item.fields.Detalle || item.fields.detalle || "",
    proyectoId: proyectoId || undefined,
    colaboradorId: colaboradorId || undefined,
    comentarioTipoDocumento: item.fields.OTRO || item.fields.Otro || item.fields.otro || undefined,
    archivosAdjuntos: item.attachments && item.attachments.length > 0 ? item.attachments : undefined,
  };

  if (colaboradorNombre) {
    return {
      ...baseGasto,
      colaboradorNombre,
    } as Gasto;
  }

  return baseGasto;
}

// ========== SERVICIOS PARA GASTOS ==========

export const gastosService = {
  // FunciÃ³n temporal para revisar un item especÃ­fico con attachments
  async checkItemWithAttachments(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);
    
    try {
      // Obtener el item
      const item = await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .expand("fields")
        .get();
      
      console.log("[INFO] Item completo:", JSON.stringify(item, null, 2));
      
      // Para SharePoint lists, los attachments se acceden usando SharePoint REST API directamente
      // No se puede usar Microsoft Graph API para attachments en list items
      console.log("[INFO] Campo Attachments en fields:", item.fields?.Attachments);
      console.log("[INFO] webUrl del item:", item.webUrl);
      
      // Usar SharePoint REST API directamente para obtener attachments
      // Necesitamos un token especÃ­fico para SharePoint REST API (no el de Microsoft Graph)
      
      // Construir la URL de SharePoint REST API usando el nombre de la lista
      // IMPORTANTE: Usar la URL completa del sitio (incluyendo el path), no solo el origin
      const siteUrl = getSharePointSiteUrl();
      const token = await getSharePointRestToken(); // Token especÃ­fico para SharePoint REST API
      const listName = LISTS.GASTOS; // Usar el nombre de la lista
      const restApiUrl = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items(${id})/AttachmentFiles`;
      
      console.log("[INFO] Intentando obtener attachments desde SharePoint REST API:", restApiUrl);
      
      try {
        const response = await fetch(restApiUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/json;odata=verbose',
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("[INFO] Attachments desde SharePoint REST API:", JSON.stringify(data, null, 2));
          
          if (data.d && data.d.results && data.d.results.length > 0) {
            console.log("[INFO] NÃºmero de attachments encontrados:", data.d.results.length);
            
            data.d.results.forEach((att: any, index: number) => {
              console.log(`[INFO] Attachment ${index + 1}:`, {
                FileName: att.FileName,
                ServerRelativeUrl: att.ServerRelativeUrl,
                // Construir URL completa
                fullUrl: `${new URL(siteUrl).origin}${att.ServerRelativeUrl}`,
                // Ver todos los campos disponibles
                allFields: Object.keys(att),
                fullObject: att,
              });
            });
          } else {
            console.log("[INFO] No se encontraron attachments en la respuesta");
          }
        } else {
          const errorText = await response.text();
          console.error("ï¿½O Error al obtener attachments:", response.status, errorText);
        }
      } catch (restError: any) {
        console.error("ï¿½O Error al usar SharePoint REST API:", restError);
      }
    } catch (error) {
      console.error("Error al revisar item con attachments:", error);
      throw error;
    }
  },

  // FunciÃ³n temporal para revisar las columnas lookup
  async checkLookupColumns(): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);
    
    try {
      // Obtener todas las columnas
      const columns = await client
        .api(`/sites/${siteId}/lists/${listId}/columns`)
        .get();
      
      console.log("[INFO] Todas las columnas de la lista:");
      columns.value.forEach((col: any) => {
        if (col.lookup) {
          console.log(`[INFO]¿½ Columna lookup encontrada:`, {
            displayName: col.displayName,
            name: col.name,
            lookup: {
              listId: col.lookup.listId,
              columnName: col.lookup.columnName,
              allowMultipleValues: col.lookup.allowMultipleValues
            }
          });
        }
      });
      
      // Obtener un item reciente para ver los nombres reales de los campos
      const items = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .top(1)
        .get();
      
      if (items.value && items.value.length > 0) {
        const item = items.value[0];
        console.log("[INFO] Item de ejemplo:", item.id);
        console.log("[INFO] Todos los campos del item:", Object.keys(item.fields || {}));
        
        // Buscar campos que contengan "EMPRESA", "PROYECTO", "TIPO_DOCUMENTO"
        const camposRelevantes = Object.keys(item.fields || {}).filter(k => 
          k.includes('EMPRESA') || 
          k.includes('PROYECTO') || 
          k.includes('TIPO_DOCUMENTO') ||
          k.includes('TipoDocumento') ||
          k.includes('Empresa') ||
          k.includes('Proyecto')
        );
        
        console.log("[INFO] Campos relevantes encontrados:");
        camposRelevantes.forEach(campo => {
          console.log(`  - ${campo}:`, item.fields[campo], `(tipo: ${typeof item.fields[campo]})`);
        });
      }
    } catch (error) {
      console.error("Error al revisar columnas:", error);
      throw error;
    }
  },

  async getPage(options: { top?: number; nextLink?: string | null; includeAttachments?: boolean } = {}): Promise<PaginatedGastosResponse> {
    const { top = 50, nextLink = null, includeAttachments = true } = options;
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);

    const pageSize = Math.max(1, Math.floor(top));

    try {
      const localOffset = nextLink ? parseLocalPageToken(nextLink) : null;
      if (localOffset !== null) {
        const localCache = gastosLocalPaginationCache || [];
        const pagedItems = localCache.slice(localOffset, localOffset + pageSize);
        const withAttachments = await loadAttachmentsForGastosItems(pagedItems, includeAttachments);
        const nextOffset = localOffset + pageSize;

        return {
          items: withAttachments.map(mapSharePointGastoItem),
          nextLink: nextOffset < localCache.length ? buildLocalPageToken(nextOffset) : null,
        };
      }

      if (nextLink) {
        const response = await client
          .api(normalizeNextLink(nextLink))
          .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
          .get();

        const rawItems: SharePointListItem[] = response.value || [];
        const withAttachments = await loadAttachmentsForGastosItems(rawItems, includeAttachments);

        return {
          items: withAttachments.map(mapSharePointGastoItem),
          nextLink: (response["@odata.nextLink"] as string | undefined) || null,
        };
      }

      try {
        const response = await client
          .api(`/sites/${siteId}/lists/${listId}/items`)
          .expand("fields")
          .orderby("fields/FECHA desc")
          .top(pageSize)
          .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
          .get();

        gastosLocalPaginationCache = null;
        const rawItems: SharePointListItem[] = response.value || [];
        const withAttachments = await loadAttachmentsForGastosItems(rawItems, includeAttachments);

        return {
          items: withAttachments.map(mapSharePointGastoItem),
          nextLink: (response["@odata.nextLink"] as string | undefined) || null,
        };
      } catch (orderByError) {
        if (!isNonIndexedFechaError(orderByError)) {
          throw orderByError;
        }

        console.warn("WARNING: FECHA no esta indexada en SharePoint. Aplicando fallback con paginacion local.");
        const allItems = await getAllGastosItemsWithoutServerOrdering(client, siteId, listId);
        const sortedItems = sortGastosItemsByFechaDesc(allItems);
        gastosLocalPaginationCache = sortedItems;

        const firstPageItems = sortedItems.slice(0, pageSize);
        const withAttachments = await loadAttachmentsForGastosItems(firstPageItems, includeAttachments);

        return {
          items: withAttachments.map(mapSharePointGastoItem),
          nextLink: pageSize < sortedItems.length ? buildLocalPageToken(pageSize) : null,
        };
      }
    } catch (error) {
      console.error("Error al obtener pï¿½gina de gastos:", error);
      throw error;
    }
  },

  async getAll(options: { mode?: GastosFetchMode; includeAttachments?: boolean } = {}): Promise<Gasto[]> {
    const { mode = "recent", includeAttachments = true } = options;
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);

    try {
      let gastosItems: SharePointListItem[] = [];

      if (mode === "all") {
        const allItems = await getAllGastosItemsWithoutServerOrdering(client, siteId, listId);
        gastosItems = sortGastosItemsByFechaDesc(allItems);
      } else {
        try {
          const response = await client
            .api(`/sites/${siteId}/lists/${listId}/items`)
            .expand("fields")
            .orderby("fields/FECHA desc")
            .top(GASTOS_FETCH_LIMIT)
            .header("Prefer", "HonorNonIndexedQueriesWarningMayFailRandomly")
            .get();

          gastosItems = response.value || [];
        } catch (orderByError) {
          if (!isNonIndexedFechaError(orderByError)) {
            throw orderByError;
          }

          console.warn("WARNING: FECHA no esta indexada en SharePoint. Aplicando fallback con paginacion local.");
          const allItems = await getAllGastosItemsWithoutServerOrdering(client, siteId, listId);
          gastosItems = sortGastosItemsByFechaDesc(allItems).slice(0, GASTOS_FETCH_LIMIT);
        }
      }

      const gastosProcesados =
        mode === "recent"
          ? gastosItems.slice(0, GASTOS_FETCH_LIMIT)
          : gastosItems;

      const withAttachments = await loadAttachmentsForGastosItems(gastosProcesados, includeAttachments);
      return withAttachments.map(mapSharePointGastoItem);
    } catch (error) {
      console.error("Error al obtener gastos:", error);
      throw error;
    }
  },

  async create(gasto: Omit<Gasto, "id">): Promise<Gasto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);
    
    try {
      // Obtener el email del usuario logueado y buscar el colaborador correspondiente
      const userEmail = getUserEmail();
      let personaId: number | null = null;
      
      if (userEmail) {
        console.log(`[INFO]¿½ Buscando colaborador para el usuario: ${userEmail}`);
        const colaboradorIdStr = await findColaboradorByEmail(userEmail);
        if (colaboradorIdStr) {
          const parsed = Number(colaboradorIdStr);
          if (!isNaN(parsed) && parsed > 0) {
            personaId = parsed;
            console.log(`ï¿½o. Colaborador encontrado, ID: ${personaId}`);
          }
        }
      } else {
        console.warn("ï¿½sï¿½ï¸ No se pudo obtener el email del usuario logueado");
      }
      
      // Obtener los nombres internos de las columnas lookup
      const categoriaColumnName = await getColumnInternalName(listId, "CATEGORIA");
      const empresaColumnName = await getColumnInternalName(listId, "EMPRESA");
      const proyectoColumnName = await getColumnInternalName(listId, "PROYECTO");
      const tipoDocumentoColumnName = await getColumnInternalName(listId, "TIPO_DOCUMENTO");
      const personaColumnName = await getColumnInternalName(listId, "PERSONA");
      
      console.log("[INFO] Nombres internos de columnas lookup:");
      console.log("  - CATEGORIA:", categoriaColumnName);
      console.log("  - EMPRESA:", empresaColumnName);
      console.log("  - PROYECTO:", proyectoColumnName);
      console.log("  - TIPO_DOCUMENTO:", tipoDocumentoColumnName);
      console.log("  - PERSONA:", personaColumnName);
      
      // Parsear IDs de campos lookup (deben ser nÃºmeros)
      let categoriaId: number | null = null;
      if (gasto.categoria) {
        const parsed = Number(gasto.categoria);
        if (!isNaN(parsed) && parsed > 0) {
          categoriaId = parsed;
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de categorÃ­a invÃ¡lido:", gasto.categoria);
        }
      }
      
      let empresaId: number | null = null;
      if (gasto.empresaId) {
        const parsed = Number(gasto.empresaId);
        if (!isNaN(parsed) && parsed > 0) {
          empresaId = parsed;
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de empresa invÃ¡lido:", gasto.empresaId);
        }
      }
      
      let proyectoId: number | null = null;
      if (gasto.proyectoId) {
        const parsed = Number(gasto.proyectoId);
        if (!isNaN(parsed) && parsed > 0) {
          proyectoId = parsed;
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de proyecto invÃ¡lido:", gasto.proyectoId);
        }
      }
      
      // TIPO_DOCUMENTO es lookup, necesitamos el ID
      // Por ahora, asumimos que viene como ID numÃ©rico
      let tipoDocumentoId: number | null = null;
      if (gasto.tipoDocumento) {
        const parsed = Number(gasto.tipoDocumento);
        if (!isNaN(parsed) && parsed > 0) {
          tipoDocumentoId = parsed;
        } else {
          // Si no es un nÃºmero, puede ser el nombre del tipo de documento
          // Por ahora, lo ignoramos y se actualizarÃ¡ despuÃ©s si es necesario
          console.warn("ï¿½sï¿½ï¸ TIPO_DOCUMENTO no es un ID numÃ©rico:", gasto.tipoDocumento);
        }
      }
      
      // Campos bÃ¡sicos que NO son lookup
      // Ya no guardamos MONTO, solo MONTO_TOTAL
      const fields: any = {
        FECHA: gasto.fecha,
        // MONTO_TOTAL siempre se guarda (es el monto total, con o sin impuestos)
        MONTO_TOTAL: gasto.montoTotal !== undefined && gasto.montoTotal !== null 
          ? gasto.montoTotal 
          : gasto.monto, // Fallback al monto si no hay montoTotal
      };
      
      // Agregar campos de impuestos si estÃ¡n definidos
      if (gasto.montoNeto !== undefined && gasto.montoNeto !== null) {
        fields.MONTO_NETO = gasto.montoNeto;
      }
      if (gasto.iva !== undefined && gasto.iva !== null) {
        fields.IVA = gasto.iva;
      }
      
      // Agregar campos de texto simples (estos deberÃ­an funcionar)
      if (gasto.detalle && gasto.detalle.trim() !== "") {
        fields.DETALLE = gasto.detalle;
      }
      
      if (gasto.numeroDocumento && gasto.numeroDocumento.trim() !== "") {
        fields.NUMERO_DOCUMENTO = gasto.numeroDocumento;
      }
      
      if (gasto.comentarioTipoDocumento && gasto.comentarioTipoDocumento.trim() !== "") {
        fields.OTRO = gasto.comentarioTipoDocumento;
      }
      
      // NOTA: Todos los campos lookup (CATEGORIA, EMPRESA, PROYECTO, TIPO_DOCUMENTO)
      // se manejarÃ¡n despuÃ©s con PATCH, no se agregan al POST inicial
      
      // Solo agregar ArchivosAdjuntos si existe
      if (gasto.archivosAdjuntos && gasto.archivosAdjuntos.length > 0) {
        fields.ArchivosAdjuntos = JSON.stringify(gasto.archivosAdjuntos);
      }
      
      console.log("[INFO]¿½ Campos a enviar:", JSON.stringify(fields, null, 2));
      console.log("[INFO]¿½ Tipo de cada campo:", Object.keys(fields).map(key => `${key}: ${typeof fields[key]}`));
      
      // Validar que no haya campos undefined o null (SharePoint no los acepta)
      const cleanFields: any = {};
      Object.keys(fields).forEach(key => {
        const value = fields[key];
        // Solo incluir campos que tengan un valor vÃ¡lido
        if (value !== undefined && value !== null && value !== "") {
          cleanFields[key] = value;
        }
      });
      
      console.log("[INFO]¿½ Campos limpios a enviar:", JSON.stringify(cleanFields, null, 2));
      
      // Limpiar campos y preparar para envÃ­o
      const fieldsToSend = { ...cleanFields };
      
      // Remover ArchivosAdjuntos por ahora (puede causar problemas)
      if (fieldsToSend.ArchivosAdjuntos) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo ArchivosAdjuntos (se agregarÃ¡ despuÃ©s)...");
        delete fieldsToSend.ArchivosAdjuntos;
      }
      
      // Remover cualquier referencia al campo MONTO (ya no existe, se usa MONTO_TOTAL y MONTO_NETO)
      if (fieldsToSend.MONTO) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo MONTO (ya no existe, se usa MONTO_TOTAL y MONTO_NETO)...");
        delete fieldsToSend.MONTO;
      }
      if (fieldsToSend.Monto) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo Monto (ya no existe, se usa MONTO_TOTAL y MONTO_NETO)...");
        delete fieldsToSend.Monto;
      }
      if (fieldsToSend.monto) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo monto (ya no existe, se usa MONTO_TOTAL y MONTO_NETO)...");
        delete fieldsToSend.monto;
      }
      
      // Remover todos los campos lookup del POST inicial (SharePoint rechaza lookup en POST)
      // Estos se actualizarÃ¡n despuÃ©s con PATCH
      const lookupFieldsToUpdate: { [key: string]: number } = {};
      
      // CATEGORIA
      if (fieldsToSend[categoriaColumnName] || fieldsToSend.CATEGORIA) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo CATEGORIA del POST (se actualizarÃ¡ con PATCH despuÃ©s)");
        delete fieldsToSend[categoriaColumnName];
        delete fieldsToSend.CATEGORIA;
      }
      if (categoriaId !== null) {
        lookupFieldsToUpdate[`${categoriaColumnName}LookupId`] = categoriaId;
        console.log("[INFO]¿½ CategorÃ­a ID guardado para actualizar despuÃ©s:", categoriaId);
      }
      
      // EMPRESA
      if (fieldsToSend[empresaColumnName] || fieldsToSend.EMPRESA) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo EMPRESA del POST (se actualizarÃ¡ con PATCH despuÃ©s)");
        delete fieldsToSend[empresaColumnName];
        delete fieldsToSend.EMPRESA;
      }
      if (empresaId !== null) {
        lookupFieldsToUpdate[`${empresaColumnName}LookupId`] = empresaId;
        console.log("[INFO]¿½ Empresa ID guardado para actualizar despuÃ©s:", empresaId);
      }
      
      // PROYECTO
      if (fieldsToSend[proyectoColumnName] || fieldsToSend.PROYECTO) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo PROYECTO del POST (se actualizarÃ¡ con PATCH despuÃ©s)");
        delete fieldsToSend[proyectoColumnName];
        delete fieldsToSend.PROYECTO;
      }
      if (proyectoId !== null) {
        lookupFieldsToUpdate[`${proyectoColumnName}LookupId`] = proyectoId;
        console.log("[INFO]¿½ Proyecto ID guardado para actualizar despuÃ©s:", proyectoId);
      }
      
      // TIPO_DOCUMENTO
      if (fieldsToSend[tipoDocumentoColumnName] || fieldsToSend.TIPO_DOCUMENTO) {
        console.log("ï¿½sï¿½ï¸ Removiendo campo TIPO_DOCUMENTO del POST (se actualizarÃ¡ con PATCH despuÃ©s)");
        delete fieldsToSend[tipoDocumentoColumnName];
        delete fieldsToSend.TIPO_DOCUMENTO;
      }
      if (tipoDocumentoId !== null) {
        lookupFieldsToUpdate[`${tipoDocumentoColumnName}LookupId`] = tipoDocumentoId;
        console.log("[INFO]¿½ Tipo Documento ID guardado para actualizar despuÃ©s:", tipoDocumentoId);
      }
      
      // PERSONA (colaborador identificado por email del usuario logueado)
      if (personaId !== null) {
        const personaLookupField = `${personaColumnName}LookupId`;
        lookupFieldsToUpdate[personaLookupField] = personaId;
        console.log("[INFO]¿½ Persona ID guardado para actualizar despuÃ©s:");
        console.log(`  - Campo: ${personaLookupField}`);
        console.log(`  - Valor: ${personaId}`);
        console.log(`  - Tipo: ${typeof personaId}`);
      } else {
        console.warn("ï¿½sï¿½ï¸ No se pudo obtener el ID de la persona. No se guardarÃ¡ en el campo PERSONA.");
      }
      
      console.log("[INFO]¿½ Campos finales a enviar (sin categorÃ­a):", JSON.stringify(fieldsToSend, null, 2));
      console.log("[INFO]¿½ Â¿Incluye CATEGORIA?", categoriaColumnName in fieldsToSend || "CATEGORIA" in fieldsToSend);
      
      // Crear el item SIN el campo lookup primero (para evitar error 400)
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .post({
          fields: fieldsToSend,
        });
      
      console.log("ï¿½o. Gasto creado exitosamente (sin campos lookup). Response ID:", response.id);
      
      // Actualizar todos los campos lookup con PATCH despuÃ©s de crear el item
      // IMPORTANTE: Para campos lookup, SharePoint usa nombres con sufijo "LookupId"
      if (Object.keys(lookupFieldsToUpdate).length > 0) {
        try {
          console.log("[INFO]¿½ Actualizando campos lookup despuÃ©s de crear el item...");
          console.log("[INFO]¿½ ID del item:", response.id);
          console.log("[INFO]¿½ Campos lookup a actualizar:", lookupFieldsToUpdate);
          
          // Actualizar todos los campos lookup en una sola llamada PATCH
          await client
            .api(`/sites/${siteId}/lists/${listId}/items/${response.id}/fields`)
            .patch(lookupFieldsToUpdate);
          
          console.log("ï¿½o. Campos lookup actualizados exitosamente");
          
          // Leer el item actualizado para verificar
          const itemUpdated = await client
            .api(`/sites/${siteId}/lists/${listId}/items/${response.id}`)
            .expand("fields")
            .get();
          
          // Verificar que los campos se guardaron
          console.log("[INFO]¿½ Verificando campos lookup actualizados:");
          Object.keys(lookupFieldsToUpdate).forEach(fieldName => {
            const valorGuardado = itemUpdated.fields?.[fieldName];
            if (valorGuardado) {
              console.log(`ï¿½o. Campo ${fieldName} verificado y guardado correctamente:`, valorGuardado);
            } else {
              console.warn(`ï¿½sï¿½ï¸ Campo ${fieldName} no aparece despuÃ©s de actualizar. Verifica en SharePoint.`);
              console.warn(`ï¿½sï¿½ï¸ Campos disponibles en el item:`, Object.keys(itemUpdated.fields || {}));
            }
          });
          
          // VerificaciÃ³n especÃ­fica para PERSONA
          if (personaId !== null) {
            const personaLookupField = `${personaColumnName}LookupId`;
            const personaGuardada = itemUpdated.fields?.[personaLookupField];
            if (personaGuardada) {
              console.log(`ï¿½o. Campo PERSONA (${personaLookupField}) guardado correctamente:`, personaGuardada);
            } else {
              console.error(`ï¿½O Campo PERSONA (${personaLookupField}) NO se guardÃ³. Valor esperado: ${personaId}`);
              console.error(`ï¿½O Todos los campos del item:`, JSON.stringify(itemUpdated.fields, null, 2));
            }
          }
        } catch (updateError: any) {
          console.error("ï¿½O Error al actualizar los campos lookup:", updateError);
          if (updateError?.body) {
            console.error("ï¿½O Detalles del error:", JSON.stringify(updateError.body, null, 2));
          }
          // No lanzar el error - el item ya se creÃ³, solo fallaron los campos lookup
          console.warn("ï¿½sï¿½ï¸ El gasto se creÃ³ pero algunos campos lookup no se pudieron actualizar. Intenta actualizarlos manualmente.");
        }
      }
      
      // Subir archivos adjuntos despuÃ©s de crear el item
      if (gasto.archivosAdjuntos && gasto.archivosAdjuntos.length > 0) {
        try {
          console.log("[INFO] Subiendo archivos adjuntos...");
          console.log("[INFO] NÃºmero de archivos:", gasto.archivosAdjuntos.length);
          
          // Los archivos vienen como objetos con {nombre, url, tipo}
          // Necesitamos convertir las URLs de blob a archivos File para subirlos
          // O mejor, recibir los archivos File directamente desde el componente
          // Por ahora, intentaremos subir los archivos que vengan como File objects
          
          // Si los archivos vienen como objetos con URL (blob URLs), necesitamos convertirlos
          // Por ahora, asumimos que vienen como File objects desde el componente
          const archivosParaSubir: File[] = [];
          
          for (const archivo of gasto.archivosAdjuntos) {
            // Si el archivo tiene una propiedad 'file' (File object), usarlo
            // Si no, intentar obtener el archivo desde la URL blob
            if ((archivo as any).file instanceof File) {
              archivosParaSubir.push((archivo as any).file);
            } else {
              // Si viene como objeto con URL blob, necesitamos el File original
              // Por ahora, saltamos estos archivos y los manejaremos despuÃ©s
              console.warn("ï¿½sï¿½ï¸ Archivo sin File object:", archivo.nombre);
            }
          }
          
          // Subir cada archivo como attachment
          for (const archivo of archivosParaSubir) {
            try {
              console.log(`[INFO] Subiendo archivo: ${archivo.name}`);
              
              // Leer el archivo como ArrayBuffer
              const arrayBuffer = await archivo.arrayBuffer();
              
              console.log(`[INFO]¿½ Archivo leÃ­do: ${archivo.name} (${arrayBuffer.byteLength} bytes, tipo: ${archivo.type || 'application/octet-stream'})`);
              
              // Subir el archivo usando SharePoint REST API
              // Microsoft Graph API no soporta attachments en list items
              const siteUrl = getSharePointSiteUrl();
              const token = await getSharePointRestToken(); // Token especÃ­fico para SharePoint REST API
              
              // Construir la URL de SharePoint REST API para subir el attachment
              // IMPORTANTE: Usar la URL completa del sitio (incluyendo el path), no solo el origin
              const listName = LISTS.GASTOS;
              // SharePoint REST API requiere que el nombre del archivo estÃ© codificado correctamente
              // Usar encodeURIComponent para manejar caracteres especiales en el nombre del archivo
              const fileName = encodeURIComponent(archivo.name);
              const restApiUrl = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items(${response.id})/AttachmentFiles/add(FileName='${fileName}')`;
              
              console.log(`[INFO]¿½ Subiendo archivo a: ${restApiUrl}`);
              
              // Subir el archivo usando SharePoint REST API
              // IMPORTANTE: SharePoint REST API requiere el contenido binario directamente, no base64
              // El Content-Type debe ser el tipo MIME del archivo o application/octet-stream
              const uploadResponse = await fetch(restApiUrl, {
                method: 'POST',
                headers: {
                  'Accept': 'application/json;odata=verbose',
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': archivo.type || 'application/octet-stream',
                },
                body: arrayBuffer, // Usar el ArrayBuffer directamente, no base64
              });
              
              if (!uploadResponse.ok) {
                const errorText = await uploadResponse.text();
                throw new Error(`Error ${uploadResponse.status}: ${errorText}`);
              }
              
              console.log(`ï¿½o. Archivo ${archivo.name} subido exitosamente`);
            } catch (fileError: any) {
              console.error(`ï¿½O Error al subir archivo ${archivo.name}:`, fileError);
              if (fileError?.body) {
                console.error("ï¿½O Detalles del error:", JSON.stringify(fileError.body, null, 2));
              }
              // Continuar con los demÃ¡s archivos
            }
          }
          
          if (archivosParaSubir.length > 0) {
            console.log(`ï¿½o. ${archivosParaSubir.length} archivo(s) adjunto(s) subido(s) exitosamente`);
          }
        } catch (attachmentsError: any) {
          console.error("ï¿½O Error al subir archivos adjuntos:", attachmentsError);
          if (attachmentsError?.body) {
            console.error("ï¿½O Detalles del error:", JSON.stringify(attachmentsError.body, null, 2));
          }
          // No lanzar el error - el item ya se creÃ³, solo fallaron los archivos
          console.warn("ï¿½sï¿½ï¸ El gasto se creÃ³ pero algunos archivos adjuntos no se pudieron subir.");
        }
      }
      
      gastosLocalPaginationCache = null;

      return {
        id: response.id,
        ...gasto,
      };
    } catch (error: any) {
      console.error("ï¿½O Error al crear gasto:", error);
      if (error instanceof Error) {
        console.error("Detalles del error:", error.message);
      }
      // Mostrar mÃ¡s detalles del error si estÃ¡n disponibles
      if (error?.body) {
        console.error("Cuerpo del error:", JSON.stringify(error.body, null, 2));
      }
      if (error?.statusCode) {
        console.error("CÃ³digo de estado:", error.statusCode);
      }
      throw error;
    }
  },

  async update(id: string, gasto: Partial<Gasto>): Promise<Gasto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);
    
    try {
      // Obtener nombres internos de las columnas lookup (igual que en create)
      const categoriaColumnName = await getColumnInternalName(listId, "CATEGORIA");
      const empresaColumnName = await getColumnInternalName(listId, "EMPRESA");
      const proyectoColumnName = await getColumnInternalName(listId, "PROYECTO");
      const tipoDocumentoColumnName = await getColumnInternalName(listId, "TIPO_DOCUMENTO");
      
      // Campos bÃ¡sicos que NO son lookup
      const fields: any = {};
      
      if (gasto.fecha !== undefined && gasto.fecha !== null && gasto.fecha !== '') {
        fields.FECHA = gasto.fecha;
      }
      
      if (gasto.numeroDocumento !== undefined && gasto.numeroDocumento !== null && gasto.numeroDocumento !== '') {
        fields.NUMERO_DOCUMENTO = gasto.numeroDocumento;
      }
      
      // Ya no guardamos MONTO, solo MONTO_TOTAL
      if (gasto.montoTotal !== undefined && gasto.montoTotal !== null) {
        fields.MONTO_TOTAL = gasto.montoTotal;
      } else if (gasto.monto !== undefined && gasto.monto !== null) {
        // Fallback: si no hay montoTotal pero hay monto, usar monto como total
        fields.MONTO_TOTAL = gasto.monto;
      }
      
      if (gasto.montoNeto !== undefined && gasto.montoNeto !== null) {
        fields.MONTO_NETO = gasto.montoNeto;
      }
      
      if (gasto.iva !== undefined && gasto.iva !== null) {
        fields.IVA = gasto.iva;
      }
      
      if (gasto.detalle !== undefined && gasto.detalle !== null && gasto.detalle.trim() !== '') {
        fields.DETALLE = gasto.detalle;
      }
      
      if (gasto.comentarioTipoDocumento !== undefined && gasto.comentarioTipoDocumento !== null && gasto.comentarioTipoDocumento.trim() !== '') {
        fields.OTRO = gasto.comentarioTipoDocumento;
      }
      
      // Preparar campos lookup (usando formato LookupId)
      const lookupFields: any = {};
      
      // CATEGORIA
      if (gasto.categoria !== undefined && gasto.categoria !== null && gasto.categoria !== '') {
        const parsed = Number(gasto.categoria);
        if (!isNaN(parsed) && parsed > 0) {
          lookupFields[`${categoriaColumnName}LookupId`] = parsed;
          console.log("[INFO]¿½ Actualizando categorÃ­a con ID:", parsed);
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de categorÃ­a invÃ¡lido para actualizaciÃ³n:", gasto.categoria);
        }
      }
      
      // EMPRESA
      if (gasto.empresaId !== undefined && gasto.empresaId !== null && gasto.empresaId !== '') {
        const parsed = Number(gasto.empresaId);
        if (!isNaN(parsed) && parsed > 0) {
          lookupFields[`${empresaColumnName}LookupId`] = parsed;
          console.log("[INFO]¿½ Actualizando empresa con ID:", parsed);
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de empresa invÃ¡lido para actualizaciÃ³n:", gasto.empresaId);
        }
      }
      
      // PROYECTO
      if (gasto.proyectoId !== undefined && gasto.proyectoId !== null && gasto.proyectoId !== '') {
        const parsed = Number(gasto.proyectoId);
        if (!isNaN(parsed) && parsed > 0) {
          lookupFields[`${proyectoColumnName}LookupId`] = parsed;
          console.log("[INFO]¿½ Actualizando proyecto con ID:", parsed);
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de proyecto invÃ¡lido para actualizaciÃ³n:", gasto.proyectoId);
        }
      }
      
      // TIPO_DOCUMENTO
      if (gasto.tipoDocumento !== undefined && gasto.tipoDocumento !== null && gasto.tipoDocumento !== '') {
        const parsed = Number(gasto.tipoDocumento);
        if (!isNaN(parsed) && parsed > 0) {
          lookupFields[`${tipoDocumentoColumnName}LookupId`] = parsed;
          console.log("[INFO]¿½ Actualizando tipo documento con ID:", parsed);
        } else {
          console.warn("ï¿½sï¿½ï¸ ID de tipo documento invÃ¡lido para actualizaciÃ³n:", gasto.tipoDocumento);
        }
      }
      
      // Limpiar campos: no enviar undefined, null o strings vacÃ­os
      const cleanFields: any = {};
      Object.keys(fields).forEach(key => {
        const value = fields[key];
        if (value !== undefined && value !== null && value !== '') {
          cleanFields[key] = value;
        }
      });
      
      // Combinar campos normales y lookup
      const finalFields = { ...cleanFields, ...lookupFields };
      
      console.log("[INFO]¿½ Campos a actualizar:", JSON.stringify(finalFields, null, 2));
      
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(finalFields);
      
      gastosLocalPaginationCache = null;

      return {
        id,
        ...gasto,
      } as Gasto;
    } catch (error) {
      console.error("Error al actualizar gasto:", error);
      if (error instanceof Error) {
        console.error("Detalles del error:", error.message);
      }
      if ((error as any)?.body) {
        console.error("Cuerpo del error:", JSON.stringify((error as any).body, null, 2));
      }
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.GASTOS);
    
    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();

      gastosLocalPaginationCache = null;
    } catch (error) {
      console.error("Error al eliminar gasto:", error);
      throw error;
    }
  },
};

// ========== SERVICIOS PARA EMPRESAS ==========

export const empresasService = {
  async getAll(): Promise<Empresa[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.EMPRESAS);
    
    try {
      // Optimizar la consulta: obtener solo los campos necesarios
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .select("id,fields")
        .top(500) // Limitar a 500 items
        .get();
      
      if (!response.value || response.value.length === 0) {
        console.warn("No se encontraron empresas en SharePoint");
        return [];
      }
      
      return response.value.map((item: any) => {
        // Manejar la fecha de creaciÃ³n de forma segura
        let createdAt = "";
        try {
          const fechaValue = item.fields.CreatedAt || item.createdDateTime || item.fields.Created || "";
          if (fechaValue) {
            // Si es una cadena, intentar parsearla
            if (typeof fechaValue === 'string') {
              const fecha = new Date(fechaValue);
              if (!isNaN(fecha.getTime())) {
                createdAt = fecha.toISOString().split('T')[0];
              } else {
                // Si no se puede parsear, usar fecha actual
                createdAt = new Date().toISOString().split('T')[0];
              }
            } else if (fechaValue instanceof Date) {
              createdAt = fechaValue.toISOString().split('T')[0];
            } else {
              createdAt = new Date().toISOString().split('T')[0];
            }
          } else {
            // Si no hay fecha, usar fecha actual
            createdAt = new Date().toISOString().split('T')[0];
          }
        } catch (e) {
          // Si hay cualquier error, usar fecha actual
          console.warn("Error al parsear fecha de empresa:", e);
          createdAt = new Date().toISOString().split('T')[0];
        }
        
        return {
          id: item.id,
          razonSocial: item.fields.NOM_EMPRESA || item.fields.NomEmpresa || item.fields.RazonSocial || "",
          rut: item.fields.RUT || item.fields.Rut || "",
          numeroContacto: item.fields.NUM_CONTACTO || item.fields.NumContacto || item.fields.NumeroContacto || undefined,
          correoElectronico: item.fields.CORREO || item.fields.Correo || item.fields.CorreoElectronico || undefined,
          categoria: item.fields.CATEGORIA || item.fields.Categoria || undefined,
          createdAt: createdAt,
        };
      });
    } catch (error) {
      console.error("Error al obtener empresas:", error);
      throw error;
    }
  },

  async create(empresa: Omit<Empresa, "id" | "createdAt">): Promise<Empresa> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.EMPRESAS);
    
    try {
      // Mapeo de campos del formulario a columnas de SharePoint (nombres reales)
      // NOM_EMPRESA, RUT, NUM_CONTACTO, CORREO, CATEGORIA
      const fields: any = {
        NOM_EMPRESA: empresa.razonSocial,
        RUT: empresa.rut,
        NUM_CONTACTO: empresa.numeroContacto || "",
        CORREO: empresa.correoElectronico || "",
      };
      
      // Agregar CATEGORIA si estÃ¡ definida (campo Choice)
      if (empresa.categoria) {
        fields.CATEGORIA = empresa.categoria;
      }
      
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields,
        });
      
      return {
        id: response.id,
        ...empresa,
        createdAt: new Date().toISOString().split("T")[0],
      };
    } catch (error) {
      console.error("Error al crear empresa:", error);
      throw error;
    }
  },

  async update(id: string, empresa: Partial<Empresa>): Promise<Empresa> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.EMPRESAS);
    
    try {
      // Mapeo usando los nombres reales de SharePoint
      const fields: any = {};
      if (empresa.razonSocial !== undefined) fields.NOM_EMPRESA = empresa.razonSocial;
      if (empresa.rut !== undefined) fields.RUT = empresa.rut;
      if (empresa.numeroContacto !== undefined) fields.NUM_CONTACTO = empresa.numeroContacto || "";
      if (empresa.correoElectronico !== undefined) fields.CORREO = empresa.correoElectronico || "";
      if (empresa.categoria !== undefined) fields.CATEGORIA = empresa.categoria || "";
      
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(fields);
      
      return empresa as Empresa;
    } catch (error) {
      console.error("Error al actualizar empresa:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.EMPRESAS);
    
    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar empresa:", error);
      throw error;
    }
  },
};

// ========== SERVICIOS PARA PROYECTOS ==========

export type MonedaProyecto = "CLP" | "UF" | "USD";

function normalizeProjectCode(code?: string): string {
  return (code || "").trim().toUpperCase();
}

async function ensureUniqueProjectCode(
  code: string,
  excludeProjectId?: string,
): Promise<void> {
  const normalizedCode = normalizeProjectCode(code);
  if (!normalizedCode) {
    throw new Error("El código de proyecto es obligatorio");
  }

  const proyectos = await proyectosService.getAll();
  const duplicated = proyectos.find((p) =>
    normalizeProjectCode(p.codigoProyecto) === normalizedCode &&
    String(p.id) !== String(excludeProjectId || "")
  );

  if (duplicated) {
    throw new Error(`Ya existe un proyecto con código "${normalizedCode}"`);
  }
}

export const proyectosService = {
  async getAll(): Promise<Proyecto[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.PROYECTOS);
    
    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .get();
      
      return response.value.map((item: any) => ({
        id: item.id,
        nombre: item.fields.NOM_PROYECTO || item.fields.NomProyecto || item.fields.Nombre || item.fields.Title || "",
        codigoProyecto: item.fields.COD_PROYECTO || item.fields.CodProyecto || item.fields.CodigoProyecto || "",
        montoTotalProyecto: item.fields.MONTO_TOTAL_PROY || item.fields.MontoTotalProy || undefined,
        monedaBase: (item.fields.MONEDA_BASE || item.fields.MonedaBase || undefined) as MonedaProyecto | undefined,
        createdAt: item.fields.CreatedAt || item.createdDateTime || "",
      }));
    } catch (error) {
      console.error("Error al obtener proyectos:", error);
      throw error;
    }
  },

  async create(proyecto: Omit<Proyecto, "id" | "createdAt">): Promise<Proyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.PROYECTOS);
    
    try {
      await ensureUniqueProjectCode(proyecto.codigoProyecto);

      // Mapeo usando el nombre real de la columna en SharePoint: NOM_PROYECTO
      const fields: any = {
        Title: proyecto.nombre,
        NOM_PROYECTO: proyecto.nombre,
        COD_PROYECTO: normalizeProjectCode(proyecto.codigoProyecto),
      };

      if (proyecto.montoTotalProyecto !== undefined && proyecto.montoTotalProyecto !== null) {
        fields.MONTO_TOTAL_PROY = Number(proyecto.montoTotalProyecto);
      }

      if (proyecto.monedaBase) {
        fields.MONEDA_BASE = proyecto.monedaBase;
      }
      
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields,
        });
      
      return {
        id: response.id,
        ...proyecto,
        codigoProyecto: normalizeProjectCode(proyecto.codigoProyecto),
        createdAt: new Date().toISOString().split("T")[0],
      };
    } catch (error) {
      console.error("Error al crear proyecto:", error);
      throw error;
    }
  },

  async update(id: string, proyecto: Partial<Proyecto>): Promise<Proyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.PROYECTOS);

    try {
      const fields: any = {};

      if (proyecto.nombre !== undefined) {
        fields.NOM_PROYECTO = proyecto.nombre;
        fields.Title = proyecto.nombre;
      }

      if (proyecto.codigoProyecto !== undefined) {
        await ensureUniqueProjectCode(proyecto.codigoProyecto, id);
        fields.COD_PROYECTO = normalizeProjectCode(proyecto.codigoProyecto);
      }

      if (proyecto.montoTotalProyecto !== undefined) {
        fields.MONTO_TOTAL_PROY = proyecto.montoTotalProyecto === null
          ? null
          : Number(proyecto.montoTotalProyecto);
      }

      if (proyecto.monedaBase !== undefined) {
        fields.MONEDA_BASE = proyecto.monedaBase || null;
      }

      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(fields);

      return {
        id,
        ...proyecto,
      } as Proyecto;
    } catch (error) {
      console.error("Error al actualizar proyecto:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.PROYECTOS);
    
    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar proyecto:", error);
      throw error;
    }
  },
};

// ========== SERVICIOS PARA COLABORADORES ==========

export const colaboradoresService = {
  async getAll(): Promise<Colaborador[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.COLABORADORES);
    
    try {
      // Optimizar la consulta: obtener solo los campos necesarios
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .select("id,fields")
        .top(500) // Limitar a 500 items
        .get();
      
      if (!response.value || response.value.length === 0) {
        console.warn("No se encontraron colaboradores en SharePoint");
        return [];
      }
      
      return response.value.map((item: any) => {
        // Manejar la fecha de creaciÃ³n de forma segura
        let createdAt = "";
        try {
          const fechaValue = item.fields.CreatedAt || item.createdDateTime || item.fields.Created || "";
          if (fechaValue) {
            // Si es una cadena, intentar parsearla
            if (typeof fechaValue === 'string') {
              const fecha = new Date(fechaValue);
              if (!isNaN(fecha.getTime())) {
                createdAt = fecha.toISOString().split('T')[0];
              } else {
                // Si no se puede parsear, usar fecha actual
                createdAt = new Date().toISOString().split('T')[0];
              }
            } else if (fechaValue instanceof Date) {
              createdAt = fechaValue.toISOString().split('T')[0];
            } else {
              createdAt = new Date().toISOString().split('T')[0];
            }
          } else {
            // Si no hay fecha, usar fecha actual
            createdAt = new Date().toISOString().split('T')[0];
          }
        } catch (e) {
          // Si hay cualquier error, usar fecha actual
          console.warn("Error al parsear fecha de colaborador:", e);
          createdAt = new Date().toISOString().split('T')[0];
        }
        
        return {
          id: item.id,
          nombre: item.fields.NOMBRE || item.fields.Nombre || item.fields.Title || "",
          email: item.fields.CORREO || item.fields.Correo || item.fields.Email || undefined,
          telefono: item.fields.NUM_CONTACTO || item.fields.NumContacto || item.fields.Telefono || undefined,
          cargo: item.fields.CARGO || item.fields.Cargo || undefined,
          createdAt: createdAt,
        };
      });
    } catch (error) {
      console.error("Error al obtener colaboradores:", error);
      throw error;
    }
  },

  async create(colaborador: Omit<Colaborador, "id" | "createdAt">): Promise<Colaborador> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.COLABORADORES);
    
    try {
      // Mapeo usando los nombres reales de las columnas en SharePoint: NOMBRE, CORREO, NUM_CONTACTO, CARGO
      const fields: any = {
        NOMBRE: colaborador.nombre,
        CORREO: colaborador.email || "",
        NUM_CONTACTO: colaborador.telefono || "",
        CARGO: colaborador.cargo || "",
      };
      
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields,
        });
      
      return {
        id: response.id,
        ...colaborador,
        createdAt: new Date().toISOString().split("T")[0],
      };
    } catch (error) {
      console.error("Error al crear colaborador:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.COLABORADORES);
    
    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar colaborador:", error);
      throw error;
    }
  },
};

// ========== SERVICIOS PARA CATEGORIAS ==========

export interface Categoria {
  id: string;
  nombre: string;
  color?: string;
}

export const categoriasService = {
  async getAll(): Promise<Categoria[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.CATEGORIAS);
    
    try {
      // Optimizar la consulta: obtener solo los campos necesarios y ordenar por nombre
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .select("id,fields")
        .top(500) // Limitar a 500 items (suficiente para categorÃ­as)
        .get();
      
      return response.value.map((item: any) => ({
        id: item.id,
        nombre: item.fields.NOM_CATEGORIA || item.fields.NomCategoria || item.fields.NOMBRE || item.fields.Nombre || item.fields.Title || "",
        color: item.fields.COLOR || item.fields.Color || `bg-category-${item.id}`,
      }));
    } catch (error) {
      console.error("Error al obtener categorÃ­as:", error);
      throw error;
    }
  },

  async create(categoria: Omit<Categoria, "id">): Promise<Categoria> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.CATEGORIAS);
    
    try {
      const fields: any = {
        NOM_CATEGORIA: categoria.nombre,
      };
      
      if (categoria.color) {
        fields.COLOR = categoria.color;
      }
      
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields,
        });
      
      return {
        id: response.id,
        ...categoria,
      };
    } catch (error) {
      console.error("Error al crear categorÃ­a:", error);
      throw error;
    }
  },

  async update(id: string, categoria: Partial<Categoria>): Promise<Categoria> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.CATEGORIAS);
    
    try {
      const fields: any = {};
      if (categoria.nombre !== undefined) fields.NOM_CATEGORIA = categoria.nombre;
      if (categoria.color !== undefined) fields.COLOR = categoria.color;
      
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(fields);
      
      return {
        id,
        ...categoria,
      } as Categoria;
    } catch (error) {
      console.error("Error al actualizar categorÃ­a:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.CATEGORIAS);
    
    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar categorÃ­a:", error);
      throw error;
    }
  },

  /**
   * Actualiza los colores de las categorÃ­as basÃ¡ndose en los nombres
   * Mapea los nombres de categorÃ­as locales a sus colores (clases Tailwind que usan variables CSS)
   */
  async updateCategoriasColors(): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.CATEGORIAS);
    
    // Mapeo de nombres de categorÃ­as a clases Tailwind que usan las variables CSS pasteles
    // Estas clases referencian los colores definidos en index.css
    const colorMap: Record<string, string> = {
      'Gastos Generales': 'bg-category-gastos-generales',
      'Sueldos': 'bg-category-sueldos',
      'Honorarios': 'bg-category-honorarios',
      'Mantenimiento': 'bg-category-mantenimiento',
      'Materiales': 'bg-category-materiales',
    };
    
    try {
      // Obtener todas las categorÃ­as
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .get();
      
      // Actualizar cada categorÃ­a con su color correspondiente
      const updatePromises = response.value.map(async (item: any) => {
        const nombre = item.fields.NOM_CATEGORIA || item.fields.NomCategoria || item.fields.NOMBRE || item.fields.Nombre || item.fields.Title || "";
        const color = colorMap[nombre];
        
        if (color) {
          try {
            await client
              .api(`/sites/${siteId}/lists/${listId}/items/${item.id}/fields`)
              .patch({
                COLOR: color,
              });
            console.log(`ï¿½o. Color actualizado para "${nombre}": ${color}`);
          } catch (error) {
            console.error(`ï¿½O Error al actualizar color para "${nombre}":`, error);
          }
        } else {
          console.warn(`ï¿½sï¿½ï¸ No se encontrÃ³ color para la categorÃ­a "${nombre}"`);
        }
      });
      
      await Promise.all(updatePromises);
      console.log("ï¿½o. ActualizaciÃ³n de colores completada");
    } catch (error) {
      console.error("Error al actualizar colores de categorÃ­as:", error);
      throw error;
    }
  },
};

// ========== SERVICIOS PARA TIPOS DE DOCUMENTO ==========

export interface TipoDocumento {
  id: string;
  nombre: string;
  tieneImpuestos?: boolean;
  valorImpuestos?: number;
}

export const tiposDocumentoService = {
  async getAll(): Promise<TipoDocumento[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.TIPOS_DOCUMENTO);
    
    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .get();
      
      return response.value.map((item: any) => {
        const nombreRaw = item.fields.NOM_DOCUMENTO || item.fields.NomDocumento || item.fields.NOMBRE || item.fields.Nombre || item.fields.Title || "";
        return {
          id: item.id,
          nombre: nombreRaw ? nombreRaw.toUpperCase() : "",
          tieneImpuestos: item.fields.APLICA_IMPUESTO || item.fields.AplicaImpuesto || item.fields.aplicaImpuesto || false,
          valorImpuestos: item.fields.VALOR_IMPUESTO || item.fields.ValorImpuesto || item.fields.valorImpuesto || undefined,
        };
      });
    } catch (error) {
      console.error("Error al obtener tipos de documento:", error);
      throw error;
    }
  },

  async create(tipoDocumento: Omit<TipoDocumento, "id">): Promise<TipoDocumento> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.TIPOS_DOCUMENTO);
    
    try {
      const fields: any = {
        NOM_DOCUMENTO: tipoDocumento.nombre,
      };
      
      // Agregar campos de impuestos si estÃ¡n definidos
      if (tipoDocumento.tieneImpuestos !== undefined) {
        fields.APLICA_IMPUESTO = tipoDocumento.tieneImpuestos;
      }
      if (tipoDocumento.valorImpuestos !== undefined) {
        fields.VALOR_IMPUESTO = tipoDocumento.valorImpuestos;
      }
      
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields,
        });
      
      return {
        id: response.id,
        ...tipoDocumento,
      };
    } catch (error) {
      console.error("Error al crear tipo de documento:", error);
      throw error;
    }
  },

  async update(id: string, tipoDocumento: Partial<TipoDocumento>): Promise<TipoDocumento> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.TIPOS_DOCUMENTO);
    
    try {
      const fields: any = {};
      if (tipoDocumento.nombre !== undefined) fields.NOM_DOCUMENTO = tipoDocumento.nombre;
      if (tipoDocumento.tieneImpuestos !== undefined) fields.APLICA_IMPUESTO = tipoDocumento.tieneImpuestos;
      if (tipoDocumento.valorImpuestos !== undefined) fields.VALOR_IMPUESTO = tipoDocumento.valorImpuestos;
      
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(fields);
      
      return {
        id,
        ...tipoDocumento,
      } as TipoDocumento;
    } catch (error) {
      console.error("Error al actualizar tipo de documento:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.TIPOS_DOCUMENTO);
    
    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar tipo de documento:", error);
      throw error;
    }
  },
};

// ========== SERVICIOS PARA CONTROL DE PAGOS ==========

export interface TipoDocumentoProyecto {
  id: string;
  nombre: string;
  activo: boolean;
  orden?: number;
}

export interface DocumentoProyecto {
  id: string;
  proyectoId: string;
  codigoProyecto: string;
  tipoDocumentoProyectoId: string;
  tipoDocumentoNombre?: string;
  fechaDocumento: string;
  nroReferencia?: string;
  observacion?: string;
  archivoAdjunto?: { nombre: string; url: string; tipo: string };
  createdAt: string;
}

export interface HitoPagoProyecto {
  id: string;
  proyectoId: string;
  codigoProyecto: string;
  nroHito: number;
  montoHito: number;
  moneda: MonedaProyecto;
  fechaCompromiso: string;
  fechaPago?: string;
  facturado: boolean;
  pagado: boolean;
  observacion?: string;
  createdAt: string;
}

export interface HitoPagoProyectoCreateInput {
  proyectoId: string;
  codigoProyecto: string;
  montoHito: number;
  moneda: MonedaProyecto;
  fechaCompromiso: string;
  fechaPago?: string;
  facturado: boolean;
  pagado: boolean;
  observacion?: string;
  nroHito?: number;
}

function normalizeUpper(value?: string): string {
  return (value || "").trim().toUpperCase();
}

async function ensureProyectoLookupSaved(params: {
  client: any;
  siteId: string;
  listId: string;
  itemId: string;
  proyectoColumnName: string;
  proyectoLookupId: number;
}): Promise<void> {
  const { client, siteId, listId, itemId, proyectoColumnName, proyectoLookupId } = params;
  const candidateFields = Array.from(
    new Set([
      `${proyectoColumnName}LookupId`,
      "PROYECTOLookupId",
      "PROYECTO_x003a__x0020_IDLookupId",
    ]),
  );

  let lastError: unknown;
  for (const lookupField of candidateFields) {
    if (!lookupField) continue;

    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${itemId}/fields`)
        .patch({
          [lookupField]: proyectoLookupId,
        });

      const verify = await client
        .api(`/sites/${siteId}/lists/${listId}/items/${itemId}`)
        .expand("fields")
        .get();

      const savedLookupId = Number(
        verify?.fields?.PROYECTOLookupId ||
        verify?.fields?.PROYECTO_x003a__x0020_IDLookupId ||
        (typeof verify?.fields?.PROYECTO === "number" ? verify.fields.PROYECTO : 0),
      );

      if (savedLookupId === proyectoLookupId) {
        return;
      }
    } catch (error) {
      lastError = error;
      console.warn(`[WARN] No se pudo asignar PROYECTO usando ${lookupField}:`, error);
    }
  }

  console.error("[ERROR] Falló la asignación de PROYECTO en hito:", lastError);
  throw new Error(`No se pudo guardar PROYECTO (lookup ID ${proyectoLookupId}) en el registro ${itemId}.`);
}

function parseBoolean(value: any, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "si", "sí", "yes"].includes(normalized)) return true;
    if (["false", "0", "no"].includes(normalized)) return false;
  }
  return fallback;
}

function detectMimeType(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return (extension && mimeMap[extension]) || "application/octet-stream";
}

function buildSharePointDownloadUrl(siteUrl: string, serverRelativeUrl?: string): string {
  if (!serverRelativeUrl) return "";
  const escapedUrl = String(serverRelativeUrl).replace(/'/g, "''");
  return `${siteUrl}/_api/web/GetFileByServerRelativeUrl('${escapedUrl}')/$value`;
}

async function getListItemAttachments(
  listName: string,
  itemId: string,
): Promise<Array<{ nombre: string; url: string; tipo: string }>> {
  try {
    const siteUrl = getSharePointSiteUrl();
    const token = await getSharePointRestToken();
    const endpoint = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles`;
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json;odata=verbose",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    const results = data?.d?.results || [];

    return results.map((att: any) => ({
      nombre: att.FileName,
      url: buildSharePointDownloadUrl(siteUrl, att.ServerRelativeUrl),
      tipo: detectMimeType(att.FileName),
    }));
  } catch (error) {
    console.warn("No se pudieron obtener adjuntos del item", { listName, itemId, error });
    return [];
  }
}

async function uploadListItemAttachment(
  listName: string,
  itemId: string,
  file: File,
): Promise<{ nombre: string; url: string; tipo: string }> {
  const siteUrl = getSharePointSiteUrl();
  const token = await getSharePointRestToken();
  const encodedName = encodeURIComponent(file.name);
  const endpoint = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles/add(FileName='${encodedName}')`;
  const arrayBuffer = await file.arrayBuffer();

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: arrayBuffer,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al subir adjunto: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const fileInfo = data?.d || {};

  return {
    nombre: file.name,
    url: buildSharePointDownloadUrl(siteUrl, fileInfo.ServerRelativeUrl),
    tipo: file.type || detectMimeType(file.name),
  };
}

async function deleteListItemAttachment(
  listName: string,
  itemId: string,
  fileName: string,
): Promise<void> {
  const siteUrl = getSharePointSiteUrl();
  const token = await getSharePointRestToken();
  const encodedName = encodeURIComponent(fileName);
  const endpoint = `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items(${itemId})/AttachmentFiles/getByFileName('${encodedName}')`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json;odata=verbose",
      Authorization: `Bearer ${token}`,
      "IF-MATCH": "*",
      "X-HTTP-Method": "DELETE",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error al eliminar adjunto: ${response.status} ${errorText}`);
  }
}

export const tiposDocumentoProyectoService = {
  async getAll(): Promise<TipoDocumentoProyecto[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.DIM_TIPO_DOCUMENTO_PROY);

    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .top(500)
        .get();

      return response.value.map((item: any) => ({
        id: item.id,
        nombre: normalizeUpper(item.fields.NOM_TIPO_DOCUMENTO || item.fields.Title || ""),
        activo: parseBoolean(item.fields.ACTIVO, true),
        orden: item.fields.ORDEN || undefined,
      }));
    } catch (error) {
      console.error("Error al obtener tipos de documento de proyecto:", error);
      throw error;
    }
  },

  async create(tipo: Omit<TipoDocumentoProyecto, "id">): Promise<TipoDocumentoProyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.DIM_TIPO_DOCUMENTO_PROY);
    const nombre = normalizeUpper(tipo.nombre);

    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields: {
            Title: nombre,
            NOM_TIPO_DOCUMENTO: nombre,
            ACTIVO: tipo.activo,
            ORDEN: tipo.orden ?? null,
          },
        });

      return {
        id: response.id,
        nombre,
        activo: tipo.activo,
        orden: tipo.orden,
      };
    } catch (error) {
      console.error("Error al crear tipo de documento de proyecto:", error);
      throw error;
    }
  },

  async update(id: string, tipo: Partial<TipoDocumentoProyecto>): Promise<TipoDocumentoProyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.DIM_TIPO_DOCUMENTO_PROY);
    const fields: any = {};

    if (tipo.nombre !== undefined) {
      const nombre = normalizeUpper(tipo.nombre);
      fields.Title = nombre;
      fields.NOM_TIPO_DOCUMENTO = nombre;
    }
    if (tipo.activo !== undefined) fields.ACTIVO = tipo.activo;
    if (tipo.orden !== undefined) fields.ORDEN = tipo.orden;

    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(fields);

      return { id, ...tipo } as TipoDocumentoProyecto;
    } catch (error) {
      console.error("Error al actualizar tipo de documento de proyecto:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.DIM_TIPO_DOCUMENTO_PROY);

    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar tipo de documento de proyecto:", error);
      throw error;
    }
  },

  async seedDefaults(): Promise<void> {
    const defaults = [
      "CONTRATO",
      "ORDEN DE COMPRA",
      "FACTURA",
      "PROPUESTA ADJUDICADA",
      "OTROS",
    ];

    const current = await this.getAll();
    const existing = new Set(current.map((item) => normalizeUpper(item.nombre)));

    for (let i = 0; i < defaults.length; i += 1) {
      const nombre = defaults[i];
      if (!existing.has(nombre)) {
        await this.create({
          nombre,
          activo: true,
          orden: i + 1,
        });
      }
    }
  },
};

export const documentosProyectoService = {
  async getAll(filters?: {
    proyectoId?: string;
    codigoProyecto?: string;
    tipoDocumentoProyectoId?: string;
  }): Promise<DocumentoProyecto[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_DOCUMENTOS_PROY);
    const tipos = await tiposDocumentoProyectoService.getAll();
    const tipoMap = new Map(tipos.map((t) => [String(t.id), t.nombre]));

    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .top(500)
        .get();

      let items = response.value.map((item: any) => {
        const proyectoId = String(
          item.fields.PROYECTOLookupId ||
          item.fields.PROYECTO_x003a__x0020_IDLookupId ||
          item.fields.PROYECTO ||
          "",
        );
        const tipoDocumentoProyectoId = String(
          item.fields.TIPO_DOCUMENTOLookupId ||
          item.fields.TIPO_DOCUMENTO_x003a__x0020_IDLookupId ||
          item.fields.TIPO_DOCUMENTO ||
          "",
        );

        return {
          id: item.id,
          proyectoId,
          codigoProyecto: item.fields.COD_PROYECTO || "",
          tipoDocumentoProyectoId,
          tipoDocumentoNombre: tipoMap.get(tipoDocumentoProyectoId),
          fechaDocumento: item.fields.FECHA_DOCUMENTO || "",
          nroReferencia: item.fields.NRO_REFERENCIA || undefined,
          observacion: item.fields.OBSERVACION || undefined,
          createdAt: item.fields.Created || item.createdDateTime || "",
        } as DocumentoProyecto;
      });

      if (filters?.proyectoId) {
        items = items.filter((item) => String(item.proyectoId) === String(filters.proyectoId));
      }

      if (filters?.codigoProyecto) {
        const code = normalizeUpper(filters.codigoProyecto);
        items = items.filter((item) => normalizeUpper(item.codigoProyecto) === code);
      }

      if (filters?.tipoDocumentoProyectoId) {
        items = items.filter((item) =>
          String(item.tipoDocumentoProyectoId) === String(filters.tipoDocumentoProyectoId)
        );
      }

      const withAttachments = await Promise.all(
        items.map(async (item) => {
          const attachments = await getListItemAttachments(LISTS.FCT_DOCUMENTOS_PROY, item.id);
          return {
            ...item,
            archivoAdjunto: attachments[0],
          };
        }),
      );

      return withAttachments;
    } catch (error) {
      console.error("Error al obtener documentos de proyecto:", error);
      throw error;
    }
  },

  async create(input: {
    proyectoId: string;
    codigoProyecto: string;
    tipoDocumentoProyectoId: string;
    fechaDocumento: string;
    nroReferencia?: string;
    observacion?: string;
    archivo: File;
  }): Promise<DocumentoProyecto> {
    if (!input.archivo) {
      throw new Error("Debes adjuntar exactamente 1 archivo");
    }

    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_DOCUMENTOS_PROY);
    const proyectoColumnName = await getColumnInternalName(listId, "PROYECTO");
    const tipoDocumentoColumnName = await getColumnInternalName(listId, "TIPO_DOCUMENTO");
    const proyectoLookupId = Number(input.proyectoId);
    const tipoDocumentoLookupId = Number(input.tipoDocumentoProyectoId);

    if (Number.isNaN(proyectoLookupId) || Number.isNaN(tipoDocumentoLookupId)) {
      throw new Error("IDs de lookup inválidos para el documento de proyecto");
    }

    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields: {
            COD_PROYECTO: normalizeUpper(input.codigoProyecto),
            FECHA_DOCUMENTO: input.fechaDocumento,
            NRO_REFERENCIA: input.nroReferencia || "",
            OBSERVACION: input.observacion || "",
          },
        });

      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${response.id}/fields`)
        .patch({
          [`${proyectoColumnName}LookupId`]: proyectoLookupId,
          [`${tipoDocumentoColumnName}LookupId`]: tipoDocumentoLookupId,
        });

      const archivoAdjunto = await uploadListItemAttachment(
        LISTS.FCT_DOCUMENTOS_PROY,
        response.id,
        input.archivo,
      );

      return {
        id: response.id,
        proyectoId: String(input.proyectoId),
        codigoProyecto: normalizeUpper(input.codigoProyecto),
        tipoDocumentoProyectoId: String(input.tipoDocumentoProyectoId),
        fechaDocumento: input.fechaDocumento,
        nroReferencia: input.nroReferencia,
        observacion: input.observacion,
        archivoAdjunto,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error al crear documento de proyecto:", error);
      throw error;
    }
  },

  async update(
    id: string,
    payload: Partial<DocumentoProyecto> & { archivo?: File | null },
  ): Promise<DocumentoProyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_DOCUMENTOS_PROY);
    const { archivo, ...fieldsPayload } = payload;
    const fields: any = {};

    if (fieldsPayload.codigoProyecto !== undefined) fields.COD_PROYECTO = normalizeUpper(fieldsPayload.codigoProyecto);
    if (fieldsPayload.fechaDocumento !== undefined) fields.FECHA_DOCUMENTO = fieldsPayload.fechaDocumento;
    if (fieldsPayload.nroReferencia !== undefined) fields.NRO_REFERENCIA = fieldsPayload.nroReferencia || "";
    if (fieldsPayload.observacion !== undefined) fields.OBSERVACION = fieldsPayload.observacion || "";

    try {
      if (Object.keys(fields).length > 0) {
        await client
          .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
          .patch(fields);
      }

      if (fieldsPayload.proyectoId !== undefined || fieldsPayload.tipoDocumentoProyectoId !== undefined) {
        const proyectoColumnName = await getColumnInternalName(listId, "PROYECTO");
        const tipoDocumentoColumnName = await getColumnInternalName(listId, "TIPO_DOCUMENTO");
        const lookupFields: any = {};
        if (fieldsPayload.proyectoId !== undefined) {
          lookupFields[`${proyectoColumnName}LookupId`] = Number(fieldsPayload.proyectoId);
        }
        if (fieldsPayload.tipoDocumentoProyectoId !== undefined) {
          lookupFields[`${tipoDocumentoColumnName}LookupId`] = Number(fieldsPayload.tipoDocumentoProyectoId);
        }

        if (Object.keys(lookupFields).length > 0) {
          await client
            .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
            .patch(lookupFields);
        }
      }

      let archivoAdjuntoActualizado: { nombre: string; url: string; tipo: string } | undefined;
      if (archivo) {
        const currentAttachments = await getListItemAttachments(LISTS.FCT_DOCUMENTOS_PROY, id);
        for (const att of currentAttachments) {
          await deleteListItemAttachment(LISTS.FCT_DOCUMENTOS_PROY, id, att.nombre);
        }
        archivoAdjuntoActualizado = await uploadListItemAttachment(LISTS.FCT_DOCUMENTOS_PROY, id, archivo);
      }

      return {
        id,
        ...fieldsPayload,
        ...(archivoAdjuntoActualizado ? { archivoAdjunto: archivoAdjuntoActualizado } : {}),
      } as DocumentoProyecto;
    } catch (error) {
      console.error("Error al actualizar documento de proyecto:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_DOCUMENTOS_PROY);

    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar documento de proyecto:", error);
      throw error;
    }
  },
};

export const hitosPagoProyectoService = {
  async getAll(filters?: {
    proyectoId?: string;
    codigoProyecto?: string;
  }): Promise<HitoPagoProyecto[]> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_HITOS_PAGO_PROY);

    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .expand("fields")
        .top(500)
        .get();

      let items: HitoPagoProyecto[] = response.value.map((item: any) => ({
        id: item.id,
        proyectoId: String(
          item.fields.PROYECTOLookupId ||
          item.fields.PROYECTO_x003a__x0020_IDLookupId ||
          item.fields.PROYECTO ||
          "",
        ),
        codigoProyecto: item.fields.COD_PROYECTO || "",
        nroHito: Number(item.fields.NRO_HITO || 0),
        montoHito: Number(item.fields.MONTO_HITO || 0),
        moneda: (item.fields.MONEDA || "CLP") as MonedaProyecto,
        fechaCompromiso: item.fields.FECHA_COMPROMISO || "",
        fechaPago: item.fields.FECHA_PAGO || undefined,
        facturado: parseBoolean(item.fields.FACTURADO, false),
        pagado: parseBoolean(item.fields.PAGADO, false),
        observacion: item.fields.OBSERVACION || undefined,
        createdAt: item.fields.Created || item.createdDateTime || "",
      }));

      if (filters?.proyectoId) {
        items = items.filter((item) => String(item.proyectoId) === String(filters.proyectoId));
      }

      if (filters?.codigoProyecto) {
        const code = normalizeUpper(filters.codigoProyecto);
        items = items.filter((item) => normalizeUpper(item.codigoProyecto) === code);
      }

      return items.sort((a, b) => a.nroHito - b.nroHito);
    } catch (error) {
      console.error("Error al obtener hitos de pago:", error);
      throw error;
    }
  },

  async getNextHitoNumber(proyectoId: string): Promise<number> {
    const hitos = await this.getAll({ proyectoId });
    if (!hitos.length) return 1;
    return Math.max(...hitos.map((h) => Number(h.nroHito || 0))) + 1;
  },

  async create(input: HitoPagoProyectoCreateInput): Promise<HitoPagoProyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_HITOS_PAGO_PROY);
    const proyectoColumnName = await getColumnInternalName(listId, "PROYECTO");
    const nroHito = input.nroHito ?? await this.getNextHitoNumber(input.proyectoId);
    const proyectoLookupId = Number(input.proyectoId);

    if (Number.isNaN(proyectoLookupId)) {
      throw new Error("ID de proyecto inválido para crear hito");
    }

    try {
      const response = await client
        .api(`/sites/${siteId}/lists/${listId}/items`)
        .post({
          fields: {
            COD_PROYECTO: normalizeUpper(input.codigoProyecto),
            NRO_HITO: nroHito,
            MONTO_HITO: Number(input.montoHito),
            MONEDA: input.moneda,
            FECHA_COMPROMISO: input.fechaCompromiso,
            FECHA_PAGO: input.fechaPago || null,
            FACTURADO: input.facturado,
            PAGADO: input.pagado,
            OBSERVACION: input.observacion || "",
          },
        });

      await ensureProyectoLookupSaved({
        client,
        siteId,
        listId,
        itemId: response.id,
        proyectoColumnName,
        proyectoLookupId,
      });

      return {
        id: response.id,
        proyectoId: input.proyectoId,
        codigoProyecto: normalizeUpper(input.codigoProyecto),
        nroHito,
        montoHito: Number(input.montoHito),
        moneda: input.moneda,
        fechaCompromiso: input.fechaCompromiso,
        fechaPago: input.fechaPago,
        facturado: input.facturado,
        pagado: input.pagado,
        observacion: input.observacion,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error al crear hito de pago:", error);
      throw error;
    }
  },

  async update(id: string, payload: Partial<HitoPagoProyecto>): Promise<HitoPagoProyecto> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_HITOS_PAGO_PROY);
    const fields: any = {};

    if (payload.codigoProyecto !== undefined) fields.COD_PROYECTO = normalizeUpper(payload.codigoProyecto);
    if (payload.nroHito !== undefined) fields.NRO_HITO = Number(payload.nroHito);
    if (payload.montoHito !== undefined) fields.MONTO_HITO = Number(payload.montoHito);
    if (payload.moneda !== undefined) fields.MONEDA = payload.moneda;
    if (payload.fechaCompromiso !== undefined) fields.FECHA_COMPROMISO = payload.fechaCompromiso;
    if (payload.fechaPago !== undefined) fields.FECHA_PAGO = payload.fechaPago || null;
    if (payload.facturado !== undefined) fields.FACTURADO = payload.facturado;
    if (payload.pagado !== undefined) fields.PAGADO = payload.pagado;
    if (payload.observacion !== undefined) fields.OBSERVACION = payload.observacion || "";

    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}/fields`)
        .patch(fields);

      if (payload.proyectoId !== undefined) {
        const proyectoLookupId = Number(payload.proyectoId);
        if (Number.isNaN(proyectoLookupId)) {
          throw new Error("ID de proyecto inválido para actualizar hito");
        }
        const proyectoColumnName = await getColumnInternalName(listId, "PROYECTO");
        await ensureProyectoLookupSaved({
          client,
          siteId,
          listId,
          itemId: id,
          proyectoColumnName,
          proyectoLookupId,
        });
      }

      return { id, ...payload } as HitoPagoProyecto;
    } catch (error) {
      console.error("Error al actualizar hito de pago:", error);
      throw error;
    }
  },

  async delete(id: string): Promise<void> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const listId = await getListId(LISTS.FCT_HITOS_PAGO_PROY);

    try {
      await client
        .api(`/sites/${siteId}/lists/${listId}/items/${id}`)
        .delete();
    } catch (error) {
      console.error("Error al eliminar hito de pago:", error);
      throw error;
    }
  },
};

function normalizeProvisioningError(error: any): Error {
  const rawMessage = String(
    error?.message ||
    error?.error?.message ||
    error?.body ||
    error ||
    "Error desconocido",
  );
  const message = rawMessage.toLowerCase();

  if (
    message.includes("access denied") ||
    message.includes("insufficient privileges") ||
    message.includes("forbidden")
  ) {
    return new Error(
      "Access denied al crear listas/columnas. Necesitas permisos de administrador del sitio y consentimiento de 'Sites.Manage.All' en Azure.",
    );
  }

  if (
    message.includes("consent") ||
    message.includes("aadsts65001") ||
    message.includes("interaction_required")
  ) {
    return new Error(
      "Falta consentimiento para permisos de aprovisionamiento. Solicita aprobar 'Sites.Manage.All' y vuelve a intentar.",
    );
  }

  return new Error(rawMessage);
}

export const controlPagosSchemaService = {
  async getSchemaStatus(): Promise<{
    isReady: boolean;
    missing: Array<{ list: string; columns: string[] }>;
  }> {
    const requiredColumns: Record<string, string[]> = {
      [LISTS.PROYECTOS]: ["COD_PROYECTO", "MONTO_TOTAL_PROY", "MONEDA_BASE"],
      [LISTS.DIM_TIPO_DOCUMENTO_PROY]: ["NOM_TIPO_DOCUMENTO", "ACTIVO", "ORDEN"],
      [LISTS.FCT_DOCUMENTOS_PROY]: [
        "PROYECTO",
        "COD_PROYECTO",
        "TIPO_DOCUMENTO",
        "FECHA_DOCUMENTO",
        "NRO_REFERENCIA",
        "OBSERVACION",
      ],
      [LISTS.FCT_HITOS_PAGO_PROY]: [
        "PROYECTO",
        "COD_PROYECTO",
        "NRO_HITO",
        "MONTO_HITO",
        "MONEDA",
        "FECHA_COMPROMISO",
        "FECHA_PAGO",
        "FACTURADO",
        "PAGADO",
        "OBSERVACION",
      ],
    };

    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    const missing: Array<{ list: string; columns: string[] }> = [];

    for (const [listName, columns] of Object.entries(requiredColumns)) {
      const list = await getListByName(listName);
      if (!list?.id) {
        missing.push({ list: listName, columns: [...columns] });
        continue;
      }

      const response = await client
        .api(`/sites/${siteId}/lists/${list.id}/columns`)
        .get();

      const absent = columns.filter((column) => !hasColumn(response.value || [], column));
      if (absent.length > 0) {
        missing.push({ list: listName, columns: absent });
      }
    }

    return {
      isReady: missing.length === 0,
      missing,
    };
  },

  async ensureControlPagosSchema(): Promise<void> {
    try {
    // 1) Listas base
    const proyectosListId = await ensureList(LISTS.PROYECTOS);
    const tiposListId = await ensureList(LISTS.DIM_TIPO_DOCUMENTO_PROY);
    const documentosListId = await ensureList(LISTS.FCT_DOCUMENTOS_PROY);
    const hitosListId = await ensureList(LISTS.FCT_HITOS_PAGO_PROY);

    // 2) ExtensiÃ³n de PROYECTOS
    await ensureColumn(proyectosListId, "COD_PROYECTO", { text: {} });
    await ensureColumn(proyectosListId, "MONTO_TOTAL_PROY", {
      number: { decimalPlaces: "automatic", displayAs: "number" },
    });
    await ensureColumn(proyectosListId, "MONEDA_BASE", {
      choice: { allowTextEntry: false, choices: ["CLP", "UF", "USD"] },
    });

    // 3) DIM_TIPO_DOCUMENTO_PROY
    await ensureColumn(tiposListId, "NOM_TIPO_DOCUMENTO", { text: {} });
    await ensureColumn(tiposListId, "ACTIVO", { boolean: {} });
    await ensureColumn(tiposListId, "ORDEN", {
      number: { decimalPlaces: "none", displayAs: "number" },
    });

    // 4) FCT_DOCUMENTOS_PROY
    await ensureColumn(documentosListId, "COD_PROYECTO", { text: {} });
    await ensureColumn(documentosListId, "FECHA_DOCUMENTO", {
      dateTime: { format: "dateOnly", displayAs: "default" },
    });
    await ensureColumn(documentosListId, "NRO_REFERENCIA", { text: {} });
    await ensureColumn(documentosListId, "OBSERVACION", { text: { allowMultipleLines: true } });
    await ensureLookupColumn(documentosListId, "PROYECTO", proyectosListId, "NOM_PROYECTO");
    await ensureLookupColumn(documentosListId, "TIPO_DOCUMENTO", tiposListId, "NOM_TIPO_DOCUMENTO");

    // 5) FCT_HITOS_PAGO_PROY
    await ensureColumn(hitosListId, "COD_PROYECTO", { text: {} });
    await ensureColumn(hitosListId, "NRO_HITO", {
      number: { decimalPlaces: "none", displayAs: "number" },
    });
    await ensureColumn(hitosListId, "MONTO_HITO", {
      number: { decimalPlaces: "automatic", displayAs: "number" },
    });
    await ensureColumn(hitosListId, "MONEDA", {
      choice: { allowTextEntry: false, choices: ["CLP", "UF", "USD"] },
    });
    await ensureColumn(hitosListId, "FECHA_COMPROMISO", {
      dateTime: { format: "dateOnly", displayAs: "default" },
    });
    await ensureColumn(hitosListId, "FECHA_PAGO", {
      dateTime: { format: "dateOnly", displayAs: "default" },
    });
    await ensureColumn(hitosListId, "FACTURADO", { boolean: {} });
    await ensureColumn(hitosListId, "PAGADO", { boolean: {} });
    await ensureColumn(hitosListId, "OBSERVACION", { text: { allowMultipleLines: true } });
    await ensureLookupColumn(hitosListId, "PROYECTO", proyectosListId, "NOM_PROYECTO");

    // 6) Seed catÃ¡logo
    await tiposDocumentoProyectoService.seedDefaults();

    clearListIdsCache();
    } catch (error: any) {
      throw normalizeProvisioningError(error);
    }
  },
};

// ========== SERVICIO PARA ARCHIVOS ==========

export const archivosService = {
  /**
   * Sube un archivo a la Document Library de SharePoint
   */
  async uploadFile(file: File, gastoId: string): Promise<{ nombre: string; url: string; tipo: string }> {
    const client = await getGraphClient();
    const siteId = await getCachedSiteId();
    
    try {
      // Obtener el drive (Document Library) del sitio
      const drive = await client
        .api(`/sites/${siteId}/drives`)
        .filter(`name eq '${DOCUMENT_LIBRARY}'`)
        .get();
      
      if (!drive.value || drive.value.length === 0) {
        throw new Error(`Document Library "${DOCUMENT_LIBRARY}" no encontrada`);
      }
      
      const driveId = drive.value[0].id;
      
      // Crear una carpeta para el gasto si no existe
      const folderPath = `/Gasto-${gastoId}`;
      const fileName = `${Date.now()}-${file.name}`;
      
      // Convertir archivo a ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();
      
      // Subir el archivo
      const uploadedFile = await client
        .api(`/sites/${siteId}/drives/${driveId}/root:${folderPath}/${fileName}:`)
        .put(arrayBuffer);
      
      return {
        nombre: file.name,
        url: uploadedFile.webUrl,
        tipo: file.type || "application/octet-stream",
      };
    } catch (error) {
      console.error("Error al subir archivo:", error);
      throw error;
    }
  },
};




