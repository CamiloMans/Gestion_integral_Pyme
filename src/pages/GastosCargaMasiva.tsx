import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Eye, FileUp, Loader2, Save, Upload, XCircle } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { DocumentoViewer } from '@/components/DocumentoViewer';
import { toast } from '@/hooks/use-toast';
import { formatCurrency, type Gasto } from '@/data/mockData';
import { formatNumericInput, parseNumericInput } from '@/lib/numeric-input';
import {
  isExtractableDocument,
  resolveEmpresaMatch,
  resolveTipoDocumentoId,
  validateGastoDraft,
} from '@/lib/gasto-document';
import { postgresApi, type BootstrapResponse, type GastoDocumentExtractionResult } from '@/services/postgresApi';

type BulkRowStatus = 'pendiente' | 'extrayendo' | 'listo' | 'error' | 'validado' | 'guardando' | 'guardado';
type EmpresaMatchInfo = ReturnType<typeof resolveEmpresaMatch>;

type BulkGastoDraft = {
  fecha: string;
  categoria: string;
  empresaId: string;
  proyectoId: string;
  tipoDocumento: string;
  numeroDocumento: string;
  montoTotal: string;
  montoNeto: string;
  iva: string;
  detalle: string;
  comentarioTipoDocumento: string;
};

type BulkGastoRow = {
  id: string;
  file: File;
  draft: BulkGastoDraft;
  status: BulkRowStatus;
  selected: boolean;
  validationErrors: string[];
  extracted?: GastoDocumentExtractionResult;
  empresaMatchInfo?: EmpresaMatchInfo;
  error?: string;
  savedGastoId?: string;
};

type BulkApplyDraft = Partial<Pick<BulkGastoDraft, 'categoria' | 'empresaId' | 'proyectoId' | 'tipoDocumento'>>;

const MAX_EXTRACTION_CONCURRENCY = 2;

const emptyDraft = (): BulkGastoDraft => ({
  fecha: '',
  categoria: '',
  empresaId: '',
  proyectoId: '',
  tipoDocumento: '',
  numeroDocumento: '',
  montoTotal: '',
  montoNeto: '',
  iva: '',
  detalle: '',
  comentarioTipoDocumento: '',
});

function formatNumberValue(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? formatNumericInput(String(value), { allowDecimal: false })
    : '';
}

function buildInitialRow(file: File): BulkGastoRow {
  const unsupported = !isExtractableDocument(file);

  return {
    id: `${Date.now()}-${crypto.randomUUID()}`,
    file,
    draft: emptyDraft(),
    status: unsupported ? 'error' : 'pendiente',
    selected: !unsupported,
    validationErrors: unsupported ? ['Archivo no soportado'] : ['Extraccion pendiente'],
    error: unsupported ? 'Solo se pueden escanear imagenes, PDF o XML.' : undefined,
  };
}

function statusBadge(row: BulkGastoRow) {
  if (row.status === 'guardado') return <Badge className="bg-emerald-600">Guardado</Badge>;
  if (row.status === 'guardando') return <Badge variant="secondary">Guardando</Badge>;
  if (row.status === 'validado') return <Badge className="bg-blue-600">Validado</Badge>;
  if (row.status === 'listo') return <Badge variant="outline">Listo</Badge>;
  if (row.status === 'extrayendo') return <Badge variant="secondary">Extrayendo</Badge>;
  if (row.status === 'error') return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="outline">Pendiente</Badge>;
}

