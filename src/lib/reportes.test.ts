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
        { id: 'gasto-3', fecha: '2026-01-05', montoTotal: 50, proyectoId: null },
      ],
      hitos: [
        { id: 'hito-1', proyectoId: 'project-1', montoHito: 200, moneda: 'CLP', fechaCompromiso: '2026-01-01', fechaPago: '2026-01-15', facturado: true, pagado: true },
        { id: 'hito-2', proyectoId: 'project-1', montoHito: 300, moneda: 'CLP', fechaCompromiso: '2026-02-01', facturado: true, pagado: false },
        { id: 'hito-3', proyectoId: 'project-1', montoHito: 100, moneda: 'CLP', fechaCompromiso: '2026-01-20', facturado: false, pagado: false },
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
    expect(report.alerts.unassignedExpenses).toEqual({ count: 1, amountClp: 50 });
    expect(report.alerts.overdueMilestones).toHaveLength(2);
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
        { id: 'hito-usd', proyectoId: 'project-uf', montoHito: 10, moneda: 'USD', fechaCompromiso: '2026-01-01', facturado: true, pagado: false },
      ],
      filters: { year: '2026', month: 'all', ingresos: 'con_ingresos', proyectoId: 'all' },
      now: new Date('2026-02-10T12:00:00Z'),
    });

    expect(report.summary.paidClp).toBe(400000);
    expect(report.summary.invoicedPendingClp).toBe(0);
    expect(report.alerts.unconvertibleMilestones).toHaveLength(1);
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
