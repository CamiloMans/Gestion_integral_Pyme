import { z } from 'zod';

// Identificadores que aceptamos interpolar en SQL. Vienen de pg_catalog (regclass y
// quote_ident ya los entregan escapados), pero validamos igual antes de concatenarlos.
const SAFE_IDENTIFIER = /^[A-Za-z0-9_."]+$/;

export function createFusionError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function createEmpresaFusionInputSchema(empresaInputSchema) {
  return z.object({
    empresaIds: z.array(z.string().uuid()).min(2),
    empresaPrincipalId: z.string().uuid(),
    empresa: empresaInputSchema,
  });
}

export function normalizeEmpresaFusionSelection({ empresaIds, empresaPrincipalId }) {
  const uniqueIds = [...new Set(empresaIds || [])];

  if (uniqueIds.length < 2) {
    throw createFusionError('Debes seleccionar al menos dos empresas para agrupar.');
  }

  if (!uniqueIds.includes(empresaPrincipalId)) {
    throw createFusionError('La empresa principal debe ser una de las empresas seleccionadas.');
  }

  return {
    empresaIds: uniqueIds,
    empresaPrincipalId,
    empresasAbsorbidasIds: uniqueIds.filter((id) => id !== empresaPrincipalId),
  };
}

// Convierte las filas del catalogo de claves foraneas en sentencias update listas para
// repuntar cada referencia a dim_empresa hacia la empresa principal.
export function buildEmpresaReferenceUpdates(catalogRows, columnsByTable = new Map()) {
  return (catalogRows || []).map((row) => {
    const tableRef = String(row.table_ref || '');
    const columnRef = String(row.column_ref || '');
    const tableName = String(row.table_name || tableRef);
    const columnName = String(row.column_name || columnRef);

    if (Number(row.key_columns) !== 1) {
      throw createFusionError(
        `No se pueden reasignar los registros de ${tableName} porque su clave foranea es compuesta.`,
        409,
      );
    }

    if (!SAFE_IDENTIFIER.test(tableRef) || !SAFE_IDENTIFIER.test(columnRef)) {
      throw createFusionError(
        `No se pueden reasignar los registros de ${tableName} porque su identificador no es valido.`,
        409,
      );
    }

    const tableColumns = columnsByTable.get(tableName);
    const usesTenant = Boolean(tableColumns && tableColumns.has('tenant_id'));

    return {
      tabla: tableName,
      columna: columnName,
      usaTenant: usesTenant,
      sql: `update ${tableRef} set ${columnRef} = $1 where ${columnRef} = any($2::uuid[])${usesTenant ? ' and tenant_id = $3' : ''}`,
    };
  });
}
