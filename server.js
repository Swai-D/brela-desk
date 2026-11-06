const express=require('express'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const {Pool}=require('pg'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),multer=require('multer'),cookieParser=require('cookie-parser');
const PROD=process.env.NODE_ENV==='production';
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:false}:false});
const q=(t,p)=>pool.query(t,p).then(r=>r.rows);
const one=async(t,p)=>(await q(t,p))[0];
const SECRET=process.env.JWT_SECRET||(PROD?null:'dev-secret-change-me');
const KEY=Buffer.from(process.env.ENCRYPTION_KEY||(PROD?'':'0'.repeat(64)),'hex');
if(!SECRET||KEY.length!==32){console.error('Set JWT_SECRET and ENCRYPTION_KEY (64 hex chars) in the environment.');process.exit(1)}
const enc=s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',KEY,iv),e=Buffer.concat([c.update(s,'utf8'),c.final()]);return [iv,c.getAuthTag(),e].map(b=>b.toString('base64')).join('.')};
const dec=s=>{const [iv,t,e]=s.split('.').map(x=>Buffer.from(x,'base64')),d=crypto.createDecipheriv('aes-256-gcm',KEY,iv);d.setAuthTag(t);return Buffer.concat([d.update(e),d.final()]).toString('utf8')};
const ROLES=['MANAGER','SENIOR','JUNIOR','SECRETARY','ASSOCIATE'], STAGES=['new','docs','ready','submitted','returned','done'];
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const app=express();app.use(express.json({limit:'1mb',verify:(req,res,buf)=>{req.rawBody=buf}}));app.use(cookieParser());
const wrap=f=>(req,res)=>f(req,res).catch(e=>{if(!e.status)console.error(e);res.status(e.status||500).json({error:e.status?e.message:'Server error'})});
const fail=(s,m)=>{const e=new Error(m);e.status=s;throw e};
const auth=(req,res,next)=>{try{req.user=jwt.verify(req.cookies.t,SECRET);next()}catch{res.status(401).json({error:'Please sign in'})}};
const need=(...r)=>(req,res,next)=>r.includes(req.user.role)?next():res.status(403).json({error:'Your role cannot do this'});
const log=(caseId,userId,text)=>q('INSERT INTO activity(case_id,user_id,text) VALUES($1,$2,$3)',[caseId,userId,text]);
const WA=require('./whatsapp')({q,one});
const caseInfo=id=>one(CASE_SQL+' WHERE c.id=$1',[id]);
app.get('/webhooks/whatsapp',WA.verify);app.post('/webhooks/whatsapp',WA.receive);
// ---- auth (with simple brute-force guard)
const tries=new Map();
app.post('/api/login',wrap(async(req,res)=>{
  const k=req.ip,t=tries.get(k)||{n:0,at:Date.now()};if(Date.now()-t.at>6e5){t.n=0;t.at=Date.now()}
  if(t.n>=8)fail(429,'Too many attempts. Try again in 10 minutes.');
  const u=await one('SELECT * FROM users WHERE lower(email)=lower($1) AND active',[String(req.body.email||'')]);
  if(!u||!await bcrypt.compare(String(req.body.password||''),u.password_hash)){t.n++;tries.set(k,t);fail(401,'Wrong email or password')}
  tries.delete(k);
  res.cookie('t',jwt.sign({id:u.id,role:u.role,name:u.name},SECRET,{expiresIn:'7d'}),{httpOnly:true,sameSite:'lax',secure:PROD,maxAge:6048e5});
  res.json({id:u.id,name:u.name,role:u.role})}));
app.post('/api/logout',(req,res)=>{res.clearCookie('t');res.json({ok:1})});
app.use('/api',auth);
app.param('id',(req,res,next,v)=>/^\d+$/.test(v)?next():res.status(400).json({error:'Bad id'}));
app.get('/api/me',(req,res)=>res.json(req.user));
const CASE_SQL=`SELECT c.id,c.code,c.status,c.due::text AS due,c.rounds,c.note,c.assignee_id AS who,c.client_id,cl.name AS client,c.case_type_id,t.name AS type,
 (SELECT count(*) FROM case_docs d WHERE d.case_id=c.id AND d.done)::int AS docs_done,(SELECT count(*) FROM case_docs d WHERE d.case_id=c.id)::int AS docs_total
 FROM cases c JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id`;
