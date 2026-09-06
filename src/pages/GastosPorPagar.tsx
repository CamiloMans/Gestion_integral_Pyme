import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { CategoryBadge } from '@/components/CategoryBadge';
import { GastoModal } from '@/components/GastoModal';
import { formatCurrency, formatDate, Gasto } from '@/data/mockData';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Search, Pencil, Trash2, FileText, Paperclip, Plus, CheckCircle2 } from 'lucide-react';
import { DocumentoViewer } from '@/components/DocumentoViewer';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { postgresApi, type BootstrapResponse, type CategoriaOption, type TipoDocumentoOption } from '@/services/postgresApi';
import { useAppAuth } from '@/hooks/useAppAuth';
import { formatDateOnly, parseDateOnly, toDateOnly, todayDateOnly } from '@/lib/date-format';

const PAGE_SIZE = 50;
const EMPRESA_NO_INFORMADA_LABEL = 'Empresa no informada';

const DIAS_VENCIMIENTO_PROXIMO = 7;

/** Fecha en la que hay que pagar. fechaCompromiso es solo respaldo para filas antiguas. */
function vencimientoDe(gasto: Gasto) {
  return gasto.fechaPago || gasto.fechaCompromiso;
}

/** Dias hasta el vencimiento: negativo si ya vencio, null si no hay fecha. */
function diasHastaVencimiento(gasto: Gasto) {
  const vencimiento = toDateOnly(vencimientoDe(gasto));
  if (!vencimiento) return null;

  const hoy = parseDateOnly(todayDateOnly());
  const fecha = parseDateOnly(vencimiento);
  if (!hoy || !fecha) return null;

  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}

function sortGastosPorPagar(items: Gasto[]) {
  const toTime = (value?: string) => {
    const parsed = new Date(value || '').getTime();
    return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
  };

  return [...items].sort((a, b) => {
    // Vencimientos mas proximos primero; sin fecha al final. El vencimiento es
    // fechaPago (fechaCompromiso es la fecha del documento).
    const vencimientoDiff = toTime(vencimientoDe(a)) - toTime(vencimientoDe(b));
    if (vencimientoDiff !== 0) {
      return vencimientoDiff;
    }
    const toCreated = (value?: string) => {
      const parsed = new Date(value || '').getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    return toCreated(b.createdAt) - toCreated(a.createdAt);
  });
}

function sortByNombre<T extends { nombre: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
  );
}

function sortByRazonSocial<T extends { razonSocial: string }>(items: T[]) {
  return [...items].sort((a, b) =>
    a.razonSocial.localeCompare(b.razonSocial, 'es', { sensitivity: 'base' })
  );
}

