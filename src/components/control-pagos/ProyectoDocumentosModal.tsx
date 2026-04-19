import { useEffect, useMemo, useRef, useState } from "react";
import { DocumentoViewer } from "@/components/DocumentoViewer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { formatDateOnly } from "@/lib/date-format";
import {
  postgresApi,
  type DocumentoProyectoRecord,
  type DocumentoProyectoRecordCreateInput,
  type TipoDocumentoProyectoOption,
} from "@/services/postgresApi";
import type { Proyecto } from "@/data/mockData";
import { Eye, FileText, MessageSquare, Paperclip, Pencil, Plus, Trash2 } from "lucide-react";

type ModalMode = "view" | "create";

interface ProyectoDocumentosModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proyecto?: Proyecto;
  initialMode?: ModalMode;
}

function todayIsoDate() {
  return new Date().toISOString().split("T")[0];
}

function toDateInputValue(value?: string) {
  if (!value) return todayIsoDate();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return todayIsoDate();
  return parsed.toISOString().split("T")[0];
}

function parseDateToIso(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsedIso = new Date(`${trimmed}T00:00:00`);
    if (Number.isNaN(parsedIso.getTime())) return null;
    if (parsedIso.toISOString().split("T")[0] !== trimmed) return null;
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().split("T")[0] !== iso) return null;
  return iso;
}

function normalizeObservacion(value: string) {
  return value.toLocaleUpperCase("es-CL");
}