app.get('/api/bootstrap',wrap(async(req,res)=>{
  const [users,types,docs,clients,cases,recent,inbox]=await Promise.all([
   q('SELECT id,name,role,active'+(req.user.role==='MANAGER'?',phone,wa_opt_in':'')+' FROM users ORDER BY id'),q('SELECT id,name,active FROM case_types ORDER BY name'),
   q('SELECT case_type_id,name FROM case_type_docs ORDER BY position,id'),q('SELECT id,name,phone,email FROM clients ORDER BY name'),
   q(CASE_SQL+' ORDER BY c.id DESC'),
   q('SELECT a.text,a.created_at,a.user_id,c.code FROM activity a JOIN cases c ON c.id=a.case_id ORDER BY a.id DESC LIMIT 8'),one('SELECT count(*)::int AS n FROM files WHERE inbox')]);
  types.forEach(t=>t.docs=docs.filter(d=>d.case_type_id===t.id).map(d=>d.name));
  res.json({me:req.user,users,types,clients,cases,recent,inboxCount:inbox.n})}));
// ---- team
app.post('/api/users',need('MANAGER'),wrap(async(req,res)=>{
  const {name,email,role,password,phone}=req.body;if(!name||!email||!ROLES.includes(role)||String(password||'').length<8)fail(400,'Name, email, role and a password of 8+ characters are required');
  try{res.json(await one('INSERT INTO users(name,email,role,password_hash,phone) VALUES($1,lower($2),$3,$4,$5) RETURNING id,name,role,active',[name,email,role,await bcrypt.hash(password,10),phone||null]))}catch(e){fail(400,'That email is already used')}}));
app.patch('/api/users/:id',need('MANAGER'),wrap(async(req,res)=>{
  const {role,active,password,phone,waOptIn}=req.body,id=+req.params.id;
  if(phone!==undefined)await q('UPDATE users SET phone=$1 WHERE id=$2',[String(phone).trim()||null,id]);
  if(typeof waOptIn==='boolean')await q('UPDATE users SET wa_opt_in=$1 WHERE id=$2',[waOptIn,id]);
  if(id===req.user.id&&(active===false||(role&&role!=='MANAGER')))fail(400,'You cannot demote or deactivate yourself');
  if(role){if(!ROLES.includes(role))fail(400,'Bad role');await q('UPDATE users SET role=$1 WHERE id=$2',[role,id])}
  if(typeof active==='boolean')await q('UPDATE users SET active=$1 WHERE id=$2',[active,id]);
  if(password){if(password.length<8)fail(400,'Password must be 8+ characters');await q('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(password,10),id])}
  res.json({ok:1})}));
// ---- case types (flexible: add/edit any time)
const saveDocs=async(id,docs)=>{await q('DELETE FROM case_type_docs WHERE case_type_id=$1',[id]);let i=0;for(const n of docs.map(s=>String(s).trim()).filter(Boolean))await q('INSERT INTO case_type_docs(case_type_id,name,position) VALUES($1,$2,$3)',[id,n,i++])};
app.post('/api/case-types',need('MANAGER'),wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)fail(400,'Name required');
  try{const t=await one('INSERT INTO case_types(name) VALUES($1) RETURNING id',[name]);await saveDocs(t.id,req.body.docs||[]);res.json(t)}catch(e){if(e.status)throw e;fail(400,'A case type with this name already exists')}}));
app.put('/api/case-types/:id',need('MANAGER'),wrap(async(req,res)=>{
  const id=+req.params.id;if(req.body.name)await q('UPDATE case_types SET name=$1 WHERE id=$2',[req.body.name.trim(),id]);
  if(typeof req.body.active==='boolean')await q('UPDATE case_types SET active=$1 WHERE id=$2',[req.body.active,id]);
  if(req.body.docs)await saveDocs(id,req.body.docs);res.json({ok:1})}));
