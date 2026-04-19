import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DocumentoViewer } from "@/components/DocumentoViewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Proyecto } from "@/data/mockData";
import { toast } from "@/hooks/use-toast";
import { formatDateOnly } from "@/lib/date-format";
import {
  postgresApi,
  type DocumentoProyectoRecord,
  type DocumentoProyectoRecordCreateInput,
  type TipoDocumentoProyectoOption,
} from "@/services/postgresApi";
import { FileText, Paperclip, Pencil, Search, Trash2 } from "lucide-react";

interface DocumentoFormState {
  proyectoId: string;
  tipoDocumentoProyectoId: string;
  fechaDocumento: string;
  nroReferencia: string;
  observacion: string;
  archivo: File | null;
}

const initialForm: DocumentoFormState = {
  proyectoId: "",
  tipoDocumentoProyectoId: "",
  fechaDocumento: new Date().toISOString().split("T")[0],
  nroReferencia: "",
  observacion: "",
  archivo: null,
};

function normalizeObservacion(value: string) {
  return value.toLocaleUpperCase("es-CL");
}

function sortByNombre<T extends { nombre: string }>(items: T[]) {
  return [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

export default function ControlPagosDocumentosPg() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [tiposDocumentoProyecto, setTiposDocumentoProyecto] = useState<TipoDocumentoProyectoOption[]>([]);
  const [documentosProyecto, setDocumentosProyecto] = useState<DocumentoProyectoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDocumento, setEditingDocumento] = useState<DocumentoProyectoRecord | undefined>();
  const [form, setForm] = useState<DocumentoFormState>(initialForm);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [configuracion, documentos] = await Promise.all([
        postgresApi.getConfiguracion(),
        postgresApi.getDocumentosProyecto(),
      ]);

      setProyectos(sortByNombre(configuracion.proyectos));
      setTiposDocumentoProyecto(sortByNombre(configuracion.tiposDocumentoProyecto));
      setDocumentosProyecto(documentos);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar documentos");
      setProyectos([]);
      setTiposDocumentoProyecto([]);
      setDocumentosProyecto([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!error) return;

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

  const activeTipos = useMemo(() => {
    return sortByNombre(tiposDocumentoProyecto.filter((item) => item.activo !== false));
  }, [tiposDocumentoProyecto]);

  const projectById = useMemo(() => {
    const map = new Map<string, { nombre: string; codigo?: string }>();
    proyectos.forEach((item) => {
      map.set(String(item.id), { nombre: item.nombre, codigo: item.codigoProyecto });
    });
    return map;
  }, [proyectos]);

  const projectByCode = useMemo(() => {
    const map = new Map<string, { nombre: string; id: string }>();
    proyectos.forEach((item) => {
      const code = (item.codigoProyecto || "").trim().toUpperCase();
      if (code) {
        map.set(code, { nombre: item.nombre, id: String(item.id) });
      }
    });
    return map;
  }, [proyectos]);

  const resolveProjectName = useCallback((item: Pick<DocumentoProyectoRecord, "proyectoId" | "codigoProyecto">) => {
    const byId = projectById.get(String(item.proyectoId))?.nombre;
    if (byId) return byId;

    const code = (item.codigoProyecto || item.proyectoId || "").trim().toUpperCase();
    const byCode = code ? projectByCode.get(code)?.nombre : undefined;
    if (byCode) return byCode;

    return item.codigoProyecto || "-";
  }, [projectByCode, projectById]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return [...documentosProyecto]
      .filter((item) => {
        if (projectFilter !== "all" && String(item.proyectoId) !== String(projectFilter)) return false;
        if (!query) return true;

        const projectName = resolveProjectName(item);
        return (
          (item.codigoProyecto || "").toLowerCase().includes(query)
          || (item.nroReferencia || "").toLowerCase().includes(query)
          || (item.tipoDocumentoNombre || "").toLowerCase().includes(query)
          || projectName.toLowerCase().includes(query)
          || (item.archivoAdjunto?.nombre || "").toLowerCase().includes(query)
        );
      })
      .sort(
        (a, b) =>
          (b.fechaDocumento || "").localeCompare(a.fechaDocumento || "")
          || (b.createdAt || "").localeCompare(a.createdAt || ""),
      );
  }, [documentosProyecto, projectFilter, resolveProjectName, search]);

  const clearLocalPreview = useCallback(() => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
  }, [localPreviewUrl]);

  const resetForm = useCallback(() => {
    clearLocalPreview();
    setForm(initialForm);
    setEditingDocumento(undefined);
    setSelectedFile(undefined);
    setFileInputKey((prev) => prev + 1);
  }, [clearLocalPreview]);

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (item: DocumentoProyectoRecord) => {
    clearLocalPreview();
    setEditingDocumento(item);
    setForm({
      proyectoId: String(item.proyectoId),
      tipoDocumentoProyectoId: String(item.tipoDocumentoProyectoId),
      fechaDocumento: item.fechaDocumento || new Date().toISOString().split("T")[0],
      nroReferencia: item.nroReferencia || "",
      observacion: normalizeObservacion(item.observacion || ""),
      archivo: null,
    });
    setFileInputKey((prev) => prev + 1);
    setModalOpen(true);
  };

  const openSelectedFilePreview = () => {
    if (!form.archivo) return;

    clearLocalPreview();
    const previewUrl = URL.createObjectURL(form.archivo);
    setLocalPreviewUrl(previewUrl);
    setSelectedFile({
      nombre: form.archivo.name,
      url: previewUrl,
      tipo: form.archivo.type || "application/octet-stream",
    });
    setViewerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedProject = proyectos.find((item) => String(item.id) === String(form.proyectoId));
    if (!selectedProject?.id) {
      toast({
        title: "Proyecto invalido",
        description: "Debes seleccionar un proyecto valido.",
        variant: "destructive",
      });
      return;
    }

    if (!form.archivo && !editingDocumento) {
      toast({
        title: "Archivo requerido",
        description: "Debes adjuntar exactamente 1 archivo.",
        variant: "destructive",
      });
      return;
    }

    const payload: DocumentoProyectoRecordCreateInput = {
      proyectoId: form.proyectoId,
      tipoDocumentoProyectoId: form.tipoDocumentoProyectoId,
      fechaDocumento: form.fechaDocumento,
      nroReferencia: form.nroReferencia,
      observacion: normalizeObservacion(form.observacion),
      archivo: form.archivo || undefined,
    };

    setSaving(true);
    try {
      if (editingDocumento) {
        const updated = await postgresApi.updateDocumentoProyecto(editingDocumento.id, payload);
        setDocumentosProyecto((prev) => prev.map((item) => (item.id === editingDocumento.id ? updated : item)));
        toast({
          title: "Documento actualizado",
          description: form.archivo
            ? "Se actualizo correctamente y se reemplazo el archivo."
            : "Se actualizo correctamente.",
          variant: "success",
        });
      } else {
        const created = await postgresApi.createDocumentoProyecto(payload);
        setDocumentosProyecto((prev) => [created, ...prev]);
        toast({
          title: "Documento creado",
          description: "Se creo correctamente.",
          variant: "success",
        });
      }

      setModalOpen(false);
      resetForm();
    } catch (saveError) {
      toast({
        title: "Error",
        description: saveError instanceof Error ? saveError.message : "No se pudo guardar el documento",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;

    try {
      await postgresApi.deleteDocumentoProyecto(deleteTarget.id);
      setDocumentosProyecto((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      toast({
        title: "Documento eliminado",
        description: "Se elimino correctamente.",
        variant: "success",
      });
    } catch (deleteError) {
      toast({
        title: "Error",
        description: deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el documento",
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <Layout>
      <PageHeader
        title="Control de Pagos - Documentos"
        subtitle={loading ? "Cargando documentos..." : `${filtered.length} documentos`}
        action={{ label: "Nuevo Documento", onClick: openCreateModal }}
      />

      <div className="mb-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        Los registros y archivos de documentos de proyecto ya se guardan en PostgreSQL + Google Storage.
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Buscar por codigo, tipo, referencia o archivo..."
          />
        </div>

        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="bg-card">
            <SelectValue placeholder="Filtrar por proyecto" />
          </SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">Todos los proyectos</SelectItem>
            {proyectos.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {item.codigoProyecto ? `${item.codigoProyecto} - ${item.nombre}` : item.nombre}
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
              <TableHead>TIPO DOCUMENTO</TableHead>
              <TableHead>FECHA DOCUMENTO</TableHead>
              <TableHead>NRO REFERENCIA</TableHead>
              <TableHead>ARCHIVO</TableHead>
              <TableHead className="text-center">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{resolveProjectName(item)}</TableCell>
                <TableCell>{item.tipoDocumentoNombre || "-"}</TableCell>
                <TableCell>{formatDateOnly(item.fechaDocumento)}</TableCell>
                <TableCell>{item.nroReferencia || "-"}</TableCell>
                <TableCell>
                  {item.archivoAdjunto ? (
                    <button
                      className="flex items-center gap-2 text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        setSelectedFile(item.archivoAdjunto);
                        setViewerOpen(true);
                      }}
                    >
                      <FileText size={14} />
                      {item.archivoAdjunto.nombre}
                    </button>
                  ) : (
                    <span className="text-muted-foreground">Pendiente</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditModal(item)}>
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setDeleteTarget({
                          id: item.id,
                          label: item.archivoAdjunto?.nombre || item.nroReferencia || item.tipoDocumentoNombre || "este documento",
                        })
                      }
                    >
                      <Trash2 size={16} className="text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No hay documentos para mostrar.
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
            <DialogTitle>{editingDocumento ? "Editar Documento" : "Nuevo Documento"}</DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSave}>
            {editingDocumento && (
              <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                Editando documento. El archivo actual se mantiene; puedes reemplazarlo opcionalmente.
              </p>
            )}

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
                  {proyectos.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.codigoProyecto ? `${item.codigoProyecto} - ${item.nombre}` : item.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Documento *</Label>
              <Select
                value={form.tipoDocumentoProyectoId || undefined}
                onValueChange={(value) => setForm((prev) => ({ ...prev, tipoDocumentoProyectoId: value }))}
                required
              >
                <SelectTrigger id="tipo" className="bg-card">
                  <SelectValue placeholder="Seleccionar tipo de documento" />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  {activeTipos.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fechaDocumento">Fecha Documento *</Label>
                <Input
                  id="fechaDocumento"
                  type="date"
                  value={form.fechaDocumento}
                  onChange={(e) => setForm((prev) => ({ ...prev, fechaDocumento: e.target.value }))}
                  onClick={(e) => e.currentTarget.showPicker?.()}
                  onFocus={(e) => e.currentTarget.showPicker?.()}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nroReferencia">Nro Referencia</Label>
                <Input
                  id="nroReferencia"
                  value={form.nroReferencia}
                  onChange={(e) => setForm((prev) => ({ ...prev, nroReferencia: e.target.value.toUpperCase() }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="archivoDocumento">Archivo {!editingDocumento ? "*" : ""}</Label>
              <input
                ref={fileInputRef}
                key={fileInputKey}
                id="archivoDocumento"
                type="file"
                className="hidden"
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    archivo: e.target.files?.[0] || null,
                  }))
                }
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  title={editingDocumento ? "Reemplazar archivo" : "Adjuntar archivo"}
                >
                  <Paperclip size={18} />
                </Button>
              </div>
              {form.archivo ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <div
                    className="flex cursor-pointer items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
                    role="button"
                    tabIndex={0}
                    onClick={openSelectedFilePreview}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openSelectedFilePreview();
                      }
                    }}
                  >
                    <span className="truncate">{form.archivo.name}</span>
                    <button
                      type="button"
                      className="leading-none text-muted-foreground hover:text-foreground"
                      aria-label="Quitar archivo"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearLocalPreview();
                        setSelectedFile(undefined);
                        setForm((prev) => ({ ...prev, archivo: null }));
                        setFileInputKey((prev) => prev + 1);
                      }}
                    >
                      &times;
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  {editingDocumento
                    ? "Si no seleccionas un archivo nuevo, se mantiene el actual."
                    : "Ningun archivo seleccionado."}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacion">Observacion</Label>
              <Textarea
                id="observacion"
                value={form.observacion}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, observacion: normalizeObservacion(e.target.value) }))
                }
                rows={3}
              />
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

      <DocumentoViewer
        open={viewerOpen}
        onClose={() => {
          setViewerOpen(false);
          setSelectedFile(undefined);
        }}
        archivo={selectedFile}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar documento"
        description={`¿Seguro que deseas eliminar "${deleteTarget?.label || "este documento"}"? Esta accion no se puede deshacer.`}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}
