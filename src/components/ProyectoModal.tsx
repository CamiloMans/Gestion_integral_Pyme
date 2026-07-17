import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Proyecto } from '@/data/mockData';
import { formatNumericInput, parseNumericInput } from '@/lib/numeric-input';
import { toast } from '@/hooks/use-toast';
import { Save } from 'lucide-react';

interface ProyectoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (proyecto: Omit<Proyecto, 'id' | 'createdAt'>) => void | Promise<void>;
  proyecto?: Proyecto;
}

export function ProyectoModal({ open, onClose, onSave, proyecto }: ProyectoModalProps) {
  const [nombre, setNombre] = useState('');
  const [codigoProyecto, setCodigoProyecto] = useState('');
  const [montoTotalProyecto, setMontoTotalProyecto] = useState('');
  const [monedaBase, setMonedaBase] = useState<'' | 'CLP' | 'UF' | 'USD'>('');
  const [generaIngresos, setGeneraIngresos] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (proyecto) {
      setNombre(proyecto.nombre ? proyecto.nombre.toUpperCase() : '');
      setCodigoProyecto(proyecto.codigoProyecto ? proyecto.codigoProyecto.toUpperCase() : '');
      setMontoTotalProyecto(
        proyecto.montoTotalProyecto !== undefined && proyecto.montoTotalProyecto !== null
          ? formatNumericInput(String(proyecto.montoTotalProyecto), { allowDecimal: true, maxDecimals: 2 })
          : ''
      );
      setMonedaBase(proyecto.monedaBase || '');
      setGeneraIngresos(proyecto.generaIngresos !== false);
    } else {
      setNombre('');
      setCodigoProyecto('');
      setMontoTotalProyecto('');
      setMonedaBase('');
      setGeneraIngresos(true);
    }
  }, [proyecto, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montoTotalProyectoParsed = parseNumericInput(montoTotalProyecto, { allowDecimal: true, maxDecimals: 2 });
    const montoIsPositive = Number.isFinite(montoTotalProyectoParsed) && montoTotalProyectoParsed > 0;

    if (montoIsPositive && !monedaBase) {
      toast({
        title: 'Moneda base requerida',
        description: 'Selecciona la moneda base cuando el monto total es mayor a 0.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);

    try {
      await onSave({
        nombre: nombre.trim().toUpperCase(),
        codigoProyecto: codigoProyecto.trim() ? codigoProyecto.trim().toUpperCase() : undefined,
        montoTotalProyecto: Number.isFinite(montoTotalProyectoParsed) ? montoTotalProyectoParsed : undefined,
        monedaBase: monedaBase || undefined,
        generaIngresos,
      });
      onClose();
    } catch (error) {
      console.error('Error al guardar proyecto:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const montoParsedRender = parseNumericInput(montoTotalProyecto, { allowDecimal: true, maxDecimals: 2 });
  const requiereMoneda = Number.isFinite(montoParsedRender) && montoParsedRender > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSaving) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {proyecto ? 'Editar Proyecto' : 'Nuevo Proyecto'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del Proyecto *</Label>
            <Input
              id="nombre"
              placeholder="Nombre del proyecto"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="codigoProyecto">Codigo del Proyecto</Label>
            <Input
              id="codigoProyecto"
              placeholder="Ej: PROY-001"
              value={codigoProyecto}
              onChange={(e) => setCodigoProyecto(e.target.value.toUpperCase())}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="montoTotalProyecto">Monto Total del Proyecto</Label>
            <Input
              id="montoTotalProyecto"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={montoTotalProyecto}
              onChange={(e) =>
                setMontoTotalProyecto(
                  formatNumericInput(e.target.value, { allowDecimal: true, maxDecimals: 2 })
                )
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="monedaBase">Moneda Base{requiereMoneda ? ' *' : ''}</Label>
            <Select value={monedaBase} onValueChange={(value) => setMonedaBase(value as 'CLP' | 'UF' | 'USD')}>
              <SelectTrigger id="monedaBase" className="bg-card">
                <SelectValue placeholder="Seleccionar moneda" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="CLP">CLP</SelectItem>
                <SelectItem value="UF">UF</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-h-10 items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="generaIngresos" className="cursor-pointer">Genera ingresos</Label>
            <Switch id="generaIngresos" checked={generaIngresos} onCheckedChange={setGeneraIngresos} />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2" disabled={isSaving}>
              <Save size={18} />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
