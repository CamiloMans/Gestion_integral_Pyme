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
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Search, Filter, Pencil, Trash2, FileText, Paperclip, MessageSquare } from 'lucide-react';
import { DocumentoViewer } from '@/components/DocumentoViewer';
import { DetalleGastoDialog } from '@/components/DetalleGastoDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/hooks/use-toast';
import { postgresApi, type BootstrapResponse, type CategoriaOption, type TipoDocumentoOption } from '@/services/postgresApi';
import { useAppAuth } from '@/hooks/useAppAuth';

const PAGE_SIZE = 50;
const EMPRESA_NO_INFORMADA_LABEL = 'Empresa no informada';

function sortGastosByFechaDesc(items: Gasto[]) {
  return [...items].sort((a, b) => {
    const fechaA = new Date(a.fecha || '').getTime();
    const fechaB = new Date(b.fecha || '').getTime();
    const safeA = Number.isNaN(fechaA) ? 0 : fechaA;
    const safeB = Number.isNaN(fechaB) ? 0 : fechaB;
    return safeB - safeA;
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

export default function Gastos() {
  const { session } = useAppAuth();
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSave, setLoadingSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGasto, setEditingGasto] = useState<Gasto | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategoria, setFilterCategoria] = useState('all');
  const [filterEmpresa, setFilterEmpresa] = useState('all');
  const [filterTipoDoc, setFilterTipoDoc] = useState('all');
  const [filterColaborador, setFilterColaborador] = useState('all');
  const [filterProyecto, setFilterProyecto] = useState('all');
  const [filterMes, setFilterMes] = useState('all');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [documentoViewerOpen, setDocumentoViewerOpen] = useState(false);
  const [documentoSeleccionado, setDocumentoSeleccionado] = useState<{ nombre: string; url: string; tipo: string } | undefined>();
  const [detalleGastoOpen, setDetalleGastoOpen] = useState(false);
  const [gastoSeleccionado, setGastoSeleccionado] = useState<Gasto | undefined>();
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [gastoAEliminar, setGastoAEliminar] = useState<string | null>(null);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmDescription, setConfirmDescription] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [bootstrapResponse, gastosResponse] = await Promise.all([
        postgresApi.getBootstrap(),
        postgresApi.getGastos(),
      ]);

      setBootstrap(bootstrapResponse);
      setGastos(sortGastosByFechaDesc(gastosResponse));
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
  const colaboradoresData = useMemo(() => bootstrap?.colaboradores || [], [bootstrap]);

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

  const colaboradoresOrdenados = useMemo(() => {
    return [...colaboradoresData].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [colaboradoresData]);

  const proyectosOrdenados = useMemo(() => {
    return sortByNombre(proyectosData);
  }, [proyectosData]);

  const gastoCumpleFiltros = useCallback((gasto: Gasto) => {
    const empresa = empresasData.find((item) => item.id === gasto.empresaId);
    const numeroDocStr = gasto.numeroDocumento ? String(gasto.numeroDocumento) : '';

    const matchesSearch =
      !!empresa?.razonSocial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      numeroDocStr.includes(searchTerm) ||
      !!gasto.detalle?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategoria = filterCategoria === 'all' || String(gasto.categoria) === String(filterCategoria);
    const matchesEmpresa = filterEmpresa === 'all' || String(gasto.empresaId) === String(filterEmpresa);
    const matchesTipoDoc = filterTipoDoc === 'all' || String(gasto.tipoDocumento) === String(filterTipoDoc);
    const matchesColaborador = filterColaborador === 'all' || String(gasto.colaboradorId || '') === String(filterColaborador);
    const matchesProyecto = filterProyecto === 'all' || String(gasto.proyectoId || '') === String(filterProyecto);

    let matchesMes = true;
    if (filterMes !== 'all' && gasto.fecha) {
      try {
        const fechaGasto = new Date(gasto.fecha);
        if (!Number.isNaN(fechaGasto.getTime())) {
          const mesGasto = `${fechaGasto.getFullYear()}-${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`;
          matchesMes = mesGasto === filterMes;
        }
      } catch {
        matchesMes = true;
      }
    }

    return matchesSearch && matchesCategoria && matchesEmpresa && matchesTipoDoc && matchesColaborador && matchesProyecto && matchesMes;
  }, [
    empresasData,
    searchTerm,
    filterCategoria,
    filterEmpresa,
    filterTipoDoc,
    filterColaborador,
    filterProyecto,
    filterMes,
  ]);

  const filteredGastos = useMemo(() => {
    return sortGastosByFechaDesc(gastos.filter(gastoCumpleFiltros));
  }, [gastos, gastoCumpleFiltros]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterCategoria, filterEmpresa, filterTipoDoc, filterColaborador, filterProyecto, filterMes]);

  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const gastosPagina = filteredGastos.slice(pageStart, pageEnd);
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = pageEnd < filteredGastos.length;

  const cantidadGastosTexto = `${filteredGastos.length}`;

  const nombreRegistradorActual = useMemo(() => {
    if (!editingGasto) {
      return session?.user?.nombre || 'Persona no identificada';
    }

    const nombreDesdeCreador = (editingGasto.creadoPorNombre || '').trim();
    if (nombreDesdeCreador) {
      return nombreDesdeCreador;
    }

    const nombreDesdeGasto = (editingGasto.colaboradorNombre || '').trim();
    if (nombreDesdeGasto) {
      return nombreDesdeGasto;
    }

    const colaborador = colaboradoresData.find(
      (item) => String(item.id) === String(editingGasto.colaboradorId || '')
    );

    return colaborador?.nombre || 'Persona no identificada';
  }, [colaboradoresData, editingGasto, session]);

  const mesesDisponibles = useMemo(() => {
    const fechas = new Set<string>();

    gastos.forEach((gasto) => {
      try {
        const fecha = new Date(gasto.fecha);
        if (!Number.isNaN(fecha.getTime())) {
          fechas.add(`${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`);
        }
      } catch {
        return;
      }
    });

    return Array.from(fechas)
      .sort((a, b) => b.localeCompare(a))
      .map((mesKey) => {
        const [year, month] = mesKey.split('-').map(Number);
        const fecha = new Date(year, month - 1, 1);
        const mesLabel = fecha.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

        return {
          key: mesKey,
          label: mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1),
        };
      });
  }, [gastos]);

  const handleSaveGasto = async (newGasto: Omit<Gasto, 'id'>) => {
    setLoadingSave(true);

    try {
      if (editingGasto) {
        const actualizado = await postgresApi.updateGasto(editingGasto.id, newGasto);
        setGastos((prev) => sortGastosByFechaDesc([
          ...prev.filter((item) => item.id !== actualizado.id),
          actualizado,
        ]));
        toast({
          title: 'Gasto actualizado',
          description: 'El gasto se actualizo correctamente en PostgreSQL.',
          variant: 'success',
        });
      } else {
        const creado = await postgresApi.createGasto(newGasto);
        setGastos((prev) => sortGastosByFechaDesc([creado, ...prev]));
        setCurrentPage(1);
        toast({
          title: 'Gasto guardado',
          description: 'El gasto se guardo correctamente en PostgreSQL.',
          variant: 'success',
        });
      }

      setEditingGasto(undefined);
      setModalOpen(false);
    } catch (saveError) {
      toast({
        title: 'Error',
        description: saveError instanceof Error ? saveError.message : 'Error al guardar el gasto',
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

  const handleDelete = (id: string) => {
    const gasto = gastos.find((item) => item.id === id);

    if (gasto) {
      const empresa = empresasData.find((item) => item.id === gasto.empresaId);
      const montoTotal = gasto.montoTotal !== undefined && gasto.montoTotal !== null
        ? gasto.montoTotal
        : gasto.monto;
      const detalle = gasto.detalle || 'Sin detalle';
      const nombreEmpresa = empresa?.razonSocial || EMPRESA_NO_INFORMADA_LABEL;

      setConfirmTitle('Eliminar gasto');
      setConfirmDescription(
        `Estas seguro de que deseas eliminar el gasto de "${nombreEmpresa}" por ${formatCurrency(montoTotal)} (${detalle})? Esta accion no se puede deshacer.`
      );
    } else {
      setConfirmTitle('Eliminar gasto');
      setConfirmDescription('Estas seguro de que deseas eliminar este gasto? Esta accion no se puede deshacer.');
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
        title: 'Gasto eliminado',
        description: `El gasto de "${nombreEmpresa}" se ha eliminado correctamente`,
        variant: 'success',
      });
    } catch (deleteError) {
      toast({
        title: 'Error',
        description: deleteError instanceof Error ? deleteError.message : 'Error al eliminar el gasto',
        variant: 'destructive',
      });
    } finally {
      setGastoAEliminar(null);
    }
  };

  return (
    <Layout onNewGasto={() => setModalOpen(true)}>
      <PageHeader
        title="Gastos"
        subtitle={
          loading
            ? 'Cargando gastos desde PostgreSQL...'
            : `${cantidadGastosTexto} gastos encontrados`
        }
        action={{ label: 'Nuevo Gasto', onClick: () => setModalOpen(true) }}
      />

      <div className="bg-card rounded-xl p-3 sm:p-4 mb-4 sm:mb-6 shadow-sm border border-border">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
            <Input
              placeholder="Buscar gasto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <button
            onClick={() => setFiltrosAbiertos(!filtrosAbiertos)}
            className={`flex items-center gap-2 px-3 py-2 h-10 rounded-md transition-colors whitespace-nowrap ${
              filtrosAbiertos
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted/50 hover:bg-muted'
            }`}
          >
            <Filter size={16} className={filtrosAbiertos ? 'text-primary-foreground' : 'text-muted-foreground'} />
            <span className={`font-medium text-sm ${filtrosAbiertos ? 'text-primary-foreground' : 'text-foreground'}`}>Filtros</span>
          </button>
        </div>
        {filtrosAbiertos && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 sm:gap-3 animate-fade-in">
            <Select value={filterCategoria} onValueChange={setFilterCategoria}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Todas las categorias" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="all">Todas las categorias</SelectItem>
                {categoriasData.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>

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

            <Select value={filterTipoDoc} onValueChange={setFilterTipoDoc}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Todos los tipos" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="all">Todos los tipos</SelectItem>
                {tiposDocumentoOptions.map((tipo) => (
                  <SelectItem key={tipo.id} value={String(tipo.id)}>
                    {tipo.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterColaborador} onValueChange={setFilterColaborador}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Todos los colaboradores" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="all">Todos los colaboradores</SelectItem>
                {colaboradoresOrdenados.map((colaborador) => (
                  <SelectItem key={colaborador.id} value={colaborador.id}>
                    {colaborador.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterMes} onValueChange={setFilterMes}>
              <SelectTrigger className="bg-card">
                <SelectValue placeholder="Todos los meses" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                <SelectItem value="all">Todos los meses</SelectItem>
                {mesesDisponibles.map((mes) => (
                  <SelectItem key={mes.key} value={mes.key}>{mes.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">FECHA</TableHead>
                <TableHead className="font-semibold">CATEGORIA</TableHead>
                <TableHead className="font-semibold">EMPRESA</TableHead>
                <TableHead className="font-semibold">DOCUMENTO</TableHead>
                <TableHead className="font-semibold text-right">MONTO NETO</TableHead>
                <TableHead className="font-semibold text-right">IVA</TableHead>
                <TableHead className="font-semibold text-right">MONTO TOTAL</TableHead>
                <TableHead className="font-semibold text-center">ACCIONES</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                      <span className="text-muted-foreground">Conectando con PostgreSQL...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredGastos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    {error ? 'No se pudo cargar la informacion desde PostgreSQL' : 'No se encontraron gastos'}
                  </TableCell>
                </TableRow>
              ) : (
                gastosPagina.map((gasto) => {
                  const empresa = empresasData.find((item) => item.id === gasto.empresaId);
                  const colaborador = gasto.colaboradorId
                    ? colaboradoresData.find((item) => item.id === gasto.colaboradorId)
                    : null;
                  const nombreColaborador = gasto.colaboradorNombre || colaborador?.nombre;

                  return (
                    <TableRow key={gasto.id} className="animate-fade-in">
                      <TableCell>
                        <div>
                          <p className="text-muted-foreground">{formatDate(gasto.fecha)}</p>
                          {gasto.creadoPorNombre && (
                            <p className="font-medium text-sm mt-1">{gasto.creadoPorNombre}</p>
                          )}
                        </div>
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
                        {gasto.montoNeto !== undefined && gasto.montoNeto !== null
                          ? formatCurrency(gasto.montoNeto)
                          : formatCurrency(gasto.monto)}
                      </TableCell>
                      <TableCell className="text-right">
                        {gasto.iva !== undefined && gasto.iva !== null
                          ? formatCurrency(gasto.iva)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {gasto.montoTotal !== undefined && gasto.montoTotal !== null
                          ? formatCurrency(gasto.montoTotal)
                          : formatCurrency(gasto.monto)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          {gasto.detalle && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setGastoSeleccionado(gasto);
                                setDetalleGastoOpen(true);
                              }}
                              title="Ver detalle"
                            >
                              <MessageSquare size={16} className="text-blue-500" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(gasto)}>
                            <Pencil size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            type="button"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDelete(gasto.id);
                            }}
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
            Pagina {currentPage} | Mostrando {gastosPagina.length} de {cantidadGastosTexto} gastos
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
      />

      <DocumentoViewer
        open={documentoViewerOpen}
        onClose={() => {
          setDocumentoViewerOpen(false);
          setDocumentoSeleccionado(undefined);
        }}
        archivo={documentoSeleccionado}
      />

      <DetalleGastoDialog
        open={detalleGastoOpen}
        onClose={() => {
          setDetalleGastoOpen(false);
          setGastoSeleccionado(undefined);
        }}
        gasto={gastoSeleccionado}
      />

      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          setConfirmDialogOpen(open);
          if (!open) {
            setGastoAEliminar(null);
          }
        }}
        title={confirmTitle || 'Eliminar gasto'}
        description={confirmDescription || 'Estas seguro de que deseas eliminar este gasto? Esta accion no se puede deshacer.'}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}
