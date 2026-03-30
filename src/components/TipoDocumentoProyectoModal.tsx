import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';
import type { TipoDocumentoProyecto } from '@/services/sharepointService';

interface TipoDocumentoProyectoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (tipoDocumentoProyecto: Omit<TipoDocumentoProyecto, 'id'>) => void;
  tipoDocumentoProyecto?: TipoDocumentoProyecto;
}

export function TipoDocumentoProyectoModal({
  open,
  onClose,
  onSave,
  tipoDocumentoProyecto,
}: TipoDocumentoProyectoModalProps) {
  const [nombre, setNombre] = useState('');
  const [activo, setActivo] = useState(true);
  const [orden, setOrden] = useState('');

  useEffect(() => {
    if (tipoDocumentoProyecto) {
      setNombre(tipoDocumentoProyecto.nombre || '');
      setActivo(Boolean(tipoDocumentoProyecto.activo));
      setOrden(tipoDocumentoProyecto.orden !== undefined ? String(tipoDocumentoProyecto.orden) : '');
    } else {
      setNombre('');
      setActivo(true);
      setOrden('');
    }
  }, [tipoDocumentoProyecto, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      nombre: nombre.trim().toUpperCase(),
      activo,
      orden: orden.trim() ? Number(orden) : undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {tipoDocumentoProyecto ? 'Editar Documento de Proyecto' : 'Nuevo Documento de Proyecto'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="nombreTipoDocumentoProyecto">Nombre *</Label>
            <Input
              id="nombreTipoDocumentoProyecto"
              placeholder="Ej: FACTURA / CONTRATO / ORDEN DE COMPRA"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="activoTipoDocumentoProyecto">Activo</Label>
              <Switch
                id="activoTipoDocumentoProyecto"
                checked={activo}
                onCheckedChange={setActivo}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ordenTipoDocumentoProyecto">Orden</Label>
            <Input
              id="ordenTipoDocumentoProyecto"
              type="number"
              min="1"
              step="1"
              placeholder="Ej: 1"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            />
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

