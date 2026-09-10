import { describe, expect, it } from 'vitest';
import {
  compactRut,
  getExpenseExtractionJsonSchema,
  normalizeExtractionPayload,
} from '../../server/gasto-extraccion.js';

const METADATA = { model: 'gpt-5.4-mini', fileName: 'comprobante.pdf', mimeType: 'application/pdf' };

// Encabezado del "Comprobante de operaciones autorizadas" real de Banco de Chile.
function comprobanteBase(overrides = {}) {
  return {
    fecha: '07-09-2026',
    fechaVencimiento: null,
    plazoPagoDias: null,
    tieneIva: false,
    tipoDocumento: 'OTRO',
    numeroDocumento: null,
    empresaNombre: null,
    empresaRut: null,
    emisorNombre: 'BANCO DE CHILE',
    emisorRut: null,
    receptorNombre: 'REKOSOL INGENIERIA SpA',
    receptorRut: '77.522.275-1',
    montoNeto: null,
    iva: null,
    montoTotal: 651836,
    detalle: 'Comprobante de operaciones autorizadas',
    confidence: 0.95,
    warnings: [],
    esComprobanteBancario: true,
    operacionesDeclaradas: 4,
    operacionesBancarias: [],
    ...overrides,
  };
}

function operacion(overrides = {}) {
  return {
    fecha: null,
    numeroOperacion: null,
    idTransaccion: null,
    beneficiarioNombre: null,
    beneficiarioRut: null,
    bancoDestino: null,
    cuentaDestino: null,
    cuentaOrigen: '001015259301',
    monto: null,
    tipoOperacion: 'Transferencia',
    asunto: '-',
    ...overrides,
  };
}

const CUATRO_OPERACIONES = [
  operacion({
    numeroOperacion: '6033950421',
    beneficiarioNombre: 'Termoalumplas S.p.a',
    beneficiarioRut: '77.079.176-6',
    bancoDestino: 'BANCO DEL ESTADO DE CHILE',
    cuentaDestino: '083170458403',
    monto: 190000,
  }),
  operacion({
    numeroOperacion: '6033950205',
    beneficiarioNombre: 'Sergio Hernan Munoz Arcos',
    beneficiarioRut: '28.669.789-5',
    bancoDestino: 'BANCO DEL ESTADO DE CHILE',
    cuentaDestino: '000028669789',
    monto: 24015,
  }),
  operacion({
    numeroOperacion: '6033949908',
    beneficiarioNombre: 'Mauricio Soto Barahona',
    beneficiarioRut: '12.465.535-8',
    bancoDestino: 'BCI MACHBANK',
    cuentaDestino: '000063045672',
    monto: 421821,
  }),
  operacion({
    numeroOperacion: '6033950047',
    beneficiarioNombre: 'Sergio Hernan Munoz Arcos',
    beneficiarioRut: '28.669.789-5',
    bancoDestino: 'BANCO DEL ESTADO DE CHILE',
    cuentaDestino: '000028669789',
    monto: 16000,
  }),
];

