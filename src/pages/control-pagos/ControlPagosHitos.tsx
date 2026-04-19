import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DocumentoViewer } from "@/components/DocumentoViewer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Proyecto } from "@/data/mockData";
import { formatDateOnly } from "@/lib/date-format";
import { formatNumericInput, parseNumericInput } from "@/lib/numeric-input";
import { toast } from "@/hooks/use-toast";
import {
  postgresApi,
  type DocumentoHitoRecord,
  type HitoPagoProyecto,
  type HitoPagoProyectoCreateInput,
  type MonedaProyecto,
} from "@/services/postgresApi";
import { FileText, Paperclip, Pencil, Search, Trash2 } from "lucide-react";

interface HitoFormState {
  proyectoId: string;
  montoHito: string;
  moneda: MonedaProyecto;
  fechaCompromiso: string;
  fechaPago: string;
  facturado: boolean;
  pagado: boolean;
  observacion: string;
  archivos: Array<File | null>;
}

const initialForm: HitoFormState = {
  proyectoId: "",
  montoHito: "",
  moneda: "CLP",
  fechaCompromiso: "",
  fechaPago: "",
  facturado: false,
  pagado: false,
  observacion: "",
  archivos: [null],
};

function normalizeObservacion(value: string) {
  return value.toLocaleUpperCase("es-CL");
}

function toDateInputValue(value?: string) {
  if (!value) return "";

  const normalized = value.trim();
  if (!normalized) return "";

  const isoDate = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate?.[1]) return isoDate[1];

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().split("T")[0];
}

