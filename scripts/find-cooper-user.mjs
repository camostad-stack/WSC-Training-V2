import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
try {
  const rows = await sql`
    select id, name, email, role
    from users
    where lower(coalesce(name, '')) like ${'%cooper%'}
       or lower(coalesce(email, '')) like ${'%cooper%'}
       or lower(coalesce(email, '')) like ${'%camostad%'}
    order by id
  `;
  console.log(JSON.stringify(rows));
} finally {
  await sql.end({ timeout: 5 });
}
