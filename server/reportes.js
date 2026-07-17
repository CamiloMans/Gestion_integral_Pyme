const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundClp(value) {
  return Math.round(value || 0);
}

function dateKey(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function dateFromKey(value) {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKeyInTimeZone(value, timeZone) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(parsed);
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function isInPeriod(value, year, month) {
  const key = dateKey(value);
  if (!key || key.slice(0, 4) !== String(year)) return false;
  return month === 'all' || key.slice(5, 7) === month;
}

function periodKeys(year, month) {
  if (month === 'all') {
    return MONTH_LABELS.map((label, index) => ({
      key: `${year}-${String(index + 1).padStart(2, '0')}`,
      label,
    }));
  }

  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  return Array.from({ length: days }, (_, index) => ({
    key: `${year}-${month}-${String(index + 1).padStart(2, '0')}`,
    label: String(index + 1),
  }));
}

function percentage(value, total) {
  return total > 0 ? round((value / total) * 100) : null;
}

function mapById(items) {
  return new Map(items.map((item) => [String(item.id), item]));
}

function sumBy(items, valueGetter) {
  return items.reduce((total, item) => total + (valueGetter(item) || 0), 0);
}

function getProjectBudget(project) {
  const amount = toNumber(project.montoTotalClp);
  return amount && amount > 0 ? amount : null;
}

function convertMilestoneToClp(hito, project) {
  const amount = toNumber(hito.montoHito);
  if (amount === null || amount < 0) return null;

  const currency = hito.moneda || project.monedaBase || 'CLP';
  if (currency === 'CLP') return roundClp(amount);

  const projectAmount = toNumber(project.montoTotalProyecto);
  const projectClp = getProjectBudget(project);
  if (
    currency === project.monedaBase
    && projectAmount
    && projectAmount > 0
    && projectClp
  ) {
    return roundClp(amount * (projectClp / projectAmount));
  }

  return null;
}

function getHealth(project, expenseClp, budgetClp, overdueCount) {
  if (!budgetClp) return 'sin_presupuesto';
  if (expenseClp > budgetClp) return 'sobre_presupuesto';
  if (expenseClp / budgetClp >= 0.8 || overdueCount > 0) return 'atencion';
  return 'en_rango';
}

function sortByAmountDesc(items) {
  return items.sort((a, b) => b.amountClp - a.amountClp || a.name.localeCompare(b.name, 'es'));
}

function buildBreakdown(items, nameGetter, total) {
  const totals = new Map();
  items.forEach((item) => {
    const name = nameGetter(item) || 'Sin clasificar';
    totals.set(name, (totals.get(name) || 0) + (item.amountClp || 0));
  });

  return sortByAmountDesc(
    Array.from(totals, ([name, amountClp]) => ({
      name,
      amountClp: roundClp(amountClp),
      percentage: percentage(amountClp, total),
    })),
  );
}

export function buildReportesPortafolio({
  projects = [],
  gastos = [],
  hitos = [],
  filters = {},
  now = new Date(),
  timeZone = 'America/Santiago',
}) {
  const year = String(filters.year || now.getUTCFullYear());
  const month = filters.month || 'all';
  const projectFilter = filters.proyectoId || 'all';
  const incomeFilter = filters.ingresos || 'con_ingresos';
  const today = dateKeyInTimeZone(now, timeZone);

  const availableYears = Array.from(new Set([
    year,
    ...gastos.map((gasto) => dateKey(gasto.fecha)?.slice(0, 4)).filter(Boolean),
    ...hitos.map((hito) => dateKey(hito.fechaCompromiso)?.slice(0, 4)).filter(Boolean),
  ])).sort((a, b) => Number(b) - Number(a));

  const matchesIncomeFilter = (project) => {
    const generatesIncome = project.generaIngresos !== false;
    if (incomeFilter === 'con_ingresos') return generatesIncome;
    if (incomeFilter === 'sin_ingresos') return !generatesIncome;
    return true;
  };
  const selectedProjects = projects.filter(
    (project) => matchesIncomeFilter(project)
      && (projectFilter === 'all' || String(project.id) === String(projectFilter)),
  );
  const availableProjects = projects
    .filter(matchesIncomeFilter)
    .map((project) => ({
      id: String(project.id),
      name: project.nombre,
      code: project.codigoProyecto || null,
    }));
  const selectedProjectIds = new Set(selectedProjects.map((project) => String(project.id)));
  const projectMap = mapById(selectedProjects);

  const selectedExpenses = gastos
    .map((gasto) => ({
      ...gasto,
      projectId: gasto.proyectoId ? String(gasto.proyectoId) : null,
      amountClp: roundClp(toNumber(gasto.montoTotal) ?? toNumber(gasto.monto) ?? 0),
    }))
    .filter((gasto) => gasto.projectId && selectedProjectIds.has(gasto.projectId));

  const periodExpenses = selectedExpenses.filter((gasto) => isInPeriod(gasto.fecha, year, month));
  const unassignedExpenses = gastos
    .map((gasto) => ({
      ...gasto,
      amountClp: roundClp(toNumber(gasto.montoTotal) ?? toNumber(gasto.monto) ?? 0),
    }))
    .filter((gasto) => !gasto.proyectoId && isInPeriod(gasto.fecha, year, month));

  const normalizedHitos = [];
  const unconvertibleMilestones = [];

  hitos.forEach((hito) => {
    const project = projectMap.get(String(hito.proyectoId));
    if (!project) return;

    const amountClp = convertMilestoneToClp(hito, project);
    if (amountClp === null) {
      unconvertibleMilestones.push({
        id: hito.id,
        projectId: String(hito.proyectoId),
        projectName: project.nombre,
        amount: toNumber(hito.montoHito) || 0,
        currency: hito.moneda || project.monedaBase || 'CLP',
      });
      return;
    }

    normalizedHitos.push({
      ...hito,
      projectId: String(hito.proyectoId),
      amountClp,
      commitmentDate: dateKey(hito.fechaCompromiso),
      paymentDate: dateKey(hito.fechaPago),
    });
  });

  const expensesByProject = new Map();
  const periodExpensesByProject = new Map();
  selectedExpenses.forEach((gasto) => {
    expensesByProject.set(gasto.projectId, (expensesByProject.get(gasto.projectId) || 0) + gasto.amountClp);
  });
  periodExpenses.forEach((gasto) => {
    periodExpensesByProject.set(gasto.projectId, (periodExpensesByProject.get(gasto.projectId) || 0) + gasto.amountClp);
  });

  const hitosByProject = new Map();
  normalizedHitos.forEach((hito) => {
    const current = hitosByProject.get(hito.projectId) || [];
    current.push(hito);
    hitosByProject.set(hito.projectId, current);
  });

  const projectRows = selectedProjects.map((project) => {
    const projectId = String(project.id);
    const projectHitos = hitosByProject.get(projectId) || [];
    const expensesHistoricalClp = roundClp(expensesByProject.get(projectId) || 0);
    const expensesPeriodClp = roundClp(periodExpensesByProject.get(projectId) || 0);
    const paidClp = roundClp(sumBy(projectHitos.filter((hito) => hito.pagado), (hito) => hito.amountClp));
    const invoicedPendingClp = roundClp(sumBy(
      projectHitos.filter((hito) => hito.facturado && !hito.pagado),
      (hito) => hito.amountClp,
    ));
    const invoicedClp = roundClp(sumBy(projectHitos.filter((hito) => hito.facturado), (hito) => hito.amountClp));
    const budgetClp = getProjectBudget(project);
    const unpaidHitos = projectHitos.filter((hito) => !hito.pagado);
    const overdueHitos = unpaidHitos.filter((hito) => hito.commitmentDate && hito.commitmentDate < today);
    const nextMilestone = unpaidHitos
      .filter((hito) => hito.commitmentDate)
      .sort((a, b) => a.commitmentDate.localeCompare(b.commitmentDate))[0];

    return {
      id: projectId,
      name: project.nombre,
      code: project.codigoProyecto || null,
      currency: project.monedaBase || null,
      budgetClp,
      expensesHistoricalClp,
      expensesPeriodClp,
      executionPercentage: percentage(expensesHistoricalClp, budgetClp || 0),
      estimatedMarginClp: budgetClp === null ? null : roundClp(budgetClp - expensesHistoricalClp),
      estimatedMarginPercentage: budgetClp === null
        ? null
        : percentage(budgetClp - expensesHistoricalClp, budgetClp),
      paidClp,
      invoicedPendingClp,
      toInvoiceClp: budgetClp === null ? null : Math.max(0, roundClp(budgetClp - invoicedClp)),
      toCollectClp: budgetClp === null ? null : Math.max(0, roundClp(budgetClp - paidClp)),
      nextMilestoneDate: nextMilestone?.commitmentDate || null,
      overdueDays: overdueHitos.reduce((max, hito) => {
        const commitment = dateFromKey(hito.commitmentDate);
        const current = dateFromKey(today);
        if (!commitment || !current) return max;
        return Math.max(max, Math.ceil((current - commitment) / 86400000));
      }, 0),
      overdueMilestonesCount: overdueHitos.length,
      milestoneCount: projectHitos.length,
      health: getHealth(project, expensesHistoricalClp, budgetClp, overdueHitos.length),
    };
  });

  const budgetProjects = projectRows.filter((project) => project.budgetClp !== null);
  const portfolioClp = roundClp(sumBy(budgetProjects, (project) => project.budgetClp));
  const historicalExpensesClp = roundClp(sumBy(projectRows, (project) => project.expensesHistoricalClp));
  const periodExpensesClp = roundClp(sumBy(periodExpenses, (gasto) => gasto.amountClp));
  const historicalCategories = buildBreakdown(
    selectedExpenses,
    (gasto) => gasto.categoriaNombre || gasto.categoriaId,
    historicalExpensesClp,
  );
  const historicalSuppliers = buildBreakdown(
    selectedExpenses,
    (gasto) => gasto.empresaNombre || gasto.empresaId,
    historicalExpensesClp,
  );
  const paidClp = roundClp(sumBy(projectRows, (project) => project.paidClp));
  const invoicedPendingClp = roundClp(sumBy(projectRows, (project) => project.invoicedPendingClp));
  const invoicedClp = roundClp(sumBy(normalizedHitos.filter((hito) => hito.facturado), (hito) => hito.amountClp));
  const paidMilestoneItems = normalizedHitos
    .filter((hito) => hito.pagado)
    .map((hito) => {
      const project = projectMap.get(hito.projectId);
      return {
        id: String(hito.id),
        projectId: hito.projectId,
        projectName: project?.nombre || 'Proyecto',
        projectCode: project?.codigoProyecto || null,
        milestoneNumber: Number(hito.nroHito) || null,
        paymentDate: hito.paymentDate,
        amountClp: hito.amountClp,
        invoiced: Boolean(hito.facturado),
      };
    })
    .sort((left, right) => {
      const leftDate = left.paymentDate || '';
      const rightDate = right.paymentDate || '';
      return rightDate.localeCompare(leftDate) || right.amountClp - left.amountClp;
    });
  const toInvoiceRawClp = portfolioClp - invoicedClp;
  const toCollectRawClp = portfolioClp - paidClp;
  const estimatedMarginClp = roundClp(portfolioClp - historicalExpensesClp);
  const overdueMilestones = normalizedHitos.filter(
    (hito) => !hito.pagado && hito.commitmentDate && hito.commitmentDate < today,
  );

  const trend = periodKeys(year, month).map(({ key, label }) => ({
    period: key,
    label,
    expensesClp: roundClp(periodExpenses
      .filter((gasto) => dateKey(gasto.fecha)?.startsWith(key))
      .reduce((total, gasto) => total + gasto.amountClp, 0)),
    paymentsClp: roundClp(normalizedHitos
      .filter((hito) => hito.pagado && hito.paymentDate?.startsWith(key))
      .reduce((total, hito) => total + hito.amountClp, 0)),
  }));

  const alerts = {
    overBudget: projectRows
      .filter((project) => project.health === 'sobre_presupuesto')
      .map((project) => ({ id: project.id, name: project.name, amountClp: project.expensesHistoricalClp - project.budgetClp })),
    overdueMilestones: overdueMilestones.map((hito) => ({
      id: hito.id,
      projectId: hito.projectId,
      projectName: projectMap.get(hito.projectId)?.nombre || 'Proyecto',
      date: hito.commitmentDate,
      amountClp: hito.amountClp,
    })),
    missingBudget: projectRows
      .filter((project) => project.budgetClp === null)
      .map((project) => ({ id: project.id, name: project.name })),
    unassignedExpenses: {
      count: unassignedExpenses.length,
      amountClp: roundClp(sumBy(unassignedExpenses, (gasto) => gasto.amountClp)),
    },
    unconvertibleMilestones,
  };

  return {
    summary: {
      totalProjects: selectedProjects.length,
      projectsWithBudget: budgetProjects.length,
      portfolioClp,
      historicalExpensesClp,
      periodExpensesClp,
      estimatedMarginClp,
      estimatedMarginPercentage: percentage(estimatedMarginClp, portfolioClp),
      paidClp,
      invoicedPendingClp,
      toInvoiceClp: Math.max(0, roundClp(toInvoiceRawClp)),
      toCollectClp: Math.max(0, roundClp(toCollectRawClp)),
    },
    paidMilestones: {
      totalCount: paidMilestoneItems.length,
      totalClp: paidClp,
      items: paidMilestoneItems.slice(0, 50),
      isTruncated: paidMilestoneItems.length > 50,
    },
    historicalCategories,
    historicalSuppliers,
    trend,
    collections: {
      segments: [
        { key: 'paid', label: 'Pagado', amountClp: paidClp },
        { key: 'invoicedPending', label: 'Facturado sin pagar', amountClp: invoicedPendingClp },
        { key: 'toInvoice', label: 'Falta por facturar', amountClp: Math.max(0, roundClp(toInvoiceRawClp)) },
      ],
      excessInvoicedClp: Math.max(0, roundClp(-toInvoiceRawClp)),
    },
    categories: buildBreakdown(
      periodExpenses,
      (gasto) => gasto.categoriaNombre || gasto.categoriaId,
      periodExpensesClp,
    ),
    suppliers: buildBreakdown(
      periodExpenses,
      (gasto) => gasto.empresaNombre || gasto.empresaId,
      periodExpensesClp,
    ),
    projects: projectRows,
    alerts,
    meta: {
      filters: { proyectoId: projectFilter, ingresos: incomeFilter, year, month },
      availableYears,
      availableProjects,
      generatedAt: now.toISOString(),
    },
  };
}
