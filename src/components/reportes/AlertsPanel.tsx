import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Receipt,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateOnly } from '@/lib/date-format';
import type { ReportesPortafolioResponse } from '@/services/postgresApi';

type AlertKind = 'overBudget' | 'overdueMilestones' | 'missingBudget' | 'unassignedExpenses' | 'unconvertibleMilestones';

type AlertCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  tone: 'red' | 'amber' | 'slate' | 'blue' | 'orange';
  onClick: () => void;
  wide?: boolean;
};

const TONE_CLASSES = {
  red: 'border-red-200 bg-red-50 text-red-800 hover:border-red-300 focus-visible:ring-red-500',
  amber: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 focus-visible:ring-amber-500',
  slate: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 focus-visible:ring-slate-500',
  blue: 'border-blue-200 bg-blue-50 text-blue-800 hover:border-blue-300 focus-visible:ring-blue-500',
  orange: 'border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-300 focus-visible:ring-orange-500',
} as const;

const DESCRIPTION_CLASSES = {
  red: 'text-red-700',
  amber: 'text-amber-700',
  slate: 'text-slate-600',
  blue: 'text-blue-700',
  orange: 'text-orange-700',
} as const;

function formatAmount(value: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatOriginalAmount(value: number, currency: string) {
  if (currency === 'UF') {
    return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)} UF`;
  }

  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency,
      maximumFractionDigits: currency === 'CLP' ? 0 : 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value)} ${currency}`;
  }
}

