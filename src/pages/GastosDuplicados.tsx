import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { postgresApi, type GrupoDuplicado } from '@/services/postgresApi';
import { formatCurrency, formatDate } from '@/data/mockData';
import {
  CATALOGOS_VACIOS,
  construirComparacion,
  describirSeparacion,
  formatearTamano,
  type Catalogos,
} from '@/lib/gastos-duplicados';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, CopyCheck, ExternalLink, Loader2, Paperclip, Trash2, Undo2 } from 'lucide-react';

export default function GastosDuplicados() {
  const { toast } = useToast();
  const [grupos, setGrupos] = useState<GrupoDuplicado[]>([]);
  const [catalogos, setCatalogos] = useState<Catalogos>(CATALOGOS_VACIOS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({});
  const [conservar, setConservar] = useState<Record<string, string>>({});
  const [mostrarDescartados, setMostrarDescartados] = useState(false);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmAbierto, setConfirmAbierto] = useState(false);
  const [grupoAEliminar, setGrupoAEliminar] = useState<GrupoDuplicado | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [bootstrap, duplicados] = await Promise.all([
        postgresApi.getBootstrap(),
        postgresApi.getGastosDuplicados(),
      ]);

      setCatalogos({
        empresas: bootstrap.empresas || [],
        proyectos: bootstrap.proyectos || [],
        categorias: (bootstrap.categorias || []) as Categoria[],
        tiposDocumento: (bootstrap.tiposDocumento || []) as TipoDocumento[],
        colaboradores: bootstrap.colaboradores || [],
      });
      setGrupos(duplicados);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Error al cargar los duplicados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const pendientes = useMemo(() => grupos.filter((grupo) => !grupo.descartado), [grupos]);
  const descartados = useMemo(() => grupos.filter((grupo) => grupo.descartado), [grupos]);
  const visibles = mostrarDescartados ? descartados : pendientes;

  const alternarExpandido = (firma: string) =>
    setExpandidos((previo) => ({ ...previo, [firma]: !previo[firma] }));

  const idConservado = (grupo: GrupoDuplicado) => conservar[grupo.firma] || grupo.gastos[0]?.id || '';

  const pedirConfirmacionEliminar = (grupo: GrupoDuplicado) => {
    setGrupoAEliminar(grupo);
    setConfirmAbierto(true);
  };

  const eliminarSobrantes = async () => {
    const grupo = grupoAEliminar;
    if (!grupo) return;

    const conservado = idConservado(grupo);
    const aEliminar = grupo.gastos.filter((gasto) => gasto.id !== conservado);
    setProcesando(grupo.firma);

    try {
      for (const gasto of aEliminar) {
        await postgresApi.deleteGasto(gasto.id);
      }

      toast({
        title: aEliminar.length === 1 ? 'Copia eliminada' : 'Copias eliminadas',
        description: `Se elimino ${aEliminar.length} registro(s) y se conservo uno.`,
        variant: 'success',
      });
      await cargar();
    } catch (deleteError) {
      toast({
        title: 'Error',
        description: deleteError instanceof Error ? deleteError.message : 'No se pudieron eliminar las copias',
        variant: 'destructive',
      });
    } finally {
      setProcesando(null);
      setGrupoAEliminar(null);
    }
  };

  const cambiarDescarte = async (grupo: GrupoDuplicado, descartado: boolean) => {
    setProcesando(grupo.firma);

    try {
      await postgresApi.setDescarteDuplicado(grupo.gastos.map((gasto) => gasto.id), descartado);
      toast({
        title: descartado ? 'Marcados como gastos diferentes' : 'Vuelto a revision',
        description: descartado
          ? 'El grupo deja de aparecer como duplicado pendiente.'
          : 'El grupo vuelve a la lista de duplicados pendientes.',
        variant: 'success',
      });
      await cargar();
    } catch (descarteError) {
      toast({
        title: 'Error',
        description: descarteError instanceof Error ? descarteError.message : 'No se pudo actualizar el grupo',
        variant: 'destructive',
      });
    } finally {
      setProcesando(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Duplicados</h1>
            <p className="text-muted-foreground">
              Gastos que comparten empresa, numero de documento, fecha y monto total.
            </p>
          </div>

          <div className="flex gap-2">
            <Button
              variant={mostrarDescartados ? 'outline' : 'default'}
              onClick={() => setMostrarDescartados(false)}
            >
              Pendientes ({pendientes.length})
            </Button>
            <Button
              variant={mostrarDescartados ? 'default' : 'outline'}
              onClick={() => setMostrarDescartados(true)}
            >
              Marcados como diferentes ({descartados.length})
            </Button>
          </div>
        </div>

        {loading && (
          <Card className="flex items-center gap-3 p-6 text-muted-foreground">
            <Loader2 className="animate-spin" size={18} />
            Buscando duplicados...
          </Card>
        )}

        {!loading && error && (
          <Card className="flex items-center gap-3 border-destructive/40 p-6 text-destructive">
            <AlertTriangle size={18} />
            {error}
          </Card>
        )}

        {!loading && !error && visibles.length === 0 && (
          <Card className="flex items-center gap-3 p-6 text-muted-foreground">
            <CheckCircle2 size={18} className="text-emerald-600" />
            {mostrarDescartados
              ? 'No hay grupos marcados como gastos diferentes.'
              : 'No hay duplicados pendientes de revision.'}
          </Card>
        )}

        {!loading &&
          !error &&
          visibles.map((grupo) => {
            const abierto = Boolean(expandidos[grupo.firma]);
            const conservado = idConservado(grupo);
            const comparacion = construirComparacion(grupo.gastos, catalogos);
            const camposDistintos = comparacion.filter((fila) => !fila.iguales && !fila.metadato);
            const ocupado = procesando === grupo.firma;

            return (
              <Card key={grupo.firma} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => alternarExpandido(grupo.firma)}
                  aria-expanded={abierto}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">
                      {grupo.empresaNombre || 'Empresa no informada'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      #{grupo.numeroDocumento} · {formatDate(grupo.fecha)} · {formatCurrency(grupo.montoTotal)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {describirSeparacion(grupo.primeraCarga, grupo.ultimaCarga)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{grupo.gastos.length} registros</Badge>
                    {camposDistintos.length === 0 ? (
                      <Badge variant="outline">Identicos</Badge>
                    ) : (
                      <Badge variant="outline">{camposDistintos.length} campos distintos</Badge>
                    )}
                    {grupo.descartado && <Badge variant="outline">Marcado como diferentes</Badge>}
                    {abierto ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </button>

                {abierto && (
                  <div className="border-t p-4">
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[640px] border-collapse text-sm">
                        <thead>
                          <tr>
                            <th className="w-40 p-2 text-left font-medium text-muted-foreground">Campo</th>
                            {grupo.gastos.map((gasto, indice) => (
                              <th key={gasto.id} className="p-2 text-left align-top">
                                <div className="flex flex-col gap-1">
                                  <span className="font-semibold">Registro {indice + 1}</span>
                                  {!grupo.descartado && (
                                    <label className="flex items-center gap-2 text-xs font-normal">
                                      <input
                                        type="radio"
                                        name={`conservar-${grupo.firma}`}
                                        value={gasto.id}
                                        checked={conservado === gasto.id}
                                        onChange={() =>
                                          setConservar((previo) => ({ ...previo, [grupo.firma]: gasto.id }))
                                        }
                                      />
                                      Conservar este
                                    </label>
                                  )}
                                  <Link
                                    to={`/gastos?gastoId=${gasto.id}`}
                                    className="flex items-center gap-1 text-xs font-normal text-primary hover:underline"
                                  >
                                    <ExternalLink size={12} />
                                    Abrir en Gastos
                                  </Link>
                                </div>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparacion.map((fila) => (
                            <tr
                              key={fila.etiqueta}
                              className={
                                fila.iguales || fila.metadato
                                  ? 'border-t'
                                  : 'border-t bg-amber-50 dark:bg-amber-950/30'
                              }
                            >
                              <td className="p-2 align-top font-medium text-muted-foreground">
                                {fila.etiqueta}
                                {!fila.iguales && !fila.metadato && <span className="ml-1 text-amber-600">*</span>}
                              </td>
                              {fila.valores.map((valor, indice) => (
                                <td key={indice} className="p-2 align-top">
                                  {valor}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {grupo.gastos.some((gasto) => (gasto.archivosAdjuntos || []).length > 0) && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        {grupo.gastos.flatMap((gasto, indice) =>
                          (gasto.archivosAdjuntos || []).map((archivo) => (
                            <a
                              key={`${gasto.id}-${archivo.id}`}
                              href={archivo.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs hover:bg-muted"
                            >
                              <Paperclip size={14} />
                              Registro {indice + 1}: {archivo.nombre}
                              {archivo.tamano ? ` (${formatearTamano(archivo.tamano)})` : ''}
                            </a>
                          )),
                        )}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {grupo.descartado ? (
                        <Button
                          variant="outline"
                          className="gap-2"
                          disabled={ocupado}
                          onClick={() => cambiarDescarte(grupo, false)}
                        >
                          {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
                          Volver a tratar como duplicado
                        </Button>
                      ) : (
                        <>
                          <Button
                            variant="destructive"
                            className="gap-2"
                            disabled={ocupado}
                            onClick={() => pedirConfirmacionEliminar(grupo)}
                          >
                            {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                            Conservar el elegido y eliminar {grupo.gastos.length - 1}
                          </Button>
                          <Button
                            variant="outline"
                            className="gap-2"
                            disabled={ocupado}
                            onClick={() => cambiarDescarte(grupo, true)}
                          >
                            <CopyCheck size={16} />
                            Son gastos diferentes
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
      </div>

      <ConfirmDialog
        open={confirmAbierto}
        onOpenChange={(abierto) => {
          setConfirmAbierto(abierto);
          if (!abierto) setGrupoAEliminar(null);
        }}
        title="Eliminar copias del gasto"
        description={
          grupoAEliminar
            ? `Se eliminaran ${grupoAEliminar.gastos.length - 1} de ${grupoAEliminar.gastos.length} registros de ` +
              `#${grupoAEliminar.numeroDocumento} (${formatCurrency(grupoAEliminar.montoTotal)}), junto con sus ` +
              'archivos adjuntos. Se conservara el registro marcado. Esta accion no se puede deshacer.'
            : ''
        }
        onConfirm={eliminarSobrantes}
      />
    </Layout>
  );
}
