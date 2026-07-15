import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Gasto, Proyecto, Empresa } from '@/data/mockData';
import { formatNumericInput, parseNumericInput } from '@/lib/numeric-input';
import { Save, Plus, Paperclip, Search, Loader2 } from 'lucide-react';
import { ProyectoModal } from './ProyectoModal';
import { EmpresaModal } from './EmpresaModal';
import { CategoriaModal } from './CategoriaModal';
import { ConfirmDialog } from './ConfirmDialog';
import { DocumentoViewer } from './DocumentoViewer';
import { toast } from '@/hooks/use-toast';
import { postgresApi, type GastoDocumentExtractionResult } from '@/services/postgresApi';
import {
  isExtractableDocument,
  normalizeLookupText,
  resolveEmpresaMatch as resolveExtractedEmpresaMatch,
  resolveTipoDocumentoId as resolveExtractedTipoDocumentoId,
} from '@/lib/gasto-document';

type CategoriaOption = {
  id: string;
  nombre: string;
  color?: string;
  activa?: boolean;
};

type TipoDocumentoOption = {
  id: string;
  nombre: string;
  descripcion?: string;
  activo?: boolean;
  tieneImpuestos?: boolean;
  valorImpuestos?: number;
};

type GastoAdjunto = NonNullable<Gasto['archivosAdjuntos']>[number];

interface GastoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (gasto: Omit<Gasto, 'id'>) => void | Promise<void>;
  gasto?: Gasto;
  nombreRegistrador?: string;
  proyectos: Proyecto[];
  empresas: Empresa[];
  categorias: CategoriaOption[];
  tiposDocumento: TipoDocumentoOption[];
  onCreateProyecto: (proyecto: Omit<Proyecto, 'id' | 'createdAt'>) => Promise<Proyecto> | Proyecto;
  onCreateEmpresa: (empresa: Omit<Empresa, 'id' | 'createdAt'>) => Promise<Empresa> | Empresa;
  onCreateCategoria: (categoria: Omit<CategoriaOption, 'id' | 'color'>) => Promise<CategoriaOption> | CategoriaOption;
  allowCreateProyecto?: boolean;
  allowCreateEmpresa?: boolean;
  allowCreateCategoria?: boolean;
}