function AlertCard({ icon: Icon, title, description, tone, onClick, wide }: AlertCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-16 w-full gap-3 rounded-lg border p-3 text-left shadow-sm transition-[border-color,box-shadow,transform] duration-150 ease-out hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-[0.96] ${TONE_CLASSES[tone]} ${wide ? 'sm:col-span-2' : ''}`}
      aria-label={`${title}. Ver detalle`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold tabular-nums">{title}</p>
        <p className={`mt-1 text-xs text-pretty ${DESCRIPTION_CLASSES[tone]}`}>{description}</p>
      </div>
      <span className="flex shrink-0 items-center gap-1 self-center text-xs font-medium opacity-70 transition-[opacity,transform] duration-150 group-hover:translate-x-0.5 group-hover:opacity-100">
        Ver
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    </button>
  );
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="min-h-10 gap-1.5 whitespace-nowrap" onClick={onClick}>
      {label}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  );
}

function AlertTable({ children }: { children: ReactNode }) {
  return <div className="max-h-[min(62vh,34rem)] overflow-auto">{children}</div>;
}

type AlertsPanelProps = {
  data: ReportesPortafolioResponse;
  canOpenExpenses?: boolean;
  canOpenProjects?: boolean;
  canOpenMilestones?: boolean;
};

export function AlertsPanel({
  data,
  canOpenExpenses = true,
  canOpenProjects = true,
  canOpenMilestones = true,
}: AlertsPanelProps) {
  const navigate = useNavigate();
  const [selectedAlert, setSelectedAlert] = useState<AlertKind | null>(null);
  const { alerts } = data;
  const alertCount = alerts.overBudget.length
    + alerts.overdueMilestones.length
    + alerts.missingBudget.length
    + alerts.unconvertibleMilestones.length
    + (alerts.unassignedExpenses.count > 0 ? 1 : 0);

  const navigateTo = (path: string) => {
    setSelectedAlert(null);
    navigate(path);
  };

  const reportProjectPath = (projectId: string) => {
    const params = new URLSearchParams({
      tab: 'proyectos',
      proyectoId: projectId,
      ingresos: data.meta.filters.ingresos,
      year: data.meta.filters.year,
      month: data.meta.filters.month,
    });
    return `/reportes?${params.toString()}`;
  };

  const dialogContent = (() => {
    if (selectedAlert === 'overBudget') {
      return {
        title: 'Proyectos sobre presupuesto',
        description: `${alerts.overBudget.length} proyecto(s) requieren revisar su desviacion de gasto.`,
        body: (
          <AlertTable>
            <Table>
              <TableHeader><TableRow><TableHead>Proyecto</TableHead><TableHead>Exceso</TableHead><TableHead className="text-right">Accion</TableHead></TableRow></TableHeader>
              <TableBody>{alerts.overBudget.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell className="whitespace-nowrap font-semibold tabular-nums text-red-700">{formatAmount(project.amountClp)}</TableCell>
                  <TableCell className="text-right"><ActionButton label="Ver analisis" onClick={() => navigateTo(reportProjectPath(project.id))} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </AlertTable>
        ),
      };
    }

    if (selectedAlert === 'overdueMilestones') {
      return {
        title: 'Hitos vencidos',
        description: `${alerts.overdueMilestones.length} hito(s) pendientes con fecha comprometida anterior a hoy.`,
        body: (
          <AlertTable>
            <Table>
              <TableHeader><TableRow><TableHead>Proyecto / hito</TableHead><TableHead>Vencimiento</TableHead><TableHead>Monto</TableHead><TableHead className="text-right">Accion</TableHead></TableRow></TableHeader>
              <TableBody>{alerts.overdueMilestones.map((milestone) => (
                <TableRow key={milestone.id}>
                  <TableCell><p className="font-medium">{milestone.projectName}</p><p className="text-xs text-muted-foreground">{milestone.milestoneNumber ? `Hito #${milestone.milestoneNumber}` : 'Hito sin numero'}</p></TableCell>
                  <TableCell className="whitespace-nowrap text-amber-700">{formatDateOnly(milestone.date)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatAmount(milestone.amountClp)}</TableCell>
                  <TableCell className="text-right">{canOpenMilestones ? <ActionButton label="Abrir hito" onClick={() => navigateTo(`/control-pagos/hitos?hitoId=${encodeURIComponent(milestone.id)}`)} /> : '-'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </AlertTable>
        ),
      };
    }

    if (selectedAlert === 'missingBudget') {
      return {
        title: 'Proyectos sin presupuesto',
        description: `${alerts.missingBudget.length} proyecto(s) no entran en los porcentajes de cartera.`,
        body: (
          <AlertTable>
            <Table>
              <TableHeader><TableRow><TableHead>Proyecto</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Accion</TableHead></TableRow></TableHeader>
              <TableBody>{alerts.missingBudget.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-medium">{project.name}</TableCell>
                  <TableCell><Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">Presupuesto no definido</Badge></TableCell>
                  <TableCell className="text-right">{canOpenProjects ? <ActionButton label="Completar" onClick={() => navigateTo(`/control-pagos/proyectos?proyectoId=${encodeURIComponent(project.id)}`)} /> : '-'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </AlertTable>
        ),
      };
    }

    if (selectedAlert === 'unassignedExpenses') {
      return {
        title: 'Gastos sin proyecto',
        description: `${alerts.unassignedExpenses.count} gasto(s) por ${formatAmount(alerts.unassignedExpenses.amountClp)} en el periodo seleccionado.`,
        body: (
          <AlertTable>
            <Table>
              <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Proveedor / categoria</TableHead><TableHead>Monto</TableHead><TableHead className="text-right">Accion</TableHead></TableRow></TableHeader>
              <TableBody>{alerts.unassignedExpenses.items.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="whitespace-nowrap">{expense.date ? formatDateOnly(expense.date) : 'Sin fecha'}</TableCell>
                  <TableCell><p className="font-medium">{expense.supplierName}</p><p className="text-xs text-muted-foreground">{expense.categoryName}</p></TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatAmount(expense.amountClp)}</TableCell>
                  <TableCell className="text-right">{canOpenExpenses ? <ActionButton label="Abrir gasto" onClick={() => navigateTo(`/gastos?gastoId=${encodeURIComponent(expense.id)}`)} /> : '-'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </AlertTable>
        ),
      };
    }

    if (selectedAlert === 'unconvertibleMilestones') {
      return {
        title: 'Hitos sin conversion CLP',
        description: `${alerts.unconvertibleMilestones.length} hito(s) requieren completar moneda o monto base.`,
        body: (
          <AlertTable>
            <Table>
              <TableHeader><TableRow><TableHead>Proyecto / hito</TableHead><TableHead>Fecha</TableHead><TableHead>Monto original</TableHead><TableHead className="text-right">Accion</TableHead></TableRow></TableHeader>
              <TableBody>{alerts.unconvertibleMilestones.map((milestone) => (
                <TableRow key={milestone.id}>
                  <TableCell><p className="font-medium">{milestone.projectName}</p><p className="text-xs text-muted-foreground">{milestone.milestoneNumber ? `Hito #${milestone.milestoneNumber}` : 'Hito sin numero'}</p></TableCell>
                  <TableCell className="whitespace-nowrap">{milestone.date ? formatDateOnly(milestone.date) : 'Sin fecha'}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatOriginalAmount(milestone.amount, milestone.currency)}</TableCell>
                  <TableCell className="text-right">{canOpenMilestones ? <ActionButton label="Abrir hito" onClick={() => navigateTo(`/control-pagos/hitos?hitoId=${encodeURIComponent(milestone.id)}`)} /> : '-'}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </AlertTable>
        ),
      };
    }

    return null;
  })();

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Control de calidad</p>
            <h2 className="mt-1 text-balance text-lg font-semibold text-foreground">Alertas para decidir</h2>
          </div>
          <Badge variant={alertCount > 0 ? 'destructive' : 'secondary'} className="tabular-nums">
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
            {alerts.overBudget.length > 0 && <AlertCard icon={TrendingUp} title={`${alerts.overBudget.length} proyecto(s) sobre presupuesto`} description="Revisar desviaciones de gasto." tone="red" onClick={() => setSelectedAlert('overBudget')} />}
            {alerts.overdueMilestones.length > 0 && <AlertCard icon={Clock3} title={`${alerts.overdueMilestones.length} hito(s) vencido(s)`} description="Facturar o gestionar cobro." tone="amber" onClick={() => setSelectedAlert('overdueMilestones')} />}
            {alerts.missingBudget.length > 0 && <AlertCard icon={FolderKanban} title={`${alerts.missingBudget.length} proyecto(s) sin presupuesto`} description="No entran en porcentajes de cartera." tone="slate" onClick={() => setSelectedAlert('missingBudget')} />}
            {alerts.unassignedExpenses.count > 0 && <AlertCard icon={Receipt} title={`${alerts.unassignedExpenses.count} gasto(s) sin proyecto`} description={`Total periodo: ${formatAmount(alerts.unassignedExpenses.amountClp)}.`} tone="blue" onClick={() => setSelectedAlert('unassignedExpenses')} />}
            {alerts.unconvertibleMilestones.length > 0 && <AlertCard icon={AlertTriangle} title={`${alerts.unconvertibleMilestones.length} hito(s) sin conversion CLP`} description="No entran en totales hasta completar moneda o monto base." tone="orange" wide onClick={() => setSelectedAlert('unconvertibleMilestones')} />}
          </div>
        )}
      </section>

      <Dialog open={Boolean(selectedAlert)} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl bg-card p-0">
          {dialogContent && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4 pr-12 sm:px-6">
                <DialogTitle className="text-balance">{dialogContent.title}</DialogTitle>
                <DialogDescription className="text-pretty">{dialogContent.description}</DialogDescription>
              </DialogHeader>
              {dialogContent.body}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
