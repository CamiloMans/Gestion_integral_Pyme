import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FolderKanban,
  Receipt,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateOnly } from '@/lib/date-format';
import { postgresApi, type ReportesPortafolioResponse, type ReportesProject } from '@/services/postgresApi';

const MONTHS = [
  ['01', 'Enero'],
  ['02', 'Febrero'],
  ['03', 'Marzo'],
  ['04', 'Abril'],
  ['05', 'Mayo'],
  ['06', 'Junio'],
  ['07', 'Julio'],
  ['08', 'Agosto'],
  ['09', 'Septiembre'],
  ['10', 'Octubre'],
  ['11', 'Noviembre'],
  ['12', 'Diciembre'],
] as const;

type ReportTab = 'resumen' | 'proyectos' | 'gastos';
type PaidMilestone = ReportesPortafolioResponse['paidMilestones']['items'][number];
type ExpenseBreakdown = ReportesPortafolioResponse['historicalCategories'][number];
type ExpenseBreakdownTab = 'categories' | 'suppliers';
type ProjectSortKey =
  | 'name'
  | 'budgetClp'
  | 'expensesHistoricalClp'
  | 'executionPercentage'
  | 'estimatedMarginClp'
  | 'paidClp'
  | 'toCollectClp';

const HEALTH_LABELS: Record<ReportesProject['health'], string> = {
  sobre_presupuesto: 'Sobre presupuesto',
  atencion: 'Atencion',
  en_rango: 'En rango',
  sin_presupuesto: 'Sin presupuesto',
};

const HEALTH_CLASSES: Record<ReportesProject['health'], string> = {
  sobre_presupuesto: 'border-red-200 bg-red-50 text-red-700',
  atencion: 'border-amber-200 bg-amber-50 text-amber-700',
  en_rango: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  sin_presupuesto: 'border-slate-200 bg-slate-50 text-slate-600',
};

function formatAmount(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactAmount(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatPercentage(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : `${Math.round(value)}%`;
}

function getSortValue(project: ReportesProject, key: ProjectSortKey) {
  if (key === 'name') return project.name;
  return project[key] ?? -1;
}

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  tone = 'blue',
}: {
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
  tone?: 'blue' | 'green' | 'amber' | 'red' | 'slate';
}) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700',
    slate: 'bg-slate-100 text-slate-700',
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-pretty">{label}</p>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 text-xl font-bold tabular-nums text-foreground">{value}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground text-pretty">{note}</p>}
    </div>
  );
}

function PaidMilestoneRows({ items }: { items: PaidMilestone[] }) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay hitos pagados para los filtros seleccionados.</p>;
  }

  return (
    <div className="divide-y divide-border">
      {items.map((milestone) => (
        <div key={milestone.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {milestone.projectCode ? `${milestone.projectCode} - ${milestone.projectName}` : milestone.projectName}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{milestone.milestoneNumber ? `Hito #${milestone.milestoneNumber}` : 'Hito'}</span>
              <span>{milestone.paymentDate ? formatDateOnly(milestone.paymentDate) : 'Sin fecha de pago'}</span>
              <span className={milestone.invoiced ? 'text-emerald-700' : 'text-amber-700'}>
                {milestone.invoiced ? 'Facturado' : 'Sin factura'}
              </span>
            </div>
          </div>
          <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmount(milestone.amountClp)}</p>
        </div>
      ))}
    </div>
  );
}

