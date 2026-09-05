import { describe, expect, it } from 'vitest';
import type { Empresa } from '@/data/mockData';
import { buildFusionDraft, contarGastosAReasignar, elegirEmpresaPrincipal } from './empresa-fusion';

function crearEmpresa(overrides: Partial<Empresa> & Pick<Empresa, 'id'>): Empresa {
  return {
    razonSocial: 'EMPRESA',
    rut: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('elegirEmpresaPrincipal', () => {
  it('elige la empresa con mas gastos', () => {
    const empresas = [
      crearEmpresa({ id: 'a' }),
      crearEmpresa({ id: 'b' }),
      crearEmpresa({ id: 'c' }),
    ];

    expect(elegirEmpresaPrincipal(empresas, { a: 3, b: 47, c: 9 })).toBe('b');
  });

  it('no compara los conteos como texto', () => {
    const empresas = [crearEmpresa({ id: 'a' }), crearEmpresa({ id: 'b' })];

    // Lexicograficamente "9" > "47"; numericamente 47 > 9.
    expect(elegirEmpresaPrincipal(empresas, { a: 9, b: 47 })).toBe('b');
  });

  it('ante empate se queda con la mas antigua', () => {
    const empresas = [
      crearEmpresa({ id: 'nueva', createdAt: '2026-08-01T00:00:00.000Z' }),
      crearEmpresa({ id: 'antigua', createdAt: '2024-02-01T00:00:00.000Z' }),
    ];

    expect(elegirEmpresaPrincipal(empresas, { nueva: 5, antigua: 5 })).toBe('antigua');
  });

  it('trata como cero las empresas sin conteo', () => {
    const empresas = [crearEmpresa({ id: 'a' }), crearEmpresa({ id: 'b' })];

    expect(elegirEmpresaPrincipal(empresas, { b: 1 })).toBe('b');
  });

  it('devuelve cadena vacia sin empresas', () => {
    expect(elegirEmpresaPrincipal([], {})).toBe('');
  });
});

describe('buildFusionDraft', () => {
  const empresas = [
    crearEmpresa({ id: 'a', razonSocial: 'Acme spa', rut: '', numeroContacto: '' }),
    crearEmpresa({
      id: 'b',
      razonSocial: 'ACME SPA DUPLICADA',
      rut: '76123456-7',
      numeroContacto: '+56911111111',
      correoElectronico: 'pagos@acme.cl',
      categoria: 'Empresa',
    }),
  ];

  it('toma el nombre de la principal y lo pasa a mayusculas', () => {
    expect(buildFusionDraft(empresas, 'a').razonSocial).toBe('ACME SPA');
  });

  it('rescata RUT, contacto y correo de las otras cuando la principal los tiene vacios', () => {
    const draft = buildFusionDraft(empresas, 'a');

    expect(draft.rut).toBe('76123456-7');
    expect(draft.numeroContacto).toBe('+56911111111');
    expect(draft.correoElectronico).toBe('pagos@acme.cl');
    expect(draft.categoria).toBe('Empresa');
  });

  it('nunca hereda el nombre de otra empresa', () => {
    const sinNombre = [
      crearEmpresa({ id: 'a', razonSocial: '' }),
      crearEmpresa({ id: 'b', razonSocial: 'OTRA' }),
    ];

    expect(buildFusionDraft(sinNombre, 'a').razonSocial).toBe('');
  });

  it('prefiere los datos de la principal cuando existen', () => {
    expect(buildFusionDraft(empresas, 'b').rut).toBe('76123456-7');
  });
});

describe('contarGastosAReasignar', () => {
  it('suma los gastos de todas menos la principal', () => {
    const empresas = [
      crearEmpresa({ id: 'a' }),
      crearEmpresa({ id: 'b' }),
      crearEmpresa({ id: 'c' }),
    ];

    expect(contarGastosAReasignar(empresas, 'a', { a: 10, b: 4, c: 3 })).toBe(7);
  });

  it('devuelve cero si solo esta la principal', () => {
    expect(contarGastosAReasignar([crearEmpresa({ id: 'a' })], 'a', { a: 10 })).toBe(0);
  });
});
