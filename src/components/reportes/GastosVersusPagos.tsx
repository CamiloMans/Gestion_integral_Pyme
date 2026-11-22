import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TrendingDown } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatAmount, formatCompactAmount } from '@/lib/reportes-format';
import { describirPeriodo, resumirPromedios, type ResumenPromedios } from '@/lib/reportes-promedios';
import {
  EJE_ACUMULADO,
  EJE_MENSUAL,
  ETIQUETAS_SERIE,
  SERIES,
  SERIES_POR_DEFECTO,
  COLOR_GASTOS,
  COLOR_COBROS,
  ejesNecesarios,
  seriesVisibles as filtrarSeries,
  type ClaveSerie,
} from '@/lib/reportes-series';
import type { ReportesPortafolioResponse } from '@/services/postgresApi';

function GraficoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value?: number; name?: string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="flex items-center justify-between gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {ETIQUETAS_SERIE.get(item.name as ClaveSerie) ?? item.name}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{formatAmount(item.value || 0)}</span>
        </p>
      ))}
    </div>
  );
}

function Tile({ titulo, monto, nota }: { titulo: string; monto: number; nota?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{formatAmount(monto)}</p>
      {nota && <p className="mt-1 text-xs text-muted-foreground text-pretty">{nota}</p>}
    </div>
  );
}