function PaidMilestonesMetric({ data }: { data: ReportesPortafolioResponse }) {
  const [open, setOpen] = useState(false);
  const { paidMilestones } = data;
  const previewItems = paidMilestones.items.slice(0, 5);

  return (
    <>
      <HoverCard openDelay={150} closeDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="group min-h-32 w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:border-emerald-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 active:scale-[0.96]"
            onClick={() => setOpen(true)}
            aria-label="Ver resumen de hitos pagados"
            title="Ver resumen de hitos pagados"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-pretty">Pagado</p>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition-transform group-hover:scale-105">
                <CircleDollarSign className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-xl font-bold tabular-nums text-foreground">{formatAmount(data.summary.paidClp)}</p>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              {formatPercentage(data.summary.portfolioClp ? (data.summary.paidClp / data.summary.portfolioClp) * 100 : null)}
            </p>
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" side="bottom" className="w-80 max-w-[calc(100vw-2rem)] p-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Hitos pagados</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{paidMilestones.totalCount} en los proyectos filtrados</p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmount(paidMilestones.totalClp)}</p>
          </div>
          <PaidMilestoneRows items={previewItems} />
          {paidMilestones.totalCount > previewItems.length && (
            <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Selecciona la tarjeta para ver el detalle.</p>
          )}
        </HoverCardContent>
      </HoverCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl bg-card p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12 sm:px-6">
            <DialogTitle>Hitos pagados</DialogTitle>
            <DialogDescription>
              {paidMilestones.totalCount} hito(s) por {formatAmount(paidMilestones.totalClp)} en los proyectos filtrados.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(60vh,32rem)] overflow-y-auto">
            <PaidMilestoneRows items={paidMilestones.items} />
          </div>
          {paidMilestones.isTruncated && (
            <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground sm:px-6">
              Se muestran los 50 hitos pagados mas recientes.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExpenseBreakdownRows({ items }: { items: ExpenseBreakdown[] }) {
  if (items.length === 0) {
    return <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay gastos clasificados.</p>;
  }

  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-3 border-b border-border bg-muted/30 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Detalle</span>
        <span className="text-right">Monto</span>
        <span className="text-right">%</span>
      </div>
      <div className="divide-y divide-border">
      {items.map((item) => (
        <div key={item.name} className="grid grid-cols-[minmax(0,1fr)_auto_3rem] items-center gap-3 px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.name}</p>
          <p className="text-right text-sm font-semibold tabular-nums text-foreground">{formatAmount(item.amountClp)}</p>
          <p className="text-right text-xs tabular-nums text-muted-foreground">{formatPercentage(item.percentage)}</p>
        </div>
      ))}
      </div>
    </div>
  );
}

function ExpenseBreakdownPreview({ title, items }: { title: string; items: ExpenseBreakdown[] }) {
  const previewItems = items.slice(0, 4);

  return (
    <div className="min-w-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {previewItems.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin datos.</p>
      ) : (
        <div className="space-y-2">
          {previewItems.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{item.name}</span>
              <span className="shrink-0 font-semibold tabular-nums text-foreground">{formatAmount(item.amountClp)}</span>
            </div>
          ))}
          {items.length > previewItems.length && (
            <p className="text-xs text-muted-foreground">+ {items.length - previewItems.length} mas</p>
          )}
        </div>
      )}
    </div>
  );
}

