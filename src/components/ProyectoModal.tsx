import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Proyecto } from '@/data/mockData';
import { formatNumericInput, parseNumericInput } from '@/lib/numeric-input';
import { Save } from 'lucide-react';

interface ProyectoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (proyecto: Omit<Proyecto, 'id' | 'createdAt'>) => void;
  proyecto?: Proyecto;
}

export function ProyectoModal({ open, onClose, onSave, proyecto }: ProyectoModalProps) {
  const [nombre, setNombre] = useState('');
  const [montoTotalProyecto, setMontoTotalProyecto] = useState('');
  const [monedaBase, setMonedaBase] = useState<'CLP' | 'UF' | 'USD'>('CLP');

  useEffect(() => {
    if (proyecto) {
      setNombre(proyecto.nombre ? proyecto.nombre.toUpperCase() : '');
      setMontoTotalProyecto(
        proyecto.montoTotalProyecto !== undefined && proyecto.montoTotalProyecto !== null
          ? formatNumericInput(String(proyecto.montoTotalProyecto), { allowDecimal: true, maxDecimals: 2 })
          : ''
      );
      setMonedaBase(proyecto.monedaBase || 'CLP');
    } else {
      setNombre('');
      setMontoTotalProyecto('');
      setMonedaBase('CLP');
    }
  }, [proyecto, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const montoTotalProyectoParsed = parseNumericInput(montoTotalProyecto, { allowDecimal: true, maxDecimals: 2 });

    onSave({
      nombre: nombre.trim().toUpperCase(),
      montoTotalProyecto: Number.isFinite(montoTotalProyectoParsed) ? montoTotalProyectoParsed : undefined,
      monedaBase,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
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
            <Label htmlFor="monedaBase">Moneda Base *</Label>
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

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2">
              <Save size={18} />
              Guardar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

