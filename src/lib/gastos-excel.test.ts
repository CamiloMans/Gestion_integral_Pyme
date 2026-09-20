import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildGastosWorkbook } from './gastos-excel';

const catalogs = {
  empresas: [{ id: 'empresa-1', razonSocial: 'Proveedor Uno SPA', rut: '76.123.456-7', createdAt: '2026-01-01' }],
  proyectos: [{ id: 'proyecto-1', nombre: 'Proyecto Uno', codigoProyecto: 'PR-001', createdAt: '2026-01-01' }],
  categorias: [{ id: 'categoria-1', nombre: 'Materiales', color: 'bg-blue-500' }],
  tiposDocumento: [{ id: 'tipo-1', nombre: 'Factura', tieneImpuestos: true, valorImpuestos: 0.19 }],
  colaboradores: [{ id: 'colaborador-1', nombre: 'Mariana Navarro', createdAt: '2026-01-01' }],
};

describe('buildGastosWorkbook', () => {
  it('crea tablas profesionales con datos relacionados, totales y campos opcionales', async () => {
    const workbook = buildGastosWorkbook([
      {
        id: 'gasto-1',
        fecha: '2026-09-17',
        createdAt: '2026-09-18T10:30:00Z',
        empresaId: 'empresa-1',
        proyectoId: 'proyecto-1',
        categoria: 'categoria-1',
        tipoDocumento: 'tipo-1',
        numeroDocumento: 'F-100',
        detalle: 'Compra de materiales',
        monto: 119000,
        montoNeto: 100000,
        iva: 19000,
        montoTotal: 119000,
        colaboradorId: 'colaborador-1',
        origen: 'COMPROMISO',
        fechaCompromiso: '2026-09-10',
        fechaPago: '2026-09-17',
        facturado: true,
        pagado: true,
        archivosAdjuntos: [{ nombre: 'factura.pdf', url: '/archivo', tipo: 'application/pdf' }],
      },
      {
        id: 'gasto-2',
        fecha: '2026-09-16',
        categoria: 'categoria-1',
        tipoDocumento: 'tipo-1',
        numeroDocumento: '',
        monto: 5000,
      },
    ], catalogs);

    const gastosSheet = workbook.getWorksheet('Gastos');
    const resumenSheet = workbook.getWorksheet('Resumen');

    expect(gastosSheet).toBeDefined();
    expect(resumenSheet).toBeDefined();
    expect(gastosSheet?.getTable('TablaGastos')).toBeDefined();
    expect(resumenSheet?.getTable('IndicadoresGastos')).toBeDefined();
    expect(resumenSheet?.getTable('ResumenPorCategoria')).toBeDefined();
    expect(resumenSheet?.getTable('ResumenPorProyecto')).toBeDefined();
    expect(resumenSheet?.getTable('ResumenPorEmpresa')).toBeDefined();
    expect(gastosSheet?.getCell('E4').value).toBe('Proyecto Uno');
    expect(gastosSheet?.getCell('G4').value).toBe('Proveedor Uno SPA');
    expect(gastosSheet?.getCell('T4').value).toBe('factura.pdf');
    expect(gastosSheet?.getCell('L4').numFmt).toContain('$');
    expect(gastosSheet?.views[0].state).toBe('frozen');
    expect(gastosSheet?.views[0].ySplit).toBe(3);
    expect(gastosSheet?.getTable('TablaGastos')?.table.columns.every((column) => column.filterButton)).toBe(true);

    const zip = await JSZip.loadAsync(await workbook.xlsx.writeBuffer());
    const tableXml = await zip.file('xl/tables/table1.xml')?.async('string');
    expect(tableXml).toContain('hiddenButton="0"');
    expect(tableXml).not.toContain('hiddenButton="1"');
  });
});