function HistoricalExpensesMetric({ data }: { data: ReportesPortafolioResponse }) {
  const [open, setOpen] = useState(false);
  const [breakdownTab, setBreakdownTab] = useState<ExpenseBreakdownTab>('categories');

  return (
    <>
      <HoverCard openDelay={150} closeDelay={120}>
        <HoverCardTrigger asChild>
          <button
            type="button"
            className="group min-h-32 w-full rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-[border-color,box-shadow,transform] hover:border-amber-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 active:scale-[0.96]"
            onClick={() => setOpen(true)}
            aria-label="Ver resumen de gastos historicos"
            title="Ver resumen de gastos historicos"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground text-pretty">Gasto historico</p>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 transition-transform group-hover:scale-105">
                <TrendingDown className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-xl font-bold tabular-nums text-foreground">{formatAmount(data.summary.historicalExpensesClp)}</p>
            <p className="mt-1 text-xs text-muted-foreground text-pretty">Periodo: {formatAmount(data.summary.periodExpensesClp)}</p>
          </button>
        </HoverCardTrigger>
        <HoverCardContent align="start" side="bottom" className="w-[28rem] max-w-[calc(100vw-2rem)] p-0">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Gastos historicos</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Distribucion por categoria y proveedor</p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{formatAmount(data.summary.historicalExpensesClp)}</p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <ExpenseBreakdownPreview title="Categorias" items={data.historicalCategories} />
            <ExpenseBreakdownPreview title="Proveedores" items={data.historicalSuppliers} />
          </div>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">Selecciona la tarjeta para ver el detalle completo.</p>
        </HoverCardContent>
      </HoverCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl bg-card p-0">
          <DialogHeader className="border-b border-border px-5 py-4 pr-12 sm:px-6">
            <DialogTitle>Gastos historicos</DialogTitle>
            <DialogDescription>
              {formatAmount(data.summary.historicalExpensesClp)} distribuidos entre los proyectos filtrados.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={breakdownTab} onValueChange={(value) => setBreakdownTab(value as ExpenseBreakdownTab)} className="px-5 pb-5 sm:px-6 sm:pb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="categories">Categorias</TabsTrigger>
              <TabsTrigger value="suppliers">Proveedores</TabsTrigger>
            </TabsList>
            <TabsContent value="categories" className="mt-4 max-h-[min(60vh,32rem)] overflow-y-auto rounded-lg border border-border">
              <ExpenseBreakdownRows items={data.historicalCategories} />
            </TabsContent>
            <TabsContent value="suppliers" className="mt-4 max-h-[min(60vh,32rem)] overflow-y-auto rounded-lg border border-border">
              <ExpenseBreakdownRows items={data.historicalSuppliers} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number; name?: string; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center justify-between gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name === 'expensesClp' ? 'Gastos' : 'Pagos'}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{formatAmount(item.value || 0)}</span>
        </p>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-label="Cargando dashboard">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)}
      </div>
      <Skeleton className="h-80 rounded-xl" />
    </div>
  );
}