function formatAmount(value: number, moneda: MonedaProyecto) {
  if (moneda === "UF") {
    return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)} UF`;
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: moneda,
    minimumFractionDigits: moneda === "CLP" ? 0 : 2,
    maximumFractionDigits: moneda === "CLP" ? 0 : 2,
  }).format(value);
}

function statusTag(flag: boolean) {
  return flag ? "SI" : "NO";
}

function sortProjects(items: Proyecto[]) {
  return [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

function sortHitos(items: HitoPagoProyecto[]) {
  return [...items].sort((a, b) => {
    if (String(a.proyectoId) !== String(b.proyectoId)) {
      return String(a.proyectoId).localeCompare(String(b.proyectoId));
    }

    return a.nroHito - b.nroHito;
  });
}

export default function ControlPagosHitos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [hitosPagoProyecto, setHitosPagoProyecto] = useState<HitoPagoProyecto[]>([]);
  const [documentosHito, setDocumentosHito] = useState<DocumentoHitoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHito, setEditingHito] = useState<HitoPagoProyecto | undefined>();
  const [form, setForm] = useState<HitoFormState>(initialForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [documentosModalOpen, setDocumentosModalOpen] = useState(false);
  const [selectedHitoForDocumentos, setSelectedHitoForDocumentos] = useState<HitoPagoProyecto | undefined>();
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedArchivo, setSelectedArchivo] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const saveLockRef = useRef(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [bootstrap, hitos, documentos] = await Promise.all([
        postgresApi.getBootstrap(),
        postgresApi.getHitosPagoProyecto(),
        postgresApi.getDocumentosHito(),
      ]);

      setProyectos(sortProjects(bootstrap.proyectos));
      setHitosPagoProyecto(sortHitos(hitos));
      setDocumentosHito(documentos);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar Control de Pagos");
      setProyectos([]);
      setHitosPagoProyecto([]);
      setDocumentosHito([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!error) {
      return;
    }

    toast({
      title: "Error",
      description: error,
      variant: "destructive",
    });
  }, [error]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const projectMap = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo?: string }>();

    proyectos.forEach((project) => {
      map.set(String(project.id), { nombre: project.nombre, codigo: project.codigoProyecto });
    });

    return map;
  }, [proyectos]);

  const projectByCode = useMemo(() => {
    const map = new Map<string, { nombre: string; id: string }>();

    proyectos.forEach((project) => {
      const code = (project.codigoProyecto || "").trim().toUpperCase();
      if (code) {
        map.set(code, { nombre: project.nombre, id: String(project.id) });
      }
    });

    return map;
  }, [proyectos]);

  const resolveProjectName = useCallback((item: Pick<HitoPagoProyecto, "proyectoId" | "codigoProyecto">) => {
    const byId = projectMap.get(String(item.proyectoId))?.nombre;
    if (byId) return byId;

    const code = (item.codigoProyecto || item.proyectoId || "").trim().toUpperCase();
    const byCode = code ? projectByCode.get(code)?.nombre : undefined;
    if (byCode) return byCode;

    return item.codigoProyecto || "-";
  }, [projectByCode, projectMap]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...hitosPagoProyecto]
      .filter((item) => {
        if (projectFilter !== "all" && String(item.proyectoId) !== String(projectFilter)) return false;
        if (!query) return true;

        const projectName = resolveProjectName(item);
        return (
          String(item.nroHito).includes(query)
          || (item.codigoProyecto || "").toLowerCase().includes(query)
          || projectName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => {
        const projectComparison = resolveProjectName(a).localeCompare(resolveProjectName(b), "es", {
          sensitivity: "base",
        });

        if (projectComparison !== 0) {
          return projectComparison;
        }

        return a.nroHito - b.nroHito;
      });
  }, [hitosPagoProyecto, projectFilter, resolveProjectName, search]);

  const documentosByHito = useMemo(() => {
    const map = new Map<string, DocumentoHitoRecord[]>();

    documentosHito.forEach((item) => {
      const key = String(item.hitoPagoId);
      const current = map.get(key) || [];
      current.push(item);
      map.set(key, current);
    });

    map.forEach((items) => {
      items.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    });

    return map;
  }, [documentosHito]);

  const selectedHitoDocumentos = useMemo(() => {
    if (!selectedHitoForDocumentos) return [];
    return documentosByHito.get(String(selectedHitoForDocumentos.id)) || [];
  }, [documentosByHito, selectedHitoForDocumentos]);

  const editingHitoDocumentos = useMemo(() => {
    if (!editingHito) return [];
    return documentosByHito.get(String(editingHito.id)) || [];
  }, [documentosByHito, editingHito]);

  const clearLocalPreview = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
  };

  const resetForm = () => {
    clearLocalPreview();
    setForm(initialForm);
    setEditingHito(undefined);
    setSelectedArchivo(undefined);
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (item: HitoPagoProyecto) => {
    clearLocalPreview();
    setEditingHito(item);
    setForm({
      proyectoId: String(item.proyectoId),
      montoHito: formatNumericInput(String(item.montoHito), { allowDecimal: true, maxDecimals: 2 }),
      moneda: item.moneda,
      fechaCompromiso: toDateInputValue(item.fechaCompromiso),
      fechaPago: toDateInputValue(item.fechaPago),
      facturado: item.facturado,
      pagado: item.pagado,
      observacion: normalizeObservacion(item.observacion || ""),
      archivos: [null],
    });
    setModalOpen(true);
  };

  const openLocalFilePreview = (file?: File | null) => {
    if (!file) return;

    clearLocalPreview();
    const previewUrl = URL.createObjectURL(file);
    setLocalPreviewUrl(previewUrl);
    setSelectedArchivo({
      nombre: file.name,
      url: previewUrl,
      tipo: file.type || "application/octet-stream",
    });
    setViewerOpen(true);
  };

  const openDocumentosModal = (item: HitoPagoProyecto) => {
    setSelectedHitoForDocumentos(item);
    setDocumentosModalOpen(true);
  };

  const handleDeleteDocumentoHito = async (documentoId: string) => {
    try {
      await postgresApi.deleteDocumentoHito(documentoId);
      setDocumentosHito((prev) => prev.filter((item) => item.id !== documentoId));
      toast({
        title: "Documento eliminado",
        description: "Se elimino correctamente.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el documento",
        variant: "destructive",
      });
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveLockRef.current) return;

    saveLockRef.current = true;
    setSaving(true);

    try {
      const project = proyectos.find((item) => String(item.id) === String(form.proyectoId));

      if (!project) {
        toast({
          title: "Proyecto invalido",
          description: "Debes seleccionar un proyecto valido.",
          variant: "destructive",
        });
        return;
      }

      const montoHitoValue = parseNumericInput(form.montoHito, { allowDecimal: true, maxDecimals: 2 });
      if (!Number.isFinite(montoHitoValue) || montoHitoValue <= 0) {
        toast({
          title: "Monto invalido",
          description: "El monto del hito debe ser mayor a 0.",
          variant: "destructive",
        });
        return;
      }

      const payload: HitoPagoProyectoCreateInput = {
        proyectoId: form.proyectoId,
        montoHito: montoHitoValue,
        moneda: form.moneda,
        fechaCompromiso: form.fechaCompromiso,
        fechaPago: form.fechaPago || undefined,
        facturado: form.facturado,
        pagado: form.pagado,
        observacion: normalizeObservacion(form.observacion),
      };

      let targetHito: HitoPagoProyecto;
      if (editingHito) {
        const updated = await postgresApi.updateHitoPagoProyecto(editingHito.id, payload);
        setHitosPagoProyecto((prev) =>
          sortHitos(prev.map((item) => (item.id === editingHito.id ? updated : item)))
        );
        targetHito = updated;
      } else {
        const created = await postgresApi.createHitoPagoProyecto(payload);
        setHitosPagoProyecto((prev) => sortHitos([...prev, created]));
        targetHito = created;
      }

      const filesToUpload = form.archivos.filter((archivo): archivo is File => Boolean(archivo));
      const uploadResults = await Promise.allSettled(
        filesToUpload.map((archivo) =>
          postgresApi.createDocumentoHito({
            hitoPagoId: targetHito.id,
            archivo,
          }),
        ),
      );

      const uploadedDocuments = uploadResults
        .filter((result): result is PromiseFulfilledResult<DocumentoHitoRecord> => result.status === "fulfilled")
        .map((result) => result.value);

      if (uploadedDocuments.length > 0) {
        setDocumentosHito((prev) => [...uploadedDocuments, ...prev]);
      }

      const failedFilesCount = uploadResults.length - uploadedDocuments.length;
      if (failedFilesCount > 0) {
        toast({
          title: editingHito ? "Hito actualizado con advertencia" : "Hito creado con advertencia",
          description: `Archivos guardados: ${uploadedDocuments.length}/${filesToUpload.length}.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: editingHito ? "Hito actualizado" : "Hito creado",
          description:
            filesToUpload.length > 0
              ? `Se guardo correctamente y se subieron ${uploadedDocuments.length} archivo(s).`
              : project.codigoProyecto
                ? `Se guardo correctamente para ${project.codigoProyecto}.`
                : "Se guardo correctamente.",
          variant: "success",
        });
      }

      setModalOpen(false);
      resetForm();
    } catch (saveError) {
      toast({
        title: "Error",
        description: saveError instanceof Error ? saveError.message : "No se pudo guardar el hito",
        variant: "destructive",
      });
    } finally {
      saveLockRef.current = false;
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;

    try {
      await postgresApi.deleteHitoPagoProyecto(deleteId);
      setHitosPagoProyecto((prev) => prev.filter((item) => item.id !== deleteId));
      setDocumentosHito((prev) => prev.filter((item) => String(item.hitoPagoId) !== String(deleteId)));
      toast({
        title: "Hito eliminado",
        description: "Se elimino correctamente.",
        variant: "success",
      });
    } catch (deleteError) {
      toast({
        title: "Error",
        description: deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el hito",
        variant: "destructive",
      });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Control de Pagos - Hitos"
        subtitle={loading ? "Cargando hitos..." : `${filtered.length} hitos`}
        action={{ label: "Nuevo Hito", onClick: openCreateModal }}
      />

      <div className="mb-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        Los hitos se guardan en PostgreSQL y sus archivos asociados ahora se almacenan en Google Storage.
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Buscar por codigo, proyecto o nro hito..."
          />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Filtrar por proyecto" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {proyectos.map((project) => (
              <SelectItem key={project.id} value={String(project.id)}>
                {project.codigoProyecto ? `${project.codigoProyecto} - ${project.nombre}` : project.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>PROYECTO</TableHead>
              <TableHead>NRO HITO</TableHead>
              <TableHead>MONTO HITO</TableHead>
              <TableHead>MONEDA</TableHead>
              <TableHead>FECHA COMPROMISO</TableHead>
              <TableHead>FECHA PAGO</TableHead>
              <TableHead>FACTURADO</TableHead>
              <TableHead>PAGADO</TableHead>
              <TableHead className="text-center">DOCUMENTOS</TableHead>
              <TableHead className="text-center">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              const documentos = documentosByHito.get(String(item.id)) || [];

              return (
                <TableRow key={item.id}>
                  <TableCell>{resolveProjectName(item)}</TableCell>
                  <TableCell>{item.nroHito}</TableCell>
                  <TableCell>{formatAmount(item.montoHito, item.moneda)}</TableCell>
                  <TableCell>{item.moneda}</TableCell>
                  <TableCell>{formatDateOnly(item.fechaCompromiso)}</TableCell>
                  <TableCell>{formatDateOnly(item.fechaPago)}</TableCell>
                  <TableCell>{statusTag(item.facturado)}</TableCell>
                  <TableCell>{statusTag(item.pagado)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      {documentos.length > 0 ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDocumentosModal(item)}
                            title={`Ver ${documentos.length} documento(s)`}
                          >
                            <FileText size={16} className="text-primary" />
                          </Button>
                          <span className="text-xs text-muted-foreground">{documentos.length}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditModal(item)}>
                        <Pencil size={16} />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(item.id)}>
                        <Trash2 size={16} className="text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                  No hay hitos para mostrar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle>{editingHito ? "Editar Hito" : "Nuevo Hito"}</DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="proyecto">Proyecto *</Label>
              <Select
                value={form.proyectoId || undefined}
                onValueChange={(value) => setForm((prev) => ({ ...prev, proyectoId: value }))}
                required
              >
                <SelectTrigger id="proyecto" className="bg-card">
                  <SelectValue placeholder="Seleccionar proyecto" />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  {proyectos.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.codigoProyecto ? `${project.codigoProyecto} - ${project.nombre}` : project.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="montoHito">Monto Hito *</Label>
                <Input
                  id="montoHito"
                  type="text"
                  inputMode="decimal"
                  value={form.montoHito}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      montoHito: formatNumericInput(e.target.value, { allowDecimal: true, maxDecimals: 2 }),
                    }))
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="moneda">Moneda *</Label>
                <Select
                  value={form.moneda}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, moneda: value as MonedaProyecto }))}
                >
                  <SelectTrigger id="moneda" className="bg-card">
                    <SelectValue placeholder="Seleccionar moneda" />
                  </SelectTrigger>
                  <SelectContent className="bg-card">
                    <SelectItem value="CLP">CLP</SelectItem>
                    <SelectItem value="UF">UF</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fechaCompromiso">Fecha Compromiso</Label>
                <Input
                  id="fechaCompromiso"
                  type="date"
                  value={form.fechaCompromiso}
                  onChange={(e) => setForm((prev) => ({ ...prev, fechaCompromiso: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fechaPago">Fecha Pago</Label>
                <Input
                  id="fechaPago"
                  type="date"
                  value={form.fechaPago}
                  onChange={(e) => setForm((prev) => ({ ...prev, fechaPago: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox
                  id="facturado"
                  checked={form.facturado}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, facturado: Boolean(checked) }))}
                />
                <Label htmlFor="facturado" className="cursor-pointer">Facturado</Label>
              </div>

              <div className="flex items-center gap-2 rounded-md border p-3">
                <Checkbox
                  id="pagado"
                  checked={form.pagado}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, pagado: Boolean(checked) }))}
                />
                <Label htmlFor="pagado" className="cursor-pointer">Pagado</Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacion">Observacion</Label>
              <Input
                id="observacion"
                value={form.observacion}
                onChange={(e) => setForm((prev) => ({ ...prev, observacion: normalizeObservacion(e.target.value) }))}
              />
            </div>

            <div className="space-y-3">
              <Label>{editingHito ? "Agregar documentos al hito (opcional)" : "Archivos (opcional)"}</Label>

              {editingHito && (
                <div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">Documentos actuales asociados al hito:</p>
                  {editingHitoDocumentos.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No hay documentos asociados.</p>
                  ) : (
                    editingHitoDocumentos.map((documento) => (
                      <div
                        key={`doc-edit-${documento.id}`}
                        className="flex items-center justify-between gap-2 rounded-md border p-2"
                      >
                        <button
                          type="button"
                          className="flex min-w-0 items-center gap-2 text-left text-sm text-primary hover:underline"
                          onClick={() => {
                            if (!documento.archivoAdjunto) return;
                            setSelectedArchivo(documento.archivoAdjunto);
                            setViewerOpen(true);
                          }}
                        >
                          <FileText size={14} className="shrink-0" />
                          <span className="truncate">
                            {documento.archivoAdjunto?.nombre || `Documento ${documento.id}`}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => void handleDeleteDocumentoHito(documento.id)}
                        >
                          Quitar
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )}

              {form.archivos.map((archivo, index) => (
                <div key={`archivo-slot-${index}`} className="space-y-2">
                  {form.archivos.length > 1 && (
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          setForm((prev) => {
                            clearLocalPreview();
                            const remaining = prev.archivos.filter((_, itemIndex) => itemIndex !== index);
                            return {
                              ...prev,
                              archivos: remaining.length > 0 ? remaining : [null],
                            };
                          })
                        }
                      >
                        Quitar
                      </Button>
                    </div>
                  )}

                  <input
                    id={`archivosHito-${index}`}
                    type="file"
                    className="hidden"
                    aria-label={form.archivos.length > 1 ? `Seleccionar archivo ${index + 1}` : "Seleccionar archivo"}
                    onChange={(e) => {
                      const selectedFile = e.target.files?.[0] || null;
                      clearLocalPreview();
                      setSelectedArchivo(undefined);
                      setForm((prev) => {
                        const updated = [...prev.archivos];
                        updated[index] = selectedFile;
                        return { ...prev, archivos: updated };
                      });
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      title={form.archivos.length > 1 ? `Adjuntar archivo ${index + 1}` : "Adjuntar archivo"}
                      onClick={() => (document.getElementById(`archivosHito-${index}`) as HTMLInputElement | null)?.click()}
                    >
                      <Paperclip size={18} />
                    </Button>
                  </div>
                  {archivo ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div
                        className="flex cursor-pointer items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
                        role="button"
                        tabIndex={0}
                        onClick={() => openLocalFilePreview(archivo)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openLocalFilePreview(archivo);
                          }
                        }}
                      >
                        <span className="truncate">{archivo.name}</span>
                        <button
                          type="button"
                          className="leading-none text-muted-foreground hover:text-foreground"
                          aria-label={form.archivos.length > 1 ? `Quitar archivo ${index + 1}` : "Quitar archivo"}
                          onClick={(e) => {
                            e.stopPropagation();
                            clearLocalPreview();
                            setSelectedArchivo(undefined);
                            setForm((prev) => {
                              const updated = [...prev.archivos];
                              updated[index] = null;
                              return { ...prev, archivos: updated };
                            });
                            const input = document.getElementById(`archivosHito-${index}`) as HTMLInputElement | null;
                            if (input) input.value = "";
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Ningun archivo seleccionado.</p>
                  )}
                </div>
              ))}

              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setForm((prev) => ({ ...prev, archivos: [...prev.archivos, null] }))}
              >
                <Paperclip size={16} />
                Agregar otro archivo
              </Button>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={documentosModalOpen}
        onOpenChange={(open) => {
          setDocumentosModalOpen(open);
          if (!open) setSelectedHitoForDocumentos(undefined);
        }}
      >
        <DialogContent className="sm:max-w-2xl bg-card">
          <DialogHeader>
            <DialogTitle>
              Documentos del hito {selectedHitoForDocumentos?.nroHito ?? "-"}
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {selectedHitoDocumentos.length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-muted-foreground">
                No hay documentos asociados para este hito.
              </div>
            ) : (
              selectedHitoDocumentos.map((documento) => (
                <button
                  key={documento.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors hover:bg-muted/30"
                  onClick={() => {
                    if (!documento.archivoAdjunto) return;
                    setSelectedArchivo(documento.archivoAdjunto);
                    setViewerOpen(true);
                  }}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileText size={16} className="shrink-0 text-primary" />
                    <span className="truncate">
                      {documento.archivoAdjunto?.nombre || `Documento ${documento.id}`}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDateOnly(documento.createdAt)}
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <DocumentoViewer
        open={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setSelectedArchivo(undefined);
          clearLocalPreview();
        }}
        archivo={selectedArchivo}
      />

      <ConfirmDialog
        open={Boolean(deleteId)}
        onOpenChange={(open) => {
          if (!open) setDeleteId(null);
        }}
        title="Eliminar hito"
        description="¿Seguro que deseas eliminar este hito? Esta accion no se puede deshacer."
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}
