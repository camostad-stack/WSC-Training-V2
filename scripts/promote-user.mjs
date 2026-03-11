import postgres from 'postgres';

const email = process.argv[2];
const role = process.argv[3] || 'admin';

if (!email) {
  console.error('Usage: node scripts/promote-user.mjs <email> [role]');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });

try {
  const rows = await sql`
    update users
    set role = ${role}
    where lower(email) = lower(${email})
    returning id, name, email, role
  `;
  console.log(JSON.stringify(rows));
} finally {
  await sql.end({ timeout: 5 });
}
