import { useState, useMemo, useEffect, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { CategoryBadge } from '@/components/CategoryBadge';
import { GastoModal } from '@/components/GastoModal';
import { gastosData, empresasData as empresasDataMock, categorias, colaboradoresData as colaboradoresDataMock, formatCurrency, formatDate, Gasto } from '@/data/mockData';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Search, Filter, Pencil, Trash2, FileText, Paperclip, MessageSquare } from 'lucide-react';
import { DocumentoViewer } from '@/components/DocumentoViewer';
import { DetalleGastoDialog } from '@/components/DetalleGastoDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useGastosPaginados, useEmpresas, useColaboradores, useSharePointAuth, useTiposDocumento, useProyectos, useCategorias } from '@/hooks/useSharePoint';
import { toast } from '@/hooks/use-toast';
import { gastosService } from '@/services/sharepointService';

export default function Gastos() {
  const { isAuthenticated, isLoading: authLoading, account } = useSharePointAuth();
  
  // Los hooks siempre deben llamarse, pero pueden retornar valores vacíos si no está autenticado
  
  // TEMPORAL: Revisar el item 14 con attachments para ver cómo se almacenan
  useEffect(() => {
    if (isAuthenticated) {
      gastosService.checkItemWithAttachments("14").catch((error) => {
        console.error("Error al revisar item 14:", error);
      });
    }
  }, [isAuthenticated]);
  const empresasHook = useEmpresas();
  const tiposDocumentoHook = useTiposDocumento();
  const colaboradoresHook = useColaboradores();
  const proyectosHook = useProyectos();
  const categoriasHook = useCategorias();
  
  // Extraer valores de forma segura
  const empresasSharePoint = empresasHook.empresas || [];
  const loadingEmpresas = empresasHook.loading || false;
  const tiposDocumentoSharePoint = tiposDocumentoHook.tiposDocumento || [];
  const colaboradoresSharePoint = colaboradoresHook.colaboradores || [];
  const loadingColaboradores = colaboradoresHook.loading || false;
  const errorColaboradores = colaboradoresHook.error || null;
  const proyectosSharePoint = proyectosHook.proyectos || [];
  const categoriasSharePoint = categoriasHook.categorias || [];

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
  const [currentPageLocal, setCurrentPageLocal] = useState(1);
  
  // Crear un mapeo de ID a nombre para tipos de documento
  const tiposDocumentoMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    tiposDocumentoSharePoint.forEach(tipo => {
      map[String(tipo.id)] = tipo.nombre;
    });
    return map;
  }, [tiposDocumentoSharePoint]);
  
  // Ordenar tipos de documento alfabéticamente, pero "Otro" o "Otros" siempre al final
  const tiposDocumentoOrdenados = useMemo(() => {
    return [...tiposDocumentoSharePoint].sort((a, b) => {
      const nombreA = a.nombre.toLowerCase();
      const nombreB = b.nombre.toLowerCase();
      
      // Si uno es "Otro" o "Otros", va al final
      const esOtroA = nombreA === 'otro' || nombreA === 'otros';
      const esOtroB = nombreB === 'otro' || nombreB === 'otros';
      
      if (esOtroA && !esOtroB) return 1; // A va después
      if (!esOtroA && esOtroB) return -1; // B va después
      if (esOtroA && esOtroB) return 0; // Ambos son "Otro", mantener orden
      
      // Ordenar alfabéticamente
      return nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
    });
  }, [tiposDocumentoSharePoint]);
  
  // Usar datos de SharePoint si está autenticado y no está cargando, sino usar datos mock
  // Asegurar que siempre sean arrays para evitar errores
  const PAGE_SIZE = 50;
  const empresasData = (isAuthenticated && !authLoading && !loadingEmpresas) ? empresasSharePoint : empresasDataMock;
  const colaboradoresData = (isAuthenticated && !authLoading) ? colaboradoresSharePoint : colaboradoresDataMock;
  const proyectosData = (isAuthenticated && !authLoading) ? proyectosSharePoint : [];

  const gastoCumpleFiltros = useCallback((gasto: Gasto) => {
    const empresa = empresasData?.find(e => e.id === gasto.empresaId);

    // Asegurar que numeroDocumento sea string antes de usar includes
    const numeroDocStr = gasto.numeroDocumento ? String(gasto.numeroDocumento) : '';

    const matchesSearch =
      empresa?.razonSocial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      numeroDocStr.includes(searchTerm) ||
      gasto.detalle?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategoria = filterCategoria === 'all' || gasto.categoria === filterCategoria;
    const matchesEmpresa = filterEmpresa === 'all' || gasto.empresaId === filterEmpresa;
    const matchesTipoDoc = filterTipoDoc === 'all' || gasto.tipoDocumento === filterTipoDoc;
    const matchesColaborador = filterColaborador === 'all' || String(gasto.colaboradorId || '') === String(filterColaborador);
    const matchesProyecto = filterProyecto === 'all' || String(gasto.proyectoId || '') === String(filterProyecto);

    // Filtrar por mes
    let matchesMes = true;
    if (filterMes !== 'all' && gasto.fecha) {
      try {
        const fechaGasto = new Date(gasto.fecha);
        if (!isNaN(fechaGasto.getTime())) {
          const mesGasto = `${fechaGasto.getFullYear()}-${String(fechaGasto.getMonth() + 1).padStart(2, '0')}`;
          matchesMes = mesGasto === filterMes;
        }
      } catch (e) {
        // Si hay error al parsear la fecha, no filtrar por mes
        matchesMes = true;
      }
    }

    return matchesSearch && matchesCategoria && matchesEmpresa && matchesTipoDoc && matchesColaborador && matchesProyecto && matchesMes;
  }, [empresasData, searchTerm, filterCategoria, filterEmpresa, filterTipoDoc, filterColaborador, filterProyecto, filterMes]);

  const filtroPaginacionKey = useMemo(() => JSON.stringify({
    searchTerm: searchTerm.toLowerCase(),
    filterCategoria,
    filterEmpresa,
    filterTipoDoc,
    filterColaborador,
    filterProyecto,
    filterMes,
    empresasCount: empresasData.length,
  }), [searchTerm, filterCategoria, filterEmpresa, filterTipoDoc, filterColaborador, filterProyecto, filterMes, empresasData.length]);

  const gastosPaginadosHook = useGastosPaginados({
    pageSize: PAGE_SIZE,
    includeAttachments: true,
    filterFn: gastoCumpleFiltros,
    filterKey: filtroPaginacionKey,
  });

  const gastosSharePoint = gastosPaginadosHook.loadedItems || [];
  const loadingGastos = gastosPaginadosHook.loading || false;
  const errorGastos = gastosPaginadosHook.error || null;
  const gastos = (isAuthenticated && !authLoading) ? gastosSharePoint : gastosData;

  const nombreRegistradorActual = useMemo(() => {
    if (editingGasto) {
      const nombreDesdePersona = (editingGasto.colaboradorNombre || '').trim();
      return nombreDesdePersona || 'Persona no identificada';
    }

    const correoUsuarioLogueado = account?.username?.toLowerCase().trim() || '';
    if (!correoUsuarioLogueado) return 'Persona no identificada';

    const colaborador = colaboradoresData.find(
      (item) => (item.email || '').toLowerCase().trim() === correoUsuarioLogueado
    );

    // Priorizar el valor visible del lookup PERSONA (NOMBRE) proveniente de REGISTRO_GASTOS
    if (colaborador?.id) {
      const gastoConPersona = gastos.find(
        (item) => String(item.colaboradorId || '') === String(colaborador.id) && !!item.colaboradorNombre
      );

      if (gastoConPersona?.colaboradorNombre) {
        return gastoConPersona.colaboradorNombre;
      }
    }

    // Fallback global: cualquier valor visible de PERSONA obtenido desde REGISTRO_GASTOS
    const gastoConPersona = gastos.find((item) => !!(item.colaboradorNombre || '').trim());
    if (gastoConPersona?.colaboradorNombre) {
      return gastoConPersona.colaboradorNombre;
    }

    return 'Persona no identificada';
  }, [account, colaboradoresData, gastos, editingGasto]);
  
  // Ordenar empresas alfabéticamente
  const empresasOrdenadas = useMemo(() => {
    return [...empresasData].sort((a, b) => 
      a.razonSocial.localeCompare(b.razonSocial, 'es', { sensitivity: 'base' })
    );
  }, [empresasData]);
  
  // Ordenar colaboradores alfabéticamente
  const colaboradoresOrdenados = useMemo(() => {
    return [...colaboradoresData].sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [colaboradoresData]);
  
  // Usar categorías de SharePoint si está autenticado, sino usar datos mock
  // Mapear categorías de SharePoint al formato esperado y ordenar alfabéticamente
  const categoriasData = useMemo(() => {
    if (isAuthenticated && !authLoading && categoriasSharePoint.length > 0) {
      return categoriasSharePoint.map(cat => ({
        id: String(cat.id),
        nombre: cat.nombre,
        color: cat.color || `bg-category-${cat.id}`,
      })).sort((a, b) => 
        a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
      );
    }
    return categorias;
  }, [isAuthenticated, authLoading, categoriasSharePoint]);
  
  // Mostrar errores
  useEffect(() => {
    if (errorGastos) {
      toast({
        title: "Error",
        description: errorGastos.message,
        variant: "destructive",
      });
    }
  }, [errorGastos]);

  useEffect(() => {
    if (errorColaboradores) {
      toast({
        title: "Error al cargar colaboradores",
        description: errorColaboradores.message,
        variant: "destructive",
      });
    }
  }, [errorColaboradores]);

  const filteredGastosSharePoint = gastosPaginadosHook.filteredItems || [];
  const pagedGastosSharePoint = gastosPaginadosHook.pageItems || [];

  const filteredGastosLocal = useMemo(() => {
    return gastosData
      .filter(gastoCumpleFiltros)
      .sort((a, b) => {
        const fechaA = new Date(a.fecha || "").getTime();
        const fechaB = new Date(b.fecha || "").getTime();
        const safeFechaA = Number.isNaN(fechaA) ? 0 : fechaA;
        const safeFechaB = Number.isNaN(fechaB) ? 0 : fechaB;
        return safeFechaB - safeFechaA;
      });
  }, [gastoCumpleFiltros]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCurrentPageLocal(1);
    }
  }, [filtroPaginacionKey, isAuthenticated]);

  const pagedGastosLocal = useMemo(() => {
    const pageStart = (currentPageLocal - 1) * PAGE_SIZE;
    return filteredGastosLocal.slice(pageStart, pageStart + PAGE_SIZE);
  }, [currentPageLocal, filteredGastosLocal, PAGE_SIZE]);

  const filteredGastos = isAuthenticated ? filteredGastosSharePoint : filteredGastosLocal;
  const gastosPagina = isAuthenticated ? pagedGastosSharePoint : pagedGastosLocal;
  const currentPage = isAuthenticated ? gastosPaginadosHook.currentPage : currentPageLocal;
  const hasPreviousPage = currentPage > 1;
  const hasNextPage = isAuthenticated
    ? gastosPaginadosHook.hasNextPage
    : (currentPage * PAGE_SIZE) < filteredGastosLocal.length;
  const cantidadGastosTexto = isAuthenticated && hasNextPage
    ? `${filteredGastos.length}+`
    : `${filteredGastos.length}`;

  // Mostrar meses desde el mes actual hacia atras hasta enero de 2026
  const mesesDisponibles = useMemo(() => {
    const START_YEAR = 2026;
    const inicioRango = new Date(START_YEAR, 0, 1);
    const cursor = new Date();
    cursor.setDate(1);

    if (cursor < inicioRango) return [];

    const meses: { key: string; label: string }[] = [];

    while (cursor >= inicioRango) {
      const mesKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const mesLabel = cursor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });

      meses.push({
        key: mesKey,
        label: mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1),
      });

      cursor.setMonth(cursor.getMonth() - 1);
    }

    return meses;
  }, []);

  // Ordenar proyectos alfabéticamente
  const proyectosOrdenados = useMemo(() => {
    return [...proyectosData].sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [proyectosData]);

  const handleSaveGasto = async (newGasto: Omit<Gasto, 'id'>) => {
    try {
    if (editingGasto) {
        if (isAuthenticated && !authLoading) {
          await gastosPaginadosHook.updateGasto(editingGasto.id, newGasto);
          toast({
            title: "Gasto actualizado",
            description: "El gasto se ha actualizado correctamente en SharePoint",
            variant: "success",
          });
        } else {
          toast({
            title: "No autenticado",
            description: "Por favor, inicia sesión para guardar en SharePoint",
            variant: "destructive",
          });
        }
      } else {
        if (isAuthenticated && !authLoading) {
          await gastosPaginadosHook.createGasto(newGasto);
          toast({
            title: "Gasto guardado",
            description: "El gasto se ha guardado correctamente en SharePoint",
            variant: "success",
          });
    } else {
          toast({
            title: "No autenticado",
            description: "Por favor, inicia sesión para guardar en SharePoint",
            variant: "destructive",
          });
        }
    }
    setEditingGasto(undefined);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al guardar el gasto",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (gasto: Gasto) => {
    setEditingGasto(gasto);
    setModalOpen(true);
  };

  const handleDelete = (id: string) => {
    console.log("🔍 handleDelete llamado con id:", id);
    
    if (!isAuthenticated || authLoading) {
      toast({
        title: "No autenticado",
        description: "Por favor, inicia sesión para eliminar gastos",
        variant: "destructive",
      });
      return;
    }
    
    const gasto = gastos.find(g => g.id === id);
    if (gasto) {
      const empresa = empresasData?.find(e => e.id === gasto.empresaId);
      const montoTotal = gasto.montoTotal !== undefined && gasto.montoTotal !== null 
        ? gasto.montoTotal 
        : gasto.monto;
      const detalle = gasto.detalle || 'Sin detalle';
      const nombreEmpresa = empresa?.razonSocial || 'Empresa desconocida';
      
      console.log("📝 Configurando diálogo para:", nombreEmpresa, montoTotal);
      setConfirmTitle("Eliminar gasto");
      setConfirmDescription(
        `¿Estás seguro de que deseas eliminar el gasto de "${nombreEmpresa}" por ${formatCurrency(montoTotal)} (${detalle})? Esta acción no se puede deshacer.`
      );
    } else {
      console.log("⚠️ Gasto no encontrado");
      setConfirmTitle("Eliminar gasto");
      setConfirmDescription("¿Estás seguro de que deseas eliminar este gasto? Esta acción no se puede deshacer.");
    }
    
    console.log("💾 Guardando ID del gasto a eliminar:", id);
    setGastoAEliminar(id);
    console.log("🔓 Abriendo diálogo de confirmación");
    setConfirmDialogOpen(true);
    console.log("✅ handleDelete completado - NO se eliminó nada aún");
  };

  const confirmDelete = async () => {
    console.log("🚨 confirmDelete llamado - ELIMINANDO AHORA");
    console.log("🗑️ ID del gasto a eliminar:", gastoAEliminar);
    
    if (!gastoAEliminar) {
      console.log("❌ No hay gasto para eliminar, saliendo");
      return;
    }
    
    const gasto = gastos.find(g => g.id === gastoAEliminar);
    const empresa = gasto ? empresasData?.find(e => e.id === gasto.empresaId) : null;
    const nombreEmpresa = empresa?.razonSocial || 'el gasto';
    
    console.log("🔥 Ejecutando eliminación para:", nombreEmpresa);
    
    try {
      await gastosPaginadosHook.deleteGasto(gastoAEliminar);
      console.log("✅ Gasto eliminado exitosamente");
      toast({
        title: "Gasto eliminado",
        description: `El gasto de "${nombreEmpresa}" se ha eliminado correctamente`,
        variant: "success",
      });
    } catch (error) {
      console.log("❌ Error al eliminar:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al eliminar el gasto",
        variant: "destructive",
      });
    } finally {
      setGastoAEliminar(null);
      console.log("🧹 Limpieza completada");
    }
  };

  return (
    <Layout onNewGasto={() => setModalOpen(true)}>
      <PageHeader 
        title="Gastos" 
        subtitle={
          loadingGastos 
            ? "Cargando gastos..." 
            : `${cantidadGastosTexto} gastos encontrados`
        }
        action={{ label: 'Nuevo Gasto', onClick: () => setModalOpen(true) }}
      />

      {/* Filters */}
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
              <SelectValue placeholder="Todas las categorías" />
            </SelectTrigger>
            <SelectContent className="bg-card">
              <SelectItem value="all">Todas las categorías</SelectItem>
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
              {tiposDocumentoOrdenados.map((tipo) => (
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

      {/* Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">FECHA</TableHead>
              <TableHead className="font-semibold">CATEGORÍA</TableHead>
              <TableHead className="font-semibold">EMPRESA</TableHead>
              <TableHead className="font-semibold">DOCUMENTO</TableHead>
              <TableHead className="font-semibold text-right">MONTO NETO</TableHead>
              <TableHead className="font-semibold text-right">IVA</TableHead>
              <TableHead className="font-semibold text-right">MONTO TOTAL</TableHead>
              <TableHead className="font-semibold text-center">ACCIONES</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingGastos ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <div className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                    <span className="text-muted-foreground">Cargando gastos...</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : filteredGastos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No se encontraron gastos
                </TableCell>
              </TableRow>
            ) : (
              gastosPagina.map((gasto) => {
                const empresa = empresasData?.find(e => e.id === gasto.empresaId);
              const colaborador = gasto.colaboradorId ? colaboradoresData.find(c => c.id === gasto.colaboradorId) : null;
              return (
                <TableRow key={gasto.id} className="animate-fade-in">
                  <TableCell>
                    <div>
                      <p className="text-muted-foreground">{formatDate(gasto.fecha)}</p>
                      {colaborador && (
                        <p className="font-medium text-sm mt-1">{colaborador.nombre}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <CategoryBadge categoryId={gasto.categoria} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{empresa?.razonSocial}</p>
                      <p className="text-sm text-muted-foreground">{empresa?.rut}</p>
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
                          console.log("🗑️ Botón de eliminar clickeado - abriendo diálogo");
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
            Página {currentPage} · Mostrando {gastosPagina.length} de {cantidadGastosTexto} gastos
          </p>

          <Pagination className="mx-0 w-auto justify-start sm:justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={!hasPreviousPage || loadingGastos ? "pointer-events-none opacity-50" : ""}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!hasPreviousPage || loadingGastos) return;

                    if (isAuthenticated) {
                      await gastosPaginadosHook.goToPreviousPage();
                    } else {
                      setCurrentPageLocal((prev) => Math.max(1, prev - 1));
                    }
                  }}
                />
              </PaginationItem>

              <PaginationItem>
                <PaginationLink href="#" size="default" isActive onClick={(e) => e.preventDefault()}>
                  Página {currentPage}
                </PaginationLink>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={!hasNextPage || loadingGastos ? "pointer-events-none opacity-50" : ""}
                  onClick={async (e) => {
                    e.preventDefault();
                    if (!hasNextPage || loadingGastos) return;

                    if (isAuthenticated) {
                      await gastosPaginadosHook.goToNextPage();
                    } else {
                      setCurrentPageLocal((prev) => prev + 1);
                    }
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
          setModalOpen(false);
          setEditingGasto(undefined);
        }}
        onSave={handleSaveGasto}
        gasto={editingGasto}
        nombreRegistrador={nombreRegistradorActual}
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
            // Limpiar el estado cuando se cierra el diálogo (cancelar o cerrar)
            setGastoAEliminar(null);
          }
        }}
        title={confirmTitle || "Eliminar gasto"}
        description={confirmDescription || "¿Estás seguro de que deseas eliminar este gasto? Esta acción no se puede deshacer."}
        onConfirm={confirmDelete}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </Layout>
  );
}