export default function GastosCargaMasiva() {
  const navigate = useNavigate();
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<BulkGastoRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [bulkApply, setBulkApply] = useState<BulkApplyDraft>({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const previewUrlRef = useRef<string | null>(null);

  const empresas = useMemo(() => bootstrap?.empresas || [], [bootstrap]);
  const proyectos = useMemo(() => bootstrap?.proyectos || [], [bootstrap]);
  const categorias = useMemo(() => bootstrap?.categorias || [], [bootstrap]);
  const tiposDocumento = useMemo(() => bootstrap?.tiposDocumento || [], [bootstrap]);

  const sortedEmpresas = useMemo(() => [...empresas].sort((a, b) => a.razonSocial.localeCompare(b.razonSocial, 'es')), [empresas]);
  const sortedProyectos = useMemo(() => [...proyectos].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [proyectos]);
  const sortedCategorias = useMemo(() => [...categorias].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [categorias]);
  const sortedTiposDocumento = useMemo(() => [...tiposDocumento].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [tiposDocumento]);

  const validatedRows = rows.filter((row) => row.status === 'validado');
  const selectedRowsCount = rows.filter((row) => row.selected && row.status !== 'guardado').length;
  const extractionInProgress = rows.some((row) => row.status === 'extrayendo' || row.status === 'pendiente');

  const validateRow = useCallback((draft: BulkGastoDraft) => {
    return validateGastoDraft({
      fecha: draft.fecha,
      categoria: draft.categoria,
      empresaId: draft.empresaId,
      tipoDocumento: draft.tipoDocumento,
      numeroDocumento: draft.numeroDocumento,
      montoTotal: parseNumericInput(draft.montoTotal, { allowDecimal: false }),
      comentarioTipoDocumento: draft.comentarioTipoDocumento,
    }, sortedTiposDocumento);
  }, [sortedTiposDocumento]);

  const setRow = useCallback((id: string, updater: (row: BulkGastoRow) => BulkGastoRow) => {
    setRows((current) => current.map((row) => (row.id === id ? updater(row) : row)));
  }, []);

  const buildDraftFromExtraction = useCallback((extracted: GastoDocumentExtractionResult) => {
    const tipoDocumento = resolveTipoDocumentoId(sortedTiposDocumento, extracted.tipoDocumento);
    const empresaMatchInfo = resolveEmpresaMatch(empresas, extracted);

    const draft: BulkGastoDraft = {
      fecha: extracted.fecha && /^\d{4}-\d{2}-\d{2}$/.test(extracted.fecha) ? extracted.fecha : '',
      categoria: '',
      empresaId: empresaMatchInfo?.empresaId || '',
      proyectoId: '',
      tipoDocumento,
      numeroDocumento: extracted.numeroDocumento?.replace(/\.0$/, '') || '',
      montoTotal: formatNumberValue(extracted.montoTotal),
      montoNeto: formatNumberValue(extracted.montoNeto),
      iva: formatNumberValue(extracted.iva),
      detalle: extracted.detalle?.toUpperCase() || '',
      comentarioTipoDocumento: '',
    };

    return { draft, empresaMatchInfo };
  }, [empresas, sortedTiposDocumento]);

  const runExtractionQueue = useCallback(async (items: BulkGastoRow[]) => {
    let cursor = 0;

    const worker = async () => {
      while (cursor < items.length) {
        const row = items[cursor];
        cursor += 1;

        setRow(row.id, (current) => ({ ...current, status: 'extrayendo', error: undefined }));

        try {
          const extracted = await postgresApi.extractGastoDocument(row.file);
          const { draft, empresaMatchInfo } = buildDraftFromExtraction(extracted);
          const validationErrors = validateRow(draft);

          setRow(row.id, (current) => ({
            ...current,
            draft,
            extracted,
            empresaMatchInfo,
            status: validationErrors.length === 0 ? 'validado' : 'listo',
            validationErrors,
          }));
        } catch (error) {
          setRow(row.id, (current) => ({
            ...current,
            status: 'error',
            error: error instanceof Error ? error.message : 'Error desconocido al extraer datos.',
            validationErrors: ['Extraccion fallida'],
          }));
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(MAX_EXTRACTION_CONCURRENCY, items.length) }, worker));
  }, [buildDraftFromExtraction, setRow, validateRow]);

  useEffect(() => {
    let mounted = true;

    postgresApi.getBootstrap()
      .then((response) => {
        if (mounted) setBootstrap(response);
      })
      .catch((error) => {
        toast({
          title: 'No se pudo cargar configuracion',
          description: error instanceof Error ? error.message : 'Error al cargar datos base.',
          variant: 'destructive',
        });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  const handleFiles = useCallback((files: File[]) => {
    const nextRows = files.map(buildInitialRow);
    setRows((current) => [...current, ...nextRows]);

    const extractableRows = nextRows.filter((row) => row.status === 'pendiente');
    if (extractableRows.length > 0) {
      void runExtractionQueue(extractableRows);
    }

    const rejectedCount = nextRows.length - extractableRows.length;
    if (rejectedCount > 0) {
      toast({
        title: 'Archivos rechazados',
        description: `${rejectedCount} archivo(s) no son imagen, PDF o XML.`,
        variant: 'destructive',
      });
    }
  }, [runExtractionQueue]);

  const updateDraftField = useCallback((id: string, field: keyof BulkGastoDraft, value: string) => {
    setRow(id, (row) => {
      if (row.status === 'guardado' || row.status === 'guardando') return row;

      const nextDraft = { ...row.draft, [field]: value };
      const validationErrors = validateRow(nextDraft);
      const nextStatus: BulkRowStatus = row.status === 'error'
        ? 'error'
        : row.status === 'validado' && validationErrors.length > 0
          ? 'listo'
          : row.status;

      return {
        ...row,
        draft: nextDraft,
        empresaMatchInfo: field === 'empresaId' ? null : row.empresaMatchInfo,
        status: nextStatus,
        validationErrors,
      };
    });
  }, [setRow, validateRow]);

  const toggleValidated = useCallback((id: string, checked: boolean) => {
    setRow(id, (row) => {
      if (row.status === 'guardado' || row.status === 'guardando') return row;

      const validationErrors = validateRow(row.draft);
      if (checked && validationErrors.length > 0) {
        toast({
          title: 'Fila incompleta',
          description: `Completa: ${validationErrors.join(', ')}.`,
          variant: 'destructive',
        });
        return { ...row, validationErrors, status: row.status === 'error' ? 'error' : 'listo' };
      }

      return {
        ...row,
        validationErrors,
        status: checked ? 'validado' : 'listo',
      };
    });
  }, [setRow, validateRow]);

  const applyBulkValues = useCallback(() => {
    const hasValues = Object.values(bulkApply).some(Boolean);
    if (!hasValues) return;

    setRows((current) => current.map((row) => {
      const shouldApply = selectedRowsCount > 0
        ? row.selected && row.status !== 'guardado'
        : row.status !== 'guardado' && row.status !== 'guardando';

      if (!shouldApply) return row;

      const draft = {
        ...row.draft,
        ...(bulkApply.categoria ? { categoria: bulkApply.categoria } : {}),
        ...(bulkApply.empresaId ? { empresaId: bulkApply.empresaId } : {}),
        ...(bulkApply.proyectoId ? { proyectoId: bulkApply.proyectoId } : {}),
        ...(bulkApply.tipoDocumento ? { tipoDocumento: bulkApply.tipoDocumento } : {}),
      };
      const validationErrors = validateRow(draft);

      return {
        ...row,
        draft,
        empresaMatchInfo: bulkApply.empresaId ? null : row.empresaMatchInfo,
        validationErrors,
        status: row.status === 'validado' && validationErrors.length > 0 ? 'listo' : row.status,
      };
    }));
  }, [bulkApply, selectedRowsCount, validateRow]);

  const openPreview = useCallback((row: BulkGastoRow) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);

    const previewUrl = URL.createObjectURL(row.file);
    previewUrlRef.current = previewUrl;
    setSelectedPreviewFile({
      nombre: row.file.name,
      url: previewUrl,
      tipo: row.file.type || 'application/octet-stream',
    });
    setViewerOpen(true);
  }, []);

  const buildGastoPayload = useCallback((row: BulkGastoRow): Omit<Gasto, 'id'> => {
    const montoTotal = parseNumericInput(row.draft.montoTotal, { allowDecimal: false });
    const montoNeto = parseNumericInput(row.draft.montoNeto, { allowDecimal: false });
    const iva = parseNumericInput(row.draft.iva, { allowDecimal: false });

    return {
      fecha: row.draft.fecha,
      categoria: row.draft.categoria,
      empresaId: row.draft.empresaId,
      proyectoId: row.draft.proyectoId || undefined,
      tipoDocumento: row.draft.tipoDocumento,
      numeroDocumento: row.draft.numeroDocumento.trim().toUpperCase(),
      monto: Number.isFinite(montoTotal) ? montoTotal : 0,
      montoNeto: Number.isFinite(montoNeto) ? montoNeto : undefined,
      iva: Number.isFinite(iva) ? iva : undefined,
      montoTotal: Number.isFinite(montoTotal) ? montoTotal : 0,
      detalle: row.draft.detalle.trim().toUpperCase() || undefined,
      comentarioTipoDocumento: row.draft.comentarioTipoDocumento.trim().toUpperCase() || undefined,
      archivosAdjuntos: [{
        nombre: row.file.name,
        url: '',
        tipo: row.file.type || 'application/octet-stream',
        file: row.file,
      }],
    };
  }, []);

  const saveValidatedRows = useCallback(async () => {
    const rowsToSave = rows.filter((row) => row.status === 'validado');
    if (rowsToSave.length === 0) return;

    setSaving(true);

    for (const row of rowsToSave) {
      setRow(row.id, (current) => ({ ...current, status: 'guardando' }));

      try {
        const created = await postgresApi.createGasto(buildGastoPayload(row));
        setRow(row.id, (current) => ({
          ...current,
          status: 'guardado',
          savedGastoId: created.id,
          selected: false,
          validationErrors: [],
        }));
      } catch (error) {
        setRow(row.id, (current) => ({
          ...current,
          status: 'error',
          error: error instanceof Error ? error.message : 'Error al guardar gasto.',
        }));
      }
    }

    setSaving(false);
    toast({
      title: 'Guardado masivo finalizado',
      description: 'Las filas validadas fueron procesadas.',
      variant: 'success',
    });
  }, [buildGastoPayload, rows, setRow]);

  return (
    <Layout>
      <PageHeader
        title="Carga masiva"
        subtitle={loading ? 'Cargando configuracion...' : `${rows.length} documento(s), ${validatedRows.length} validado(s)`}
        actions={[
          { label: 'Volver', onClick: () => navigate('/gastos'), icon: <ArrowLeft size={18} />, variant: 'outline' },
          { label: 'Guardar validados', onClick: saveValidatedRows, icon: saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} /> },
        ]}
      />

      <div className="mb-4 grid gap-3 border border-border bg-card p-3 shadow-sm sm:grid-cols-[minmax(220px,1fr)_auto]">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <Label className="text-xs">Categoria</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={bulkApply.categoria || ''} onChange={(e) => setBulkApply((prev) => ({ ...prev, categoria: e.target.value }))}>
              <option value="">Sin cambio</option>
              {sortedCategorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <Label className="text-xs">Empresa</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={bulkApply.empresaId || ''} onChange={(e) => setBulkApply((prev) => ({ ...prev, empresaId: e.target.value }))}>
              <option value="">Sin cambio</option>
              {sortedEmpresas.map((item) => <option key={item.id} value={item.id}>{item.razonSocial}</option>)}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <Label className="text-xs">Proyecto</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={bulkApply.proyectoId || ''} onChange={(e) => setBulkApply((prev) => ({ ...prev, proyectoId: e.target.value }))}>
              <option value="">Sin cambio</option>
              {sortedProyectos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </div>
          <div className="min-w-[180px] flex-1">
            <Label className="text-xs">Tipo documento</Label>
            <select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={bulkApply.tipoDocumento || ''} onChange={(e) => setBulkApply((prev) => ({ ...prev, tipoDocumento: e.target.value }))}>
              <option value="">Sin cambio</option>
              {sortedTiposDocumento.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </div>
          <Button type="button" variant="outline" onClick={applyBulkValues}>
            Aplicar a {selectedRowsCount > 0 ? `${selectedRowsCount} seleccionada(s)` : 'filas editables'}
          </Button>
        </div>

        <div className="flex items-end gap-2">
          <Input
            id="bulk-gasto-files"
            type="file"
            multiple
            className="hidden"
            accept="image/*,application/pdf,text/xml,application/xml,.xml"
            onChange={(event) => {
              handleFiles(Array.from(event.target.files || []));
              event.target.value = '';
            }}
          />
          <Button type="button" className="gap-2" onClick={() => document.getElementById('bulk-gasto-files')?.click()} disabled={loading}>
            <Upload size={18} />
            Seleccionar documentos
          </Button>
          <Button type="button" className="gap-2" onClick={saveValidatedRows} disabled={saving || validatedRows.length === 0}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Guardar validados
          </Button>
        </div>
      </div>

      <div className="border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[44px]"></TableHead>
                <TableHead className="min-w-[220px]">Archivo</TableHead>
                <TableHead className="min-w-[150px]">Fecha</TableHead>
                <TableHead className="min-w-[190px]">Categoria</TableHead>
                <TableHead className="min-w-[240px]">Empresa</TableHead>
                <TableHead className="min-w-[190px]">Proyecto</TableHead>
                <TableHead className="min-w-[190px]">Tipo</TableHead>
                <TableHead className="min-w-[140px]">Numero</TableHead>
                <TableHead className="min-w-[130px] text-right">Total</TableHead>
                <TableHead className="min-w-[120px] text-right">Neto</TableHead>
                <TableHead className="min-w-[120px] text-right">IVA</TableHead>
                <TableHead className="min-w-[240px]">Detalle</TableHead>
                <TableHead className="min-w-[180px]">Validacion</TableHead>
                <TableHead className="min-w-[130px]">Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="py-12 text-center text-muted-foreground">
                    <div className="flex flex-col items-center gap-3">
                      <FileUp size={34} />
                      <span>Selecciona imagenes, PDF o XML para comenzar.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : rows.map((row) => {
                const disabled = row.status === 'guardado' || row.status === 'guardando';
                const busy = row.status === 'extrayendo' || row.status === 'guardando';

                return (
                  <TableRow key={row.id} className={row.status === 'guardado' ? 'bg-emerald-50/60' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={row.selected}
                        disabled={disabled}
                        onCheckedChange={(checked) => setRow(row.id, (current) => ({ ...current, selected: Boolean(checked) }))}
                        aria-label={`Seleccionar ${row.file.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="ghost" size="icon" onClick={() => openPreview(row)} disabled={busy}>
                          <Eye size={16} />
                        </Button>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{row.file.name}</p>
                          <p className="text-xs text-muted-foreground">{Math.max(1, Math.round(row.file.size / 1024))} KB</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Input type="date" value={row.draft.fecha} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'fecha', e.target.value)} /></TableCell>
                    <TableCell>
                      <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={row.draft.categoria} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'categoria', e.target.value)}>
                        <option value="">Seleccionar</option>
                        {sortedCategorias.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>
                      <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={row.draft.empresaId} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'empresaId', e.target.value)}>
                        <option value="">Seleccionar</option>
                        {sortedEmpresas.map((item) => <option key={item.id} value={item.id}>{item.razonSocial}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>
                      <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={row.draft.proyectoId} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'proyectoId', e.target.value)}>
                        <option value="">Sin proyecto</option>
                        {sortedProyectos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                      </select>
                    </TableCell>
                    <TableCell>
                      <select className="h-10 w-full rounded-md border bg-background px-2 text-sm" value={row.draft.tipoDocumento} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'tipoDocumento', e.target.value)}>
                        <option value="">Seleccionar</option>
                        {sortedTiposDocumento.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                      </select>
                    </TableCell>
                    <TableCell><Input value={row.draft.numeroDocumento} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'numeroDocumento', e.target.value.toUpperCase())} /></TableCell>
                    <TableCell><Input className="text-right" inputMode="numeric" value={row.draft.montoTotal} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'montoTotal', formatNumericInput(e.target.value, { allowDecimal: false }))} /></TableCell>
                    <TableCell><Input className="text-right" inputMode="numeric" value={row.draft.montoNeto} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'montoNeto', formatNumericInput(e.target.value, { allowDecimal: false }))} /></TableCell>
                    <TableCell><Input className="text-right" inputMode="numeric" value={row.draft.iva} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'iva', formatNumericInput(e.target.value, { allowDecimal: false }))} /></TableCell>
                    <TableCell><Input value={row.draft.detalle} disabled={disabled} onChange={(e) => updateDraftField(row.id, 'detalle', e.target.value.toUpperCase())} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Checkbox
                          checked={row.status === 'validado' || row.status === 'guardado'}
                          disabled={disabled || row.status === 'extrayendo' || row.status === 'pendiente'}
                          onCheckedChange={(checked) => toggleValidated(row.id, Boolean(checked))}
                          aria-label={`Validar ${row.file.name}`}
                        />
                        <div className="min-w-0 text-xs">
                          {row.status === 'validado' || row.status === 'guardado' ? (
                            <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14} /> OK</span>
                          ) : row.validationErrors.length > 0 ? (
                            <span className="line-clamp-2 text-destructive">{row.validationErrors.join(', ')}</span>
                          ) : (
                            <span className="text-muted-foreground">Sin validar</span>
                          )}
                          {row.error && <p className="line-clamp-2 text-destructive">{row.error}</p>}
                          {row.empresaMatchInfo && (
                            <p
                              className={
                                row.empresaMatchInfo.score >= 0.9
                                  ? 'line-clamp-2 text-emerald-700'
                                  : 'line-clamp-2 text-amber-700'
                              }
                            >
                              Empresa {Math.round(row.empresaMatchInfo.score * 100)}% por {row.empresaMatchInfo.method}: {row.empresaMatchInfo.matchedName}
                            </p>
                          )}
                          {row.extracted?.warnings?.length ? <p className="line-clamp-2 text-amber-700">{row.extracted.warnings.join(' ')}</p> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {busy && <Loader2 size={16} className="animate-spin" />}
                        {row.status === 'error' && <XCircle size={16} className="text-destructive" />}
                        {statusBadge(row)}
                      </div>
                      {row.extracted && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Conf. {Math.round(row.extracted.confidence * 100)}% · {row.draft.montoTotal ? formatCurrency(parseNumericInput(row.draft.montoTotal, { allowDecimal: false }) || 0) : '-'}
                        </p>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <DocumentoViewer
        open={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setSelectedPreviewFile(undefined);
          if (previewUrlRef.current) {
            URL.revokeObjectURL(previewUrlRef.current);
            previewUrlRef.current = null;
          }
        }}
        archivo={selectedPreviewFile}
      />
    </Layout>
  );
}
