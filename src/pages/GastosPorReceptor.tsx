import { useCallback, useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DetalleGastoDialog } from '@/components/DetalleGastoDialog';
import { DocumentoViewer } from '@/components/DocumentoViewer';
import { postgresApi, type BootstrapResponse } from '@/services/postgresApi';
import { formatCurrency, formatDate, type Gasto } from '@/data/mockData';
import {
  agruparPorReceptor,
  buscarReceptores,
  filtrarGastos,
  filtrarPorCategoria,
  ordenarReceptores,
  SIN_CLASIFICAR,
  totalizarReceptores,
  type CategoriaReceptor,
  type MovimientoReceptor,
  type OrdenReceptores,
  type ResumenReceptor,
} from '@/lib/gastos-por-receptor';
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Paperclip,
  Search,
  Users,
} from 'lucide-react';

type Archivo = NonNullable<Gasto['archivosAdjuntos']>[number];

const CATEGORIAS: Array<{ valor: CategoriaReceptor | 'all'; etiqueta: string }> = [
  { valor: 'all', etiqueta: 'Todas las categorias' },
  { valor: 'Empresa', etiqueta: 'Empresa' },
  { valor: 'Persona Natural', etiqueta: 'Persona Natural' },
  { valor: 'Sin individualizar', etiqueta: 'Sin individualizar' },
  { valor: SIN_CLASIFICAR, etiqueta: 'Sin clasificar' },
];

const ORDENES: Array<{ valor: OrdenReceptores; etiqueta: string }> = [
  { valor: 'pagado', etiqueta: 'Mas pagado' },
  { valor: 'pendiente', etiqueta: 'Mas pendiente' },
  { valor: 'movimientos', etiqueta: 'Mas movimientos' },
  { valor: 'reciente', etiqueta: 'Mas reciente' },
  { valor: 'nombre', etiqueta: 'Nombre' },
];

const claveReceptor = (receptor: ResumenReceptor) => receptor.empresaId ?? 'sin-receptor';

/** Receptores que se agregan a la lista en cada tramo. */
const TRAMO = 50;

