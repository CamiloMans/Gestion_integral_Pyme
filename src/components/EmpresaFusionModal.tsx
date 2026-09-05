import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Empresa } from '@/data/mockData';
import { AlertTriangle, Combine } from 'lucide-react';
import { buildFusionDraft, contarGastosAReasignar, elegirEmpresaPrincipal } from '@/lib/empresa-fusion';

export interface EmpresaFusionPayload {
  empresaIds: string[];
  empresaPrincipalId: string;
  empresa: Omit<Empresa, 'id' | 'createdAt'>;
}

interface EmpresaFusionModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (payload: EmpresaFusionPayload) => void | Promise<void>;
  empresas: Empresa[];
  gastosPorEmpresa: Record<string, number>;
}

export function EmpresaFusionModal({ open, onClose, onSave, empresas, gastosPorEmpresa }: EmpresaFusionModalProps) {
  const [empresaPrincipalId, setEmpresaPrincipalId] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [rut, setRut] = useState('');
  const [numeroContacto, setNumeroContacto] = useState('');
  const [correoElectronico, setCorreoElectronico] = useState('');
  const [categoria, setCategoria] = useState<'Empresa' | 'Persona Natural' | ''>('');
  const [confirmado, setConfirmado] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmado(false);
    setEmpresaPrincipalId(elegirEmpresaPrincipal(empresas, gastosPorEmpresa));
  }, [open, empresas, gastosPorEmpresa]);

  useEffect(() => {
    if (!empresaPrincipalId) return;
    const draft = buildFusionDraft(empresas, empresaPrincipalId);
    setRazonSocial(draft.razonSocial);
    setRut(draft.rut);
    setNumeroContacto(draft.numeroContacto);
    setCorreoElectronico(draft.correoElectronico);
    setCategoria(draft.categoria);
  }, [empresaPrincipalId, empresas]);

  const gastosPrincipal = gastosPorEmpresa[empresaPrincipalId] ?? 0;
  const gastosAReasignar = useMemo(
    () => contarGastosAReasignar(empresas, empresaPrincipalId, gastosPorEmpresa),
    [empresas, empresaPrincipalId, gastosPorEmpresa],
  );
  const empresasAEliminar = Math.max(0, empresas.length - 1);
  const seleccionSuficiente = empresas.length >= 2;
  const puedeGuardar = seleccionSuficiente
    && Boolean(razonSocial.trim())
    && Boolean(empresaPrincipalId)
    && confirmado;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      await onSave({
        empresaIds: empresas.map((item) => item.id),
        empresaPrincipalId,
        empresa: {
          razonSocial,
          rut,
          numeroContacto: numeroContacto || undefined,
          correoElectronico: correoElectronico || undefined,
          categoria: categoria ? (categoria as 'Empresa' | 'Persona Natural') : undefined,
        },
      });
      onClose();
    } catch (error) {
      console.error('Error al agrupar empresas:', error);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-card sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
            <Combine size={20} />
            Agrupar Empresas
          </DialogTitle>
          <DialogDescription>
            Elige la empresa principal y ajusta sus datos. Los gastos de las demas se moveran a ella.
          </DialogDescription>
        </DialogHeader>

        {!seleccionSuficiente ? (
          <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Selecciona al menos dos empresas para poder agruparlas.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Empresa principal *</Label>
              <p className="text-xs text-muted-foreground">
                Se conserva este registro. Al cambiar la empresa principal se vuelven a cargar los datos editables.
              </p>
              <RadioGroup
                value={empresaPrincipalId}
                onValueChange={setEmpresaPrincipalId}
                disabled={isSaving}
                className="space-y-2"
              >
                {empresas.map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`empresa-principal-${item.id}`}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/40"
                  >
                    <RadioGroupItem id={`empresa-principal-${item.id}`} value={item.id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.razonSocial}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.rut || 'Sin RUT'} · {item.categoria || 'Sin categoria'}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {gastosPorEmpresa[item.id] ?? 0} gastos
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fusion-categoria">Categoría</Label>
              <Select
                value={categoria}
                onValueChange={(value) => setCategoria(value as 'Empresa' | 'Persona Natural' | '')}
                disabled={isSaving}
              >
                <SelectTrigger id="fusion-categoria" className="bg-card">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="Empresa">Empresa</SelectItem>
                  <SelectItem value="Persona Natural">Persona Natural</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fusion-razonSocial">Nombre Empresa *</Label>
              <Input
                id="fusion-razonSocial"
                placeholder="Ej: Sodimac"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
                disabled={isSaving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fusion-rut">Rut (sin punto y con guión)</Label>
              <Input
                id="fusion-rut"
                placeholder="Ej: 17720312-5"
                value={rut}
                onChange={(e) => setRut(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fusion-numeroContacto">Número de Contacto</Label>
              <Input
                id="fusion-numeroContacto"
                type="tel"
                placeholder="Ej: +56963936654"
                value={numeroContacto}
                onChange={(e) => setNumeroContacto(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fusion-correoElectronico">Correo electrónico</Label>
              <Input
                id="fusion-correoElectronico"
                type="email"
                placeholder="Ej: correo@gmail.com"
                value={correoElectronico}
                onChange={(e) => setCorreoElectronico(e.target.value)}
                disabled={isSaving}
              />
            </div>

            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/40 dark:bg-red-900/20">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="space-y-2 text-sm">
                  <p>
                    Se agruparan {empresas.length} empresas en{' '}
                    <strong>{razonSocial || 'la empresa principal'}</strong>. Se reasignaran{' '}
                    <strong>{gastosAReasignar}</strong> gastos, que se sumaran a los {gastosPrincipal} que
                    ya tiene la empresa principal ({gastosPrincipal + gastosAReasignar} en total).
                    Ningun gasto se elimina.
                  </p>
                  <p>
                    Las otras {empresasAEliminar} empresas se eliminaran de forma permanente. Esta accion
                    no se puede deshacer.
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 font-medium">
                    <Checkbox
                      checked={confirmado}
                      onCheckedChange={(checked) => setConfirmado(Boolean(checked))}
                      disabled={isSaving}
                    />
                    Entiendo que se eliminaran {empresasAEliminar} empresas.
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" className="gap-2" disabled={isSaving || !puedeGuardar}>
                <Combine size={18} />
                {isSaving ? 'Agrupando...' : 'Agrupar empresas'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