export function GastoModal({
  open,
  onClose,
  onSave,
  gasto,
  nombreRegistrador,
  proyectos,
  empresas: todasLasEmpresas,
  categorias,
  tiposDocumento,
  onCreateProyecto,
  onCreateEmpresa,
  onCreateCategoria,
  allowCreateProyecto = true,
  allowCreateEmpresa = true,
  allowCreateCategoria = true,
}: GastoModalProps) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [categoria, setCategoria] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [monto, setMonto] = useState('');
  const [montoNeto, setMontoNeto] = useState('');
  const [montoIva, setMontoIva] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [detalle, setDetalle] = useState('');
  const [comentarioTipoDocumento, setComentarioTipoDocumento] = useState('');
  const [proyectoModalOpen, setProyectoModalOpen] = useState(false);
  const [empresaModalOpen, setEmpresaModalOpen] = useState(false);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [archivosAdjuntos, setArchivosAdjuntos] = useState<GastoAdjunto[]>([]);
  const [filtroCategoriaEmpresa, setFiltroCategoriaEmpresa] = useState<'Empresa' | 'Persona Natural' | 'all'>('all');
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [archivoAEliminar, setArchivoAEliminar] = useState<number | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const localPreviewUrlRef = useRef<string | null>(null);
  const [isExtractingDocument, setIsExtractingDocument] = useState(false);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [empresaMatchInfo, setEmpresaMatchInfo] = useState<ReturnType<typeof resolveExtractedEmpresaMatch> | null>(null);

  const clearLocalPreview = useCallback(() => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = null;
    }
    setSelectedPreviewFile(undefined);
  }, []);

  const openArchivoPreview = useCallback((archivo: GastoAdjunto) => {
    clearLocalPreview();

    if (archivo.file instanceof File) {
      const previewUrl = URL.createObjectURL(archivo.file);
      localPreviewUrlRef.current = previewUrl;
      setSelectedPreviewFile({
        nombre: archivo.nombre,
        url: previewUrl,
        tipo: archivo.tipo || 'application/octet-stream',
      });
      setViewerOpen(true);
      return;
    }

    setSelectedPreviewFile({
      nombre: archivo.nombre,
      url: archivo.url,
      tipo: archivo.tipo || 'application/octet-stream',
    });
    setViewerOpen(true);
  }, [clearLocalPreview]);

  const proyectosOrdenados = useMemo(() => {
    return [...proyectos].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [proyectos]);

  const empresas = useMemo(() => {
    let empresasFiltradas = [...todasLasEmpresas];

    if (filtroCategoriaEmpresa !== 'all') {
      empresasFiltradas = empresasFiltradas.filter((empresa) => empresa.categoria === filtroCategoriaEmpresa);
    }

    if (busquedaEmpresa.trim() !== '') {
      const busquedaLower = busquedaEmpresa.toLowerCase().trim();
      empresasFiltradas = empresasFiltradas.filter((empresa) =>
        empresa.razonSocial.toLowerCase().includes(busquedaLower) ||
        (empresa.rut || '').toLowerCase().includes(busquedaLower)
      );
    }

    return empresasFiltradas.sort((a, b) =>
      a.razonSocial.localeCompare(b.razonSocial, 'es', { sensitivity: 'base' })
    );
  }, [todasLasEmpresas, filtroCategoriaEmpresa, busquedaEmpresa]);

  const categoriasOrdenadas = useMemo(() => {
    return [...categorias].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [categorias]);

  const tiposDocumentoOrdenados = useMemo(() => {
    return [...tiposDocumento].sort((a, b) => {
      const nombreA = a.nombre.toLowerCase();
      const nombreB = b.nombre.toLowerCase();
      const esOtroA = nombreA === 'otro' || nombreA === 'otros';
      const esOtroB = nombreB === 'otro' || nombreB === 'otros';

      if (esOtroA && !esOtroB) return 1;
      if (!esOtroA && esOtroB) return -1;
      if (esOtroA && esOtroB) return 0;

      return nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
    });
  }, [tiposDocumento]);

  const tipoDocumentoSeleccionado = useMemo(() => {
    return tiposDocumentoOrdenados.find((item) => item.id === tipoDocumento);
  }, [tiposDocumentoOrdenados, tipoDocumento]);

  const aplicaImpuesto = tipoDocumentoSeleccionado?.tieneImpuestos || false;
  const valorImpuesto = tipoDocumentoSeleccionado?.valorImpuestos || 0;

  useEffect(() => {
    if (!aplicaImpuesto) {
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
    }
  }, [aplicaImpuesto]);

  useEffect(() => {
    const total = parseNumericInput(monto, { allowDecimal: false });

    if (aplicaImpuesto && Number.isFinite(total)) {
      if (total > 0 && valorImpuesto > 0) {
        const neto = total / (1 + valorImpuesto);
        const iva = total - neto;

        setMontoNeto(neto.toFixed(0));
        setMontoIva(iva.toFixed(0));
        setMontoTotal(total.toFixed(0));
      } else {
        setMontoNeto('');
        setMontoIva('');
        setMontoTotal('');
      }
    } else if (aplicaImpuesto && !monto) {
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
    } else if (!aplicaImpuesto && Number.isFinite(total)) {
      setMontoTotal(total.toFixed(0));
      setMontoNeto('');
      setMontoIva('');
    }
  }, [monto, aplicaImpuesto, valorImpuesto]);

  useEffect(() => {
    if (!open) {
      setViewerOpen(false);
      clearLocalPreview();
      return;
    }

    if (gasto) {
      let fechaFormateada = '';

      if (gasto.fecha) {
        try {
          const fechaGasto = new Date(gasto.fecha);
          if (!Number.isNaN(fechaGasto.getTime())) {
            fechaFormateada = fechaGasto.toISOString().split('T')[0];
          } else {
            fechaFormateada = gasto.fecha.split('T')[0];
          }
        } catch {
          fechaFormateada = gasto.fecha.split('T')[0];
        }
      }

      setFecha(fechaFormateada || new Date().toISOString().split('T')[0]);

      const categoriaEncontrada = categoriasOrdenadas.find((item) => String(item.id) === String(gasto.categoria));
      setCategoria(categoriaEncontrada ? String(categoriaEncontrada.id) : String(gasto.categoria || ''));
      setTipoDocumento(String(gasto.tipoDocumento || ''));
      setNumeroDocumento(gasto.numeroDocumento);
      setEmpresaId(gasto.empresaId || '');
      setProyectoId(gasto.proyectoId || '');

      if (gasto.montoTotal !== undefined && gasto.montoTotal !== null) {
        setMonto(formatNumericInput(gasto.montoTotal.toString(), { allowDecimal: false }));
      } else {
        setMonto(formatNumericInput(gasto.monto.toString(), { allowDecimal: false }));
      }

      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
      setDetalle(gasto.detalle || '');
      setComentarioTipoDocumento(gasto.comentarioTipoDocumento || '');
      setArchivosAdjuntos(gasto.archivosAdjuntos ? [...gasto.archivosAdjuntos] : []);
      setEmpresaMatchInfo(null);
    } else {
      setFecha(new Date().toISOString().split('T')[0]);
      setCategoria('');
      setTipoDocumento('');
      setNumeroDocumento('');
      setEmpresaId('');
      setProyectoId('');
      setMonto('');
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
      setDetalle('');
      setComentarioTipoDocumento('');
      setArchivosAdjuntos([]);
      setFiltroCategoriaEmpresa('all');
      setBusquedaEmpresa('');
      setEmpresaMatchInfo(null);
    }
  }, [categoriasOrdenadas, clearLocalPreview, gasto, open]);

  useEffect(() => {
    return () => {
      if (localPreviewUrlRef.current) {
        URL.revokeObjectURL(localPreviewUrlRef.current);
        localPreviewUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (categoria) {
      const categoriaSeleccionada = categoriasOrdenadas.find((item) => String(item.id) === String(categoria));
      if (categoriaSeleccionada?.nombre === 'Honorarios') {
        setFiltroCategoriaEmpresa('Persona Natural');
      }
    }
  }, [categoria, categoriasOrdenadas]);

  useEffect(() => {
    if (filtroCategoriaEmpresa !== 'all' && empresaId) {
      const empresaSeleccionada = todasLasEmpresas.find((item) => item.id === empresaId);
      if (empresaSeleccionada && empresaSeleccionada.categoria !== filtroCategoriaEmpresa) {
        setEmpresaId('');
      }
    }
  }, [filtroCategoriaEmpresa, todasLasEmpresas, empresaId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSaving) {
      return;
    }

    const nombreTipoDocumentoNormalizado = tipoDocumentoSeleccionado?.nombre?.trim().toLowerCase() || '';
    const esOtros =
      nombreTipoDocumentoNormalizado === 'otros' ||
      nombreTipoDocumentoNormalizado === 'otro';

    const montoTotalParsed = parseNumericInput(monto, { allowDecimal: false });
    const montoNetoParsed = parseNumericInput(montoNeto, { allowDecimal: false });
    const montoIvaParsed = parseNumericInput(montoIva, { allowDecimal: false });
    const montoTotalValue = Number.isFinite(montoTotalParsed) ? montoTotalParsed : 0;
    const montoNetoValue = aplicaImpuesto && Number.isFinite(montoNetoParsed) ? montoNetoParsed : undefined;
    const ivaValue = aplicaImpuesto && Number.isFinite(montoIvaParsed) ? montoIvaParsed : undefined;
    const numeroDocumentoValue = numeroDocumento.trim().toUpperCase();
    const validationErrors = [
      !fecha.trim() ? 'Fecha' : null,
      !categoria ? 'Categoria' : null,
      !tipoDocumento ? 'Tipo de documento' : null,
      !empresaId ? 'Empresa' : null,
      !numeroDocumentoValue ? 'Numero de documento' : null,
      montoTotalValue <= 0 ? 'Monto total' : null,
      esOtros && !comentarioTipoDocumento.trim() ? 'Especificar tipo de documento' : null,
    ].filter((item): item is string => Boolean(item));

    if (validationErrors.length > 0) {
      toast({
        title: 'Campos obligatorios',
        description: `Completa antes de guardar: ${validationErrors.join(', ')}.`,
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        fecha,
        categoria,
        tipoDocumento,
        numeroDocumento: numeroDocumentoValue,
        empresaId,
        proyectoId: proyectoId || undefined,
        monto: montoTotalValue,
        montoNeto: montoNetoValue,
        iva: ivaValue,
        montoTotal: montoTotalValue,
        detalle,
        comentarioTipoDocumento: esOtros && comentarioTipoDocumento ? comentarioTipoDocumento : undefined,
        archivosAdjuntos: archivosAdjuntos.length > 0 ? archivosAdjuntos : undefined,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveProyecto = async (nuevoProyecto: Omit<Proyecto, 'id' | 'createdAt'>) => {
    const proyectoCreado = await onCreateProyecto(nuevoProyecto);
    setProyectoId(proyectoCreado.id);
    setProyectoModalOpen(false);
  };

  const handleSaveEmpresa = async (nuevaEmpresa: Omit<Empresa, 'id' | 'createdAt'>) => {
    const empresaCreada = await onCreateEmpresa(nuevaEmpresa);
    setEmpresaId(empresaCreada.id);
    setEmpresaModalOpen(false);
  };

  const handleSaveCategoria = async (nuevaCategoria: Omit<CategoriaOption, 'id' | 'color'>) => {
    const categoriaCreada = await onCreateCategoria(nuevaCategoria);
    setCategoria(categoriaCreada.id);
    setCategoriaModalOpen(false);
  };

  const resolveTipoDocumentoId = useCallback((extractedType?: string | null) => {
    return resolveExtractedTipoDocumentoId(tiposDocumentoOrdenados, extractedType);
  }, [tiposDocumentoOrdenados]);

  const resolveEmpresaId = useCallback((extracted: GastoDocumentExtractionResult) => {
    return resolveExtractedEmpresaMatch(todasLasEmpresas, extracted);
  }, [todasLasEmpresas]);

  const applyExtractedDocumentData = useCallback((extracted: GastoDocumentExtractionResult) => {
    if (extracted.fecha && /^\d{4}-\d{2}-\d{2}$/.test(extracted.fecha)) {
      setFecha(extracted.fecha);
    }

    const resolvedTipoDocumentoId = resolveTipoDocumentoId(extracted.tipoDocumento);
    if (resolvedTipoDocumentoId) {
      setTipoDocumento(resolvedTipoDocumentoId);
    }

    if (extracted.numeroDocumento) {
      setNumeroDocumento(extracted.numeroDocumento.replace(/\.0$/, ''));
    }

    const resolvedEmpresaMatch = resolveEmpresaId(extracted);
    if (resolvedEmpresaMatch) {
      setEmpresaId(resolvedEmpresaMatch.empresaId);
      setEmpresaMatchInfo(resolvedEmpresaMatch);
    } else {
      setEmpresaMatchInfo(null);
    }

    if (typeof extracted.montoTotal === 'number' && Number.isFinite(extracted.montoTotal)) {
      setMonto(formatNumericInput(String(extracted.montoTotal), { allowDecimal: false }));
    }

    if (extracted.detalle) {
      setDetalle(extracted.detalle.toUpperCase());
    }

    const apiConfidence = typeof extracted.confidence === 'number'
      ? ` Confianza API: ${Math.round(extracted.confidence * 100)}%.`
      : '';
    const empresaConfidence = resolvedEmpresaMatch
      ? ` Empresa: ${Math.round(resolvedEmpresaMatch.score * 100)}% por ${resolvedEmpresaMatch.method}.`
      : ' Empresa no encontrada automaticamente.';
    const warnings = extracted.warnings?.length ? ` ${extracted.warnings.join(' ')}` : '';
    toast({
      title: 'Documento escaneado',
      description: `Se completaron los datos detectados.${apiConfidence}${empresaConfidence}${warnings}`,
      variant: 'success',
    });
  }, [resolveEmpresaId, resolveTipoDocumentoId]);

  const processAttachmentFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const nuevosArchivos = files.map((archivo) => ({
      nombre: archivo.name,
      url: '',
      tipo: archivo.type || 'application/octet-stream',
      file: archivo,
    }));

    setArchivosAdjuntos((prev) => [...prev, ...nuevosArchivos]);

    const fileToExtract = files.find(isExtractableDocument);
    if (!fileToExtract) {
      return;
    }

    setIsExtractingDocument(true);

    try {
      const extracted = await postgresApi.extractGastoDocument(fileToExtract);
      applyExtractedDocumentData(extracted);
    } catch (error) {
      toast({
        title: 'No se pudo escanear el documento',
        description: error instanceof Error ? error.message : 'Error desconocido al extraer datos.',
        variant: 'destructive',
      });
    } finally {
      setIsExtractingDocument(false);
    }
  }, [applyExtractedDocumentData]);

  const handleAttachmentInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    void processAttachmentFiles(files);
  }, [processAttachmentFiles]);

  const handleAttachmentDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
    if (isExtractingDocument) return;
    const files = Array.from(event.dataTransfer?.files || []);
    void processAttachmentFiles(files);
  }, [processAttachmentFiles, isExtractingDocument]);

  const handleAttachmentDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isExtractingDocument) setIsDraggingFiles(true);
  }, [isExtractingDocument]);

  const handleAttachmentDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFiles(false);
  }, []);

  const montoValue = parseNumericInput(monto, { allowDecimal: false });
  const montoNetoValue = parseNumericInput(montoNeto, { allowDecimal: false });
  const montoIvaValue = parseNumericInput(montoIva, { allowDecimal: false });

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {gasto ? 'Editar Gasto' : 'Nuevo Gasto'}
              {nombreRegistrador && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({nombreRegistrador})
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para registrar gastos y adjuntar documentos para extraer datos automaticamente.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="proyecto">Proyecto</Label>
              <div className="flex gap-2">
                <Select value={String(proyectoId || '')} onValueChange={(value) => setProyectoId(value)}>
                  <SelectTrigger className="flex-1 bg-card">
                    <SelectValue placeholder="Seleccionar proyecto" />
                  </SelectTrigger>
                  <SelectContent className="bg-card">
                    {proyectosOrdenados.map((proyecto) => (
                      <SelectItem key={proyecto.id} value={String(proyecto.id)}>
                        {proyecto.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {allowCreateProyecto && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setProyectoModalOpen(true)}
                  >
                    <Plus size={18} />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label htmlFor="fecha">Fecha *</Label>
                <Input
                  id="fecha"
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  required
                  className="w-full h-10 min-w-0"
                  style={{
                    WebkitAppearance: 'none',
                    appearance: 'none',
                    minWidth: 0,
                    maxWidth: '100%',
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="categoria">Categoria *</Label>
                <div className="flex gap-2">
                  <Select value={String(categoria)} onValueChange={(value) => setCategoria(value)} required>
                    <SelectTrigger className="flex-1 bg-card w-full h-10">
                      <SelectValue placeholder="Seleccionar categoria" />
                    </SelectTrigger>
                    <SelectContent className="bg-card">
                      {categoriasOrdenadas.length > 0 ? (
                        categoriasOrdenadas.map((cat) => (
                          <SelectItem key={cat.id} value={String(cat.id)}>
                            {cat.nombre}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="sin-categorias" disabled>
                          No hay categorias disponibles
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  {allowCreateCategoria && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => setCategoriaModalOpen(true)}
                    >
                      <Plus size={18} />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipoDocumento">Tipo de Documento *</Label>
              <Select
                value={tipoDocumento || undefined}
                onValueChange={(value) => setTipoDocumento(value)}
                required
              >
                <SelectTrigger className="bg-card" id="tipoDocumento">
                  <SelectValue placeholder="Seleccionar documento" />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  {tiposDocumentoOrdenados.length > 0 ? (
                    tiposDocumentoOrdenados.map((tipo) => (
                      <SelectItem key={tipo.id} value={tipo.id}>
                        {tipo.nombre}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="sin-documentos" disabled>
                      No hay tipos de documento disponibles
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
              {(() => {
                const nombreNormalizado = tipoDocumentoSeleccionado?.nombre?.toLowerCase() || '';
                const esOtros = nombreNormalizado === 'otros' || nombreNormalizado === 'otro';
                return esOtros && (
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="comentarioTipoDocumento">Especificar tipo de documento *</Label>
                    <Input
                      id="comentarioTipoDocumento"
                      placeholder="Ej: NOTA DE CREDITO, RECIBO, ETC."
                      value={comentarioTipoDocumento}
                      onChange={(e) => setComentarioTipoDocumento(e.target.value.toUpperCase())}
                      required
                      style={{ textTransform: 'uppercase' }}
                    />
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="numeroDocumento">Numero de Documento *</Label>
                <Input
                  id="numeroDocumento"
                  placeholder="Ej: 001234"
                  value={numeroDocumento}
                  onChange={(e) => setNumeroDocumento(e.target.value.toUpperCase())}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="empresa">Empresa *</Label>
                <ToggleGroup
                  type="single"
                  value={filtroCategoriaEmpresa}
                  onValueChange={(value) => {
                    if (value) {
                      setFiltroCategoriaEmpresa(value as 'Empresa' | 'Persona Natural' | 'all');
                    } else {
                      setFiltroCategoriaEmpresa('all');
                    }
                  }}
                  className="h-8"
                >
                  <ToggleGroupItem value="all" className="text-xs px-2 py-1 h-7 data-[state=on]:bg-muted">
                    Todas
                  </ToggleGroupItem>
                  <ToggleGroupItem value="Empresa" className="text-xs px-2 py-1 h-7 data-[state=on]:bg-muted">
                    Empresa
                  </ToggleGroupItem>
                  <ToggleGroupItem value="Persona Natural" className="text-xs px-2 py-1 h-7 data-[state=on]:bg-muted">
                    Persona Natural
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex gap-2">
                <Select
                  value={String(empresaId || '')}
                  onValueChange={(value) => {
                    setEmpresaId(value);
                    setEmpresaMatchInfo(null);
                  }}
                  required
                >
                  <SelectTrigger className="flex-1 bg-card">
                    <SelectValue placeholder="Seleccionar empresa" />
                  </SelectTrigger>
                  <SelectContent className="bg-card p-0">
                    <div className="flex items-center border-b px-3 py-2">
                      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                      <Input
                        placeholder="Buscar empresa..."
                        value={busquedaEmpresa}
                        onChange={(e) => {
                          e.stopPropagation();
                          setBusquedaEmpresa(e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        className="h-8 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                    <div className="max-h-[200px] overflow-y-auto">
                      {empresas.length > 0 ? (
                        empresas.map((empresa) => (
                          <SelectItem key={empresa.id} value={String(empresa.id)}>
                            {empresa.razonSocial}
                          </SelectItem>
                        ))
                      ) : (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          {busquedaEmpresa.trim() !== ''
                            ? 'No se encontraron empresas con ese criterio'
                            : 'No hay empresas disponibles para esta categoria'}
                        </div>
                      )}
                    </div>
                  </SelectContent>
                </Select>
                {allowCreateEmpresa && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setEmpresaModalOpen(true)}
                  >
                    <Plus size={18} />
                  </Button>
                )}
              </div>
              {empresaMatchInfo && (
                <div
                  className={
                    empresaMatchInfo.score >= 0.9
                      ? 'text-xs text-emerald-700'
                      : 'text-xs text-amber-700'
                  }
                >
                  Coincidencia empresa: {Math.round(empresaMatchInfo.score * 100)}% por {empresaMatchInfo.method}.
                  {' '}Detectado: {empresaMatchInfo.extractedName || empresaMatchInfo.extractedRut || 'sin dato'}.
                  {' '}Seleccionado: {empresaMatchInfo.matchedName}.
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto">Monto Total (CLP) *</Label>
              <div className="flex gap-2">
                <Input
                  id="monto"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={monto}
                  onChange={(e) => setMonto(formatNumericInput(e.target.value, { allowDecimal: false }))}
                  required
                  className="flex-1"
                />
                <input
                  type="file"
                  id="archivosAdjuntos"
                  multiple
                  className="hidden"
                  accept="image/*,application/pdf,text/xml,application/xml,.doc,.docx,.xls,.xlsx"
                  onChange={handleAttachmentInputChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => document.getElementById('archivosAdjuntos')?.click()}
                  title="Adjuntar documentos"
                  disabled={isExtractingDocument}
                >
                  {isExtractingDocument ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Paperclip size={18} />
                  )}
                </Button>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => document.getElementById('archivosAdjuntos')?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    document.getElementById('archivosAdjuntos')?.click();
                  }
                }}
                onDrop={handleAttachmentDrop}
                onDragOver={handleAttachmentDragOver}
                onDragLeave={handleAttachmentDragLeave}
                className={`mt-2 flex items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-xs text-center transition-colors cursor-pointer ${
                  isDraggingFiles
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border bg-muted/20 text-muted-foreground hover:border-primary/60 hover:bg-muted/40'
                } ${isExtractingDocument ? 'pointer-events-none opacity-50' : ''}`}
              >
                <Paperclip size={14} />
                <span>Arrastra imagenes o documentos aqui</span>
              </div>
              {aplicaImpuesto && (
                <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex justify-between items-center text-sm pt-2 border-t">
                    <span className="font-semibold">Monto Total:</span>
                    <span className="font-bold text-lg">
                      {Number.isFinite(montoValue) && montoValue > 0
                        ? montoValue.toLocaleString('es-CL')
                        : '0'} CLP
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Monto Neto:</span>
                    <span className="font-medium">
                      {Number.isFinite(montoNetoValue) && montoNetoValue > 0
                        ? montoNetoValue.toLocaleString('es-CL')
                        : '0'} CLP
                    </span>
                  </div>
                  {valorImpuesto > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Monto IVA ({(valorImpuesto * 100).toFixed(2)}%):</span>
                      <span className="font-medium">
                        {Number.isFinite(montoIvaValue) && montoIvaValue > 0
                          ? montoIvaValue.toLocaleString('es-CL')
                          : '0'} CLP
                      </span>
                    </div>
                  )}
                </div>
              )}
              {!aplicaImpuesto && monto && (
                <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
                  <div className="flex justify-between items-center text-sm pt-2 border-t">
                    <span className="font-semibold">Monto Total:</span>
                    <span className="font-bold text-lg">
                      {Number.isFinite(montoValue) && montoValue > 0
                        ? montoValue.toLocaleString('es-CL')
                        : '0'} CLP
                    </span>
                  </div>
                </div>
              )}
              {archivosAdjuntos.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {archivosAdjuntos.map((archivo, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-sm cursor-pointer hover:bg-muted/80"
                      role="button"
                      tabIndex={0}
                      onClick={() => openArchivoPreview(archivo)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          openArchivoPreview(archivo);
                        }
                      }}
                    >
                      <span className="truncate max-w-[200px]">{archivo.nombre}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4"
                        onClick={(e) => {
                          e.stopPropagation();
                          setArchivoAEliminar(index);
                          setConfirmDialogOpen(true);
                        }}
                      >
                        x
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="detalle">Detalle</Label>
              <Textarea
                id="detalle"
                placeholder="DESCRIPCION ADICIONAL DEL GASTO..."
                value={detalle}
                onChange={(e) => setDetalle(e.target.value.toUpperCase())}
                rows={3}
                style={{ textTransform: 'uppercase' }}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancelar
              </Button>
              <Button type="submit" className="gap-2" disabled={isSaving}>
                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isSaving ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {allowCreateProyecto && (
        <ProyectoModal
          open={proyectoModalOpen}
          onClose={() => setProyectoModalOpen(false)}
          onSave={handleSaveProyecto}
        />
      )}

      {allowCreateEmpresa && (
        <EmpresaModal
          open={empresaModalOpen}
          onClose={() => setEmpresaModalOpen(false)}
          onSave={handleSaveEmpresa}
        />
      )}

      {allowCreateCategoria && (
        <CategoriaModal
          open={categoriaModalOpen}
          onClose={() => setCategoriaModalOpen(false)}
          onSave={handleSaveCategoria}
        />
      )}

      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={(openState) => {
          setConfirmDialogOpen(openState);
          if (!openState) {
            setArchivoAEliminar(null);
          }
        }}
        title="Eliminar archivo adjunto"
        description={
          archivoAEliminar !== null && archivosAdjuntos[archivoAEliminar]
            ? `Estas seguro de que deseas eliminar el archivo "${archivosAdjuntos[archivoAEliminar].nombre}"? Esta accion no se puede deshacer.`
            : 'Estas seguro de que deseas eliminar este archivo adjunto? Esta accion no se puede deshacer.'
        }
        onConfirm={() => {
          if (archivoAEliminar !== null) {
            const archivoEliminado = archivosAdjuntos[archivoAEliminar];
            if (archivoEliminado && selectedPreviewFile?.nombre === archivoEliminado.nombre) {
              setViewerOpen(false);
              clearLocalPreview();
            }

            const nuevosArchivos = archivosAdjuntos.filter((_, index) => index !== archivoAEliminar);
            setArchivosAdjuntos(nuevosArchivos);
            setArchivoAEliminar(null);
          }
        }}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />

      <DocumentoViewer
        open={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          clearLocalPreview();
        }}
        archivo={selectedPreviewFile}
      />
    </>
  );
}
