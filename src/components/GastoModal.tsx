import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { categorias as categoriasMock, empresasData as empresasDataMock, proyectosData, Gasto, Proyecto, Empresa } from '@/data/mockData';
import { formatNumericInput, parseNumericInput } from '@/lib/numeric-input';
import { Save, Plus, Paperclip, Search } from 'lucide-react';
import { ProyectoModal } from './ProyectoModal';
import { EmpresaModal } from './EmpresaModal';
import { CategoriaModal } from './CategoriaModal';
import { ConfirmDialog } from './ConfirmDialog';
import { useProyectos, useEmpresas, useCategorias, useTiposDocumento, useSharePointAuth } from '@/hooks/useSharePoint';
import type { Categoria } from '@/services/sharepointService';

interface GastoModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (gasto: Omit<Gasto, 'id'>) => void;
  gasto?: Gasto;
  nombreRegistrador?: string;
}

const tiposDocumentoMock = ['Factura', 'Orden de Compra', 'Boleta', 'Sin Documento', 'Otros'] as const;

export function GastoModal({ open, onClose, onSave, gasto, nombreRegistrador }: GastoModalProps) {
  const { isAuthenticated } = useSharePointAuth();
  const { proyectos: proyectosSharePoint, createProyecto: createProyectoSharePoint } = useProyectos();
  const { empresas: empresasSharePoint, createEmpresa: createEmpresaSharePoint } = useEmpresas();
  const { categorias: categoriasSharePoint, createCategoria: createCategoriaSharePoint, loadCategorias: loadCategoriasSharePoint } = useCategorias();
  const { tiposDocumento: tiposDocumentoSharePoint } = useTiposDocumento();
  
  // Estados
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [categoria, setCategoria] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<string>(''); // Guardar el ID del tipo de documento
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [proyectoId, setProyectoId] = useState('');
  const [monto, setMonto] = useState('');
  const [montoNeto, setMontoNeto] = useState('');
  const [montoIva, setMontoIva] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [detalle, setDetalle] = useState('');
  const [comentarioTipoDocumento, setComentarioTipoDocumento] = useState('');
  const [proyectoModalOpen, setProyectoModalOpen] = useState(false);
  const [empresaModalOpen, setEmpresaModalOpen] = useState(false);
  const [categoriaModalOpen, setCategoriaModalOpen] = useState(false);
  const [archivosAdjuntos, setArchivosAdjuntos] = useState<File[]>([]);
  const [filtroCategoriaEmpresa, setFiltroCategoriaEmpresa] = useState<'Empresa' | 'Persona Natural' | 'all'>('all');
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [archivoAEliminar, setArchivoAEliminar] = useState<number | null>(null);
  
  // Usar datos de SharePoint si está autenticado, sino usar datos mock
  const proyectos = isAuthenticated ? (proyectosSharePoint || []) : proyectosData;
  const todasLasEmpresas = isAuthenticated ? (empresasSharePoint || []) : empresasDataMock;
  
  // Ordenar proyectos alfabéticamente
  const proyectosOrdenados = useMemo(() => {
    return [...proyectos].sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [proyectos]);
  
  // Filtrar empresas según la categoría seleccionada y la búsqueda
  // Ordenar empresas alfabéticamente
  const empresas = useMemo(() => {
    let empresasFiltradas = todasLasEmpresas;
    
    // Filtrar por categoría
    if (filtroCategoriaEmpresa !== 'all') {
      empresasFiltradas = empresasFiltradas.filter(emp => emp.categoria === filtroCategoriaEmpresa);
    }
    
    // Filtrar por búsqueda
    if (busquedaEmpresa.trim() !== '') {
      const busquedaLower = busquedaEmpresa.toLowerCase().trim();
      empresasFiltradas = empresasFiltradas.filter(emp => 
        emp.razonSocial.toLowerCase().includes(busquedaLower) ||
        emp.rut.toLowerCase().includes(busquedaLower)
      );
    }
    
    // Ordenar alfabéticamente por razón social
    return empresasFiltradas.sort((a, b) => 
      a.razonSocial.localeCompare(b.razonSocial, 'es', { sensitivity: 'base' })
    );
  }, [todasLasEmpresas, filtroCategoriaEmpresa, busquedaEmpresa]);
  
  // Mapear categorías de SharePoint al formato esperado (id, nombre, color)
  // Asegurar que los IDs sean strings para el componente Select
  // Usar useMemo para evitar recrear el array en cada render
  // Ordenar categorías alfabéticamente
  const categorias = useMemo(() => {
    let categoriasMapeadas;
    if (isAuthenticated && categoriasSharePoint.length > 0) {
      categoriasMapeadas = categoriasSharePoint.map(cat => ({
        id: String(cat.id), // Convertir a string para el Select
        nombre: cat.nombre,
        color: cat.color || `bg-category-${cat.id}`,
      }));
    } else {
      categoriasMapeadas = categoriasMock;
    }
    
    // Ordenar alfabéticamente por nombre
    return categoriasMapeadas.sort((a, b) => 
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [isAuthenticated, categoriasSharePoint]);
  
  // Usar tipos de documento de SharePoint si está autenticado, sino usar datos mock
  // IMPORTANTE: Necesitamos los IDs para guardar en el campo lookup
  // Ordenar alfabéticamente, pero "Otro" o "Otros" siempre al final
  const tiposDocumento = useMemo(() => {
    let tipos: Array<{ id: string; nombre: string; tieneImpuestos?: boolean; valorImpuestos?: number }> = [];
    
    if (isAuthenticated && tiposDocumentoSharePoint.length > 0) {
      tipos = tiposDocumentoSharePoint.map(tipo => ({
        id: String(tipo.id), // Convertir a string para el Select
        nombre: tipo.nombre,
        tieneImpuestos: tipo.tieneImpuestos,
        valorImpuestos: tipo.valorImpuestos,
      }));
    } else {
      // Para datos mock, crear objetos con id y nombre
      tipos = tiposDocumentoMock.map((nombre, index) => ({
        id: String(index + 1), // IDs temporales para mock
        nombre: nombre,
        tieneImpuestos: false,
        valorImpuestos: undefined,
      }));
    }
    
    // Ordenar alfabéticamente, pero "Otro" o "Otros" siempre al final
    return tipos.sort((a, b) => {
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
  }, [isAuthenticated, tiposDocumentoSharePoint]);
  
  // Obtener el tipo de documento seleccionado con su información de impuestos
  const tipoDocumentoSeleccionado = useMemo(() => {
    const encontrado = tiposDocumento.find(t => t.id === tipoDocumento);
    if (encontrado) {
      console.log('🔍 Tipo documento seleccionado:', encontrado.nombre);
      console.log('🔍 Tiene impuestos:', encontrado.tieneImpuestos);
      console.log('🔍 Valor impuesto:', encontrado.valorImpuestos);
    }
    return encontrado;
  }, [tiposDocumento, tipoDocumento]);
  
  const aplicaImpuesto = tipoDocumentoSeleccionado?.tieneImpuestos || false;
  const valorImpuesto = tipoDocumentoSeleccionado?.valorImpuestos || 0;
  
  // Limpiar campos de impuestos cuando cambia el tipo de documento
  useEffect(() => {
    if (!aplicaImpuesto) {
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
    }
  }, [aplicaImpuesto]);
  
  // Calcular Monto Neto e IVA cuando cambia el Monto Total (campo monto)
  useEffect(() => {
    const total = parseNumericInput(monto, { allowDecimal: false });

    if (aplicaImpuesto && Number.isFinite(total)) {
      if (total > 0 && valorImpuesto > 0) {
        // Calcular neto: total / (1 + valorImpuesto)
        const neto = total / (1 + valorImpuesto);
        const iva = total - neto;
        
        setMontoNeto(neto.toFixed(0));
        setMontoIva(iva.toFixed(0));
        setMontoTotal(total.toFixed(0));
      } else {
        setMontoNeto('');
        setMontoIva('');
        setMontoTotal('');
      }
    } else if (aplicaImpuesto && !monto) {
      // Si aplica impuesto pero no hay monto total, limpiar neto e IVA
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
    } else if (!aplicaImpuesto && Number.isFinite(total)) {
      // Si no aplica impuesto, el monto es el total
      setMontoTotal(total.toFixed(0));
      setMontoNeto('');
      setMontoIva('');
    }
  }, [monto, aplicaImpuesto, valorImpuesto]);

  useEffect(() => {
    if (gasto) {
      // Convertir la fecha al formato YYYY-MM-DD para el input de tipo date
      let fechaFormateada = '';
      if (gasto.fecha) {
        try {
          const fecha = new Date(gasto.fecha);
          if (!isNaN(fecha.getTime())) {
            fechaFormateada = fecha.toISOString().split('T')[0];
          } else {
            // Si ya está en formato YYYY-MM-DD, usarlo directamente
            fechaFormateada = gasto.fecha.split('T')[0];
          }
        } catch (e) {
          // Si hay error, intentar usar la fecha directamente
          fechaFormateada = gasto.fecha.split('T')[0];
        }
      }
      setFecha(fechaFormateada || new Date().toISOString().split('T')[0]);
      // La categoría viene como ID desde SharePoint (campo lookup)
      // Buscar la categoría por ID y asegurar que sea string
      // Usar categorias del scope actual (no en dependencias para evitar loop)
      const categoriaEncontrada = categorias.find(cat => String(cat.id) === String(gasto.categoria));
      setCategoria(categoriaEncontrada ? String(categoriaEncontrada.id) : String(gasto.categoria || ''));
      // tipoDocumento viene como ID desde SharePoint (campo lookup)
      setTipoDocumento(String(gasto.tipoDocumento || ''));
      setNumeroDocumento(gasto.numeroDocumento);
      setEmpresaId(gasto.empresaId);
      setProyectoId(gasto.proyectoId || '');
      // Cargar el monto total (el campo monto ahora es el total)
      // Los valores de montoNeto e iva se calcularán automáticamente con el useEffect
      if (gasto.montoTotal !== undefined && gasto.montoTotal !== null) {
        setMonto(formatNumericInput(gasto.montoTotal.toString(), { allowDecimal: false }));
      } else {
        // Fallback: usar monto si no hay montoTotal
        setMonto(formatNumericInput(gasto.monto.toString(), { allowDecimal: false }));
      }
      // Inicializar valores vacíos, el useEffect los calculará
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
      setDetalle(gasto.detalle || '');
      setComentarioTipoDocumento(gasto.comentarioTipoDocumento || '');
    } else {
      setFecha(new Date().toISOString().split('T')[0]);
      setCategoria('');
            setTipoDocumento(''); // Resetear a vacío, se seleccionará desde el dropdown
      setNumeroDocumento('');
      setEmpresaId('');
      setProyectoId('');
      setMonto('');
      setMontoNeto('');
      setMontoIva('');
      setMontoTotal('');
      setDetalle('');
      setComentarioTipoDocumento('');
      setArchivosAdjuntos([]);
      setFiltroCategoriaEmpresa('all');
      setBusquedaEmpresa('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gasto, open]); // categorias está en useMemo, no necesita estar en dependencias
  
  // Auto-seleccionar "Persona Natural" cuando se selecciona la categoría "Honorarios"
  useEffect(() => {
    if (categoria) {
      const categoriaSeleccionada = categorias.find(cat => String(cat.id) === String(categoria));
      if (categoriaSeleccionada && categoriaSeleccionada.nombre === 'Honorarios') {
        setFiltroCategoriaEmpresa('Persona Natural');
      }
    }
  }, [categoria, categorias]);
  
  // Resetear el filtro y la empresa seleccionada cuando cambia el filtro
  useEffect(() => {
    if (filtroCategoriaEmpresa !== 'all' && empresaId) {
      const empresaSeleccionada = todasLasEmpresas.find(e => e.id === empresaId);
      if (empresaSeleccionada && empresaSeleccionada.categoria !== filtroCategoriaEmpresa) {
        setEmpresaId('');
      }
    }
  }, [filtroCategoriaEmpresa, todasLasEmpresas, empresaId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Para campos lookup en SharePoint, necesitamos guardar el ID, no el nombre
    // tipoDocumento ahora es el ID del tipo de documento
    const tipoDocumentoSeleccionado = tiposDocumento.find(t => t.id === tipoDocumento);
    const esOtros = tipoDocumentoSeleccionado?.nombre === 'Otros' || tipoDocumentoSeleccionado?.nombre === 'Otro';
    
    // Preparar archivos adjuntos: incluir el File object para poder subirlo a SharePoint
    const archivosFormateados = archivosAdjuntos.map(archivo => ({
      nombre: archivo.name,
      url: URL.createObjectURL(archivo),
      tipo: archivo.type || 'application/octet-stream',
      file: archivo, // Incluir el File object para subirlo a SharePoint
    }));
    
    console.log("💾 Guardando gasto con tipo de documento ID:", tipoDocumento, "tipo:", typeof tipoDocumento);
    
    // Calcular valores de impuestos si aplica
    // El campo monto ahora es siempre el Monto Total
    const montoTotalParsed = parseNumericInput(monto, { allowDecimal: false });
    const montoNetoParsed = parseNumericInput(montoNeto, { allowDecimal: false });
    const montoIvaParsed = parseNumericInput(montoIva, { allowDecimal: false });
    const montoTotalValue = Number.isFinite(montoTotalParsed) ? montoTotalParsed : 0;
    const montoNetoValue = aplicaImpuesto && Number.isFinite(montoNetoParsed) ? montoNetoParsed : undefined;
    const ivaValue = aplicaImpuesto && Number.isFinite(montoIvaParsed) ? montoIvaParsed : undefined;
    
    onSave({
      fecha,
      categoria: categoria, // Guardar el ID para campos lookup
      tipoDocumento: tipoDocumento, // Guardar el ID del tipo de documento
      numeroDocumento,
      empresaId,
      proyectoId: proyectoId || undefined,
      monto: montoTotalValue, // Mantener monto para compatibilidad interna, pero será igual a montoTotal
      montoNeto: montoNetoValue,
      iva: ivaValue,
      montoTotal: montoTotalValue, // Siempre guardar el monto total
      detalle,
      comentarioTipoDocumento: esOtros && comentarioTipoDocumento ? comentarioTipoDocumento : undefined,
      archivosAdjuntos: archivosFormateados.length > 0 ? archivosFormateados : undefined,
    });
    onClose();
  };

  const handleSaveProyecto = async (nuevoProyecto: Omit<Proyecto, 'id' | 'createdAt'>) => {
    try {
      if (isAuthenticated && createProyectoSharePoint) {
        // Guardar en SharePoint
        const proyectoCreado = await createProyectoSharePoint(nuevoProyecto);
        setProyectoId(proyectoCreado.id);
      } else {
        // Fallback a datos locales
        const proyectoCreado: Proyecto = {
          ...nuevoProyecto,
          id: Date.now().toString(),
          createdAt: new Date().toISOString().split('T')[0],
        };
        setProyectoId(proyectoCreado.id);
      }
      setProyectoModalOpen(false);
    } catch (error) {
      console.error("Error al guardar proyecto:", error);
      // En caso de error, usar fallback local
    const proyectoCreado: Proyecto = {
      ...nuevoProyecto,
      id: Date.now().toString(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setProyectoId(proyectoCreado.id);
    setProyectoModalOpen(false);
    }
  };

  const handleSaveEmpresa = async (nuevaEmpresa: Omit<Empresa, 'id' | 'createdAt'>) => {
    try {
      if (isAuthenticated && createEmpresaSharePoint) {
        // Guardar en SharePoint
        const empresaCreada = await createEmpresaSharePoint(nuevaEmpresa);
        setEmpresaId(empresaCreada.id);
      } else {
        // Fallback a datos locales
        const empresaCreada: Empresa = {
          ...nuevaEmpresa,
          id: Date.now().toString(),
          createdAt: new Date().toISOString().split('T')[0],
        };
        setEmpresaId(empresaCreada.id);
      }
      setEmpresaModalOpen(false);
    } catch (error) {
      console.error("Error al guardar empresa:", error);
      // En caso de error, usar fallback local
    const empresaCreada: Empresa = {
      ...nuevaEmpresa,
      id: Date.now().toString(),
      createdAt: new Date().toISOString().split('T')[0],
    };
    setEmpresaId(empresaCreada.id);
    setEmpresaModalOpen(false);
    }
  };

  const handleSaveCategoria = async (nuevaCategoria: Omit<Categoria, 'id'>) => {
    try {
      if (isAuthenticated && createCategoriaSharePoint) {
        // Guardar en SharePoint
        const categoriaCreada = await createCategoriaSharePoint(nuevaCategoria);
        // Recargar las categorías para actualizar la lista (forzar refresh para obtener la nueva)
        if (loadCategoriasSharePoint) {
          await loadCategoriasSharePoint(true);
        }
        setCategoria(String(categoriaCreada.id));
      } else {
        // Fallback a datos locales - crear una categoría temporal
        const categoriaCreada: Categoria = {
          ...nuevaCategoria,
          id: Date.now().toString(),
        };
        setCategoria(categoriaCreada.id);
      }
      setCategoriaModalOpen(false);
    } catch (error) {
      console.error("Error al guardar categoría:", error);
      // En caso de error, usar fallback local
      const categoriaCreada: Categoria = {
        ...nuevaCategoria,
        id: Date.now().toString(),
      };
      setCategoria(categoriaCreada.id);
      setCategoriaModalOpen(false);
    }
  };

  const montoValue = parseNumericInput(monto, { allowDecimal: false });
  const montoNetoValue = parseNumericInput(montoNeto, { allowDecimal: false });
  const montoIvaValue = parseNumericInput(montoIva, { allowDecimal: false });

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {gasto ? 'Editar Gasto' : 'Nuevo Gasto'}
            {nombreRegistrador && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({nombreRegistrador})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="proyecto">Proyecto</Label>
            <div className="flex gap-2">
              <Select value={String(proyectoId || '')} onValueChange={(value) => setProyectoId(value)}>
                <SelectTrigger className="flex-1 bg-card">
                  <SelectValue placeholder="Seleccionar proyecto" />
                </SelectTrigger>
                <SelectContent className="bg-card">
                  {proyectosOrdenados.map((proyecto) => (
                    <SelectItem key={proyecto.id} value={String(proyecto.id)}>
                      {proyecto.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={() => setProyectoModalOpen(true)}
              >
                <Plus size={18} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 min-w-0">
              <Label htmlFor="fecha">Fecha *</Label>
              <Input
                id="fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className="w-full h-10 min-w-0"
                style={{ 
                  WebkitAppearance: 'none', 
                  appearance: 'none',
                  minWidth: 0,
                  maxWidth: '100%'
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoría *</Label>
              <div className="flex gap-2">
                <Select value={String(categoria)} onValueChange={(value) => setCategoria(value)} required>
                  <SelectTrigger className="flex-1 bg-card w-full h-10">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent className="bg-card">
                    {categorias.length > 0 ? (
                      categorias.map((cat) => (
                        <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.nombre}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="" disabled>
                        No hay categorías disponibles
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button 
                  type="button" 
                  variant="outline" 
                  size="icon"
                  onClick={() => setCategoriaModalOpen(true)}
                >
                  <Plus size={18} />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tipoDocumento">Tipo de Documento *</Label>
            <Select 
              value={tipoDocumento || undefined} 
              onValueChange={(value) => setTipoDocumento(value)} 
              required
            >
              <SelectTrigger className="bg-card" id="tipoDocumento">
                <SelectValue placeholder="Seleccionar documento" />
              </SelectTrigger>
              <SelectContent className="bg-card">
                {tiposDocumento.length > 0 ? (
                  tiposDocumento.map((tipo) => (
                    <SelectItem key={tipo.id} value={tipo.id}>
                      {tipo.nombre}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="" disabled>
                    No hay tipos de documento disponibles
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {(() => {
              const tipoSeleccionado = tiposDocumento.find(t => t.id === tipoDocumento);
              const nombreNormalizado = tipoSeleccionado?.nombre?.toLowerCase() || '';
              const esOtros = nombreNormalizado === 'otros' || nombreNormalizado === 'otro';
              return esOtros && (
                <div className="space-y-2 pt-2">
                  <Label htmlFor="comentarioTipoDocumento">Especificar tipo de documento *</Label>
                  <Input
                    id="comentarioTipoDocumento"
                    placeholder="Ej: NOTA DE CRÉDITO, RECIBO, ETC."
                    value={comentarioTipoDocumento}
                    onChange={(e) => setComentarioTipoDocumento(e.target.value.toUpperCase())}
                    required
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
              );
            })()}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="numeroDocumento">Número de Documento</Label>
              <Input
                id="numeroDocumento"
                placeholder="Ej: 001234"
                value={numeroDocumento}
                onChange={(e) => setNumeroDocumento(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="empresa">Empresa *</Label>
              <ToggleGroup 
                type="single" 
                value={filtroCategoriaEmpresa} 
                onValueChange={(value) => {
                  if (value) {
                    setFiltroCategoriaEmpresa(value as 'Empresa' | 'Persona Natural' | 'all');
                  } else {
                    setFiltroCategoriaEmpresa('all');
                  }
                }}
                className="h-8"
              >
                <ToggleGroupItem value="all" className="text-xs px-2 py-1 h-7 data-[state=on]:bg-muted">
                  Todas
                </ToggleGroupItem>
                <ToggleGroupItem value="Empresa" className="text-xs px-2 py-1 h-7 data-[state=on]:bg-muted">
                  Empresa
                </ToggleGroupItem>
                <ToggleGroupItem value="Persona Natural" className="text-xs px-2 py-1 h-7 data-[state=on]:bg-muted">
                  Persona Natural
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex gap-2">
              <Select value={String(empresaId || '')} onValueChange={(value) => setEmpresaId(value)} required>
                <SelectTrigger className="flex-1 bg-card">
                  <SelectValue placeholder="Seleccionar empresa" />
                </SelectTrigger>
                <SelectContent className="bg-card p-0">
                  <div className="flex items-center border-b px-3 py-2">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                    <Input
                      placeholder="Buscar empresa..."
                      value={busquedaEmpresa}
                      onChange={(e) => {
                        e.stopPropagation();
                        setBusquedaEmpresa(e.target.value);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="h-8 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {empresas.length > 0 ? (
                      empresas.map((empresa) => (
                        <SelectItem key={empresa.id} value={String(empresa.id)}>
                          {empresa.razonSocial}
                        </SelectItem>
                      ))
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        {busquedaEmpresa.trim() !== '' 
                          ? 'No se encontraron empresas con ese criterio'
                          : 'No hay empresas disponibles para esta categoría'}
                      </div>
                    )}
                  </div>
                </SelectContent>
              </Select>
              <Button 
                type="button" 
                variant="outline" 
                size="icon"
                onClick={() => setEmpresaModalOpen(true)}
              >
                <Plus size={18} />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="monto">Monto Total (CLP) *</Label>
            <div className="flex gap-2">
              <Input
                id="monto"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={monto}
                onChange={(e) => setMonto(formatNumericInput(e.target.value, { allowDecimal: false }))}
                required
                className="flex-1"
              />
              <input
                type="file"
                id="archivosAdjuntos"
                multiple
                className="hidden"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setArchivosAdjuntos([...archivosAdjuntos, ...files]);
                  // Resetear el input para permitir seleccionar el mismo archivo nuevamente
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => document.getElementById('archivosAdjuntos')?.click()}
                title="Adjuntar documentos"
              >
                <Paperclip size={18} />
              </Button>
            </div>
            {aplicaImpuesto && (
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between items-center text-sm pt-2 border-t">
                  <span className="font-semibold">Monto Total:</span>
                  <span className="font-bold text-lg">
                    {Number.isFinite(montoValue) && montoValue > 0
                      ? montoValue.toLocaleString('es-CL')
                      : '0'} CLP
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Monto Neto:</span>
                  <span className="font-medium">
                    {Number.isFinite(montoNetoValue) && montoNetoValue > 0
                      ? montoNetoValue.toLocaleString('es-CL')
                      : '0'} CLP
                  </span>
                </div>
                {valorImpuesto > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Monto IVA ({(valorImpuesto * 100).toFixed(2)}%):</span>
                    <span className="font-medium">
                      {Number.isFinite(montoIvaValue) && montoIvaValue > 0
                        ? montoIvaValue.toLocaleString('es-CL')
                        : '0'} CLP
                    </span>
                  </div>
                )}
              </div>
            )}
            {!aplicaImpuesto && monto && (
              <div className="mt-3 space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex justify-between items-center text-sm pt-2 border-t">
                  <span className="font-semibold">Monto Total:</span>
                  <span className="font-bold text-lg">
                    {Number.isFinite(montoValue) && montoValue > 0
                      ? montoValue.toLocaleString('es-CL')
                      : '0'} CLP
                  </span>
                </div>
              </div>
            )}
            {archivosAdjuntos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {archivosAdjuntos.map((archivo, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md text-sm"
                  >
                    <span className="truncate max-w-[200px]">{archivo.name}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      onClick={() => {
                        setArchivoAEliminar(index);
                        setConfirmDialogOpen(true);
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="detalle">Detalle</Label>
            <Textarea
              id="detalle"
              placeholder="DESCRIPCIÓN ADICIONAL DEL GASTO..."
              value={detalle}
              onChange={(e) => setDetalle(e.target.value.toUpperCase())}
              rows={3}
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="gap-2">
              <Save size={18} />
              Guardar
            </Button>
          </div>
        </form>
        </DialogContent>
      </Dialog>
      
      <ProyectoModal
        open={proyectoModalOpen}
        onClose={() => setProyectoModalOpen(false)}
        onSave={handleSaveProyecto}
      />
      
      <EmpresaModal
        open={empresaModalOpen}
        onClose={() => setEmpresaModalOpen(false)}
        onSave={handleSaveEmpresa}
      />
      
      <CategoriaModal
        open={categoriaModalOpen}
        onClose={() => setCategoriaModalOpen(false)}
        onSave={handleSaveCategoria}
      />
      
      <ConfirmDialog
        open={confirmDialogOpen}
        onOpenChange={(open) => {
          setConfirmDialogOpen(open);
          if (!open) {
            // Limpiar el estado cuando se cierra el diálogo (cancelar o cerrar)
            setArchivoAEliminar(null);
          }
        }}
        title="Eliminar archivo adjunto"
        description={
          archivoAEliminar !== null && archivosAdjuntos[archivoAEliminar]
            ? `¿Estás seguro de que deseas eliminar el archivo "${archivosAdjuntos[archivoAEliminar].name}"? Esta acción no se puede deshacer.`
            : "¿Estás seguro de que deseas eliminar este archivo adjunto? Esta acción no se puede deshacer."
        }
        onConfirm={() => {
          if (archivoAEliminar !== null) {
            const nuevosArchivos = archivosAdjuntos.filter((_, i) => i !== archivoAEliminar);
            setArchivosAdjuntos(nuevosArchivos);
            setArchivoAEliminar(null);
          }
        }}
        confirmText="Eliminar"
        cancelText="Cancelar"
      />
    </>
  );
}
