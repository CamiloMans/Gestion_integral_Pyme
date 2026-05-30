import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';

type TipoDocumentoFormData = {
  id: string;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
  tieneImpuestos?: boolean;
  valorImpuestos?: number;
};

interface TipoDocumentoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (tipoDocumento: Omit<TipoDocumentoFormData, 'id'>) => void | Promise<void>;
  tipoDocumento?: TipoDocumentoFormData;
}

export function TipoDocumentoModal({ open, onClose, onSave, tipoDocumento }: TipoDocumentoModalProps) {
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [activo, setActivo] = useState(true);
  const [tieneImpuestos, setTieneImpuestos] = useState(false);
  const [valorImpuestos, setValorImpuestos] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (tipoDocumento) {
      setNombre(tipoDocumento.nombre ? tipoDocumento.nombre.toUpperCase() : '');
      setDescripcion(tipoDocumento.descripcion ? tipoDocumento.descripcion.toUpperCase() : '');
      setActivo(tipoDocumento.activo ?? true);
      setTieneImpuestos(tipoDocumento.tieneImpuestos ?? false);
      setValorImpuestos(tipoDocumento.valorImpuestos != null ? String(tipoDocumento.valorImpuestos) : '');
    } else {
      setNombre('');
      setDescripcion('');
      setActivo(true);
      setTieneImpuestos(false);
      setValorImpuestos('');
    }
  }, [tipoDocumento, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        nombre: nombre.trim().toUpperCase(),
        descripcion: descripcion.trim() ? descripcion.trim().toUpperCase() : undefined,
        activo,
        tieneImpuestos,
        valorImpuestos: tieneImpuestos && valorImpuestos ? parseFloat(valorImpuestos) : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Error al guardar tipo de documento:', error);
    } finally {
      setIsSaving(false);
    }
  };

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
            {tipoDocumento ? 'Editar Tipo de Documento' : 'Nuevo Tipo de Documento'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre del Tipo de Documento *</Label>
            <Input
              id="nombre"
              placeholder="Nombre del tipo de documento"
              value={nombre}
              onChange={(e) => setNombre(e.target.value.toUpperCase())}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="descripcionTipoDocumento">Descripcion</Label>
            <Textarea
              id="descripcionTipoDocumento"
              placeholder="Descripcion opcional"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value.toUpperCase())}
              rows={3}
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="tieneImpuestos">Tiene Impuestos</Label>
              <Switch
                id="tieneImpuestos"
                checked={tieneImpuestos}
                onCheckedChange={setTieneImpuestos}
              />
            </div>
          </div>

          {tieneImpuestos && (
            <div className="space-y-2">
              <Label htmlFor="valorImpuestos">Valor Impuestos (decimal, ej: 0.19 = 19%)</Label>
              <Input
                id="valorImpuestos"
                type="number"
                step="0.01"
                min="0"
                max="1"
                placeholder="0.19"
                value={valorImpuestos}
                onChange={(e) => setValorImpuestos(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="activoTipoDocumento">Activo</Label>
              <Switch
                id="activoTipoDocumento"
                checked={activo}
                onCheckedChange={setActivo}
              />
            </div>
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
