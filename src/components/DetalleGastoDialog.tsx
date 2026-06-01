import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Paperclip, Pencil } from 'lucide-react';
import { formatCurrency, formatDate, type Gasto } from '@/data/mockData';

interface DetalleGastoDialogProps {
  open: boolean;
  onClose: () => void;
  gasto: Gasto | undefined;
  categoriaNombre?: string;
  empresaNombre?: string;
  empresaRut?: string;
  proyectoNombre?: string;
  proyectoCodigo?: string;
  tipoDocumentoNombre?: string;
  registradoPorNombre?: string;
  onEdit?: () => void;
  onOpenAttachment?: (archivo: NonNullable<Gasto['archivosAdjuntos']>[number]) => void;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || '-'}</p>
    </div>
  );
}

export function DetalleGastoDialog({
  open,
  onClose,
  gasto,
  categoriaNombre,
  empresaNombre,
  empresaRut,
  proyectoNombre,
  proyectoCodigo,
  tipoDocumentoNombre,
  registradoPorNombre,
  onEdit,
  onOpenAttachment,
}: DetalleGastoDialogProps) {
  if (!gasto) return null;

  const montoTotal = gasto.montoTotal !== undefined && gasto.montoTotal !== null
    ? gasto.montoTotal
    : gasto.monto;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl bg-card">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle className="text-xl font-semibold">Detalle del Gasto</DialogTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {formatDate(gasto.fecha)} · {formatCurrency(montoTotal)}
              </p>
            </div>
            {onEdit && (
              <Button type="button" className="gap-2" onClick={onEdit}>
                <Pencil size={16} />
                Editar
              </Button>
            )}
          </div>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-4">
            <Field label="Fecha" value={formatDate(gasto.fecha)} />
            <Field label="Proyecto" value={proyectoNombre || 'Sin proyecto'} />
            <Field label="Categoria" value={categoriaNombre || gasto.categoria} />
            <Field label="Empresa" value={empresaNombre || 'Empresa no informada'} />
            <Field label="RUT empresa" value={empresaRut} />
            <Field label="Tipo documento" value={tipoDocumentoNombre || gasto.tipoDocumento} />
            <Field label="Numero documento" value={gasto.numeroDocumento} />
            <Field label="Registrado por" value={registradoPorNombre} />
          </div>

          {proyectoCodigo && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <Field label="Codigo proyecto" value={proyectoCodigo} />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-lg border bg-muted/30 p-4">
            <Field
              label="Monto neto"
              value={gasto.montoNeto !== undefined && gasto.montoNeto !== null ? formatCurrency(gasto.montoNeto) : '-'}
            />
            <Field
              label="IVA"
              value={gasto.iva !== undefined && gasto.iva !== null ? formatCurrency(gasto.iva) : '-'}
            />
            <Field label="Monto total" value={formatCurrency(montoTotal)} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Detalle</p>
            <div className="p-4 rounded-lg bg-muted/50 border min-h-20">
              <p className="text-sm whitespace-pre-wrap">{gasto.detalle || 'Sin detalle registrado.'}</p>
            </div>
          </div>

          {gasto.comentarioTipoDocumento && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Comentario tipo de documento</p>
              <div className="p-4 rounded-lg bg-muted/50 border">
                <p className="text-sm">{gasto.comentarioTipoDocumento}</p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Adjuntos</p>
            {gasto.archivosAdjuntos && gasto.archivosAdjuntos.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {gasto.archivosAdjuntos.map((archivo, index) => (
                  <Button
                    key={`${archivo.nombre}-${index}`}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => onOpenAttachment?.(archivo)}
                  >
                    <Paperclip size={14} />
                    <span className="max-w-[220px] truncate">{archivo.nombre}</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <FileText size={14} />
                Sin adjuntos
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

