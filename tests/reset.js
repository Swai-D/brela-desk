// Wipes everything in the database (tables, views, sequences). Works for superusers (e.g. CI service containers)
// and plain database owners alike, where `DROP OWNED` fails on system-owned objects (PG error 2BP01).
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;').then(()=>p.end()).catch(e=>{console.error(e);process.exit(1)});
