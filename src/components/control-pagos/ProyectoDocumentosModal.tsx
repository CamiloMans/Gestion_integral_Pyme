import { useMemo, useState, useEffect, useRef } from "react";
import { DocumentoViewer } from "@/components/DocumentoViewer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDocumentosProyecto, useTiposDocumentoProyecto } from "@/hooks/useSharePoint";
import { toast } from "@/hooks/use-toast";
import { formatDate, type Proyecto } from "@/data/mockData";
import { Eye, FileText, MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";

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
  if (isNaN(parsed.getTime())) return todayIsoDate();
  return parsed.toISOString().split("T")[0];
}

function parseDateToIso(value: string) {
  const trimmed = value.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsedIso = new Date(`${trimmed}T00:00:00`);
    if (isNaN(parsedIso.getTime())) return null;
    if (parsedIso.toISOString().split("T")[0] !== trimmed) return null;
    return trimmed;
  }

  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T00:00:00`);
  if (isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().split("T")[0] !== iso) return null;
  return iso;
}

function normalizeObservacion(value: string) {
  return value.toLocaleUpperCase("es-CL");
}

export function ProyectoDocumentosModal({
  open,
  onOpenChange,
  proyecto,
  initialMode = "view",
}: ProyectoDocumentosModalProps) {
  const { tiposDocumentoProyecto } = useTiposDocumentoProyecto();
  const {
    documentosProyecto,
    loading,
    loadDocumentosProyecto,
    createDocumentoProyecto,
    updateDocumentoProyecto,
    deleteDocumentoProyecto,
  } = useDocumentosProyecto({
    autoLoad: false,
  });

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
    return [...tiposDocumentoProyecto]
      .filter((item) => item.activo)
      .sort((a, b) => (a.orden || 9999) - (b.orden || 9999));
  }, [tiposDocumentoProyecto]);

  const sortedDocumentos = useMemo(() => {
    return [...documentosProyecto].sort((a, b) => (a.fechaDocumento || "").localeCompare(b.fechaDocumento || "") * -1);
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

  const openEdit = (item: (typeof documentosProyecto)[number]) => {
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

  const getFilters = () => {
    if (!proyecto) return undefined;
    return {
      proyectoId: String(proyecto.id),
    };
  };

  const loadCurrentProjectDocs = async () => {
    if (!proyecto) return;
    try {
      await loadDocumentosProyecto(getFilters());
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudieron cargar los documentos",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (!open) return;

    setMode(initialMode);
    resetForm();
    loadCurrentProjectDocs();
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
        title: "Fecha inválida",
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

    setSaving(true);
    try {
      if (editingDocumentoId) {
        await updateDocumentoProyecto(editingDocumentoId, {
          proyectoId: String(proyecto.id),
          codigoProyecto: "",
          tipoDocumentoProyectoId,
          fechaDocumento: fechaDocumentoIso,
          nroReferencia: nroReferencia.trim(),
          observacion: normalizeObservacion(observacion.trim()),
        });

        toast({
          title: "Documento actualizado",
          description: "Se guardaron los cambios correctamente.",
          variant: "success",
        });
      } else {
        await createDocumentoProyecto({
          proyectoId: String(proyecto.id),
          codigoProyecto: "",
          tipoDocumentoProyectoId,
          fechaDocumento: fechaDocumentoIso,
          nroReferencia: nroReferencia.trim(),
          observacion: normalizeObservacion(observacion.trim()),
          archivo: archivo!,
        });

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
        description: error instanceof Error ? error.message : "No se pudo crear el documento",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteDocumentoId) return;

    try {
      await deleteDocumentoProyecto(deleteDocumentoId);
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
                      <TableCell>{formatDate(item.fechaDocumento)}</TableCell>
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
                          "-"
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
                  Editando documento. El archivo actual se mantiene; puedes actualizar tipo, fecha, referencia y
                  comentario.
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
                  {activeTipos.length === 0 && (
                    <p className="text-xs text-destructive">No hay tipos de documento activos disponibles.</p>
                  )}
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
                    onChange={(e) => setNroReferencia(e.target.value)}
                    placeholder="Ej: OC-12345"
                  />
                </div>

                <div className="space-y-2">
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
                  <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
                    Seleccionar archivo
                  </Button>
                  {archivo ? (
                    <button
                      type="button"
                      className="flex w-fit max-w-full items-center gap-2 rounded-md bg-muted px-2 py-1 text-sm hover:bg-muted/80"
                      onClick={openSelectedFilePreview}
                    >
                      <span className="truncate">{archivo.name}</span>
                    </button>
                  ) : (
                    <p className="text-xs text-muted-foreground">Ningun archivo seleccionado.</p>
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
        description="¿Seguro que deseas eliminar este documento? Esta acción no se puede deshacer."
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </>
  );
}