export default function GastosPorReceptor() {
  const [bootstrap, setBootstrap] = useState<BootstrapResponse | null>(null);
  const [pagados, setPagados] = useState<Gasto[]>([]);
  const [pendientes, setPendientes] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState<CategoriaReceptor | 'all'>('all');
  const [proyectoId, setProyectoId] = useState('all');
  const [orden, setOrden] = useState<OrdenReceptores>('pagado');
  const [expandido, setExpandido] = useState<string | null>(null);

  const [gastoSeleccionado, setGastoSeleccionado] = useState<MovimientoReceptor | null>(null);
  const [archivo, setArchivo] = useState<Archivo | undefined>(undefined);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [catalogos, gastosPagados, gastosPendientes] = await Promise.all([
        postgresApi.getBootstrap(),
        postgresApi.getGastos(),
        postgresApi.getGastosPorPagar(),
      ]);

      setBootstrap(catalogos);
      setPagados(gastosPagados);
      setPendientes(gastosPendientes);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar los gastos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const catalogos = useMemo(
    () => ({
      empresas: bootstrap?.empresas ?? [],
      proyectos: bootstrap?.proyectos ?? [],
      categorias: bootstrap?.categorias ?? [],
    }),
    [bootstrap],
  );

  const receptores = useMemo(() => {
    const filtro = { proyectoId };

    return agruparPorReceptor(
      filtrarGastos(pagados, filtro),
      filtrarGastos(pendientes, filtro),
      catalogos,
    );
  }, [pagados, pendientes, catalogos, proyectoId]);

  const visibles = useMemo(
    () => ordenarReceptores(buscarReceptores(filtrarPorCategoria(receptores, categoria), busqueda), orden),
    [receptores, categoria, busqueda, orden],
  );

  const totales = useMemo(() => totalizarReceptores(visibles), [visibles]);

  // Hay cientos de receptores: se muestran por tramos para no armar toda la lista de una vez.
  const [limite, setLimite] = useState(TRAMO);
  useEffect(() => setLimite(TRAMO), [busqueda, categoria, proyectoId, orden]);
  const enPantalla = useMemo(() => visibles.slice(0, limite), [visibles, limite]);

  const tiposDocumento = useMemo(
    () => new Map((bootstrap?.tiposDocumento ?? []).map((tipo) => [tipo.id, tipo.nombre])),
    [bootstrap],
  );

  const proyectos = useMemo(
    () => new Map((bootstrap?.proyectos ?? []).map((proyecto) => [proyecto.id, proyecto])),
    [bootstrap],
  );

  const receptorDelGasto = useMemo(() => {
    if (!gastoSeleccionado) return undefined;
    return receptores.find((receptor) => receptor.empresaId === (gastoSeleccionado.gasto.empresaId ?? null));
  }, [gastoSeleccionado, receptores]);

  const alternar = (clave: string) => setExpandido((previo) => (previo === clave ? null : clave));

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Por receptor</h1>
          <p className="text-muted-foreground">
            Cuanto se le ha pagado a cada persona o proveedor, por que conceptos y en que proyectos.
          </p>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="busqueda">Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busqueda"
                  className="pl-9"
                  placeholder="Nombre o RUT"
                  value={busqueda}
                  onChange={(evento) => setBusqueda(evento.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="proyecto">Proyecto</Label>
              <Select value={proyectoId} onValueChange={setProyectoId}>
                <SelectTrigger id="proyecto">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proyectos</SelectItem>
                  {(bootstrap?.proyectos ?? []).map((proyecto) => (
                    <SelectItem key={proyecto.id} value={proyecto.id}>
                      {proyecto.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoria-receptor">Categoria</Label>
              <Select
                value={categoria}
                onValueChange={(valor) => setCategoria(valor as CategoriaReceptor | 'all')}
              >
                <SelectTrigger id="categoria-receptor">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((opcion) => (
                    <SelectItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="orden">Ordenar por</Label>
              <Select value={orden} onValueChange={(valor) => setOrden(valor as OrdenReceptores)}>
                <SelectTrigger id="orden">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDENES.map((opcion) => (
                    <SelectItem key={opcion.valor} value={opcion.valor}>
                      {opcion.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Totales del resultado filtrado"
        >
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Receptores</p>
            <p className="text-2xl font-bold">{totales.receptores}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Movimientos</p>
            <p className="text-2xl font-bold">{totales.movimientos}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Pagado</p>
            <p className="text-2xl font-bold">{formatCurrency(totales.pagado)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground">Comprometido pendiente</p>
            <p className="text-2xl font-bold">{formatCurrency(totales.pendiente)}</p>
          </Card>
        </div>

        {loading && (
          <Card className="flex items-center gap-3 p-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando movimientos...
          </Card>
        )}

        {error && !loading && (
          <Card className="space-y-3 p-6">
            <p className="text-destructive">{error}</p>
            <Button variant="outline" onClick={() => void cargar()}>
              Reintentar
            </Button>
          </Card>
        )}

        {!loading && !error && visibles.length === 0 && (
          <Card className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
            <Users className="h-8 w-8" />
            <p>Ningun receptor coincide con el filtro.</p>
          </Card>
        )}

        {!loading && !error && enPantalla.map((receptor) => {
          const clave = claveReceptor(receptor);
          const abierto = expandido === clave;

          return (
            <Card key={clave} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full flex-wrap items-center justify-between gap-4 p-4 text-left hover:bg-muted/50"
                onClick={() => alternar(clave)}
                aria-expanded={abierto}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{receptor.nombre}</span>
                    <Badge variant="outline">{receptor.categoria}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {receptor.rut || 'Sin RUT'}
                    {' · '}
                    {receptor.movimientos} movimiento{receptor.movimientos === 1 ? '' : 's'}
                    {receptor.ultimaFecha ? ` · ultimo ${formatDate(receptor.ultimaFecha)}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Pagado</p>
                    <p className="font-semibold">{formatCurrency(receptor.pagado)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Pendiente</p>
                    <p className={receptor.pendiente > 0 ? 'font-semibold text-amber-600' : 'font-semibold'}>
                      {formatCurrency(receptor.pendiente)}
                    </p>
                  </div>
                  {abierto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {abierto && (
                <div className="space-y-6 border-t bg-muted/20 p-4">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <div aria-label="Distribucion por proyecto">
                      <h3 className="mb-2 text-sm font-semibold">Por proyecto</h3>
                      <Distribucion filas={receptor.porProyecto} />
                    </div>
                    <div aria-label="Distribucion por categoria">
                      <h3 className="mb-2 text-sm font-semibold">Por categoria</h3>
                      <Distribucion filas={receptor.porCategoria} />
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold">
                      Movimientos ({receptor.movimientosDetalle.length})
                    </h3>
                    <div className="overflow-x-auto rounded-md border bg-card">
                      <table className="w-full text-sm" aria-label="Movimientos del receptor">
                        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 text-left">Fecha</th>
                            <th className="px-3 py-2 text-left">Documento</th>
                            <th className="px-3 py-2 text-left">Proyecto</th>
                            <th className="px-3 py-2 text-left">Categoria</th>
                            <th className="px-3 py-2 text-left">Rendido por</th>
                            <th className="px-3 py-2 text-left">Registrado por</th>
                            <th className="px-3 py-2 text-right">Monto</th>
                            <th className="px-3 py-2 text-left">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receptor.movimientosDetalle.map((movimiento) => (
                            <tr
                              key={movimiento.gasto.id}
                              className="cursor-pointer border-t hover:bg-muted/40"
                              onClick={() => setGastoSeleccionado(movimiento)}
                            >
                              <td className="whitespace-nowrap px-3 py-2">
                                {formatDate(movimiento.gasto.fecha)}
                              </td>
                              <td className="px-3 py-2">
                                <span className="flex items-center gap-2">
                                  {movimiento.gasto.numeroDocumento || 'Sin numero'}
                                  {movimiento.adjuntos > 0 && (
                                    <Paperclip className="h-3 w-3 text-muted-foreground" aria-label="Con respaldo" />
                                  )}
                                </span>
                              </td>
                              <td className="px-3 py-2">{movimiento.proyectoNombre}</td>
                              <td className="px-3 py-2">{movimiento.categoriaNombre}</td>
                              <td className="px-3 py-2">{movimiento.rendidoPor || '—'}</td>
                              <td className="px-3 py-2">{movimiento.registradoPor || '—'}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                                {formatCurrency(movimiento.monto)}
                              </td>
                              <td className="px-3 py-2">
                                {movimiento.pendiente ? (
                                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                                    Pendiente
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Pagado</Badge>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}

        {!loading && !error && visibles.length > enPantalla.length && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setLimite((previo) => previo + TRAMO)}
          >
            Mostrar mas receptores ({visibles.length - enPantalla.length} restantes)
          </Button>
        )}
      </div>

      <DetalleGastoDialog
        open={Boolean(gastoSeleccionado)}
        onClose={() => setGastoSeleccionado(null)}
        gasto={gastoSeleccionado?.gasto}
        categoriaNombre={gastoSeleccionado?.categoriaNombre}
        empresaNombre={receptorDelGasto?.nombre}
        empresaRut={receptorDelGasto?.rut}
        proyectoNombre={gastoSeleccionado?.proyectoNombre}
        proyectoCodigo={
          gastoSeleccionado?.proyectoId
            ? proyectos.get(gastoSeleccionado.proyectoId)?.codigoProyecto
            : undefined
        }
        tipoDocumentoNombre={
          gastoSeleccionado ? tiposDocumento.get(gastoSeleccionado.gasto.tipoDocumento) : undefined
        }
        registradoPorNombre={gastoSeleccionado?.registradoPor ?? undefined}
        onOpenAttachment={(adjunto) => setArchivo(adjunto)}
      />

      <DocumentoViewer
        open={Boolean(archivo)}
        onClose={() => setArchivo(undefined)}
        archivo={archivo}
      />
    </Layout>
  );
}

function Distribucion({ filas }: { filas: ResumenReceptor['porProyecto'] }) {
  if (!filas.length) {
    return <p className="text-sm text-muted-foreground">Sin movimientos.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">Concepto</th>
            <th className="px-3 py-2 text-right">Movimientos</th>
            <th className="px-3 py-2 text-right">Pagado</th>
            <th className="px-3 py-2 text-right">Pendiente</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.id ?? fila.nombre} className="border-t">
              <td className="px-3 py-2">{fila.nombre}</td>
              <td className="px-3 py-2 text-right">{fila.movimientos}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(fila.pagado)}</td>
              <td className="px-3 py-2 text-right">
                {fila.pendiente > 0 ? formatCurrency(fila.pendiente) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
