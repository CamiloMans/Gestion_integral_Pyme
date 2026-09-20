import ExcelJS from 'exceljs';
import type { Gasto } from '@/data/mockData';
import type { BootstrapResponse } from '@/services/postgresApi';

type ExportCatalogs = Pick<BootstrapResponse, 'empresas' | 'proyectos' | 'categorias' | 'tiposDocumento' | 'colaboradores'>;

const CLP_FORMAT = '[$-es-CL]$ #,##0;[Red]-[$-es-CL]$ #,##0';
const DATE_FORMAT = 'dd/mm/yyyy';
const TABLE_STYLE = 'TableStyleMedium2';

function parseDate(value?: string) {
  if (!value) return undefined;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function money(value?: number) {
  return Number(value ?? 0);
}

function displayBoolean(value?: boolean) {
  return value === false ? 'No' : 'Sí';
}

function createLookup<T extends { id: string; nombre?: string; razonSocial?: string; codigoProyecto?: string; rut?: string }>(items: T[]) {
  return new Map(items.map((item) => [String(item.id), item]));
}

function addTitle(worksheet: ExcelJS.Worksheet, title: string) {
  worksheet.mergeCells('A1:E1');
  const titleCell = worksheet.getCell('A1');
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
  titleCell.alignment = { vertical: 'middle' };
  worksheet.getRow(1).height = 28;
}

function addSummaryTable(
  worksheet: ExcelJS.Worksheet,
  name: string,
  startRow: number,
  title: string,
  rows: Array<{ label: string; total: number }>,
) {
  const ref = `A${startRow}`;
  worksheet.getCell(`A${startRow - 1}`).value = title;
  worksheet.getCell(`A${startRow - 1}`).font = { bold: true, color: { argb: 'FF1E3A5F' } };
  worksheet.addTable({
    name,
    ref,
    headerRow: true,
    totalsRow: true,
    style: { theme: TABLE_STYLE, showRowStripes: true },
    columns: [
      { name: 'Concepto', totalsRowLabel: 'Total' },
      { name: 'Monto total', totalsRowFunction: 'sum' },
    ],
    rows: rows.map((row) => [row.label, row.total]),
  });
  for (let row = startRow + 1; row <= startRow + rows.length + 1; row += 1) {
    worksheet.getCell(row, 2).numFmt = CLP_FORMAT;
  }
  return startRow + rows.length + 4;
}

function totalsBy(items: Array<{ label: string; total: number }>) {
  const totals = new Map<string, number>();
  items.forEach(({ label, total }) => totals.set(label, (totals.get(label) || 0) + total));
  return Array.from(totals, ([label, total]) => ({ label, total }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label, 'es'));
}

export function buildGastosWorkbook(gastos: Gasto[], catalogs: ExportCatalogs) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rekosol';
  workbook.created = new Date();

  const empresas = createLookup(catalogs.empresas);
  const proyectos = createLookup(catalogs.proyectos);
  const categorias = createLookup(catalogs.categorias);
  const tiposDocumento = createLookup(catalogs.tiposDocumento);
  const colaboradores = createLookup(catalogs.colaboradores);
  const sortedGastos = [...gastos].sort((left, right) => {
    const createdDiff = (parseDate(right.createdAt)?.getTime() || 0) - (parseDate(left.createdAt)?.getTime() || 0);
    return createdDiff || (parseDate(right.fecha)?.getTime() || 0) - (parseDate(left.fecha)?.getTime() || 0);
  });

  const detailRows = sortedGastos.map((gasto) => {
    const empresa = empresas.get(String(gasto.empresaId || ''));
    const proyecto = proyectos.get(String(gasto.proyectoId || ''));
    const categoria = categorias.get(String(gasto.categoria || ''));
    const tipoDocumento = tiposDocumento.get(String(gasto.tipoDocumento || ''));
    const colaborador = colaboradores.get(String(gasto.colaboradorId || ''));
    const montoTotal = money(gasto.montoTotal ?? gasto.monto);

    return {
      gasto,
      montoTotal,
      categoria: categoria?.nombre || gasto.categoria || 'Sin categoría',
      proyecto: proyecto?.nombre || 'Sin proyecto',
      empresa: empresa?.razonSocial || 'Empresa no informada',
      values: [
        parseDate(gasto.fecha),
        parseDate(gasto.createdAt),
        gasto.creadoPorNombre || gasto.colaboradorNombre || colaborador?.nombre || 'Sin usuario',
        proyecto?.codigoProyecto || '',
        proyecto?.nombre || 'Sin proyecto',
        categoria?.nombre || gasto.categoria || 'Sin categoría',
        empresa?.razonSocial || 'Empresa no informada',
        empresa?.rut || '',
        tipoDocumento?.nombre || gasto.tipoDocumento || '',
        gasto.numeroDocumento || '',
        gasto.detalle || '',
        money(gasto.montoNeto ?? gasto.monto),
        gasto.iva === undefined || gasto.iva === null ? '' : money(gasto.iva),
        montoTotal,
        gasto.origen === 'COMPROMISO' ? 'Comprometido' : 'Inmediato',
        parseDate(gasto.fechaCompromiso),
        parseDate(gasto.fechaPago),
        displayBoolean(gasto.facturado),
        displayBoolean(gasto.pagado),
        (gasto.archivosAdjuntos || []).map((archivo) => archivo.nombre).join(', '),
      ],
    };
  });

  const gastosSheet = workbook.addWorksheet('Gastos', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  addTitle(gastosSheet, 'Exportación de gastos Rekosol');
  gastosSheet.getCell('A2').value = `Generado el ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}`;
  gastosSheet.getCell('A2').font = { italic: true, color: { argb: 'FF475569' } };

  gastosSheet.addTable({
    name: 'TablaGastos',
    ref: 'A3',
    headerRow: true,
    totalsRow: true,
    style: { theme: TABLE_STYLE, showRowStripes: true },
    columns: [
      { name: 'Fecha' }, { name: 'Creado el' }, { name: 'Registrado por' }, { name: 'Código proyecto' },
      { name: 'Proyecto' }, { name: 'Categoría' }, { name: 'Empresa' }, { name: 'RUT' },
      { name: 'Tipo documento' }, { name: 'N° documento' }, { name: 'Detalle' },
      { name: 'Monto neto', totalsRowLabel: 'Totales', totalsRowFunction: 'sum' },
      { name: 'IVA', totalsRowFunction: 'sum' }, { name: 'Monto total', totalsRowFunction: 'sum' },
      { name: 'Origen' }, { name: 'Fecha compromiso' }, { name: 'Fecha pago' },
      { name: 'Facturado' }, { name: 'Pagado' }, { name: 'Adjuntos' },
    ],
    rows: detailRows.map((row) => row.values),
  });
  gastosSheet.columns = [
    { width: 13 }, { width: 19 }, { width: 25 }, { width: 18 }, { width: 32 }, { width: 22 },
    { width: 32 }, { width: 15 }, { width: 20 }, { width: 18 }, { width: 42 }, { width: 16 },
    { width: 14 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 15 }, { width: 12 },
    { width: 12 }, { width: 38 },
  ];
  [1, 2, 16, 17].forEach((column) => { gastosSheet.getColumn(column).numFmt = DATE_FORMAT; });
  [12, 13, 14].forEach((column) => { gastosSheet.getColumn(column).numFmt = CLP_FORMAT; });
  gastosSheet.autoFilter = { from: 'A3', to: `T${Math.max(4, detailRows.length + 3)}` };

  const resumenSheet = workbook.addWorksheet('Resumen', { views: [{ state: 'frozen', ySplit: 3 }] });
  addTitle(resumenSheet, 'Resumen de gastos Rekosol');
  resumenSheet.getCell('A3').value = 'Indicador';
  resumenSheet.getCell('B3').value = 'Valor';
  resumenSheet.getCell('A4').value = 'Gastos exportados';
  resumenSheet.getCell('B4').value = detailRows.length;
  resumenSheet.getCell('A5').value = 'Monto neto total';
  resumenSheet.getCell('B5').value = detailRows.reduce((total, row) => total + money(row.gasto.montoNeto ?? row.gasto.monto), 0);
  resumenSheet.getCell('A6').value = 'IVA total';
  resumenSheet.getCell('B6').value = detailRows.reduce((total, row) => total + (row.gasto.iva === undefined || row.gasto.iva === null ? 0 : money(row.gasto.iva)), 0);
  resumenSheet.getCell('A7').value = 'Monto total';
  resumenSheet.getCell('B7').value = detailRows.reduce((total, row) => total + row.montoTotal, 0);
  resumenSheet.addTable({
    name: 'IndicadoresGastos',
    ref: 'A3',
    headerRow: true,
    style: { theme: TABLE_STYLE, showRowStripes: true },
    columns: [{ name: 'Indicador' }, { name: 'Valor' }],
    rows: [
      ['Gastos exportados', detailRows.length],
      ['Monto neto total', resumenSheet.getCell('B5').value],
      ['IVA total', resumenSheet.getCell('B6').value],
      ['Monto total', resumenSheet.getCell('B7').value],
    ],
  });
  [5, 6, 7].forEach((row) => { resumenSheet.getCell(row, 2).numFmt = CLP_FORMAT; });
  let summaryRow = 10;
  summaryRow = addSummaryTable(resumenSheet, 'ResumenPorCategoria', summaryRow, 'Totales por categoría', totalsBy(detailRows.map((row) => ({ label: row.categoria, total: row.montoTotal }))));
  summaryRow = addSummaryTable(resumenSheet, 'ResumenPorProyecto', summaryRow, 'Totales por proyecto', totalsBy(detailRows.map((row) => ({ label: row.proyecto, total: row.montoTotal }))));
  addSummaryTable(resumenSheet, 'ResumenPorEmpresa', summaryRow, 'Totales por empresa', totalsBy(detailRows.map((row) => ({ label: row.empresa, total: row.montoTotal }))));
  resumenSheet.getColumn(1).width = 40;
  resumenSheet.getColumn(2).width = 20;

  return workbook;
}

export async function downloadGastosExcel(gastos: Gasto[], catalogs: ExportCatalogs) {
  const workbook = buildGastosWorkbook(gastos, catalogs);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `gastos-rekosol-${new Date().toISOString().slice(0, 10)}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
  return gastos.length;
}
