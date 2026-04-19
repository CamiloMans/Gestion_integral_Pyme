import { useCallback, useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { PageHeader } from "@/components/PageHeader";
import { ProyectoDocumentosModal } from "@/components/control-pagos/ProyectoDocumentosModal";
import { ProyectoModal } from "@/components/ProyectoModal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Proyecto } from "@/data/mockData";
import { toast } from "@/hooks/use-toast";
import { postgresApi } from "@/services/postgresApi";
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

function sortProyectos(items: Proyecto[]) {
  return [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

export default function ControlPagosProyectos() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProyecto, setEditingProyecto] = useState<Proyecto | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; nombre: string } | null>(null);
  const [documentosModalOpen, setDocumentosModalOpen] = useState(false);
  const [documentosProyectoSeleccionado, setDocumentosProyectoSeleccionado] = useState<Proyecto | undefined>();
  const [documentosModalMode, setDocumentosModalMode] = useState<"view" | "create">("view");

  const loadProyectos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const bootstrap = await postgresApi.getBootstrap();
      setProyectos(sortProyectos(bootstrap.proyectos));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los proyectos");
      setProyectos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProyectos();
  }, [loadProyectos]);

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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return sortProyectos(
      proyectos.filter((item) =>
        !query
        || item.nombre.toLowerCase().includes(query)
        || (item.codigoProyecto || "").toLowerCase().includes(query)
      )
    );
  }, [proyectos, search]);

  const handleSave = async (payload: Omit<Proyecto, "id" | "createdAt">) => {
    try {
      if (editingProyecto) {
        const updated = await postgresApi.updateProyecto(editingProyecto.id, payload);
        setProyectos((prev) => sortProyectos(prev.map((item) => (item.id === editingProyecto.id ? updated : item))));
        toast({
          title: "Proyecto actualizado",
          description: "Se actualizo correctamente en PostgreSQL.",
          variant: "success",
        });
      } else {
        const created = await postgresApi.createProyecto(payload);
        setProyectos((prev) => sortProyectos([...prev, created]));
        toast({
          title: "Proyecto creado",
          description: "Se creo correctamente en PostgreSQL.",
          variant: "success",
        });
      }

      setEditingProyecto(undefined);
    } catch (saveError) {
      toast({
        title: "Error",
        description: saveError instanceof Error ? saveError.message : "No se pudo guardar el proyecto",
        variant: "destructive",
      });
      throw saveError;
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;

    try {
      await postgresApi.deleteProyecto(deleteTarget.id);
      setProyectos((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      toast({
        title: "Proyecto eliminado",
        description: "Se elimino correctamente.",
        variant: "success",
      });
    } catch (deleteError) {
      toast({
        title: "Error",
        description: deleteError instanceof Error ? deleteError.message : "No se pudo eliminar el proyecto",
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const openDocumentosModal = (proyecto: Proyecto, mode: "view" | "create") => {
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

      <div className="mb-4 rounded-xl border bg-card p-4 shadow-sm">
        <div className="mb-4 rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
          Los proyectos ya se guardan en PostgreSQL y sus documentos ahora se administran desde esta misma vista o desde la pantalla Documentos.
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            placeholder="Buscar por codigo o nombre de proyecto..."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>PROYECTO</TableHead>
              <TableHead>CODIGO</TableHead>
              <TableHead>MONTO TOTAL PROY</TableHead>
              <TableHead>MONEDA BASE</TableHead>
              <TableHead className="text-center">DOCUMENTOS</TableHead>
              <TableHead className="text-center">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.nombre}</TableCell>
                <TableCell>{item.codigoProyecto || "-"}</TableCell>
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
        description={`¿Seguro que deseas eliminar "${deleteTarget?.nombre || "este proyecto"}"? Esta accion no se puede deshacer.`}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}
