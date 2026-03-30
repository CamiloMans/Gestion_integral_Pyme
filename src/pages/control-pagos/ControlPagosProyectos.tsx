import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { SchemaInitializer } from "@/components/control-pagos/SchemaInitializer";
import { ProyectoDocumentosModal } from "@/components/control-pagos/ProyectoDocumentosModal";
import { ProyectoModal } from "@/components/ProyectoModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProyectos, useSharePointAuth } from "@/hooks/useSharePoint";
import type { Proyecto } from "@/data/mockData";
import { toast } from "@/hooks/use-toast";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";

function formatAmount(value?: number, moneda: "CLP" | "UF" | "USD" = "CLP") {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return "-";
  const currency = moneda === "CLP" ? "CLP" : moneda === "USD" ? "USD" : undefined;

  if (!currency) {
    return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value)} UF`;
  }

  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    minimumFractionDigits: moneda === "CLP" ? 0 : 2,
    maximumFractionDigits: moneda === "CLP" ? 0 : 2,
  }).format(value);
}

export default function ControlPagosProyectos() {
  const { isAuthenticated } = useSharePointAuth();
  const { proyectos, loading, createProyecto, updateProyecto, deleteProyecto } = useProyectos();
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProyecto, setEditingProyecto] = useState<Proyecto | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nombre: string } | null>(null);
  const [documentosModalOpen, setDocumentosModalOpen] = useState(false);
  const [documentosProyectoSeleccionado, setDocumentosProyectoSeleccionado] = useState<Proyecto | undefined>();
  const [documentosModalMode, setDocumentosModalMode] = useState<"view" | "create">("view");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...proyectos]
      .filter((item) =>
        !query ||
        item.nombre.toLowerCase().includes(query) ||
        (item.codigoProyecto || "").toLowerCase().includes(query)
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
  }, [proyectos, search]);

  const handleSave = async (payload: Omit<Proyecto, "id" | "createdAt">) => {
    try {
      if (editingProyecto) {
        await updateProyecto(editingProyecto.id, payload);
        toast({
          title: "Proyecto actualizado",
          description: "Se actualizó correctamente.",
          variant: "success",
        });
      } else {
        await createProyecto(payload);
        toast({
          title: "Proyecto creado",
          description: "Se creó correctamente.",
          variant: "success",
        });
      }
      setEditingProyecto(undefined);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo guardar el proyecto",
        variant: "destructive",
      });
      throw error;
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    try {
      await deleteProyecto(deleteTarget.id);
      toast({
        title: "Proyecto eliminado",
        description: "Se eliminó correctamente.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "No se pudo eliminar el proyecto",
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const openDocumentosModal = (proyecto: Proyecto, mode: "view" | "create") => {
    if (mode === "create" && !proyecto.codigoProyecto) {
      toast({
        title: "Proyecto invalido",
        description: "Debes asignar COD_PROYECTO antes de agregar documentos.",
        variant: "destructive",
      });
      return;
    }

    setDocumentosProyectoSeleccionado(proyecto);
    setDocumentosModalMode(mode);
    setDocumentosModalOpen(true);
  };

  return (
    <Layout>
      <PageHeader
        title="Control de Pagos - Proyectos"
        subtitle={loading ? "Cargando proyectos..." : `${filtered.length} proyectos`}
        action={{
          label: "Nuevo Proyecto",
          onClick: () => {
            setEditingProyecto(undefined);
            setModalOpen(true);
          },
        }}
      />

      <SchemaInitializer />

      <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Buscar por código o nombre de proyecto..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>COD PROYECTO</TableHead>
              <TableHead>PROYECTO</TableHead>
              <TableHead>MONTO TOTAL PROY</TableHead>
              <TableHead>MONEDA BASE</TableHead>
              <TableHead className="text-center">DOCUMENTOS</TableHead>
              <TableHead className="text-center">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono">{item.codigoProyecto || "-"}</TableCell>
                <TableCell>{item.nombre}</TableCell>
                <TableCell>{formatAmount(item.montoTotalProyecto, item.monedaBase || "CLP")}</TableCell>
                <TableCell>{item.monedaBase || "-"}</TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openDocumentosModal(item, "view")}>
                      <Eye size={16} />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDocumentosModal(item, "create")}>
                      <Plus size={16} />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex justify-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingProyecto(item);
                        setModalOpen(true);
                      }}
                    >
                      <Pencil size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget({ id: item.id, nombre: item.nombre })}
                      disabled={!isAuthenticated}
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
                  No hay proyectos para mostrar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ProyectoModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingProyecto(undefined);
        }}
        onSave={handleSave}
        proyecto={editingProyecto}
      />

      <ProyectoDocumentosModal
        open={documentosModalOpen}
        onOpenChange={(open) => {
          setDocumentosModalOpen(open);
          if (!open) {
            setDocumentosProyectoSeleccionado(undefined);
            setDocumentosModalMode("view");
          }
        }}
        proyecto={documentosProyectoSeleccionado}
        initialMode={documentosModalMode}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Eliminar proyecto"
        description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre || "este proyecto"}"? Esta acción no se puede deshacer.`}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}

