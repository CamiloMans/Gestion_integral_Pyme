import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { endOfMonth, format, parseISO, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  BarChart3,
  CalendarDays,
  Clock3,
  FolderKanban,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { HoraEntryDialog } from '@/components/horas/HoraEntryDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAppAuth } from '@/hooks/useAppAuth';
import { getDefaultRoute, hasPermission, PERMISSIONS } from '@/lib/access-control';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  postgresApi,
  type HoraEntry,
  type HoraEntryInput,
  type HorasDashboardResponse,
  type HorasResponse,
} from '@/services/postgresApi';

type DateRange = { from: string; to: string };

function localDateValue(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

function currentMonthRange(): DateRange {
  const today = new Date();
  return {
    from: localDateValue(startOfMonth(today)),
    to: localDateValue(endOfMonth(today)),
  };
}

function formatDate(value: string) {
  return format(parseISO(value), "EEE d 'de' MMM", { locale: es });
}

function formatHours(value: number) {
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 2 })} h`;
}

function RangeFilter({
  draft,
  onDraftChange,
  onApply,
  busy,
  today,
}: {
  draft: DateRange;
  onDraftChange: (range: DateRange) => void;
  onApply: () => void;
  busy: boolean;
  today?: string;
}) {
  const invalid = !draft.from || !draft.to || draft.from > draft.to;

  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <div className="space-y-1.5">
        <label htmlFor="hours-from" className="text-xs font-medium text-muted-foreground">Desde</label>
        <Input
          id="hours-from"
          type="date"
          max={today}
          value={draft.from}
          onChange={(event) => onDraftChange({ ...draft, from: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="hours-to" className="text-xs font-medium text-muted-foreground">Hasta</label>
        <Input
          id="hours-to"
          type="date"
          max={today}
          value={draft.to}
          onChange={(event) => onDraftChange({ ...draft, to: event.target.value })}
        />
      </div>
      <Button type="button" variant="outline" className="self-end gap-2" disabled={busy || invalid} onClick={onApply}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        Actualizar
      </Button>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, tone }: {
  label: string;
  value: string | number;
  icon: typeof Clock3;
  tone: 'sky' | 'violet' | 'emerald' | 'amber';
}) {
  const tones = {
    sky: 'bg-sky-100 text-sky-700',
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="flex items-center gap-3 p-4 sm:p-5">
        <div className={cn('rounded-xl p-2.5', tones[tone])}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{label}</p>
          <p className="text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonalEntries({
  entries,
  enabledProjects,
  onEdit,
  onDelete,
}: {
  entries: HoraEntry[];
  enabledProjects: Set<string>;
  onEdit: (entry: HoraEntry) => void;
  onDelete: (entry: HoraEntry) => void;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center px-5 py-12 text-center">
        <div className="mb-4 rounded-2xl bg-sky-50 p-4 text-sky-600"><Clock3 className="h-7 w-7" /></div>
        <p className="font-semibold">Aún no tienes horas en este período</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">Registra tu primera carga para comenzar a construir el historial.</p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Fecha</TableHead>
              <TableHead>Proyecto</TableHead>
              <TableHead>Detalle</TableHead>
              <TableHead className="text-right">Horas</TableHead>
              <TableHead className="w-24 text-center">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => {
              const canEdit = enabledProjects.has(entry.proyectoId);
              return (
                <TableRow key={entry.id}>
                  <TableCell className="whitespace-nowrap font-medium capitalize">{formatDate(entry.fecha)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{entry.proyectoNombre}</div>
                    {entry.proyectoCodigo && <div className="text-xs text-muted-foreground">{entry.proyectoCodigo}</div>}
                  </TableCell>
                  <TableCell className="max-w-sm truncate text-muted-foreground">{entry.detalle || 'Sin detalle'}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{formatHours(entry.horas)}</TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={!canEdit}
                        title={canEdit ? 'Editar registro' : 'El proyecto ya no acepta modificaciones'}
                        onClick={() => onEdit(entry)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" title="Eliminar registro" onClick={() => onDelete(entry)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="divide-y md:hidden">
        {entries.map((entry) => {
          const canEdit = enabledProjects.has(entry.proyectoId);
          return (
            <div key={entry.id} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{entry.proyectoNombre}</p>
                  <p className="text-xs capitalize text-muted-foreground">{formatDate(entry.fecha)}</p>
                </div>
                <Badge className="shrink-0">{formatHours(entry.horas)}</Badge>
              </div>
              {entry.detalle && <p className="text-sm text-muted-foreground">{entry.detalle}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={!canEdit} onClick={() => onEdit(entry)}>
                  <Pencil className="h-4 w-4" /> Editar
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => onDelete(entry)}>
                  <Trash2 className="h-4 w-4 text-destructive" /> Eliminar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PersonalHoursView() {
  const today = localDateValue();
  const initialRange = useMemo(currentMonthRange, []);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [draftRange, setDraftRange] = useState<DateRange>(initialRange);
  const [data, setData] = useState<HorasResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<HoraEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<HoraEntry | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      setData(await postgresApi.getHoras(range.from, range.to));
    } catch (error) {
      toast({
        title: 'No se pudieron cargar las horas',
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { void loadData(); }, [loadData]);

  const entries = data?.entries || [];
  const projects = data?.projects || [];
  const totalHours = entries.reduce((sum, entry) => sum + entry.horas, 0);
  const workedDays = new Set(entries.map((entry) => entry.fecha)).size;
  const enabledProjects = useMemo(() => new Set(projects.map((project) => project.id)), [projects]);

  async function saveEntry(payload: HoraEntryInput) {
    if (editingEntry) {
      await postgresApi.updateHora(editingEntry.id, payload);
      toast({ title: 'Horas actualizadas', description: 'El registro quedó corregido.', variant: 'success' });
    } else {
      await postgresApi.createHora(payload);
      toast({ title: 'Horas registradas', description: 'La carga se guardó correctamente.', variant: 'success' });
    }
    setEditingEntry(null);
    await loadData();
  }

  async function confirmDelete() {
    if (!deleteEntry) return;
    try {
      await postgresApi.deleteHora(deleteEntry.id);
      toast({ title: 'Registro eliminado', description: 'Las horas se quitaron de tu historial.', variant: 'success' });
      await loadData();
    } catch (error) {
      toast({
        title: 'No se pudo eliminar',
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setDeleteEntry(null);
    }
  }

  return (
    <>
      <PageHeader title="Cargar horas" subtitle="Registra el tiempo dedicado a los proyectos habilitados." />

      <div className="mb-5 overflow-hidden rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-700 to-blue-700 text-white shadow-sm">
        <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">Registro personal · {format(parseISO(range.from), 'MMMM yyyy', { locale: es })}</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-4xl font-bold tracking-tight">{formatHours(totalHours)}</span>
              <span className="pb-1 text-sm text-sky-100">en {workedDays} {workedDays === 1 ? 'día' : 'días'} con registro</span>
            </div>
          </div>
          <Button
            type="button"
            size="lg"
            className="gap-2 bg-white text-sky-800 shadow-sm hover:bg-sky-50"
            disabled={projects.length === 0}
            onClick={() => { setEditingEntry(null); setDialogOpen(true); }}
          >
            <Plus className="h-5 w-5" /> Registrar horas
          </Button>
        </div>
      </div>

      <Card className="mb-5 shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <RangeFilter
            draft={draftRange}
            onDraftChange={setDraftRange}
            onApply={() => setRange(draftRange)}
            busy={loading}
            today={today}
          />
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          {projects.length === 0 && (
            <Alert className="mb-5 border-amber-200 bg-amber-50 text-amber-950">
              <FolderKanban className="h-4 w-4" />
              <AlertTitle>No hay proyectos habilitados</AlertTitle>
              <AlertDescription>Un superadministrador debe activar “Permite cargar horas” en la configuración del proyecto.</AlertDescription>
            </Alert>
          )}

          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <SummaryCard label="Horas del período" value={formatHours(totalHours)} icon={Clock3} tone="sky" />
            <SummaryCard label="Días con registro" value={workedDays} icon={CalendarDays} tone="emerald" />
            <div className="col-span-2 sm:col-span-1">
              <SummaryCard label="Proyectos disponibles" value={projects.length} icon={FolderKanban} tone="violet" />
            </div>
          </div>

          <Card className="overflow-hidden shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Mi historial</CardTitle>
              <CardDescription>{entries.length} {entries.length === 1 ? 'registro encontrado' : 'registros encontrados'} en el período seleccionado.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <PersonalEntries
                entries={entries}
                enabledProjects={enabledProjects}
                onEdit={(entry) => { setEditingEntry(entry); setDialogOpen(true); }}
                onDelete={setDeleteEntry}
              />
            </CardContent>
          </Card>
        </>
      )}

      <HoraEntryDialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditingEntry(null); }}
        projects={projects}
        entries={entries}
        entry={editingEntry}
        today={today}
        onSave={saveEntry}
      />
      <ConfirmDialog
        open={Boolean(deleteEntry)}
        onOpenChange={(open) => !open && setDeleteEntry(null)}
        title="Eliminar carga de horas"
        description={`Se eliminarán ${deleteEntry ? formatHours(deleteEntry.horas) : ''} del proyecto ${deleteEntry?.proyectoNombre || ''}.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        onConfirm={confirmDelete}
      />
    </>
  );
}