// ---- clients, files, vault
app.post('/api/clients',wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)fail(400,'Client name required');
  res.json(await one('INSERT INTO clients(name,phone,email) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name',[name,req.body.phone||null,req.body.email||null]))}));
app.patch('/api/clients/:id',wrap(async(req,res)=>{const {name,phone,email}=req.body,id=+req.params.id;
  if(name)await q('UPDATE clients SET name=$1 WHERE id=$2',[String(name).trim(),id]);if(phone!==undefined)await q('UPDATE clients SET phone=$1 WHERE id=$2',[String(phone).trim()||null,id]);if(email!==undefined)await q('UPDATE clients SET email=$1 WHERE id=$2',[String(email).trim()||null,id]);res.json({ok:1})}));
const FILES='SELECT f.id,f.filename,f.mime,f.size,f.case_doc_id,f.case_id,f.created_at,u.name AS by FROM files f LEFT JOIN users u ON u.id=f.uploaded_by';
app.get('/api/clients/:id',wrap(async(req,res)=>{
  const id=+req.params.id,client=await one('SELECT id,name,phone,email FROM clients WHERE id=$1',[id]);if(!client)fail(404,'Not found');
  const [cases,files,creds]=await Promise.all([q(CASE_SQL+' WHERE c.client_id=$1 ORDER BY c.id DESC',[id]),
   q(FILES+' WHERE f.client_id=$1 AND NOT f.inbox ORDER BY f.id DESC',[id]),
   q(`SELECT c.id,c.label,c.username,(SELECT u.name||' · '||to_char(a.created_at,'DD Mon HH24:MI') FROM credential_access a JOIN users u ON u.id=a.user_id WHERE a.credential_id=c.id ORDER BY a.id DESC LIMIT 1) AS last_access FROM credentials c WHERE c.client_id=$1 ORDER BY c.id`,[id])]);
  res.json({client,cases,files,creds})}));
const putFile=async(req,{clientId,caseId,docId})=>{
  if(!req.file)fail(400,'Choose a file');
  return one('INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,data,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,filename',
   [clientId,caseId||null,docId||null,Buffer.from(req.file.originalname,'latin1').toString('utf8'),req.file.mimetype,req.file.size,req.file.buffer,req.user.id])};
