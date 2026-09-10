import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empresa } from '@/data/mockData';
import { Save } from 'lucide-react';

type EmpresaInitialValues = Partial<Pick<Empresa, 'razonSocial' | 'rut' | 'numeroContacto' | 'correoElectronico' | 'categoria'>>;

interface EmpresaModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (empresa: Omit<Empresa, 'id' | 'createdAt'>) => void | Promise<void>;
  empresa?: Empresa;
  /**
   * Valores iniciales para crear una empresa NUEVA (ej: el destinatario de una
   * transferencia). No cambia el titulo a "Editar Empresa".
   * Debe tener referencia estable: un objeto literal en el JSX del padre vuelve a
   * sembrar el formulario en cada render y pisa lo que el usuario escribe.
   */
  initialValues?: EmpresaInitialValues;
}

export function EmpresaModal({ open, onClose, onSave, empresa, initialValues }: EmpresaModalProps) {
  const [razonSocial, setRazonSocial] = useState('');
  const [rut, setRut] = useState('');
  const [numeroContacto, setNumeroContacto] = useState('');
  const [correoElectronico, setCorreoElectronico] = useState('');
  const [categoria, setCategoria] = useState<'Empresa' | 'Persona Natural' | ''>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Sin esto el formulario se resiembra durante la animacion de cierre.
    if (!open) return;

    const source = empresa ?? initialValues;
    setRazonSocial(source?.razonSocial ? source.razonSocial.toUpperCase() : '');
    setRut(source?.rut || '');
    setNumeroContacto(source?.numeroContacto || '');
    setCorreoElectronico(source?.correoElectronico || '');
    setCategoria(source?.categoria || '');
  }, [empresa, initialValues, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        razonSocial,
        rut,
        numeroContacto: numeroContacto || undefined,
        correoElectronico: correoElectronico || undefined,
        categoria: categoria ? (categoria as 'Empresa' | 'Persona Natural') : undefined,
      });
      onClose();
    } catch (error) {
      console.error('Error al guardar empresa:', error);
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
            {empresa ? 'Editar Empresa' : 'Nueva Empresa'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="categoria">Categoría</Label>
            <Select value={categoria} onValueChange={(value) => setCategoria(value as 'Empresa' | 'Persona Natural' | '')}>
              <SelectTrigger id="categoria" className="bg-card">
                <SelectValue placeholder="Seleccionar categoría" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="Empresa">Empresa</SelectItem>
                <SelectItem value="Persona Natural">Persona Natural</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="razonSocial">Nombre Empresa *</Label>
            <Input
              id="razonSocial"
              placeholder="Ej: Sodimac"
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rut">Rut (sin punto y con guión)</Label>
            <Input
              id="rut"
              placeholder="Ej: 17720312-5"
              value={rut}
              onChange={(e) => setRut(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="numeroContacto">Número de Contacto</Label>
            <Input
              id="numeroContacto"
              type="tel"
              placeholder="Ej: +56963936654"
              value={numeroContacto}
              onChange={(e) => setNumeroContacto(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="correoElectronico">Correo electrónico</Label>
            <Input
              id="correoElectronico"
              type="email"
              placeholder="Ej: correo@gmail.com"
              value={correoElectronico}
              onChange={(e) => setCorreoElectronico(e.target.value)}
            />
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
