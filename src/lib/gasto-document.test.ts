import { describe, expect, it } from 'vitest';
import {
  isExtractableDocument,
  resolveEmpresaId,
  resolveTipoDocumentoId,
  validateGastoDraft,
} from './gasto-document';

describe('gasto document helpers', () => {
  it('resolves document type by normalized name', () => {
    expect(resolveTipoDocumentoId([
      { id: '1', nombre: 'Factura Exenta' },
      { id: '2', nombre: 'Boleta' },
    ], 'FACTURA EXENTA')).toBe('1');
  });

  it('resolves company by rut or normalized name', () => {
    const empresas = [
      { id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' },
      { id: 'empresa-2', razonSocial: 'Servicios del Norte', rut: '77.999.999-1', createdAt: '2026-01-01' },
    ];

    expect(resolveEmpresaId(empresas, {
      empresaRut: '76123456-7',
      emisorRut: null,
      empresaNombre: null,
      emisorNombre: null,
    })).toBe('empresa-1');
    expect(resolveEmpresaId(empresas, {
      empresaRut: null,
      emisorRut: null,
      empresaNombre: 'SERVICIOS NORTE',
      emisorNombre: null,
    })).toBe('empresa-2');
  });

  it('validates required fields and Otro comment', () => {
    const tiposDocumento = [{ id: 'otro-id', nombre: 'Otro' }];

    expect(validateGastoDraft({
      fecha: '2026-05-31',
      categoria: 'cat-1',
      empresaId: 'emp-1',
      tipoDocumento: 'otro-id',
      numeroDocumento: '10',
      montoTotal: 1000,
      comentarioTipoDocumento: '',
    }, tiposDocumento)).toContain('Especificar tipo de documento');
  });

  it('accepts images, pdf and xml only', () => {
    expect(isExtractableDocument(new File(['x'], 'gasto.pdf', { type: 'application/pdf' }))).toBe(true);
    expect(isExtractableDocument(new File(['x'], 'gasto.png', { type: 'image/png' }))).toBe(true);
    expect(isExtractableDocument(new File(['x'], 'gasto.xml', { type: 'application/xml' }))).toBe(true);
    expect(isExtractableDocument(new File(['x'], 'gasto.txt', { type: 'text/plain' }))).toBe(false);
  });
});