describe('normalizeExtractionPayload con comprobantes bancarios', () => {
  it('expande las cuatro operaciones del comprobante consolidado', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({ operacionesBancarias: CUATRO_OPERACIONES }),
      METADATA,
    );

    expect(result.esComprobanteBancario).toBe(true);
    expect(result.operacionesDeclaradas).toBe(4);
    expect(result.operacionesBancarias).toHaveLength(4);
    expect(result.warnings).toEqual([]);

    expect(result.operacionesBancarias.map((item) => item.monto)).toEqual([190000, 24015, 421821, 16000]);
    expect(result.operacionesBancarias.map((item) => item.numeroDocumento)).toEqual([
      '6033950421',
      '6033950205',
      '6033949908',
      '6033950047',
    ]);
    expect(result.operacionesBancarias.map((item) => item.indice)).toEqual([1, 2, 3, 4]);

    // La fecha de autorizacion del encabezado cae en cada operacion.
    expect(result.operacionesBancarias.every((item) => item.fecha === '2026-09-07')).toBe(true);
    expect(result.operacionesBancarias[0]).toMatchObject({
      beneficiarioNombre: 'TERMOALUMPLAS S.P.A',
      beneficiarioRut: '77079176-6',
      bancoDestino: 'BANCO DEL ESTADO DE CHILE',
      cuentaDestino: '083170458403',
      detalle: 'TRANSFERENCIA A TERMOALUMPLAS S.P.A',
    });
  });

  it('no deduplica un beneficiario que se repite con montos distintos', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({ operacionesBancarias: CUATRO_OPERACIONES }),
      METADATA,
    );

    const sergio = result.operacionesBancarias.filter((item) => compactRut(item.beneficiarioRut) === '286697895');
    expect(sergio).toHaveLength(2);
    expect(sergio.map((item) => item.monto)).toEqual([24015, 16000]);
    expect(sergio[0].numeroDocumento).not.toBe(sergio[1].numeroDocumento);
  });

  it('advierte cuando la suma de las transferencias no cuadra con el total', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({
        operacionesDeclaradas: null,
        operacionesBancarias: CUATRO_OPERACIONES.filter((item) => item.monto !== 421821),
      }),
      METADATA,
    );

    expect(result.operacionesBancarias).toHaveLength(3);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('no coincide');
    expect(result.warnings[0]).toContain('$ 230.015');
    expect(result.warnings[0]).toContain('$ 651.836');
  });

  it('advierte cuando faltan operaciones respecto de las declaradas', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({
        montoTotal: 230015,
        operacionesBancarias: CUATRO_OPERACIONES.filter((item) => item.monto !== 421821),
      }),
      METADATA,
    );

    const warning = result.warnings.find((item) => item.includes('declara'));
    expect(warning).toContain('declara 4');
    expect(warning).toContain('extrajeron 3');
  });

  it('usa el id de transaccion cuando el comprobante no trae numero de operacion', () => {
    const result = normalizeExtractionPayload(
      {
        ...comprobanteBase(),
        fecha: '08/09/2026',
        operacionesDeclaradas: null,
        montoTotal: 140000,
        detalle: 'Traspaso A:franklin Soto Guichapani',
        operacionesBancarias: [
          operacion({
            idTransaccion: 'INT_EMP2609081156125616522290',
            beneficiarioNombre: 'Franklin Soto Guichapani',
            beneficiarioRut: '0191467035',
            bancoDestino: 'Banco Estado',
            cuentaDestino: '00000000083260134429',
            monto: 140000,
            tipoOperacion: 'Cargo',
            asunto: null,
          }),
        ],
      },
      METADATA,
    );

    expect(result.operacionesBancarias).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.operacionesBancarias[0]).toMatchObject({
      numeroDocumento: 'INT_EMP2609081156125616522290',
      numeroOperacion: null,
      idTransaccion: 'INT_EMP2609081156125616522290',
      fecha: '2026-09-08',
      monto: 140000,
      detalle: 'TRANSFERENCIA A FRANKLIN SOTO GUICHAPANI',
    });
    // El RUT del banco viene con cero a la izquierda; compactRut lo deja comparable.
    expect(compactRut(result.operacionesBancarias[0].beneficiarioRut)).toBe('191467035');
  });

  it('descarta la operacion cuyo destinatario es el titular de la cuenta de origen', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({
        operacionesDeclaradas: null,
        montoTotal: 190000,
        operacionesBancarias: [
          operacion({
            beneficiarioNombre: 'REKOSOL INGENIERIA SpA',
            beneficiarioRut: '77522275-1',
            monto: 651836,
          }),
          CUATRO_OPERACIONES[0],
        ],
      }),
      METADATA,
    );

    expect(result.operacionesBancarias).toHaveLength(1);
    expect(result.operacionesBancarias[0].monto).toBe(190000);
    expect(result.operacionesBancarias[0].indice).toBe(1);
    expect(result.warnings[0]).toContain('titular de la cuenta de origen');
  });

  it('sintetiza una sola operacion cuando no se pudo separar el detalle', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({
        operacionesDeclaradas: null,
        empresaNombre: 'Franklin Soto Guichapani',
        empresaRut: '0191467035',
        numeroDocumento: 'INT_EMP2609081156125616522290',
        montoTotal: 140000,
        operacionesBancarias: [],
      }),
      METADATA,
    );

    expect(result.operacionesBancarias).toHaveLength(1);
    expect(result.operacionesBancarias[0]).toMatchObject({
      monto: 140000,
      numeroDocumento: 'INT_EMP2609081156125616522290',
      beneficiarioNombre: 'FRANKLIN SOTO GUICHAPANI',
    });
    expect(result.warnings[0]).toContain('una sola fila con el total');
  });

  it('no inventa una operacion cuando el nivel superior no tiene proveedor', () => {
    const result = normalizeExtractionPayload(
      comprobanteBase({ operacionesDeclaradas: null, operacionesBancarias: [] }),
      METADATA,
    );

    expect(result.operacionesBancarias).toEqual([]);
    expect(result.warnings[0]).toContain('revisa el documento manualmente');
  });

  it('deja intacta la extraccion de un documento tributario normal', () => {
    const result = normalizeExtractionPayload(
      {
        fecha: '2026-05-30',
        fechaVencimiento: '2026-06-29',
        plazoPagoDias: 30,
        tieneIva: true,
        tipoDocumento: 'FACTURA',
        numeroDocumento: '123',
        empresaNombre: 'Proveedor Uno SPA',
        empresaRut: '76.123.456-7',
        emisorNombre: null,
        emisorRut: null,
        receptorNombre: 'REKOSOL INGENIERIA SpA',
        receptorRut: '77.522.275-1',
        montoNeto: 840,
        iva: 160,
        montoTotal: 1000,
        detalle: 'Compra materiales',
        confidence: 0.91,
        warnings: [],
        esComprobanteBancario: false,
        operacionesDeclaradas: null,
        operacionesBancarias: [],
      },
      METADATA,
    );

    expect(result).toMatchObject({
      fecha: '2026-05-30',
      fechaVencimiento: '2026-06-29',
      plazoPagoDias: 30,
      tieneIva: true,
      tipoDocumento: 'FACTURA',
      numeroDocumento: '123',
      empresaNombre: 'PROVEEDOR UNO SPA',
      empresaRut: '76123456-7',
      montoNeto: 840,
      iva: 160,
      montoTotal: 1000,
      detalle: 'COMPRA MATERIALES',
      confidence: 0.91,
      esComprobanteBancario: false,
      metadata: METADATA,
    });
    expect(result.warnings).toEqual([]);
    expect(result.operacionesBancarias).toEqual([]);
  });
});

