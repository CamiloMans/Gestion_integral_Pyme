import pg from 'pg';
const c = new pg.Client({
  host: '34.176.181.203', port: 5432,
  database: 'gestion_integral_dev', user: 'cmansilla',
  password: 'Calen123?', ssl: { rejectUnauthorized: false },
});
await c.connect();
const r = await c.query(`SELECT id, email, nombre FROM users WHERE email='camilomansillaulloa@gmail.com'`);
console.log('=== user ===');
r.rows.forEach(u => console.log(`${u.id} | ${u.email} | ${u.nombre}`));
await c.end();
