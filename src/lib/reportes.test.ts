import { describe, expect, it } from 'vitest';
import { buildReportesPortafolio } from '../../server/reportes.js';

const baseProjects = [
  {
    id: 'project-1',
    nombre: 'Proyecto Uno',
    codigoProyecto: 'P-001',
    montoTotalProyecto: 1000,
    montoTotalClp: 1000,
    monedaBase: 'CLP',
    activo: true,
  },
  {
    id: 'project-2',
    nombre: 'Proyecto Sin Presupuesto',
    montoTotalProyecto: null,
    montoTotalClp: null,
    monedaBase: null,
    activo: true,
  },
  {
    id: 'project-3',
    nombre: 'Proyecto Sin Ingresos',
    montoTotalProyecto: 500,
    montoTotalClp: 500,
    monedaBase: 'CLP',
    activo: true,
    generaIngresos: false,
  },
];

describe('buildReportesPortafolio', () => {
  it('calcula cartera, margen, pagos y alertas con filtros activos', () => {
    const report = buildReportesPortafolio({
      projects: baseProjects,
      gastos: [
        { id: 'gasto-1', fecha: '2026-01-10', montoTotal: 400, proyectoId: 'project-1', categoriaNombre: 'Materiales', empresaNombre: 'Proveedor Uno' },
        { id: 'gasto-2', fecha: '2025-12-10', montoTotal: 100, proyectoId: 'project-1', categoriaNombre: 'Materiales', empresaNombre: 'Proveedor Uno' },
        { id: 'gasto-3', fecha: '2026-01-05', montoTotal: 50, proyectoId: null, categoriaNombre: 'Traslados', empresaNombre: 'Proveedor Dos' },
      ],
      hitos: [
        { id: 'hito-1', proyectoId: 'project-1', montoHito: 200, moneda: 'CLP', fechaCompromiso: '2026-01-01', fechaPago: '2026-01-15', facturado: true, pagado: true },
        { id: 'hito-2', proyectoId: 'project-1', nroHito: 2, montoHito: 300, moneda: 'CLP', fechaCompromiso: '2026-02-01', facturado: true, pagado: false },
        { id: 'hito-3', proyectoId: 'project-1', nroHito: 3, montoHito: 100, moneda: 'CLP', fechaCompromiso: '2026-01-20', facturado: false, pagado: false },
      ],
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });

    expect(report.summary.portfolioClp).toBe(1000);
    expect(report.summary.historicalExpensesClp).toBe(500);
    expect(report.summary.periodExpensesClp).toBe(400);
    expect(report.summary.estimatedMarginClp).toBe(500);
    expect(report.summary.paidClp).toBe(200);
    expect(report.summary.invoicedPendingClp).toBe(300);
    expect(report.summary.toInvoiceClp).toBe(500);
    expect(report.summary.toCollectClp).toBe(800);
    expect(report.historicalCategories).toEqual([
      { name: 'Materiales', amountClp: 500, percentage: 100 },
    ]);
    expect(report.historicalSuppliers).toEqual([
      { name: 'Proveedor Uno', amountClp: 500, percentage: 100 },
    ]);
    expect(report.projects).toHaveLength(2);
    expect(report.projects.find((project) => project.id === 'project-2')?.health).toBe('sin_presupuesto');
    expect(report.alerts.missingBudget).toHaveLength(1);
    expect(report.alerts.unassignedExpenses).toEqual({
      count: 1,
      amountClp: 50,
      items: [{
        id: 'gasto-3',
        date: '2026-01-05',
        supplierName: 'Proveedor Dos',
        categoryName: 'Traslados',
        amountClp: 50,
      }],
    });
    expect(report.alerts.overdueMilestones).toHaveLength(2);
    expect(report.alerts.overdueMilestones).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hito-2', milestoneNumber: 2 }),
      expect.objectContaining({ id: 'hito-3', milestoneNumber: 3 }),
    ]));
  });

  it('convierte hitos en moneda base y marca conversiones imposibles', () => {
    const report = buildReportesPortafolio({
      projects: [{
        id: 'project-uf',
        nombre: 'Proyecto UF',
        montoTotalProyecto: 100,
        montoTotalClp: 4000000,
        monedaBase: 'UF',
        activo: true,
      }],
      hitos: [
        { id: 'hito-uf', proyectoId: 'project-uf', montoHito: 10, moneda: 'UF', fechaCompromiso: '2026-01-01', facturado: true, pagado: true },
        { id: 'hito-usd', proyectoId: 'project-uf', nroHito: 2, montoHito: 10, moneda: 'USD', fechaCompromiso: '2026-01-01', facturado: true, pagado: false },
      ],
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });

    expect(report.summary.paidClp).toBe(400000);
    expect(report.summary.invoicedPendingClp).toBe(0);
    expect(report.alerts.unconvertibleMilestones).toHaveLength(1);
    expect(report.alerts.unconvertibleMilestones[0]).toEqual(expect.objectContaining({
      id: 'hito-usd',
      milestoneNumber: 2,
      date: '2026-01-01',
    }));
  });

  it('resume los hitos pagados, incluidos los que siguen sin factura', () => {
    const report = buildReportesPortafolio({
      projects: [baseProjects[0]],
      hitos: [
        { id: 'hito-pagado-1', proyectoId: 'project-1', nroHito: 1, montoHito: 200, moneda: 'CLP', fechaPago: '2026-02-10', facturado: true, pagado: true },
        { id: 'hito-pagado-2', proyectoId: 'project-1', nroHito: 2, montoHito: 150, moneda: 'CLP', fechaPago: '2026-02-15', facturado: false, pagado: true },
        { id: 'hito-pendiente', proyectoId: 'project-1', nroHito: 3, montoHito: 100, moneda: 'CLP', facturado: true, pagado: false },
      ],
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
    });

    expect(report.paidMilestones.totalCount).toBe(2);
    expect(report.paidMilestones.totalClp).toBe(350);
    expect(report.paidMilestones.items).toEqual([
      expect.objectContaining({ id: 'hito-pagado-2', milestoneNumber: 2, amountClp: 150, invoiced: false }),
      expect.objectContaining({ id: 'hito-pagado-1', milestoneNumber: 1, amountClp: 200, invoiced: true }),
    ]);
  });

  it('agrupa los gastos por pagar en vencidos, por vencer en una semana y futuros', () => {
    const report = buildReportesPortafolio({
      projects: baseProjects,
      gastos: [
        { id: 'gasto-1', fecha: '2026-01-10', montoTotal: 400, proyectoId: 'project-1', categoriaNombre: 'Materiales', empresaNombre: 'Proveedor Uno' },
      ],
      gastosPorPagar: [
        // Todas llevan fechaCompromiso en el pasado a proposito: es la fecha del
        // documento y NO debe decidir nada. El bucket lo define fechaPago, asi que
        // si alguien vuelve a leer fechaCompromiso estos casos se caen.
        { id: 'pp-vencido', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-05', montoTotal: 500, proyectoId: 'project-1', categoriaNombre: 'Arriendo', empresaNombre: 'Proveedor Atrasado', facturado: true },
        { id: 'pp-hoy', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-10', montoTotal: 100, proyectoId: 'project-1', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Hoy', facturado: true },
        { id: 'pp-3-dias', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-13', montoTotal: 200, proyectoId: 'project-1', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Pronto', facturado: false },
        { id: 'pp-7-dias', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-17', montoTotal: 300, proyectoId: 'project-1', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Borde', facturado: true },
        { id: 'pp-8-dias', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-18', montoTotal: 400, proyectoId: 'project-1', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Futuro', facturado: true },
        // Vence fuera del periodo aunque su documento sea de 2026: debe quedar fuera.
        { id: 'pp-otro-anio', fechaCompromiso: '2026-01-15', fechaPago: '2027-02-13', montoTotal: 900, proyectoId: 'project-1', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor 2027', facturado: true },
        { id: 'pp-sin-proyecto', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-13', montoTotal: 700, proyectoId: null, categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Suelto', facturado: true },
        { id: 'pp-sin-ingresos', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-13', montoTotal: 800, proyectoId: 'project-3', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Sin Ingresos', facturado: true },
        // Fila anterior a que fechaPago fuera obligatoria: cae en fechaCompromiso.
        { id: 'pp-legacy', fechaCompromiso: '2026-02-14', montoTotal: 250, proyectoId: 'project-1', categoriaNombre: 'Servicios', empresaNombre: 'Proveedor Legacy', facturado: true },
      ],
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });

    expect(report.summary.historicalExpensesClp).toBe(400);
    expect(report.summary.payablesCount).toBe(8);
    expect(report.summary.payablesClp).toBe(3250);

    expect(report.alerts.overduePayables.count).toBe(1);
    expect(report.alerts.overduePayables.amountClp).toBe(500);
    // date sale de fechaPago (2026-02-05), no de fechaCompromiso (2026-01-15).
    expect(report.alerts.overduePayables.items[0]).toEqual(expect.objectContaining({
      id: 'pp-vencido',
      projectName: 'Proyecto Uno',
      supplierName: 'Proveedor Atrasado',
      date: '2026-02-05',
      daysUntil: -5,
    }));

    expect(report.alerts.payables.count).toBe(7);
    expect(report.alerts.payables.amountClp).toBe(2750);
    expect(report.alerts.payables.dueSoonCount).toBe(6);
    expect(report.alerts.payables.dueSoonAmountClp).toBe(2350);
    expect(report.alerts.payables.items.map((payable) => payable.id)).toEqual([
      'pp-hoy',
      'pp-sin-ingresos',
      'pp-sin-proyecto',
      'pp-3-dias',
      'pp-legacy',
      'pp-7-dias',
      'pp-8-dias',
    ]);
    expect(report.alerts.payables.items.map((payable) => payable.daysUntil)).toEqual([0, 3, 3, 3, 4, 7, 8]);
    expect(report.alerts.payables.isTruncated).toBe(false);
  });

  it('incluye compromisos de proyectos sin ingresos y sin proyecto asignado', () => {
    const payablesFixture = [
      { id: 'pp-sin-ingresos', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-13', montoTotal: 800, proyectoId: 'project-3', empresaNombre: 'Proveedor Sin Ingresos', facturado: true },
      { id: 'pp-sin-proyecto', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-13', montoTotal: 700, proyectoId: null, empresaNombre: 'Proveedor Suelto', facturado: true },
      { id: 'pp-con-ingresos', fechaCompromiso: '2026-01-15', fechaPago: '2026-02-13', montoTotal: 200, proyectoId: 'project-1', empresaNombre: 'Proveedor Uno', facturado: true },
    ];
    const base = {
      projects: baseProjects,
      gastosPorPagar: payablesFixture,
      now: new Date('2026-02-10T12:00:00Z'),
    };

    const report = buildReportesPortafolio({
      ...base,
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
    });

    // El filtro de ingresos deja fuera project-3 del resto del dashboard...
    expect(report.projects.some((project) => project.id === 'project-3')).toBe(false);
    // ...pero su compromiso sigue siendo deuda y debe aparecer igual.
    expect(report.summary.payablesCount).toBe(3);
    expect(report.summary.payablesClp).toBe(1700);
    expect(report.alerts.payables.items.find((payable) => payable.id === 'pp-sin-proyecto')?.projectName)
      .toBe('Sin proyecto');
    expect(report.alerts.payables.items.find((payable) => payable.id === 'pp-sin-ingresos')?.projectName)
      .toBe('Proyecto Sin Ingresos');

    // Seleccionar un proyecto concreto si acota los compromisos.
    const soloProject1 = buildReportesPortafolio({
      ...base,
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'project-1' },
    });

    expect(soloProject1.alerts.payables.items.map((payable) => payable.id)).toEqual(['pp-con-ingresos']);
  });

  it('filtra por configuracion de ingresos sin inferirla desde el presupuesto', () => {
    const conIngresos = buildReportesPortafolio({
      projects: baseProjects,
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });
    const sinIngresos = buildReportesPortafolio({
      projects: baseProjects,
      filters: { year: '2026', month: 'all', ingresos: 'sin_ingresos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });
    const todos = buildReportesPortafolio({
      projects: baseProjects,
      filters: { year: '2026', month: 'all', ingresos: 'todos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });

    expect(conIngresos.projects).toHaveLength(2);
    expect(conIngresos.projects.some((project) => project.id === 'project-3')).toBe(false);
    expect(sinIngresos.projects).toHaveLength(1);
    expect(sinIngresos.projects[0]?.id).toBe('project-3');
    expect(todos.projects).toHaveLength(3);
    expect(todos.summary.portfolioClp).toBe(1500);
  });
});