describe('getExpenseExtractionJsonSchema', () => {
  // OpenAI rechaza el structured output en modo strict si algun objeto anidado
  // omite additionalProperties o deja una propiedad fuera de required.
  function assertStrictObject(node: Record<string, unknown>, path: string) {
    if (node?.type === 'object') {
      expect(node.additionalProperties, `${path}.additionalProperties`).toBe(false);
      expect(
        [...(node.required as string[])].sort(),
        `${path}.required`,
      ).toEqual(Object.keys(node.properties as object).sort());

      for (const [key, child] of Object.entries(node.properties as Record<string, Record<string, unknown>>)) {
        assertStrictObject(child, `${path}.${key}`);
      }
    }

    if (node?.type === 'array' && node.items) {
      assertStrictObject(node.items as Record<string, unknown>, `${path}[]`);
    }
  }

  it('cumple las reglas de strict en todos los niveles', () => {
    assertStrictObject(getExpenseExtractionJsonSchema(), 'schema');
  });

  it('declara los campos de comprobante bancario', () => {
    const schema = getExpenseExtractionJsonSchema();

    expect(schema.required).toContain('esComprobanteBancario');
    expect(schema.required).toContain('operacionesDeclaradas');
    expect(schema.required).toContain('operacionesBancarias');
    expect(schema.properties.operacionesBancarias.items.required).toContain('numeroOperacion');
    expect(schema.properties.operacionesBancarias.items.required).toContain('idTransaccion');
  });
});