function SelectorSeries({
  visibles,
  onChange,
}: {
  visibles: ClaveSerie[];
  onChange: (claves: ClaveSerie[]) => void;
}) {
  return (
    <ToggleGroup
      type="multiple"
      value={visibles}
      onValueChange={(claves) => onChange(claves as ClaveSerie[])}
      className="flex flex-wrap justify-start gap-2"
      aria-label="Series del grafico"
    >
      {SERIES.map((serie) => {
        const activa = visibles.includes(serie.clave);

        return (
          <ToggleGroupItem
            key={serie.clave}
            value={serie.clave}
            aria-label={serie.etiqueta}
            className="h-7 gap-1.5 rounded-full border border-border px-3 text-xs data-[state=on]:bg-muted"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: activa ? serie.color : 'hsl(215, 16%, 72%)' }}
            />
            {serie.etiqueta}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function notaDeDiferencia(resumen: ResumenPromedios) {
  if (resumen.diferencia > 0) return 'Se gasta mas rapido de lo que se cobra.';
  if (resumen.diferencia < 0) return 'Se cobra mas rapido de lo que se gasta.';
  return 'Los dos ritmos van iguales.';
}

function GraficoDiario({ data }: { data: ReportesPortafolioResponse }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground text-pretty">
        Con un mes elegido el grafico muestra sus dias. Vuelve a &quot;Todo el año&quot; para ver promedios y acumulados.
      </p>
      <div className="h-72 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data.trend} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
            <XAxis dataKey="label" stroke="hsl(215, 16%, 47%)" tickLine={false} axisLine={false} />
            <YAxis
              tickFormatter={(value) => formatCompactAmount(Number(value))}
              stroke="hsl(215, 16%, 47%)"
              tickLine={false}
              axisLine={false}
              width={58}
            />
            <Tooltip content={<GraficoTooltip />} />
            <Bar dataKey="expensesClp" name="gastos" fill={COLOR_GASTOS} radius={[3, 3, 0, 0]} maxBarSize={24} />
            <Line
              type="monotone"
              dataKey="paymentsClp"
              name="cobros"
              stroke={COLOR_COBROS}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Un solo grafico con las dos lecturas juntas: el mes a mes, sus promedios y
 * los acumulados. Cada serie se enciende o se apaga desde el selector, que
 * ademas hace de leyenda.
 *
 * Los acumulados van en su propio eje, a la derecha: son un orden de magnitud
 * mas grandes que el mes a mes y compartir eje aplastaria las barras.
 */
export function GastosVersusPagos({ data }: { data: ReportesPortafolioResponse }) {
  const [visibles, setVisibles] = useState<ClaveSerie[]>(SERIES_POR_DEFECTO);
  const resumen = useMemo(() => resumirPromedios(data.averages), [data.averages]);

  const esMesElegido = data.meta?.filters?.month !== 'all';

  const dibujables = filtrarSeries(visibles);
  const { mensual: usaEjeMensual, acumulado: usaEjeAcumulado } = ejesNecesarios(visibles);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Periodo seleccionado</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground text-balance">Gastos versus cobros</h2>
        </div>
        <TrendingDown className="h-5 w-5 text-muted-foreground" />
      </div>

      {esMesElegido ? (
        <GraficoDiario data={data} />
      ) : !resumen.puntos.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          El año elegido todavia no tiene meses con datos.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Tile titulo="Promedio mensual de gastos" monto={resumen.promedioGastos} />
            <Tile titulo="Promedio mensual de cobros" monto={resumen.promedioCobros} />
            <Tile titulo="Diferencia" monto={Math.abs(resumen.diferencia)} nota={notaDeDiferencia(resumen)} />
          </div>

          <SelectorSeries visibles={visibles} onChange={setVisibles} />

          <p className="text-xs text-muted-foreground text-pretty">{describirPeriodo(resumen)}</p>

          {dibujables.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Enciende al menos una serie para ver el grafico.
            </p>
          ) : (
            <div className="h-80 min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                {/* Sin animacion: al encender o apagar series recharts reutiliza
                    el grafico y las lineas quedaban sin dibujar. */}
                <ComposedChart data={resumen.puntos} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 32%, 91%)" />
                  <XAxis dataKey="label" stroke="hsl(215, 16%, 47%)" tickLine={false} axisLine={false} />
                  {usaEjeMensual && (
                    <YAxis
                      yAxisId={EJE_MENSUAL}
                      tickFormatter={(value) => formatCompactAmount(Number(value))}
                      stroke="hsl(215, 16%, 47%)"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                  )}
                  {usaEjeAcumulado && (
                    <YAxis
                      yAxisId={EJE_ACUMULADO}
                      orientation="right"
                      tickFormatter={(value) => formatCompactAmount(Number(value))}
                      stroke="hsl(215, 16%, 47%)"
                      tickLine={false}
                      axisLine={false}
                      width={58}
                    />
                  )}
                  <Tooltip content={<GraficoTooltip />} />

                  {dibujables.map((serie) => {
                    if (serie.forma === 'referencia') {
                      const valor = serie.clave === 'promedioGastos' ? resumen.promedioGastos : resumen.promedioCobros;
                      return (
                        <ReferenceLine
                          key={serie.clave}
                          yAxisId={EJE_MENSUAL}
                          y={valor}
                          stroke={serie.color}
                          strokeDasharray="5 4"
                        />
                      );
                    }

                    if (serie.forma === 'barra') {
                      return (
                        <Bar
                          key={serie.clave}
                          yAxisId={serie.eje}
                          dataKey={serie.clave}
                          name={serie.clave}
                          fill={serie.color}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={24}
                          isAnimationActive={false}
                        />
                      );
                    }

                    return (
                      <Line
                        key={serie.clave}
                        yAxisId={serie.eje}
                        type="monotone"
                        dataKey={serie.clave}
                        name={serie.clave}
                        stroke={serie.color}
                        strokeWidth={2.5}
                        strokeDasharray={serie.clave === 'aporteAcumulado' ? '4 3' : undefined}
                        dot={false}
                        isAnimationActive={false}
                      />
                    );
                  })}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {usaEjeAcumulado && (
            <p className="text-xs text-muted-foreground text-pretty">
              Los acumulados usan el eje de la derecha. REKOSOL ha puesto {formatAmount(resumen.aporteFinal)} para
              sostener lo seleccionado: {formatAmount(resumen.gastosAcumulados)} gastados contra{' '}
              {formatAmount(resumen.cobrosAcumulados)} cobrados.
              {resumen.tieneArrastre ? ' El acumulado arrastra lo ocurrido antes de enero.' : ''}
            </p>
          )}

          <p className="text-xs text-muted-foreground text-pretty">
            Las dos series son caja efectiva: gastos ya pagados y cobros ya recibidos. Los compromisos sin pagar no
            entran.
          </p>
        </div>
      )}
    </section>
  );
}