const up=(req,res,next)=>upload.single('file')(req,res,e=>e?res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'File too large (max 15 MB)':'Upload failed'}):next());
app.post('/api/clients/:id/files',up,wrap(async(req,res)=>res.json(await putFile(req,{clientId:+req.params.id}))));
app.get('/api/files/:id',wrap(async(req,res)=>{
  const f=await one('SELECT filename,mime,data FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  const inline=req.query.inline&&/^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i.test(f.mime||'');
  res.set({'Content-Type':f.mime||'application/octet-stream','Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,'X-Content-Type-Options':'nosniff'});res.send(f.data)}));
app.delete('/api/files/:id',wrap(async(req,res)=>{
  const f=await one('SELECT uploaded_by FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  if(!['MANAGER','SENIOR'].includes(req.user.role)&&f.uploaded_by!==req.user.id)fail(403,'Only the uploader, a Senior or a Manager can delete this');
  await q('DELETE FROM files WHERE id=$1',[+req.params.id]);res.json({ok:1})}));
app.post('/api/clients/:id/credentials',need('MANAGER','SENIOR'),wrap(async(req,res)=>{
  const {label,username,password}=req.body;if(!label||!password)fail(400,'Label and password are required');
  res.json(await one('INSERT INTO credentials(client_id,label,username,secret_enc,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[+req.params.id,label,username||null,enc(password),req.user.id]))}));
app.post('/api/credentials/:id/reveal',wrap(async(req,res)=>{
  const c=await one('SELECT * FROM credentials WHERE id=$1',[+req.params.id]);if(!c)fail(404,'Not found');
  if(!['MANAGER','SENIOR'].includes(req.user.role)&&!await one(`SELECT 1 FROM cases WHERE client_id=$1 AND assignee_id=$2 AND status<>'done'`,[c.client_id,req.user.id]))fail(403,'You can open this only while an open case of this client is assigned to you');
  await q('INSERT INTO credential_access(credential_id,user_id) VALUES($1,$2)',[c.id,req.user.id]);
  res.json({username:c.username,password:dec(c.secret_enc)})}));
// ---- cases
app.post('/api/cases',wrap(async(req,res)=>{
  const {clientId,clientName,caseTypeId,assigneeId,due}=req.body;
  let cid=+clientId;if(!cid){const n=String(clientName||'').trim();if(!n)fail(400,'Client required');cid=(await one('INSERT INTO clients(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[n])).id}
  const t=await one('SELECT id,name FROM case_types WHERE id=$1 AND active',[+caseTypeId]);if(!t)fail(400,'Pick a case type');
  const c=await one(`INSERT INTO cases(code,client_id,case_type_id,assignee_id,due,created_by) VALUES('BR-'||nextval('case_code_seq'),$1,$2,$3,$4,$5) RETURNING id,code`,[cid,t.id,+assigneeId||req.user.id,due||null,req.user.id]);
  await q('INSERT INTO case_docs(case_id,name) SELECT $1,name FROM case_type_docs WHERE case_type_id=$2 ORDER BY position,id',[c.id,t.id]);
  await log(c.id,req.user.id,`created this case (${t.name})`);
  const ci=await caseInfo(c.id);if(ci.who&&ci.who!==req.user.id)WA.notify([ci.who],'brela_case_assigned',[ci.code,ci.client,ci.type,ci.due||'not set']);
  res.json(c)}));
app.get('/api/cases/:id',wrap(async(req,res)=>{
  const id=+req.params.id,c=await one(CASE_SQL+' WHERE c.id=$1',[id]);if(!c)fail(404,'Case not found');
  const [docs,files,comments,activity,creds]=await Promise.all([q('SELECT id,name,done FROM case_docs WHERE case_id=$1 ORDER BY id',[id]),q(FILES+' WHERE f.case_id=$1 ORDER BY f.id',[id]),
   q('SELECT m.id,m.body,m.created_at,m.user_id FROM comments m WHERE m.case_id=$1 ORDER BY m.id',[id]),q('SELECT text,created_at,user_id FROM activity WHERE case_id=$1 ORDER BY id DESC',[id]),
   q('SELECT id,label,username FROM credentials WHERE client_id=$1 ORDER BY id',[c.client_id])]);
  docs.forEach(d=>d.files=files.filter(f=>f.case_doc_id===d.id));
  res.json({case:c,docs,comments,activity,creds})}));
app.patch('/api/cases/:id',need('MANAGER','SENIOR'),wrap(async(req,res)=>{
  const {assigneeId,due}=req.body,id=+req.params.id;
  if(assigneeId){await q('UPDATE cases SET assignee_id=$1 WHERE id=$2',[+assigneeId,id]);if(+assigneeId!==req.user.id){const ci=await caseInfo(id);WA.notify([+assigneeId],'brela_case_assigned',[ci.code,ci.client,ci.type,ci.due||'not set'])}}if(due)await q('UPDATE cases SET due=$1 WHERE id=$2',[due,id]);
  await log(id,req.user.id,'updated assignee / due date');res.json({ok:1})}));
app.post('/api/cases/:id/docs',wrap(async(req,res)=>{
  const n=String(req.body.name||'').trim();if(!n)fail(400,'Name required');
  res.json(await one('INSERT INTO case_docs(case_id,name) VALUES($1,$2) RETURNING id',[+req.params.id,n]))}));
app.patch('/api/case-docs/:id',wrap(async(req,res)=>{await q('UPDATE case_docs SET done=$1 WHERE id=$2',[!!req.body.done,+req.params.id]);res.json({ok:1})}));
app.delete('/api/case-docs/:id',need('MANAGER','SENIOR'),wrap(async(req,res)=>{await q('DELETE FROM case_docs WHERE id=$1',[+req.params.id]);res.json({ok:1})}));
app.post('/api/case-docs/:id/files',up,wrap(async(req,res)=>{
  const d=await one('SELECT d.id,d.case_id,c.client_id,d.name FROM case_docs d JOIN cases c ON c.id=d.case_id WHERE d.id=$1',[+req.params.id]);if(!d)fail(404,'Not found');
  const f=await putFile(req,{clientId:d.client_id,caseId:d.case_id,docId:d.id});
  await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[d.id]);await log(d.case_id,req.user.id,`uploaded "${f.filename}" for ${d.name}`);res.json(f)}));
app.post('/api/cases/:id/comments',wrap(async(req,res)=>{
  const b=String(req.body.body||'').trim();if(!b)fail(400,'Write something');
  await q('INSERT INTO comments(case_id,user_id,body) VALUES($1,$2,$3)',[+req.params.id,req.user.id,b]);res.json({ok:1})}));
app.post('/api/cases/:id/move',wrap(async(req,res)=>{
  const id=+req.params.id,to=req.body.to,reason=String(req.body.reason||'').trim(),c=await one('SELECT * FROM cases WHERE id=$1',[id]);
  if(!c)fail(404,'Case not found');if(!STAGES.includes(to))fail(400,'Bad stage');if(to===c.status)return res.json({ok:1});
  const senior=['MANAGER','SENIOR'].includes(req.user.role);
  if(['ready','submitted','done'].includes(to)){const r=await one('SELECT count(*) FILTER (WHERE NOT done)::int AS open FROM case_docs WHERE case_id=$1',[id]);if(r.open)fail(400,'Complete all documents in the checklist first.')}
  if(['submitted','done','returned'].includes(to)&&!senior)fail(403,'Only a Senior or Manager can do this step.');
  if(to==='returned'&&!reason)fail(400,'Write what BRELA asked to correct.');
  const from=c.status;
  await q(`UPDATE cases SET status=$1,rounds=rounds+$2,note=$3,completed_at=CASE WHEN $1='done' THEN now() ELSE NULL END,submitted_at=CASE WHEN $1='submitted' THEN COALESCE(submitted_at,now()) ELSE submitted_at END WHERE id=$4`,[to,to==='returned'?1:0,to==='returned'?reason:(from==='returned'?null:c.note),id]);
  await log(id,req.user.id,to==='returned'?`marked as returned by BRELA (round ${c.rounds+1}): ${reason}`:`moved ${from} → ${to}`);  const ci=await caseInfo(id);
  if(to==='returned')WA.notify([...(await WA.managers()),ci.who].filter(x=>x&&x!==req.user.id),'brela_case_returned',[ci.code,ci.client,reason]);
  if(to==='ready')WA.seniors().then(ids=>WA.notify(ids.filter(x=>x!==req.user.id),'brela_ready_review',[ci.code,ci.client]));
  res.json({ok:1})}));
// ---- monthly report (Manager). Months are counted in East Africa Time.
const LOC=c=>`(${c} AT TIME ZONE 'Africa/Dar_es_Salaam')::date`,INR=c=>`${LOC(c)} >= $1::date AND ${LOC(c)} < ($1::date + interval '1 month')`;
const monthCounts=async s=>({received:(await one(`SELECT count(*)::int n FROM cases WHERE ${INR('created_at')}`,[s])).n,completed:(await one(`SELECT count(*)::int n FROM cases WHERE ${INR('completed_at')}`,[s])).n,
  returns:(await one(`SELECT count(*)::int n FROM activity WHERE text LIKE 'marked as returned%' AND ${INR('created_at')}`,[s])).n});
app.get('/api/reports/monthly',need('MANAGER'),wrap(async(req,res)=>{
  let m=String(req.query.month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))m=new Date(Date.now()+3*3600e3).toISOString().slice(0,7);
  const s=m+'-01',prevS=(await one(`SELECT to_char($1::date - interval '1 month','YYYY-MM-DD') d`,[s])).d;
  const base=`SELECT c.id,c.code,c.rounds,c.assignee_id AS who,cl.name AS client,t.name AS type,cl.id AS client_id`;
  const from=` FROM cases c JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id`;
  const [recv,done,rets,open,users,sub,prev]=await Promise.all([
   q(base+from+` WHERE ${INR('c.created_at')}`,[s]),
   q(base+`,c.created_at::date::text AS created,${LOC('c.completed_at')}::text AS completed,extract(epoch FROM (c.completed_at-c.created_at))/86400 AS days`+from+` WHERE ${INR('c.completed_at')} ORDER BY c.completed_at`,[s]),
   q(`SELECT a.created_at,c.code,c.assignee_id AS who,cl.name AS client,t.name AS type,a.text FROM activity a JOIN cases c ON c.id=a.case_id JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id WHERE a.text LIKE 'marked as returned%' AND ${INR('a.created_at')} ORDER BY a.created_at`,[s]),
   q(`SELECT c.assignee_id AS who,c.due<(now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date AS late FROM cases c WHERE c.status<>'done'`),
   q('SELECT id,name,role,active FROM users ORDER BY id'),
   one(`SELECT count(*)::int n FROM cases WHERE ${INR('submitted_at')}`,[s]),monthCounts(prevS)]);
  const cnt=(arr,f)=>arr.filter(f).length,avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10:null;
  const days=done.map(d=>+d.days),reason=t=>t.replace(/^marked as returned by BRELA \(round \d+\):\s*/,'');
  const byType=[...new Set([...recv,...done,...rets].map(r=>r.type))].sort().map(t=>({type:t,received:cnt(recv,r=>r.type===t),completed:cnt(done,r=>r.type===t),returns:cnt(rets,r=>r.type===t),avgDays:avg(done.filter(r=>r.type===t).map(r=>+r.days))}));
  const byPerson=users.filter(u=>u.active||recv.some(r=>r.who===u.id)||done.some(r=>r.who===u.id)).map(u=>({name:u.name,role:u.role,received:cnt(recv,r=>r.who===u.id),completed:cnt(done,r=>r.who===u.id),returns:cnt(rets,r=>r.who===u.id),openNow:cnt(open,r=>r.who===u.id),overdueNow:cnt(open,r=>r.who===u.id&&r.late)}));
  const byClient=[...new Set([...recv,...done].map(r=>r.client))].map(c=>({client:c,received:cnt(recv,r=>r.client===c),completed:cnt(done,r=>r.client===c)})).sort((a,b)=>b.received+b.completed-a.received-a.completed).slice(0,10);
  res.json({month:m,summary:{received:recv.length,completed:done.length,submitted:sub.n,returns:rets.length,avgDays:avg(days),firstTimeRate:done.length?Math.round(cnt(done,d=>d.rounds===0)/done.length*100):null,openNow:open.length,overdueNow:cnt(open,o=>o.late)},
   prev,byType,byPerson,byClient,completed:done.map(d=>({code:d.code,client:d.client,type:d.type,who:d.who,created:d.created,completed:d.completed,days:Math.round(+d.days*10)/10,rounds:d.rounds})),
   returnsList:rets.map(r=>({at:r.created_at,code:r.code,client:r.client,type:r.type,who:r.who,reason:reason(r.text)}))})}));
// ---- WhatsApp inbox + admin
app.get('/api/inbox',wrap(async(req,res)=>res.json(await q(`SELECT f.id,f.filename,f.size,f.mime,f.created_at,f.sender_phone,f.sender_name,f.note,f.client_id,cl.name AS client FROM files f LEFT JOIN clients cl ON cl.id=f.client_id WHERE f.inbox ORDER BY f.id DESC`))));
app.post('/api/inbox/:id/file',wrap(async(req,res)=>{
  const f=await one('SELECT * FROM files WHERE id=$1 AND inbox',[+req.params.id]);if(!f)fail(404,'Already filed or not found');
  let {clientId,caseDocId,linkPhone}=req.body,caseId=null;
  if(caseDocId){const d=await one('SELECT d.id,d.case_id,d.name,c.client_id FROM case_docs d JOIN cases c ON c.id=d.case_id WHERE d.id=$1',[+caseDocId]);if(!d)fail(400,'Document item not found');clientId=d.client_id;caseId=d.case_id;
   await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[d.id]);await log(caseId,req.user.id,`filed "${f.filename}" (from WhatsApp) under ${d.name}`)}
  if(!clientId)fail(400,'Choose a client');
  await q('UPDATE files SET inbox=FALSE,client_id=$1,case_id=$2,case_doc_id=$3 WHERE id=$4',[+clientId,caseId,caseDocId?+caseDocId:null,f.id]);
  if(linkPhone&&f.sender_phone)await q('UPDATE clients SET phone=$1 WHERE id=$2 AND phone IS NULL',[f.sender_phone,+clientId]);
  res.json({ok:1})}));
app.get('/api/whatsapp/status',need('MANAGER'),wrap(async(req,res)=>res.json({configured:WA.configured(),webhookReady:WA.webhookReady(),webhookPath:'/webhooks/whatsapp',templates:WA.TEMPLATES,
  log:await q('SELECT l.created_at,l.template,l.ok,l.error,l.to_phone,u.name FROM wa_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 10')})));
app.post('/api/whatsapp/test',need('MANAGER'),wrap(async(req,res)=>{
  const u=await one('SELECT phone FROM users WHERE id=$1',[req.user.id]);const to=WA.norm(u&&u.phone);if(!to)fail(400,'Add your phone number in Settings → Team first');
  const r=await WA.sendTemplate(to,'hello_world',[],req.user.id,'en_US');if(!r.ok)fail(400,r.error||'Send failed');res.json({ok:1})}));
app.post('/api/whatsapp/digest-now',need('MANAGER'),wrap(async(req,res)=>res.json({people:await WA.runDigest(true)})));
// ---- static + boot
app.use(express.static(path.join(__dirname,'public')));
app.use((req,res)=>res.status(404).send('Not found'));
const STARTER={'Business Name Registration':['Client ID / passport copy','Passport photo','Proposed business names (2-3)','Signed client authorization','Proof of address'],
 'Company Incorporation':['Directors & shareholders ID / passport copies','Passport photos','Proposed company names','MEMARTS (Memorandum & Articles)','Registered office address proof','Signed client authorization'],
 'Annual Return':['Previous annual return / certificate','Financial statements','Shareholders & directors details','Signed client authorization'],
 'Change of Directors':['New director ID / passport copy','Resignation letter (if any)','Board / shareholders resolution','Signed client authorization'],
 'Beneficial Ownership Update':['Beneficial owners ID / passport copies','Ownership structure / percentages','Signed client authorization']};
async function init(){
  await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  if(!(await one('SELECT 1 FROM users LIMIT 1'))){
    const pw=process.env.ADMIN_PASSWORD||crypto.randomBytes(6).toString('base64url'),email=(process.env.ADMIN_EMAIL||'admin@example.com').toLowerCase();
    await q('INSERT INTO users(name,email,role,password_hash) VALUES($1,$2,$3,$4)',[process.env.ADMIN_NAME||'Manager',email,'MANAGER',await bcrypt.hash(pw,10)]);
    console.log(`First Manager created: ${email}${process.env.ADMIN_PASSWORD?'':' / temporary password: '+pw}`)}
  if(!(await one('SELECT 1 FROM case_types LIMIT 1')))for(const [n,d] of Object.entries(STARTER)){const t=await one('INSERT INTO case_types(name) VALUES($1) RETURNING id',[n]);await saveDocs(t.id,d)}
  WA.startScheduler();app.listen(process.env.PORT||3000,()=>console.log('BRELA Desk running on port '+(process.env.PORT||3000)))}
init().catch(e=>{console.error(e);process.exit(1)});
