import { useEffect, useMemo, useState } from 'react';
import { Clock3, Loader2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toDateOnly } from '@/lib/date-format';
import type { HoraEntry, HoraEntryInput, HorasProject } from '@/services/postgresApi';

type HoraEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: HorasProject[];
  entries: HoraEntry[];
  entry?: HoraEntry | null;
  today: string;
  onSave: (payload: HoraEntryInput) => Promise<void>;
};

function parseHours(value: string) {
  return Number(value.replace(',', '.'));
}

export function validateHourAmount(value: number) {
  if (!Number.isFinite(value) || value <= 0 || value > 24) {
    return 'Ingresa una cantidad mayor a 0 y menor o igual a 24.';
  }
  if (!Number.isInteger(value * 4)) {
    return 'Usa incrementos de 0,25 horas.';
  }
  return null;
}

export function HoraEntryDialog({
  open,
  onOpenChange,
  projects,
  entries,
  entry,
  today,
  onSave,
}: HoraEntryDialogProps) {
  const [projectId, setProjectId] = useState('');
  const [date, setDate] = useState(today);
  const [hours, setHours] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setProjectId(entry?.proyectoId || projects[0]?.id || '');
    setDate(toDateOnly(entry?.fecha) || today);
    setHours(entry ? String(entry.horas) : '');
    setDetail(entry?.detalle || '');
    setError(null);
  }, [entry, open, projects, today]);

  const existingHoursForDate = useMemo(
    () => entries
      .filter((item) => toDateOnly(item.fecha) === date && item.id !== entry?.id)
      .reduce((sum, item) => sum + item.horas, 0),
    [date, entries, entry?.id],
  );
  const parsedHours = parseHours(hours);
  const projectedTotal = existingHoursForDate + (Number.isFinite(parsedHours) ? parsedHours : 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!projectId) {
      setError('Selecciona un proyecto habilitado.');
      return;
    }
    if (!date || date > today) {
      setError('Selecciona una fecha válida que no sea futura.');
      return;
    }
    const hourError = validateHourAmount(parsedHours);
    if (hourError) {
      setError(hourError);
      return;
    }
    if (projectedTotal > 24) {
      setError(`La carga supera 24 horas. Ya tienes ${existingHoursForDate} horas registradas ese día.`);
      return;
    }
    if (detail.trim().length > 500) {
      setError('El detalle no puede superar 500 caracteres.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        proyectoId: projectId,
        fecha: date,
        horas: parsedHours,
        detalle: detail.trim() || null,
      });
      onOpenChange(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar el registro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !saving && onOpenChange(nextOpen)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Clock3 className="h-5 w-5" />
          </div>
          <DialogTitle>{entry ? 'Editar carga de horas' : 'Registrar horas'}</DialogTitle>
          <DialogDescription>
            Registra el tiempo efectivo dedicado a un proyecto. Puedes corregirlo después.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="hora-project">Proyecto</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="hora-project">
                <SelectValue placeholder="Selecciona un proyecto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.codigoProyecto ? `${project.codigoProyecto} · ` : ''}{project.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hora-date">Fecha</Label>
              <DateInput id="hora-date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hora-amount">Horas</Label>
              <Input
                id="hora-amount"
                type="number"
                inputMode="decimal"
                min="0.25"
                max="24"
                step="0.25"
                placeholder="Ej: 2,5"
                value={hours}
                onChange={(event) => setHours(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-medium text-sky-900">Jornada cargada para esta fecha</span>
              <span className="font-semibold text-sky-700">{Math.min(projectedTotal, 24).toLocaleString('es-CL')} / 24 h</span>
            </div>
            <Progress value={Math.min((projectedTotal / 24) * 100, 100)} className="h-2" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="hora-detail">Detalle opcional</Label>
              <span className="text-xs text-muted-foreground">{detail.length}/500</span>
            </div>
            <Textarea
              id="hora-detail"
              maxLength={500}
              rows={3}
              placeholder="Ej: Levantamiento en terreno y revisión de planos"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving || projects.length === 0} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Guardando...' : 'Guardar horas'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
