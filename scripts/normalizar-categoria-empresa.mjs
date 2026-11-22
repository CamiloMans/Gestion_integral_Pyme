/**
 * Normaliza dim_empresa.categoria.
 *
 * Hace dos cosas:
 *   1. Unifica las variantes de escritura (EMPRESA -> Empresa, PERSONA NATURAL -> Persona Natural).
 *   2. Clasifica los registros sin categoria a partir del RUT, porque el nombre no sirve
 *      para distinguir persona de empresa (EMMANUEL GONZALEZ tiene RUT de empresa y
 *      ANGOVET tiene RUN de persona). Lo que no se puede determinar queda como
 *      "Sin individualizar": conceptos de gasto usados como receptor, RUT de relleno
 *      y RUT mal formados.
 *
 * Por defecto solo simula. Para escribir en la base:
 *   node scripts/normalizar-categoria-empresa.mjs --aplicar
 *
 * Lee la conexion desde .env, igual que server/db.js.
 */
import 'dotenv/config';
import pg from 'pg';

const APLICAR = process.argv.includes('--aplicar');
const TENANT_SLUG = process.env.TENANT_SLUG ?? 'rekosol';

const EMPRESA = 'Empresa';
const PERSONA = 'Persona Natural';
const SIN_INDIVIDUALIZAR = 'Sin individualizar';

/** Primer RUT de empresa en Chile. Bajo este numero el rol es de persona. */
const PRIMER_RUT_EMPRESA = 50_000_000;

/** RUT usados como relleno cuando no se individualiza al receptor. */
const RUT_DE_RELLENO = new Set(['111111111', '111111112', '000000000']);

/** Receptores sin RUT en la base que si sabemos clasificar. */
const CLASIFICACION_MANUAL = new Map([['SODIMAC', EMPRESA]]);

/** Variantes de escritura que se unifican al valor canonico. */
const EQUIVALENCIAS = new Map([
  ['empresa', EMPRESA],
  ['persona natural', PERSONA],
  ['sin individualizar', SIN_INDIVIDUALIZAR],
]);

/** Deja el RUT en digitos mas digito verificador, sin puntos ni guion. */
const limpiarRut = (valor) => (valor ?? '').toString().trim().toUpperCase().replace(/[^0-9K]/g, '');

/** Digito verificador por modulo 11. */
export const digitoVerificador = (cuerpo) => {
  let suma = 0;
  let factor = 2;

  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const resto = 11 - (suma % 11);
  if (resto === 11) return '0';
  if (resto === 10) return 'K';
  return String(resto);
};

/**
 * Clasifica un receptor. Devuelve la categoria y el motivo, para poder auditar
 * cada decision antes de escribirla.
 */
export function clasificarReceptor({ razonSocial, rut }) {
  const manual = CLASIFICACION_MANUAL.get((razonSocial ?? '').trim().toUpperCase());
  if (manual) return { categoria: manual, motivo: 'clasificacion manual' };

  const limpio = limpiarRut(rut);
  if (!limpio) return { categoria: SIN_INDIVIDUALIZAR, motivo: 'sin RUT' };
  if (RUT_DE_RELLENO.has(limpio)) return { categoria: SIN_INDIVIDUALIZAR, motivo: 'RUT de relleno' };

  const tieneSeparador = /-\s*[0-9kK]\s*$/.test((rut ?? '').toString().trim());
  if (!tieneSeparador) {
    return { categoria: SIN_INDIVIDUALIZAR, motivo: 'RUT sin digito verificador separado' };
  }

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (cuerpo.length < 7 || !/^[0-9]+$/.test(cuerpo)) {
    return { categoria: SIN_INDIVIDUALIZAR, motivo: 'RUT con formato invalido' };
  }

  const esperado = digitoVerificador(cuerpo);
  const categoria = Number(cuerpo) >= PRIMER_RUT_EMPRESA ? EMPRESA : PERSONA;
  const motivo = dv === esperado
    ? `RUT ${Number(cuerpo).toLocaleString('es-CL')} con digito verificador correcto`
    : `RUT ${Number(cuerpo).toLocaleString('es-CL')} con digito verificador ${dv}, se esperaba ${esperado}`;

  return { categoria, motivo, digitoVerificadorInvalido: dv !== esperado };
}