function AlertsPanel({ data }: { data: ReportesPortafolioResponse }) {
  const { alerts } = data;
  const alertCount = alerts.overBudget.length
    + alerts.overdueMilestones.length
    + alerts.missingBudget.length
    + alerts.unconvertibleMilestones.length
    + (alerts.unassignedExpenses.count > 0 ? 1 : 0);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Control de calidad</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground text-balance">Alertas para decidir</h2>
        </div>
        <Badge variant={alertCount > 0 ? 'destructive' : 'secondary'}>
          {alertCount > 0 ? `${alertCount} alertas` : 'Sin alertas'}
        </Badge>
      </div>

      {alertCount === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p>Datos suficientes para este corte.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {alerts.overBudget.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">{alerts.overBudget.length} proyecto(s) sobre presupuesto</p><p className="mt-1 text-xs text-red-700">Revisar desviaciones de gasto.</p></div>
            </div>
          )}
          {alerts.overdueMilestones.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">{alerts.overdueMilestones.length} hito(s) vencido(s)</p><p className="mt-1 text-xs text-amber-700">Facturar o gestionar cobro.</p></div>
            </div>
          )}
          {alerts.missingBudget.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <FolderKanban className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">{alerts.missingBudget.length} proyecto(s) sin presupuesto</p><p className="mt-1 text-xs text-slate-600">No entran en porcentajes de cartera.</p></div>
            </div>
          )}
          {alerts.unassignedExpenses.count > 0 && (
            <div className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
              <Receipt className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">{alerts.unassignedExpenses.count} gasto(s) sin proyecto</p><p className="mt-1 text-xs text-blue-700">Total periodo: {formatAmount(alerts.unassignedExpenses.amountClp)}.</p></div>
            </div>
          )}
          {alerts.unconvertibleMilestones.length > 0 && (
            <div className="flex gap-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 sm:col-span-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div><p className="font-semibold">{alerts.unconvertibleMilestones.length} hito(s) sin conversion CLP</p><p className="mt-1 text-xs text-orange-700">No entran en totales hasta completar moneda o monto base.</p></div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CollectionBar({ data }: { data: ReportesPortafolioResponse }) {
  const total = Math.max(
    data.summary.portfolioClp,
    data.collections.segments.reduce((sum, segment) => sum + segment.amountClp, 0),
  );

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cartera</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground text-balance">Flujo financiero del portafolio</h2>
        </div>
        <WalletCards className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-muted" aria-label="Composicion de cartera">
        {data.collections.segments.map((segment) => (
          <div
            key={segment.key}
            className={segment.key === 'paid' ? 'bg-emerald-500' : segment.key === 'invoicedPending' ? 'bg-amber-400' : 'bg-slate-300'}
            style={{ width: `${total > 0 ? (segment.amountClp / total) * 100 : 0}%` }}
            title={`${segment.label}: ${formatAmount(segment.amountClp)}`}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {data.collections.segments.map((segment) => (
          <div key={segment.key} className="flex items-start gap-2">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${segment.key === 'paid' ? 'bg-emerald-500' : segment.key === 'invoicedPending' ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground text-pretty">{segment.label}</p>
              <p className="mt-1 font-semibold tabular-nums text-foreground">{formatAmount(segment.amountClp)}</p>
            </div>
          </div>
        ))}
      </div>
      {data.collections.excessInvoicedClp > 0 && (
        <p className="mt-4 text-xs text-destructive text-pretty">Facturacion sobre cartera: {formatAmount(data.collections.excessInvoicedClp)}.</p>
      )}
    </section>
  );
}

function TrendChart({ data }: { data: ReportesPortafolioResponse }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Periodo seleccionado</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground text-balance">Gastos versus pagos</h2>
        </div>
        <TrendingDown className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.trend} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
            <XAxis dataKey="label" stroke="hsl(215, 16%, 47%)" tickLine={false} axisLine={false} />
            <YAxis tickFormatter={(value) => formatCompactAmount(Number(value))} stroke="hsl(215, 16%, 47%)" tickLine={false} axisLine={false} width={58} />
            <Tooltip content={<ChartTooltip />} />
            <Legend formatter={(value) => value === 'expensesClp' ? 'Gastos' : 'Pagos'} />
            <Bar dataKey="expensesClp" name="expensesClp" fill="hsl(213, 94%, 54%)" radius={[3, 3, 0, 0]} maxBarSize={24} />
            <Line type="monotone" dataKey="paymentsClp" name="paymentsClp" stroke="hsl(152, 61%, 38%)" strokeWidth={2.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function BreakdownChart({ title, items, color }: { title: string; items: ReportesPortafolioResponse['categories']; color: string }) {
  const chartItems = items.slice(0, 8);
  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gasto del periodo</p><h2 className="mt-1 text-lg font-semibold text-foreground text-balance">{title}</h2></div>
        <BarChart3 className="h-5 w-5 text-muted-foreground" />
      </div>
      {chartItems.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Sin gastos clasificados.</p>
      ) : (
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartItems} layout="vertical" margin={{ top: 0, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
              <XAxis type="number" tickFormatter={(value) => formatCompactAmount(Number(value))} stroke="hsl(215, 16%, 47%)" tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="name" width={92} tick={{ fontSize: 11 }} stroke="hsl(215, 16%, 47%)" tickLine={false} axisLine={false} />
              <Tooltip formatter={(value) => formatAmount(Number(value))} />
              <Bar dataKey="amountClp" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

const PIE_COLORS = ['#2563eb', '#0f766e', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#0284c7', '#64748b'];

type PieTooltipPayload = {
  color?: string;
  fill?: string;
  payload?: PieItem;
};

type PieItem = ExpenseBreakdown & {
  color: string;
};

function PieBreakdownTooltip({ active, payload }: { active?: boolean; payload?: PieTooltipPayload[] }) {
  const entry = payload?.[0];
  const item = entry?.payload;
  if (!active || !item) return null;

  const color = item.color || entry?.color || entry?.fill || PIE_COLORS[0];

  return (
    <div className="min-w-52 rounded-lg border border-border bg-card p-3 shadow-[0_14px_30px_rgba(15,23,42,0.16)]">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-foreground text-pretty">{item.name}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <div>
          <p className="text-muted-foreground">Monto</p>
          <p className="mt-1 whitespace-nowrap font-semibold tabular-nums text-foreground">{formatAmount(item.amountClp)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Participacion</p>
          <p className="mt-1 font-semibold tabular-nums text-foreground">{formatPercentage(item.percentage)}</p>
        </div>
      </div>
    </div>
  );
}

function buildPieItems(items: ExpenseBreakdown[]) {
  const visibleItems = items.slice(0, 7);
  const remainingItems = items.slice(7);
  const baseItems = remainingItems.length === 0
    ? items.slice(0, 8)
    : [
        ...visibleItems,
        {
          name: 'Otros',
          amountClp: remainingItems.reduce((sum, item) => sum + item.amountClp, 0),
          percentage: (() => {
            const totalAmount = items.reduce((sum, item) => sum + item.amountClp, 0);
            const otherAmount = remainingItems.reduce((sum, item) => sum + item.amountClp, 0);
            return totalAmount > 0 ? (otherAmount / totalAmount) * 100 : null;
          })(),
        },
      ];

  return baseItems.map((item, index) => ({
    ...item,
    color: PIE_COLORS[index % PIE_COLORS.length],
  }));
}

function PieBreakdownChart({ title, items }: { title: string; items: ExpenseBreakdown[] }) {
  const chartItems = buildPieItems(items);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gasto del periodo</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground text-balance">Distribucion por {title.toLocaleLowerCase('es-CL')}</h2>
        </div>
        <CircleDollarSign className="h-5 w-5 text-muted-foreground" />
      </div>
      {chartItems.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Sin gastos clasificados.</p>
      ) : (
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,0.9fr)]">
          <div className="h-64 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartItems}
                  dataKey="amountClp"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="48%"
                  outerRadius="82%"
                  paddingAngle={2}
                  stroke="hsl(0, 0%, 100%)"
                  strokeWidth={2}
                >
                  {chartItems.map((item) => (
                    <Cell key={item.name} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={<PieBreakdownTooltip />}
                  cursor={false}
                  wrapperStyle={{ outline: 'none' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid gap-2">
            {chartItems.map((item) => (
              <div key={item.name} className="flex min-w-0 items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="min-w-0 flex-1 truncate text-muted-foreground" title={item.name}>{item.name}</span>
                <span className="shrink-0 tabular-nums text-foreground">{formatPercentage(item.percentage)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ProjectsTable({ data }: { data: ReportesPortafolioResponse }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<ProjectSortKey>('executionPercentage');
  const [sortDescending, setSortDescending] = useState(true);

  const projects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es-CL');
    return [...data.projects]
      .filter((project) => !query || project.name.toLocaleLowerCase('es-CL').includes(query) || (project.code || '').toLocaleLowerCase('es-CL').includes(query))
      .sort((a, b) => {
        const left = getSortValue(a, sortKey);
        const right = getSortValue(b, sortKey);
        const result = typeof left === 'string' && typeof right === 'string'
          ? left.localeCompare(right, 'es')
          : Number(left) - Number(right);
        return sortDescending ? -result : result;
      });
  }, [data.projects, search, sortDescending, sortKey]);

  const sortBy = (nextKey: ProjectSortKey) => {
    if (sortKey === nextKey) {
      setSortDescending((current) => !current);
      return;
    }
    setSortKey(nextKey);
    setSortDescending(nextKey !== 'name');
  };

  const SortButton = ({ label, value }: { label: string; value: ProjectSortKey }) => (
    <button type="button" className="flex min-h-10 items-center gap-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground" onClick={() => sortBy(value)}>
      {label}
      {sortKey === value && <span aria-hidden="true">{sortDescending ? '↓' : '↑'}</span>}
    </button>
  );

  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Vista comparativa</p><h2 className="mt-1 text-lg font-semibold text-foreground">Proyectos</h2></div>
        <div className="relative w-full sm:w-72">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar proyecto o codigo..." aria-label="Buscar proyecto o codigo" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead><SortButton label="Proyecto" value="name" /></TableHead>
              <TableHead><SortButton label="Presupuesto" value="budgetClp" /></TableHead>
              <TableHead><SortButton label="Gasto historico" value="expensesHistoricalClp" /></TableHead>
              <TableHead><SortButton label="Ejecucion" value="executionPercentage" /></TableHead>
              <TableHead><SortButton label="Margen" value="estimatedMarginClp" /></TableHead>
              <TableHead><SortButton label="Pagado" value="paidClp" /></TableHead>
              <TableHead><SortButton label="Falta por pagar" value="toCollectClp" /></TableHead>
              <TableHead>Proximo hito</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="min-w-48">
                  <p className="font-medium text-foreground">{project.name}</p>
                  {project.code && <p className="text-xs text-muted-foreground">{project.code}</p>}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatAmount(project.budgetClp)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatAmount(project.expensesHistoricalClp)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatPercentage(project.executionPercentage)}</TableCell>
                <TableCell className={`whitespace-nowrap tabular-nums ${project.estimatedMarginClp !== null && project.estimatedMarginClp < 0 ? 'text-red-700' : ''}`}>{formatAmount(project.estimatedMarginClp)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums text-emerald-700">{formatAmount(project.paidClp)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">{formatAmount(project.toCollectClp)}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">
                  {project.nextMilestoneDate ? (
                    <span className={project.overdueDays > 0 ? 'text-amber-700' : 'text-muted-foreground'}>
                      {formatDateOnly(project.nextMilestoneDate)}{project.overdueDays > 0 ? ` (${project.overdueDays} d)` : ''}
                    </span>
                  ) : '-'}
                </TableCell>
                <TableCell><Badge variant="outline" className={HEALTH_CLASSES[project.health]}>{HEALTH_LABELS[project.health]}</Badge></TableCell>
              </TableRow>
            ))}
            {projects.length === 0 && (
              <TableRow><TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">No hay proyectos para este filtro.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-6">{projects.length} proyecto(s) mostrado(s).</div>
    </section>
  );
}

export default function Reportes() {
  const currentYear = String(new Date().getFullYear());
  const [tab, setTab] = useState<ReportTab>('resumen');
  const [filters, setFilters] = useState({
    proyectoId: 'all',
    ingresos: 'con_ingresos' as 'con_ingresos' | 'sin_ingresos' | 'todos',
    year: currentYear,
    month: 'all',
  });

  const query = useQuery({
    queryKey: ['reportes-portafolio', filters],
    queryFn: () => postgresApi.getReportesPortafolio(filters),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const errorMessage = query.error instanceof Error ? query.error.message : 'No se pudo cargar dashboard.';

  const updateFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <Layout>
      <PageHeader title="Dashboard" subtitle={data ? `${data.summary.totalProjects} proyectos - corte ${data.meta.filters.year}` : 'Inteligencia financiera del portafolio'}>
        <Button variant="ghost" size="icon" onClick={() => void query.refetch()} disabled={query.isFetching} aria-label="Actualizar reportes" title="Actualizar reportes">
          <RefreshCw className={query.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </PageHeader>

      <div className="mb-6 grid gap-3 rounded-xl border border-border bg-card p-3 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <Select value={filters.proyectoId} onValueChange={(value) => updateFilter('proyectoId', value)}>
          <SelectTrigger className="bg-card"><FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Proyecto" /></SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {(data?.meta.availableProjects || []).map((project) => <SelectItem key={project.id} value={project.id}>{project.code ? `${project.code} - ${project.name}` : project.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select
          value={filters.ingresos}
          onValueChange={(value) => setFilters((current) => ({
            ...current,
            proyectoId: 'all',
            ingresos: value as 'con_ingresos' | 'sin_ingresos' | 'todos',
          }))}
        >
          <SelectTrigger className="bg-card"><CircleDollarSign className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="con_ingresos">Con ingresos</SelectItem>
            <SelectItem value="sin_ingresos">Sin ingresos</SelectItem>
            <SelectItem value="todos">Todos los proyectos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.year} onValueChange={(value) => updateFilter('year', value)}>
          <SelectTrigger className="bg-card"><CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card">{(data?.meta.availableYears || [currentYear]).map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.month} onValueChange={(value) => updateFilter('month', value)}>
          <SelectTrigger className="bg-card"><CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card"><SelectItem value="all">Todo el año</SelectItem>{MONTHS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {query.isLoading && !data ? <LoadingState /> : query.isError && !data ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
          <div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">No se pudo cargar Dashboard</h2><p className="mt-1 text-sm text-red-700">{errorMessage}</p><Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>Reintentar</Button></div></div>
        </div>
      ) : data ? (
        <Tabs value={tab} onValueChange={(value) => setTab(value as ReportTab)}>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="w-full justify-start sm:w-auto">
              <TabsTrigger value="resumen" className="flex-1 gap-2 sm:flex-none"><WalletCards className="h-4 w-4" />Resumen</TabsTrigger>
              <TabsTrigger value="proyectos" className="flex-1 gap-2 sm:flex-none"><FolderKanban className="h-4 w-4" />Proyectos</TabsTrigger>
              <TabsTrigger value="gastos" className="flex-1 gap-2 sm:flex-none"><BarChart3 className="h-4 w-4" />Gastos</TabsTrigger>
            </TabsList>
            {query.isFetching && <span className="flex items-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Actualizando</span>}
          </div>

          <TabsContent value="resumen" className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <MetricCard label="Cartera total" value={formatAmount(data.summary.portfolioClp)} note={`${data.summary.projectsWithBudget} con presupuesto`} icon={WalletCards} tone="blue" />
              <HistoricalExpensesMetric data={data} />
              <MetricCard label="Margen estimado" value={formatAmount(data.summary.estimatedMarginClp)} note={formatPercentage(data.summary.estimatedMarginPercentage)} icon={TrendingUp} tone={data.summary.estimatedMarginClp < 0 ? 'red' : 'green'} />
              <PaidMilestonesMetric data={data} />
              <MetricCard label="Facturado sin pagar" value={formatAmount(data.summary.invoicedPendingClp)} note="Gestionar cobranza" icon={Clock3} tone="amber" />
              <MetricCard label="Falta por pagar" value={formatAmount(data.summary.toCollectClp)} note={`Por facturar: ${formatAmount(data.summary.toInvoiceClp)}`} icon={AlertTriangle} tone="red" />
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
              <CollectionBar data={data} />
              <AlertsPanel data={data} />
            </div>
            <TrendChart data={data} />
          </TabsContent>

          <TabsContent value="proyectos"><ProjectsTable data={data} /></TabsContent>

          <TabsContent value="gastos" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <BreakdownChart title="Por categoria" items={data.categories} color="hsl(213, 94%, 54%)" />
              <BreakdownChart title="Por proveedor" items={data.suppliers} color="hsl(152, 61%, 42%)" />
            </div>
            <div className="grid gap-6 xl:grid-cols-2">
              <PieBreakdownChart title="categoria" items={data.categories} />
              <PieBreakdownChart title="proveedor" items={data.suppliers} />
            </div>
            <TrendChart data={data} />
          </TabsContent>
        </Tabs>
      ) : null}
    </Layout>
  );
}
