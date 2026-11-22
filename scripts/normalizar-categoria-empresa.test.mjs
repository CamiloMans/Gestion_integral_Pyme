import { describe, expect, it } from 'vitest';
import {
  canonizarCategoria,
  clasificarReceptor,
  digitoVerificador,
} from './normalizar-categoria-empresa.mjs';

describe('digitoVerificador', () => {
  it('calcula el digito por modulo 11', () => {
    expect(digitoVerificador('14036424')).toBe('K');
    expect(digitoVerificador('76358485')).toBe('2');
    expect(digitoVerificador('6524470')).toBe('5');
  });

  it('usa 0 cuando el resto es 11', () => {
    expect(digitoVerificador('90844000')).toBe('5');
    expect(digitoVerificador('11111111')).toBe('1');
  });
});

describe('clasificarReceptor', () => {
  it('el nombre no decide: EMMANUEL GONZALEZ tiene RUT de empresa', () => {
    const resultado = clasificarReceptor({ razonSocial: 'EMMANUEL GONZALEZ', rut: '77895594-6' });
    expect(resultado.categoria).toBe('Empresa');
    expect(resultado.digitoVerificadorInvalido).toBe(false);
  });

  it('el nombre no decide: ANGOVET tiene RUN de persona', () => {
    expect(clasificarReceptor({ razonSocial: 'ANGOVET', rut: '7359930-K' }).categoria)
      .toBe('Persona Natural');
  });

  it('acepta el RUT con puntos y guion', () => {
    expect(clasificarReceptor({ razonSocial: 'KUPFER', rut: '90.844.000-5' }).categoria)
      .toBe('Empresa');
  });

  it('clasifica igual con el digito verificador malo, pero lo marca para revisar', () => {
    const resultado = clasificarReceptor({ razonSocial: 'CASA MAGNOLIA SPA', rut: '78216446-6' });
    expect(resultado.categoria).toBe('Empresa');
    expect(resultado.digitoVerificadorInvalido).toBe(true);
    expect(resultado.motivo).toContain('se esperaba 5');
  });

  it('no decide sin RUT', () => {
    expect(clasificarReceptor({ razonSocial: 'ALOJAMIENTO', rut: null }).categoria)
      .toBe('Sin individualizar');
  });

  it('no decide con un RUT de relleno aunque el digito sea valido', () => {
    expect(clasificarReceptor({ razonSocial: 'COMIDA', rut: '11111111-1' }).categoria)
      .toBe('Sin individualizar');
  });

  it('no decide cuando falta el digito verificador separado', () => {
    const resultado = clasificarReceptor({ razonSocial: 'MCT', rut: '96355006' });
    expect(resultado.categoria).toBe('Sin individualizar');
    expect(resultado.motivo).toContain('sin digito verificador separado');
  });

  it('respeta la clasificacion manual de los receptores sin RUT conocidos', () => {
    const resultado = clasificarReceptor({ razonSocial: 'SODIMAC', rut: '' });
    expect(resultado.categoria).toBe('Empresa');
    expect(resultado.motivo).toBe('clasificacion manual');
  });
});

describe('canonizarCategoria', () => {
  it('unifica las variantes en mayusculas', () => {
    expect(canonizarCategoria('EMPRESA')).toBe('Empresa');
    expect(canonizarCategoria('PERSONA NATURAL')).toBe('Persona Natural');
  });

  it('devuelve null cuando el valor ya es canonico', () => {
    expect(canonizarCategoria('Empresa')).toBeNull();
    expect(canonizarCategoria('Sin individualizar')).toBeNull();
  });

  it('devuelve null con valores nulos o desconocidos', () => {
    expect(canonizarCategoria(null)).toBeNull();
    expect(canonizarCategoria('Otra cosa')).toBeNull();
  });
});
