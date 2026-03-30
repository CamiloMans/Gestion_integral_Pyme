import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { SchemaInitializer } from "@/components/control-pagos/SchemaInitializer";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DocumentoViewer } from "@/components/DocumentoViewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  useDocumentosProyecto,
  useProyectos,
  useTiposDocumentoProyecto,
} from "@/hooks/useSharePoint";
import type { DocumentoProyecto } from "@/services/sharepointService";
import { toast } from "@/hooks/use-toast";
import { formatDateOnly } from "@/lib/date-format";
import { FileText, Pencil, Search, Trash2 } from "lucide-react";

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

export default function ControlPagosDocumentos() {
  const { proyectos } = useProyectos();
  const { tiposDocumentoProyecto } = useTiposDocumentoProyecto();
  const {
    documentosProyecto,
    loading,
    createDocumentoProyecto,
    updateDocumentoProyecto,
    deleteDocumentoProyecto,
  } = useDocumentosProyecto();

  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDocumento, setEditingDocumento] = useState<DocumentoProyecto | undefined>();
  const [form, setForm] = useState<DocumentoFormState>(initialForm);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

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

  const resolveProjectName = (item: Pick<DocumentoProyecto, "proyectoId" | "codigoProyecto">) => {
    const byId = projectById.get(String(item.proyectoId))?.nombre;
    if (byId) return byId;

    const code = (item.codigoProyecto || item.proyectoId || "").trim().toUpperCase();
    const byCode = code ? projectByCode.get(code)?.nombre : undefined;
    if (byCode) return byCode;

    return item.codigoProyecto || "-";
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documentosProyecto
      .filter((item) => {
        if (projectFilter !== "all" && String(item.proyectoId) !== String(projectFilter)) return false;
        if (!query) return true;

        const projectName = resolveProjectName(item);
        return (
          (item.codigoProyecto || "").toLowerCase().includes(query) ||
          (item.nroReferencia || "").toLowerCase().includes(query) ||
          (item.tipoDocumentoNombre || "").toLowerCase().includes(query) ||
          projectName.toLowerCase().includes(query)
        );
      })
      .sort((a, b) => (a.fechaDocumento || "").localeCompare(b.fechaDocumento || "") * -1);
  }, [documentosProyecto, search, projectFilter, projectById, projectByCode]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingDocumento(undefined);
  };

  const openCreateModal = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEditModal = (item: DocumentoProyecto) => {
    setEditingDocumento(item);
    setForm({
      proyectoId: String(item.proyectoId),
      tipoDocumentoProyectoId: String(item.tipoDocumentoProyectoId),
      fechaDocumento: item.fechaDocumento || new Date().toISOString().split("T")[0],
      nroReferencia: item.nroReferencia || "",
      observacion: item.observacion || "",
      archivo: null,
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedProject = proyectos.find((item) => String(item.id) === String(form.proyectoId));

    if (!selectedProject?.codigoProyecto) {
      toast({
        title: "Proyecto inv谩lido",
        description: "Debes seleccionar un proyecto con COD_PROYECTO.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingDocumento) {
        await updateDocumentoProyecto(editingDocumento.id, {
          proyectoId: form.proyectoId,
          codigoProyecto: selectedProject.codigoProyecto,
          tipoDocumentoProyectoId: form.tipoDocumentoProyectoId,
          fechaDocumento: form.fechaDocumento,
          nroReferencia: form.nroReferencia,
          observacion: form.observacion,
        });
        toast({
          title: "Documento actualizado",
          description: "Se actualiz贸 correctamente.",
          variant: "success",
        });
      } else {
        if (!form.archivo) {
          toast({
            title: "Adjunto requerido",
            description: "Debes adjuntar exactamente 1 archivo.",
            variant: "destructive",
          });
          return;
        }

        await createDocumentoProyecto({
          proyectoId: form.proyectoId,
          codigoProyecto: selectedProject.codigoProyecto,
          tipoDocumentoProyectoId: form.tipoDocumentoProyectoId,
          fechaDocumento: form.fechaDocumento,
          nroReferencia: form.nroReferencia,
          observacion: form.observacion,
          archivo: form.archivo,
        });
        toast({
          title: "Documento creado",
          description: "Se cre贸 correctamente.",
          variant: "success",
        });
      }

      setModalOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar el documento",
        variant: "destructive",
      });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteDocumentoProyecto(deleteTarget.id);
      toast({
        title: "Documento eliminado",
        description: "Se elimin贸 correctamente.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el documento",
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

      <SchemaInitializer />

      <div className="mb-4 grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Buscar por c贸digo, tipo o referencia..."
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
                    "-"
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEditModal(item)}>
                      <Pencil size={16} />
                    </Button>                    <Button
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
                  {tiposDocumentoProyecto
                    .filter((item) => item.activo)
                    .sort((a, b) => (a.orden || 9999) - (b.orden || 9999))
                    .map((item) => (
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
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nroReferencia">Nro Referencia</Label>
                <Input
                  id="nroReferencia"
                  value={form.nroReferencia}
                  onChange={(e) => setForm((prev) => ({ ...prev, nroReferencia: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="observacion">Observaci贸n</Label>
              <Textarea
                id="observacion"
                value={form.observacion}
                onChange={(e) => setForm((prev) => ({ ...prev, observacion: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="archivo">Archivo {editingDocumento ? "(opcional)" : "*"}</Label>
              <Input
                id="archivo"
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setForm((prev) => ({ ...prev, archivo: file }));
                }}
                required={!editingDocumento}
              />
              <p className="text-xs text-muted-foreground">Se permite exactamente 1 archivo por registro.</p>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Guardar</Button>
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
        description={`縎eguro que deseas eliminar "${deleteTarget?.label || "este documento"}"? Esta acci髇 no se puede deshacer.`}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}