function sortByNombre<T extends { nombre: string }>(items: T[]) {
  return [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

export function ProyectoDocumentosModal({
  open,
  onOpenChange,
  proyecto,
  initialMode = "view",
}: ProyectoDocumentosModalProps) {
  const [tiposDocumentoProyecto, setTiposDocumentoProyecto] = useState<TipoDocumentoProyectoOption[]>([]);
  const [documentosProyecto, setDocumentosProyecto] = useState<DocumentoProyectoRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ModalMode>(initialMode);
  const [tipoDocumentoProyectoId, setTipoDocumentoProyectoId] = useState("");
  const [fechaDocumento, setFechaDocumento] = useState(todayIsoDate());
  const [nroReferencia, setNroReferencia] = useState("");
  const [observacion, setObservacion] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [editingDocumentoId, setEditingDocumentoId] = useState<string | null>(null);
  const [deleteDocumentoId, setDeleteDocumentoId] = useState<string | null>(null);
  const [comentarioDialogOpen, setComentarioDialogOpen] = useState(false);
  const [comentarioSeleccionado, setComentarioSeleccionado] = useState<{
    tipoDocumento?: string;
    texto?: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

  const activeTipos = useMemo(() => {
    return sortByNombre(tiposDocumentoProyecto.filter((item) => item.activo !== false));
  }, [tiposDocumentoProyecto]);

  const sortedDocumentos = useMemo(() => {
    return [...documentosProyecto].sort(
      (a, b) =>
        (b.fechaDocumento || "").localeCompare(a.fechaDocumento || "")
        || (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
  }, [documentosProyecto]);

  const clearLocalPreview = () => {
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
  };

  const resetForm = () => {
    clearLocalPreview();
    setTipoDocumentoProyectoId("");
    setFechaDocumento(todayIsoDate());
    setNroReferencia("");
    setObservacion("");
    setArchivo(null);
    setEditingDocumentoId(null);
    setFileInputKey((prev) => prev + 1);
  };

  const openEdit = (item: DocumentoProyectoRecord) => {
    clearLocalPreview();
    setEditingDocumentoId(item.id);
    setTipoDocumentoProyectoId(String(item.tipoDocumentoProyectoId || ""));
    setFechaDocumento(toDateInputValue(item.fechaDocumento));
    setNroReferencia(item.nroReferencia || "");
    setObservacion(normalizeObservacion(item.observacion || ""));
    setArchivo(null);
    setFileInputKey((prev) => prev + 1);
    setMode("create");
  };

  const openSelectedFilePreview = () => {
    if (!archivo) return;

    clearLocalPreview();
    const previewUrl = URL.createObjectURL(archivo);
    setLocalPreviewUrl(previewUrl);
    setSelectedFile({
      nombre: archivo.name,
      url: previewUrl,
      tipo: archivo.type || "application/octet-stream",
    });
    setViewerOpen(true);
  };

  const loadCurrentProjectDocs = async () => {
    if (!proyecto?.id) return;

    setLoading(true);
    try {
      const [configuracion, documentos] = await Promise.all([
        postgresApi.getConfiguracion(),
        postgresApi.getDocumentosProyecto(),
      ]);

      setTiposDocumentoProyecto(sortByNombre(configuracion.tiposDocumentoProyecto));
      setDocumentosProyecto(
        documentos.filter((item) => String(item.proyectoId) === String(proyecto.id)),
      );
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron cargar los documentos",
        variant: "destructive",
      });
      setTiposDocumentoProyecto([]);
      setDocumentosProyecto([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
    resetForm();
    void loadCurrentProjectDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialMode, proyecto?.id]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) {
        URL.revokeObjectURL(localPreviewUrl);
      }
    };
  }, [localPreviewUrl]);

  const handleQuickCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!proyecto?.id) {
      toast({
        title: "Proyecto invalido",
        description: "No se pudo identificar el proyecto seleccionado.",
        variant: "destructive",
      });
      return;
    }

    if (activeTipos.length === 0) {
      toast({
        title: "Sin tipos de documento",
        description: "No hay tipos de documento activos para seleccionar.",
        variant: "destructive",
      });
      return;
    }

    if (!tipoDocumentoProyectoId) {
      toast({
        title: "Tipo requerido",
        description: "Debes seleccionar un tipo de documento.",
        variant: "destructive",
      });
      return;
    }

    if (!fechaDocumento) {
      toast({
        title: "Fecha requerida",
        description: "Debes seleccionar la fecha del documento.",
        variant: "destructive",
      });
      return;
    }

    const fechaDocumentoIso = parseDateToIso(fechaDocumento);
    if (!fechaDocumentoIso) {
      toast({
        title: "Fecha invalida",
        description: "Selecciona una fecha valida.",
        variant: "destructive",
      });
      return;
    }

    if (!archivo && !editingDocumentoId) {
      toast({
        title: "Archivo requerido",
        description: "Debes seleccionar un archivo.",
        variant: "destructive",
      });
      return;
    }

    const payload: DocumentoProyectoRecordCreateInput = {
      proyectoId: String(proyecto.id),
      tipoDocumentoProyectoId,
      fechaDocumento: fechaDocumentoIso,
      nroReferencia: nroReferencia.trim(),
      observacion: normalizeObservacion(observacion.trim()),
      archivo: archivo || undefined,
    };

    setSaving(true);
    try {
      if (editingDocumentoId) {
        await postgresApi.updateDocumentoProyecto(editingDocumentoId, payload);
        toast({
          title: "Documento actualizado",
          description: archivo
            ? "Se guardaron los cambios y se reemplazo el archivo."
            : "Se guardaron los cambios correctamente.",
          variant: "success",
        });
      } else {
        await postgresApi.createDocumentoProyecto(payload);
        toast({
          title: "Documento creado",
          description: "Se agrego correctamente al proyecto.",
          variant: "success",
        });
      }

      await loadCurrentProjectDocs();
      resetForm();
      setMode("view");
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar el documento",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDocumentoId) return;

    try {
      await postgresApi.deleteDocumentoProyecto(deleteDocumentoId);
      toast({
        title: "Documento eliminado",
        description: "El documento se elimino correctamente.",
        variant: "success",
      });
      setDeleteDocumentoId(null);
      await loadCurrentProjectDocs();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el documento",
        variant: "destructive",
      });
    }
  };

  const projectLabel = proyecto?.nombre || "";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-4xl bg-card">
          <DialogHeader>
            <DialogTitle>Documentos del proyecto {projectLabel}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {loading ? "Cargando documentos..." : `${sortedDocumentos.length} documento(s)`}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={mode === "view" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("view")}
              >
                <Eye size={14} className="mr-2" />
                Ver
              </Button>
              <Button
                type="button"
                variant={mode === "create" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  resetForm();
                  setMode("create");
                }}
              >
                <Plus size={14} className="mr-2" />
                Agregar
              </Button>
            </div>
          </div>

          {mode === "view" ? (
            <div className="overflow-hidden rounded-xl border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>TIPO DOCUMENTO</TableHead>
                    <TableHead>FECHA DOCUMENTO</TableHead>
                    <TableHead>ARCHIVO</TableHead>
                    <TableHead className="text-center">ACCIONES</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedDocumentos.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.tipoDocumentoNombre || "-"}</TableCell>
                      <TableCell>{formatDateOnly(item.fechaDocumento)}</TableCell>
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
                          {item.observacion?.trim() ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setComentarioSeleccionado({
                                  tipoDocumento: item.tipoDocumentoNombre,
                                  texto: item.observacion,
                                });
                                setComentarioDialogOpen(true);
                              }}
                              title="Ver comentario"
                            >
                              <MessageSquare size={16} />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEdit(item)}
                            title="Editar documento"
                          >
                            <Pencil size={16} className="text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeleteDocumentoId(item.id)}
                            title="Eliminar documento"
                          >
                            <Trash2 size={16} className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && sortedDocumentos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                        No hay documentos para este proyecto.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={handleQuickCreate}>
              {editingDocumentoId && (
                <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Editando documento. El archivo actual se mantiene; puedes reemplazarlo opcionalmente.
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="tipoDocumentoProyecto">Tipo de Documento *</Label>
                  <Select
                    value={tipoDocumentoProyectoId || undefined}
                    onValueChange={(value) => setTipoDocumentoProyectoId(value)}
                    required
                  >
                    <SelectTrigger id="tipoDocumentoProyecto" className="bg-card">
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

                <div className="space-y-2">
                  <Label htmlFor="fechaDocumentoProyecto">Fecha Documento *</Label>
                  <Input
                    id="fechaDocumentoProyecto"
                    type="date"
                    value={fechaDocumento}
                    onChange={(e) => setFechaDocumento(e.target.value)}
                    onClick={(e) => e.currentTarget.showPicker?.()}
                    onFocus={(e) => e.currentTarget.showPicker?.()}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nroReferencia">Nro Referencia</Label>
                  <Input
                    id="nroReferencia"
                    value={nroReferencia}
                    onChange={(e) => setNroReferencia(e.target.value.toUpperCase())}
                    placeholder="Ej: OC-12345"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="archivoDocumento">Archivo {!editingDocumentoId ? "*" : ""}</Label>
                  <input
                    ref={fileInputRef}
                    key={fileInputKey}
                    id="archivoDocumento"
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      clearLocalPreview();
                      setArchivo(e.target.files?.[0] || null);
                    }}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      title={editingDocumentoId ? "Reemplazar archivo" : "Adjuntar documento"}
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
                        onClick={openSelectedFilePreview}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openSelectedFilePreview();
                          }
                        }}
                      >
                        <span className="truncate">{archivo.name}</span>
                        <button
                          type="button"
                          className="leading-none text-muted-foreground hover:text-foreground"
                          aria-label="Quitar archivo"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearLocalPreview();
                            setSelectedFile(undefined);
                            setArchivo(null);
                            setFileInputKey((prev) => prev + 1);
                          }}
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {editingDocumentoId
                        ? "Si no seleccionas un archivo nuevo, se mantiene el actual."
                        : "Ningun archivo seleccionado."}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacion">Observacion</Label>
                <Textarea
                  id="observacion"
                  value={observacion}
                  onChange={(e) => setObservacion(normalizeObservacion(e.target.value))}
                  rows={3}
                  placeholder="Escribe un comentario opcional..."
                />
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setMode("view");
                    resetForm();
                  }}
                  disabled={saving}
                >
                  Volver
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Guardando..." : editingDocumentoId ? "Guardar cambios" : "Guardar documento"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={comentarioDialogOpen}
        onOpenChange={(open) => {
          setComentarioDialogOpen(open);
          if (!open) setComentarioSeleccionado(null);
        }}
      >
        <DialogContent className="sm:max-w-md bg-card">
          <DialogHeader>
            <DialogTitle>
              Comentario {comentarioSeleccionado?.tipoDocumento ? `- ${comentarioSeleccionado.tipoDocumento}` : ""}
            </DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {comentarioSeleccionado?.texto?.trim()
              ? comentarioSeleccionado.texto
              : "Este documento no tiene comentario."}
          </p>
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
        open={Boolean(deleteDocumentoId)}
        onOpenChange={(open) => {
          if (!open) setDeleteDocumentoId(null);
        }}
        title="Eliminar documento"
        description="¿Seguro que deseas eliminar este documento? Esta accion no se puede deshacer."
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </>
  );
}