export default function GastosPorPagar() {
  const { session } = useAppAuth();
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSave, setLoadingSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGasto, setEditingGasto] = useState<Gasto | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmpresa, setFilterEmpresa] = useState('all');
  const [filterProyecto, setFilterProyecto] = useState('all');
  const [documentoViewerOpen, setDocumentoViewerOpen] = useState(false);
  const [documentoSeleccionado, setDocumentoSeleccionado] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [gastoAEliminar, setGastoAEliminar] = useState<string | null>(null);
  const [confirmDescription, setConfirmDescription] = useState('');
  const [gastoAPagar, setGastoAPagar] = useState<Gasto | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [bootstrapResponse, gastosResponse] = await Promise.all([
        postgresApi.getBootstrap(),
        postgresApi.getGastosPorPagar(),
      ]);

      setBootstrap(bootstrapResponse);
      setGastos(sortGastosPorPagar(gastosResponse));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'No se pudo cargar PostgreSQL';
      setError(message);
      setBootstrap(null);
      setGastos([]);
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
      title: 'Error de conexion',
      description: error,
      variant: 'destructive',
    });
  }, [error]);

  const handleCreateProyecto = async (nuevoProyecto: Omit<BootstrapResponse['proyectos'][number], 'id' | 'createdAt'>) => {
    try {
      const proyectoCreado = await postgresApi.createProyecto(nuevoProyecto);

      setBootstrap((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          proyectos: sortByNombre([
            ...prev.proyectos.filter((item) => item.id !== proyectoCreado.id),
            proyectoCreado,
          ]),
        };
      });

      if (!bootstrap) {
        await loadData();
      }

      toast({
        title: 'Proyecto creado',
        description: 'El proyecto se guardo correctamente en PostgreSQL.',
        variant: 'success',
      });

      return proyectoCreado;
    } catch (createError) {
      toast({
        title: 'Error',
        description: createError instanceof Error ? createError.message : 'Error al crear el proyecto',
        variant: 'destructive',
      });
      throw createError;
    }
  };

  const handleCreateCategoria = async (nuevaCategoria: Omit<CategoriaOption, 'id' | 'color'>) => {
    try {
      const categoriaCreada = await postgresApi.createCategoria(nuevaCategoria);

      setBootstrap((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          categorias: sortByNombre([
            ...prev.categorias.filter((item) => item.id !== categoriaCreada.id),
            categoriaCreada,
          ]),
        };
      });

      if (!bootstrap) {
        await loadData();
      }

      toast({
        title: 'Categoria creada',
        description: 'La categoria se guardo correctamente en PostgreSQL.',
        variant: 'success',
      });

      return categoriaCreada;
    } catch (createError) {
      toast({
        title: 'Error',
        description: createError instanceof Error ? createError.message : 'Error al crear la categoria',
        variant: 'destructive',
      });
      throw createError;
    }
  };

  const handleCreateEmpresa = async (nuevaEmpresa: Omit<BootstrapResponse['empresas'][number], 'id' | 'createdAt'>) => {
    try {
      const empresaCreada = await postgresApi.createEmpresa(nuevaEmpresa);

      setBootstrap((prev) => {
        if (!prev) {
          return prev;
        }

        return {
          ...prev,
          empresas: sortByRazonSocial([
            ...prev.empresas.filter((item) => item.id !== empresaCreada.id),
            empresaCreada,
          ]),
        };
      });

      if (!bootstrap) {
        await loadData();
      }

      toast({
        title: 'Empresa creada',
        description: 'La empresa se guardo correctamente en PostgreSQL.',
        variant: 'success',
      });

      return empresaCreada;
    } catch (createError) {
      toast({
        title: 'Error',
        description: createError instanceof Error ? createError.message : 'Error al crear la empresa',
        variant: 'destructive',
      });
      throw createError;
    }
  };

  const empresasData = useMemo(() => bootstrap?.empresas || [], [bootstrap]);
  const proyectosData = useMemo(() => bootstrap?.proyectos || [], [bootstrap]);
  const categoriasData = useMemo<CategoriaOption[]>(() => bootstrap?.categorias || [], [bootstrap]);
  const tiposDocumentoOptions = useMemo<TipoDocumentoOption[]>(() => bootstrap?.tiposDocumento || [], [bootstrap]);

  const tiposDocumentoMap = useMemo(() => {
    const map: Record<string, string> = {};

    tiposDocumentoOptions.forEach((tipo) => {
      map[String(tipo.id)] = tipo.nombre;
    });

    return map;
  }, [tiposDocumentoOptions]);

  const empresasOrdenadas = useMemo(() => {
    return sortByRazonSocial(empresasData);
  }, [empresasData]);

  const proyectosOrdenados = useMemo(() => {
    return sortByNombre(proyectosData);
  }, [proyectosData]);

  const gastoCumpleFiltros = useCallback((gasto: Gasto) => {
    const empresa = empresasData.find((item) => item.id === gasto.empresaId);
    const proyecto = gasto.proyectoId
      ? proyectosData.find((item) => String(item.id) === String(gasto.proyectoId))
      : null;
    const numeroDocStr = gasto.numeroDocumento ? String(gasto.numeroDocumento) : '';
    const searchTermLower = searchTerm.toLowerCase();

    const matchesSearch =
      !!empresa?.razonSocial?.toLowerCase().includes(searchTermLower) ||
      !!proyecto?.nombre?.toLowerCase().includes(searchTermLower) ||
      !!proyecto?.codigoProyecto?.toLowerCase().includes(searchTermLower) ||
      numeroDocStr.includes(searchTerm) ||
      !!gasto.detalle?.toLowerCase().includes(searchTermLower);

    const matchesEmpresa = filterEmpresa === 'all' || String(gasto.empresaId) === String(filterEmpresa);
    const matchesProyecto = filterProyecto === 'all' || String(gasto.proyectoId || '') === String(filterProyecto);

    return matchesSearch && matchesEmpresa && matchesProyecto;
  }, [empresasData, proyectosData, searchTerm, filterEmpresa, filterProyecto]);

  const filteredGastos = useMemo(() => {
    return sortGastosPorPagar(gastos.filter(gastoCumpleFiltros));
  }, [gastos, gastoCumpleFiltros]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterEmpresa, filterProyecto]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const gastosPagina = filteredGastos.slice(pageStart, pageEnd);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = pageEnd < filteredGastos.length;

  const nombreRegistradorActual = useMemo(() => {
    if (!editingGasto) {
      return session?.user?.nombre || 'Persona no identificada';
    }

    return (editingGasto.creadoPorNombre || '').trim() || 'Persona no identificada';
  }, [editingGasto, session]);

  const handleSaveGasto = async (newGasto: Omit<Gasto, 'id'>) => {
    setLoadingSave(true);

    try {
      if (editingGasto) {
        const actualizado = await postgresApi.updateGastoPorPagar(editingGasto.id, newGasto);

        if (actualizado.pagado) {
          setGastos((prev) => prev.filter((item) => item.id !== actualizado.id));
          toast({
            title: 'Gasto pagado',
            description: 'El gasto se marco como pagado y se movio a la lista de Gastos.',
            variant: 'success',
          });
        } else {
          setGastos((prev) => sortGastosPorPagar([
            ...prev.filter((item) => item.id !== actualizado.id),
            actualizado,
          ]));
          toast({
            title: 'Gasto por pagar actualizado',
            description: 'El gasto por pagar se actualizo correctamente en PostgreSQL.',
            variant: 'success',
          });
        }
      } else {
        const creado = await postgresApi.createGastoPorPagar(newGasto);

        if (creado.pagado) {
          toast({
            title: 'Gasto pagado',
            description: 'El gasto se registro como pagado y quedo en la lista de Gastos.',
            variant: 'success',
          });
        } else {
          setGastos((prev) => sortGastosPorPagar([creado, ...prev]));
          setCurrentPage(1);
          toast({
            title: 'Gasto por pagar guardado',
            description: 'El compromiso de pago se guardo correctamente en PostgreSQL.',
            variant: 'success',
          });
        }
      }

      setEditingGasto(undefined);
      setModalOpen(false);
    } catch (saveError) {
      toast({
        title: 'Error',
        description: saveError instanceof Error ? saveError.message : 'Error al guardar el gasto por pagar',
        variant: 'destructive',
      });
    } finally {
      setLoadingSave(false);
    }
  };

  const handleEdit = (gasto: Gasto) => {
    setEditingGasto(gasto);
    setModalOpen(true);
  };

  const marcarPagado = async (gasto: Gasto, facturadoOverride?: boolean) => {
    if (payingId) {
      return;
    }

    setPayingId(gasto.id);

    try {
      await postgresApi.marcarGastoPorPagarPagado(gasto.id, {
        fechaPago: todayDateOnly(),
        ...(facturadoOverride === undefined ? {} : { facturado: facturadoOverride }),
      });

      setGastos((prev) => prev.filter((item) => item.id !== gasto.id));
      toast({
        title: 'Gasto pagado',
        description: 'El gasto se marco como pagado y se movio a la lista de Gastos.',
        variant: 'success',
      });
    } catch (payError) {
      toast({
        title: 'Error',
        description: payError instanceof Error ? payError.message : 'Error al marcar el gasto como pagado',
        variant: 'destructive',
      });
    } finally {
      setPayingId(null);
    }
  };

  const handleMarcarPagado = (gasto: Gasto) => {
    if (!gasto.facturado) {
      setGastoAPagar(gasto);
      return;
    }

    void marcarPagado(gasto);
  };

  const handleInvoiceDecision = (facturado: boolean) => {
    const gasto = gastoAPagar;
    setGastoAPagar(null);
    if (gasto) {
      void marcarPagado(gasto, facturado);
    }
  };

  const handleDelete = (id: string) => {
    const gasto = gastos.find((item) => item.id === id);

    if (gasto) {
      const empresa = empresasData.find((item) => item.id === gasto.empresaId);
      const montoTotal = gasto.montoTotal !== undefined && gasto.montoTotal !== null
        ? gasto.montoTotal
        : gasto.monto;
      const detalle = gasto.detalle || 'Sin detalle';
      const nombreEmpresa = empresa?.razonSocial || EMPRESA_NO_INFORMADA_LABEL;

      setConfirmDescription(
        `Estas seguro de que deseas eliminar el gasto por pagar de "${nombreEmpresa}" por ${formatCurrency(montoTotal)} (${detalle})? Esta accion no se puede deshacer.`
      );
    } else {
      setConfirmDescription('Estas seguro de que deseas eliminar este gasto por pagar? Esta accion no se puede deshacer.');
    }

    setGastoAEliminar(id);
    setConfirmDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!gastoAEliminar) {
      return;
    }

    const gasto = gastos.find((item) => item.id === gastoAEliminar);
    const empresa = gasto ? empresasData.find((item) => item.id === gasto.empresaId) : null;
    const nombreEmpresa = empresa?.razonSocial || EMPRESA_NO_INFORMADA_LABEL;

    try {
      await postgresApi.deleteGasto(gastoAEliminar);
      setGastos((prev) => prev.filter((item) => item.id !== gastoAEliminar));
      toast({
        title: 'Gasto por pagar eliminado',
        description: `El gasto por pagar de "${nombreEmpresa}" se ha eliminado correctamente`,
        variant: 'success',
      });
    } catch (deleteError) {
      toast({
        title: 'Error',
        description: deleteError instanceof Error ? deleteError.message : 'Error al eliminar el gasto por pagar',
        variant: 'destructive',
      });
    } finally {
      setGastoAEliminar(null);
    }
  };

  return (
    <Layout onNewGasto={() => setModalOpen(true)}>
      <PageHeader
        title="Gastos por Pagar"
        subtitle={
          loading
            ? 'Cargando gastos por pagar desde PostgreSQL...'
            : `${filteredGastos.length} gastos por pagar encontrados`
        }
        actions={[
          {
            label: 'Nuevo Pago pendiente',
            onClick: () => setModalOpen(true),
            icon: <Plus size={18} />,
          },
        ]}
      />

      <div className="bg-card rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm border border-border">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder="Buscar gasto por pagar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={filterEmpresa} onValueChange={setFilterEmpresa}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Todas las empresas" />
            </SelectTrigger>
            <SelectContent className="bg-card">
              <SelectItem value="all">Todas las empresas</SelectItem>
              {empresasOrdenadas.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>{emp.razonSocial}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterProyecto} onValueChange={setFilterProyecto}>
            <SelectTrigger className="bg-card">
              <SelectValue placeholder="Todos los proyectos" />
            </SelectTrigger>
            <SelectContent className="bg-card">
              <SelectItem value="all">Todos los proyectos</SelectItem>
              {proyectosOrdenados.map((proyecto) => (
                <SelectItem key={proyecto.id} value={proyecto.id}>{proyecto.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">CREADO</TableHead>
                <TableHead className="font-semibold">PROYECTO</TableHead>
                <TableHead className="font-semibold">CATEGORIA</TableHead>
                <TableHead className="font-semibold">EMPRESA</TableHead>
                <TableHead className="font-semibold">DOCUMENTO</TableHead>
                <TableHead className="font-semibold text-right">MONTO TOTAL</TableHead>
                <TableHead className="font-semibold">F. COMPROMISO</TableHead>
                <TableHead className="font-semibold">F. PAGO</TableHead>
                <TableHead className="font-semibold text-center">ESTADO</TableHead>
                <TableHead className="font-semibold text-center">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <span className="text-muted-foreground">Conectando con PostgreSQL...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredGastos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    {error ? 'No se pudo cargar la informacion desde PostgreSQL' : 'No se encontraron gastos por pagar'}
                  </TableCell>
                </TableRow>
              ) : (
                gastosPagina.map((gasto) => {
                  const empresa = empresasData.find((item) => item.id === gasto.empresaId);
                  const proyecto = gasto.proyectoId
                    ? proyectosData.find((item) => String(item.id) === String(gasto.proyectoId))
                    : null;
                  return (
                    <TableRow key={gasto.id} className="animate-fade-in">
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{gasto.creadoPorNombre || 'Sin usuario'}</p>
                          {gasto.createdAt && (
                            <p className="text-xs text-muted-foreground mt-1">{formatDate(gasto.createdAt)}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {proyecto ? (
                          <div>
                            <p className="font-medium">{proyecto.nombre}</p>
                            {proyecto.codigoProyecto && (
                              <p className="text-sm text-muted-foreground">{proyecto.codigoProyecto}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Sin proyecto</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <CategoryBadge categoryId={gasto.categoria} categories={categoriasData} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{empresa?.razonSocial || EMPRESA_NO_INFORMADA_LABEL}</p>
                          {empresa?.rut && <p className="text-sm text-muted-foreground">{empresa.rut}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {gasto.archivosAdjuntos && gasto.archivosAdjuntos.length > 0 ? (
                          <div className="space-y-1">
                            <p className="font-medium text-sm">{tiposDocumentoMap[String(gasto.tipoDocumento)] || gasto.tipoDocumento}</p>
                            <p className="text-xs text-muted-foreground">#{gasto.numeroDocumento}</p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              {gasto.archivosAdjuntos.map((archivo, index) => (
                                <Button
                                  key={index}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => {
                                    setDocumentoSeleccionado(archivo);
                                    setDocumentoViewerOpen(true);
                                  }}
                                >
                                  <Paperclip size={12} />
                                  <span className="truncate max-w-[100px]">{archivo.nombre}</span>
                                </Button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div>
                            <p className="font-medium">{tiposDocumentoMap[String(gasto.tipoDocumento)] || gasto.tipoDocumento}</p>
                            <p className="text-sm text-muted-foreground">#{gasto.numeroDocumento}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <FileText size={12} />
                              Sin adjuntos
                            </p>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {gasto.montoTotal !== undefined && gasto.montoTotal !== null
                          ? formatCurrency(gasto.montoTotal)
                          : formatCurrency(gasto.monto)}
                      </TableCell>
                      <TableCell>
                        <p className="text-muted-foreground">{formatDateOnly(gasto.fechaCompromiso)}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {(() => {
                          const dias = diasHastaVencimiento(gasto);
                          const urgente = dias !== null && dias <= DIAS_VENCIMIENTO_PROXIMO;

                          return (
                            <>
                              <p className={urgente ? 'font-medium text-red-700' : 'font-medium'}>
                                {formatDateOnly(vencimientoDe(gasto))}
                              </p>
                              {dias !== null && (
                                <p className={`text-xs ${urgente ? 'text-red-700' : 'text-muted-foreground'}`}>
                                  {dias < 0 ? `Vencido hace ${Math.abs(dias)} dia(s)` : dias === 0 ? 'Vence hoy' : `En ${dias} dia(s)`}
                                </p>
                              )}
                            </>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-center">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            gasto.facturado
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {gasto.facturado ? 'FACTURADO' : 'PENDIENTE'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={payingId === gasto.id}
                            onClick={() => handleMarcarPagado(gasto)}
                            title="Marcar pagado"
                          >
                            <CheckCircle2 size={16} className="text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(gasto)}
                            title="Editar"
                          >
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={() => handleDelete(gasto.id)}
                            title="Eliminar"
                          >
                            <Trash2 size={16} className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {filteredGastos.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Pagina {currentPage} | Mostrando {gastosPagina.length} de {filteredGastos.length} gastos por pagar
          </p>

          <Pagination className="mx-0 w-auto justify-start sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={!hasPreviousPage || loading ? 'pointer-events-none opacity-50' : ''}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!hasPreviousPage || loading) return;
                    setCurrentPage((prev) => Math.max(1, prev - 1));
                  }}
                />
              </PaginationItem>

              <PaginationItem>
                <PaginationLink href="#" size="default" isActive onClick={(e) => e.preventDefault()}>
                  Pagina {currentPage}
                </PaginationLink>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={!hasNextPage || loading ? 'pointer-events-none opacity-50' : ''}
                  onClick={(e) => {
                    e.preventDefault();
                    if (!hasNextPage || loading) return;
                    setCurrentPage((prev) => prev + 1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      <GastoModal
        open={modalOpen}
        onClose={() => {
          if (loadingSave) return;
          setModalOpen(false);
          setEditingGasto(undefined);
        }}
        onSave={handleSaveGasto}
        gasto={editingGasto}
        nombreRegistrador={nombreRegistradorActual}
        proyectos={proyectosOrdenados}
        empresas={empresasData}
        categorias={categoriasData}
        tiposDocumento={tiposDocumentoOptions}
        onCreateProyecto={handleCreateProyecto}
        onCreateEmpresa={handleCreateEmpresa}
        onCreateCategoria={handleCreateCategoria}
        allowCreateProyecto
        allowCreateEmpresa
        allowCreateCategoria
        mode="compromiso"
      />

      <DocumentoViewer
        open={documentoViewerOpen}
        onClose={() => {
          setDocumentoViewerOpen(false);
          setDocumentoSeleccionado(undefined);
        }}
        archivo={documentoSeleccionado}
      />

      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          setConfirmDialogOpen(open);
          if (!open) {
            setGastoAEliminar(null);
          }
        }}
        title="Eliminar gasto por pagar"
        description={confirmDescription || 'Estas seguro de que deseas eliminar este gasto por pagar? Esta accion no se puede deshacer.'}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />

      <Dialog open={Boolean(gastoAPagar)} onOpenChange={(open) => { if (!open) setGastoAPagar(null); }}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar estado de facturacion</DialogTitle>
            <DialogDescription>
              Este gasto no esta marcado como facturado. Confirma si la factura fue generada antes de marcarlo como pagado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => handleInvoiceDecision(false)}>
              No, pagado sin factura
            </Button>
            <Button type="button" onClick={() => handleInvoiceDecision(true)}>
              Si, fue facturado
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