function DashboardHoursView() {
  const initialRange = useMemo(currentMonthRange, []);
  const [range, setRange] = useState<DateRange>(initialRange);
  const [draftRange, setDraftRange] = useState<DateRange>(initialRange);
  const [projectId, setProjectId] = useState('all');
  const [userId, setUserId] = useState('all');
  const [data, setData] = useState<HorasDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      setData(await postgresApi.getHorasDashboard(range.from, range.to, projectId, userId));
    } catch (error) {
      toast({
        title: 'No se pudo cargar el dashboard',
        description: error instanceof Error ? error.message : 'Intenta nuevamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, range.from, range.to, userId]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const projectChart = useMemo(() => {
    const totals = new Map<string, number>();
    (data?.entries || []).forEach((entry) => totals.set(entry.proyectoNombre, (totals.get(entry.proyectoNombre) || 0) + entry.horas));
    return Array.from(totals, ([name, hours]) => ({ name, hours })).sort((a, b) => b.hours - a.hours).slice(0, 8);
  }, [data?.entries]);
  const dailyChart = useMemo(() => {
    const totals = new Map<string, number>();
    (data?.entries || []).forEach((entry) => totals.set(entry.fecha, (totals.get(entry.fecha) || 0) + entry.horas));
    return Array.from(totals, ([date, hours]) => ({ date, label: format(parseISO(date), 'd MMM', { locale: es }), hours }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data?.entries]);
  const summary = data?.summary || { totalHours: 0, people: 0, projects: 0, records: 0 };

  return (
    <>
      <PageHeader title="Dashboard de horas" subtitle="Visualiza cómo se distribuye el tiempo del equipo entre proyectos." />

      <Card className="mb-5 shadow-sm">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <RangeFilter draft={draftRange} onDraftChange={setDraftRange} onApply={() => setRange(draftRange)} busy={loading} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Filtrar proyecto" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los proyectos</SelectItem>
                {(data?.projects || []).map((project) => (
                  <SelectItem key={project.id} value={project.id}>{project.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger><SelectValue placeholder="Filtrar trabajador" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el equipo</SelectItem>
                {(data?.users || []).map((user) => (
                  <SelectItem key={user.id} value={user.id}>{user.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <SummaryCard label="Horas totales" value={formatHours(summary.totalHours)} icon={Clock3} tone="sky" />
            <SummaryCard label="Trabajadores" value={summary.people} icon={Users} tone="violet" />
            <SummaryCard label="Proyectos" value={summary.projects} icon={FolderKanban} tone="emerald" />
            <SummaryCard label="Registros" value={summary.records} icon={BarChart3} tone="amber" />
          </div>

          <div className="mb-5 grid gap-5 xl:grid-cols-2">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Horas por proyecto</CardTitle>
                <CardDescription>Los ocho proyectos con mayor dedicación en el período.</CardDescription>
              </CardHeader>
              <CardContent>
                {projectChart.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No hay datos para graficar.</div>
                ) : (
                  <div className="h-72" aria-label="Gráfico de horas por proyecto">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={projectChart} layout="vertical" margin={{ left: 12, right: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value: number) => [formatHours(value), 'Horas']} />
                        <Bar dataKey="hours" fill="#0369a1" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Ritmo diario</CardTitle>
                <CardDescription>Total cargado por el equipo en cada día con actividad.</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyChart.length === 0 ? (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">No hay datos para graficar.</div>
                ) : (
                  <div className="h-72" aria-label="Gráfico de horas por día">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dailyChart} margin={{ left: 0, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value: number) => [formatHours(value), 'Horas']} />
                        <Bar dataKey="hours" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Detalle de cargas</CardTitle>
              <CardDescription>{data?.entries.length || 0} registros según los filtros actuales.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Fecha</TableHead>
                      <TableHead>Trabajador</TableHead>
                      <TableHead>Proyecto</TableHead>
                      <TableHead>Detalle</TableHead>
                      <TableHead className="text-right">Horas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.entries || []).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap capitalize">{formatDate(entry.fecha)}</TableCell>
                        <TableCell>
                          <div className="font-medium">{entry.userNombre}</div>
                          <div className="text-xs text-muted-foreground">{entry.userEmail}</div>
                        </TableCell>
                        <TableCell>{entry.proyectoNombre}</TableCell>
                        <TableCell className="max-w-xs truncate text-muted-foreground">{entry.detalle || 'Sin detalle'}</TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">{formatHours(entry.horas)}</TableCell>
                      </TableRow>
                    ))}
                    {!loading && (data?.entries.length || 0) === 0 && (
                      <TableRow><TableCell colSpan={5} className="py-12 text-center text-muted-foreground">No hay cargas que coincidan con los filtros.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}

export default function Horas() {
  const location = useLocation();
  const { session } = useAppAuth();
  const isDashboard = location.pathname === '/horas/dashboard';
  const canViewDashboard = hasPermission(session, PERMISSIONS.HOURS_DASHBOARD);

  if (isDashboard && !canViewDashboard) {
    return <Navigate to={getDefaultRoute(session)} replace />;
  }

  return <Layout>{isDashboard ? <DashboardHoursView /> : <PersonalHoursView />}</Layout>;
}