/** Valor canonico de una categoria ya escrita, o null si ya esta bien. */
export function canonizarCategoria(valor) {
  if (valor === null || valor === undefined) return null;
  const canonico = EQUIVALENCIAS.get(valor.trim().toLowerCase());
  if (!canonico || canonico === valor) return null;
  return canonico;
}

async function main() {
  const pool = new pg.Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false },
  });

  const cliente = await pool.connect();

  try {
    const { rows: tenants } = await cliente.query(
      'select id, slug from tenants where slug = $1',
      [TENANT_SLUG],
    );
    if (!tenants.length) throw new Error(`No existe el tenant ${TENANT_SLUG}`);
    const tenantId = tenants[0].id;

    const { rows: empresas } = await cliente.query(
      `select id, razon_social, rut, categoria
       from dim_empresa
       where tenant_id = $1
       order by razon_social`,
      [tenantId],
    );

    const cambios = [];

    for (const empresa of empresas) {
      if (empresa.categoria === null) {
        const { categoria, motivo, digitoVerificadorInvalido } = clasificarReceptor({
          razonSocial: empresa.razon_social,
          rut: empresa.rut,
        });
        cambios.push({
          id: empresa.id,
          razonSocial: empresa.razon_social,
          rut: empresa.rut,
          desde: '(null)',
          hacia: categoria,
          motivo,
          revisar: Boolean(digitoVerificadorInvalido),
        });
        continue;
      }

      const canonico = canonizarCategoria(empresa.categoria);
      if (canonico) {
        cambios.push({
          id: empresa.id,
          razonSocial: empresa.razon_social,
          rut: empresa.rut,
          desde: empresa.categoria,
          hacia: canonico,
          motivo: 'unificacion de escritura',
          revisar: false,
        });
      }
    }

    const clasificaciones = cambios.filter((cambio) => cambio.desde === '(null)');
    const unificaciones = cambios.filter((cambio) => cambio.desde !== '(null)');

    console.log(`Tenant ${TENANT_SLUG}: ${empresas.length} receptores.`);
    console.log(`Unificaciones de escritura: ${unificaciones.length}`);
    console.log(`Clasificaciones nuevas: ${clasificaciones.length}\n`);

    for (const cambio of clasificaciones) {
      const marca = cambio.revisar ? ' (!) revisar RUT' : '';
      console.log(
        `${cambio.razonSocial.slice(0, 44).padEnd(44)} | ${String(cambio.rut ?? '').padEnd(12)} | ${cambio.hacia.padEnd(19)} | ${cambio.motivo}${marca}`,
      );
    }

    if (!APLICAR) {
      console.log('\nSimulacion. Nada se escribio. Agregar --aplicar para confirmar.');
      return;
    }

    await cliente.query('begin');
    for (const cambio of cambios) {
      await cliente.query(
        'update dim_empresa set categoria = $1 where id = $2 and tenant_id = $3',
        [cambio.hacia, cambio.id, tenantId],
      );
    }
    await cliente.query('commit');

    const { rows: distribucion } = await cliente.query(
      `select coalesce(categoria, '(null)') as categoria, count(*)::int as total
       from dim_empresa
       where tenant_id = $1
       group by 1
       order by 2 desc`,
      [tenantId],
    );

    console.log(`\n${cambios.length} registros actualizados. Distribucion final:`);
    for (const fila of distribucion) {
      console.log(`${String(fila.total).padStart(5)}  ${fila.categoria}`);
    }
  } catch (error) {
    await cliente.query('rollback').catch(() => {});
    throw error;
  } finally {
    cliente.release();
    await pool.end();
  }
}

if ((process.argv[1] ?? '').endsWith('normalizar-categoria-empresa.mjs')) {
  main().catch((error) => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
