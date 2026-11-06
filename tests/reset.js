// Wipes everything the test user owns (tables, sequences). Works for superusers and plain database owners.
const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query('DROP OWNED BY CURRENT_USER CASCADE').then(()=>p.end()).catch(e=>{console.error(e);process.exit(1)});
