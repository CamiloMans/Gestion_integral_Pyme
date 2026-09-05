import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildEmpresaReferenceUpdates,
  createEmpresaFusionInputSchema,
  normalizeEmpresaFusionSelection,
} from '../../server/empresas-fusion.js';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';
const EMPRESA_C = '33333333-3333-4333-8333-333333333333';

const empresaInputSchema = z.object({
  razonSocial: z.string().trim().min(1),
  rut: z.string().optional().nullable(),
});

const fusionSchema = createEmpresaFusionInputSchema(empresaInputSchema);

describe('createEmpresaFusionInputSchema', () => {
  it('acepta un payload valido', () => {
    const parsed = fusionSchema.parse({
      empresaIds: [EMPRESA_A, EMPRESA_B],
      empresaPrincipalId: EMPRESA_A,
      empresa: { razonSocial: 'ACME SPA' },
    });

    expect(parsed.empresaIds).toHaveLength(2);
  });

  it('rechaza una seleccion con una sola empresa', () => {
    expect(() => fusionSchema.parse({
      empresaIds: [EMPRESA_A],
      empresaPrincipalId: EMPRESA_A,
      empresa: { razonSocial: 'ACME SPA' },
    })).toThrow();
  });

  it('rechaza una razon social vacia', () => {
    expect(() => fusionSchema.parse({
      empresaIds: [EMPRESA_A, EMPRESA_B],
      empresaPrincipalId: EMPRESA_A,
      empresa: { razonSocial: '   ' },
    })).toThrow();
  });
});

describe('normalizeEmpresaFusionSelection', () => {
  it('deduplica ids y devuelve las absorbidas sin la principal', () => {
    const result = normalizeEmpresaFusionSelection({
      empresaIds: [EMPRESA_A, EMPRESA_B, EMPRESA_A, EMPRESA_C],
      empresaPrincipalId: EMPRESA_B,
    });

    expect(result.empresaIds).toEqual([EMPRESA_A, EMPRESA_B, EMPRESA_C]);
    expect(result.empresasAbsorbidasIds).toEqual([EMPRESA_A, EMPRESA_C]);
  });

  it('rechaza cuando los duplicados dejan una sola empresa real', () => {
    expect(() => normalizeEmpresaFusionSelection({
      empresaIds: [EMPRESA_A, EMPRESA_A],
      empresaPrincipalId: EMPRESA_A,
    })).toThrow(/al menos dos empresas/);
  });

  it('rechaza una principal que no esta en la seleccion', () => {
    expect(() => normalizeEmpresaFusionSelection({
      empresaIds: [EMPRESA_A, EMPRESA_B],
      empresaPrincipalId: EMPRESA_C,
    })).toThrow(/empresa principal/i);
  });

  it('marca los errores de seleccion como 400', () => {
    try {
      normalizeEmpresaFusionSelection({ empresaIds: [EMPRESA_A], empresaPrincipalId: EMPRESA_A });
      expect.unreachable('deberia lanzar');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(400);
    }
  });
});

describe('buildEmpresaReferenceUpdates', () => {
  const gastoRow = {
    table_ref: 'fct_gasto',
    column_ref: 'empresa_id',
    table_name: 'fct_gasto',
    column_name: 'empresa_id',
    key_columns: 1,
  };

  it('agrega el filtro por tenant solo cuando la tabla tiene tenant_id', () => {
    const columnsByTable = new Map([
      ['fct_gasto', new Set(['id', 'tenant_id', 'empresa_id'])],
      ['otra_tabla', new Set(['id', 'empresa_id'])],
    ]);

    const [conTenant, sinTenant] = buildEmpresaReferenceUpdates(
      [
        gastoRow,
        { ...gastoRow, table_ref: 'otra_tabla', table_name: 'otra_tabla' },
      ],
      columnsByTable,
    );

    expect(conTenant.usaTenant).toBe(true);
    expect(conTenant.sql).toContain('and tenant_id = $3');
    expect(conTenant.sql).toContain('= any($2::uuid[])');
    expect(sinTenant.usaTenant).toBe(false);
    expect(sinTenant.sql).not.toContain('tenant_id');
  });

  it('rechaza una clave foranea compuesta', () => {
    expect(() => buildEmpresaReferenceUpdates([{ ...gastoRow, key_columns: 2 }]))
      .toThrow(/compuesta/);
  });

  it('rechaza un identificador que no reconocemos', () => {
    expect(() => buildEmpresaReferenceUpdates([
      { ...gastoRow, table_ref: 'fct_gasto; drop table users' },
    ])).toThrow(/no es valido/);
  });

  it('devuelve una lista vacia si no hay referencias', () => {
    expect(buildEmpresaReferenceUpdates([])).toEqual([]);
    expect(buildEmpresaReferenceUpdates(null)).toEqual([]);
  });
});
