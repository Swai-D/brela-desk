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
const LEVELS=['MANAGER','SENIOR','STAFF'], STAGES=['new','docs','ready','submitted','returned','done'];
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const app=express();app.use(express.json({limit:'1mb',verify:(req,res,buf)=>{req.rawBody=buf}}));app.use(cookieParser());
const wrap=f=>(req,res)=>f(req,res).catch(e=>{if(!e.status)console.error(e);res.status(e.status||500).json({error:e.status?e.message:'Server error'})});
const fail=(s,m)=>{const e=new Error(m);e.status=s;throw e};
const auth=async(req,res,next)=>{try{const t=jwt.verify(req.cookies.t,SECRET),u=await one('SELECT u.id,u.name,u.role,r.level FROM users u JOIN roles r ON r.key=u.role WHERE u.id=$1 AND u.active',[t.id]);if(!u)throw 0;req.user=u;next()}catch{res.status(401).json({error:'Please sign in'})}};
const need=(...r)=>(req,res,next)=>r.includes(req.user.level)?next():res.status(403).json({error:'Your role cannot do this'});
const audit=(req,action,details)=>q('INSERT INTO audit_log(user_id,actor_name,action,details) VALUES($1,$2,$3,$4)',[req.user.id,req.user.name,action,details]).catch(()=>{});
const roleExists=async k=>!!(k&&await one('SELECT 1 FROM roles WHERE key=$1',[String(k)]));
const roleLevel=async k=>((await one('SELECT level FROM roles WHERE key=$1',[String(k)]))||{}).level;
const otherManagers=async excludeId=>(await one(`SELECT count(*)::int AS n FROM users u JOIN roles r ON r.key=u.role WHERE u.active AND r.level='MANAGER' AND u.id<>$1`,[excludeId||0])).n;
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
const CASE_SQL=`SELECT c.id,c.code,c.status,c.completed_at,c.due::text AS due,c.rounds,c.note,c.assignee_id AS who,c.client_id,cl.name AS client,c.case_type_id,t.name AS type,
 (SELECT count(*) FROM case_docs d WHERE d.case_id=c.id AND d.done)::int AS docs_done,(SELECT count(*) FROM case_docs d WHERE d.case_id=c.id)::int AS docs_total
 FROM cases c JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id`;
app.get('/api/bootstrap',wrap(async(req,res)=>{
  const [users,types,docs,clients,cases,recent,inbox,guide,roles]=await Promise.all([
   q('SELECT id,name,role,active'+(req.user.level==='MANAGER'?',email,phone,wa_opt_in':'')+' FROM users ORDER BY id'),q('SELECT id,name,active,sop FROM case_types ORDER BY name'),
   q('SELECT case_type_id,name FROM case_type_docs ORDER BY position,id'),q('SELECT id,name,phone,email FROM clients ORDER BY name'),
   q(CASE_SQL+' ORDER BY c.id DESC'),
   q('SELECT a.text,a.created_at,a.user_id,c.code FROM activity a JOIN cases c ON c.id=a.case_id ORDER BY a.id DESC LIMIT 8'),one('SELECT count(*)::int AS n FROM files WHERE inbox'),one('SELECT seen_guide FROM users WHERE id=$1',[req.user.id]),q(`SELECT key,name,level,team_queue FROM roles ORDER BY CASE level WHEN 'MANAGER' THEN 0 WHEN 'SENIOR' THEN 1 ELSE 2 END,name`)]);
  types.forEach(t=>t.docs=docs.filter(d=>d.case_type_id===t.id).map(d=>d.name));
  res.json({me:{...req.user,seenGuide:!!(guide&&guide.seen_guide)},roles,users,types,clients,cases,recent,inboxCount:inbox.n})}));
// ---- team
app.post('/api/users',need('MANAGER'),wrap(async(req,res)=>{
  const {name,email,role,password,phone}=req.body;if(!name||!email||!role||String(password||'').length<8)fail(400,'Name, email, role and a password of 8+ characters are required');
  if(!await roleExists(role))fail(400,'Choose a valid role');
  try{res.json(await one('INSERT INTO users(name,email,role,password_hash,phone) VALUES($1,lower($2),$3,$4,$5) RETURNING id,name,role,active',[name,email,role,await bcrypt.hash(password,10),phone||null]))}catch(e){fail(400,'That email is already used')}}));
app.patch('/api/users/:id',need('MANAGER'),wrap(async(req,res)=>{
  const {role,active,password,phone,waOptIn}=req.body,id=+req.params.id;
  const {name,email}=req.body,who=await one('SELECT u.name,u.email,u.role,r.level FROM users u JOIN roles r ON r.key=u.role WHERE u.id=$1',[id]);if(!who)fail(404,'Not found');
  if(name!==undefined){if(!String(name).trim())fail(400,'Name required');await q('UPDATE users SET name=$1 WHERE id=$2',[String(name).trim(),id])}
  if(email!==undefined){if(!/^\S+@\S+\.\S+$/.test(String(email).trim()))fail(400,'Enter a valid email');try{await q('UPDATE users SET email=lower($1) WHERE id=$2',[String(email).trim(),id])}catch(e){fail(400,'That email is already used')}}
  if(role||typeof active==='boolean'||password||name!==undefined||email!==undefined)await audit(req,'user.update',`${who.name}: ${[role&&`role ${who.role} → ${role}`,typeof active==='boolean'&&(active?'activated':'deactivated'),password&&'password reset',name!==undefined&&'name',email!==undefined&&'email'].filter(Boolean).join(', ')}`);
  if(phone!==undefined)await q('UPDATE users SET phone=$1 WHERE id=$2',[String(phone).trim()||null,id]);
  if(typeof waOptIn==='boolean')await q('UPDATE users SET wa_opt_in=$1 WHERE id=$2',[waOptIn,id]);
  if(id===req.user.id&&(active===false||(role&&role!==who.role)))fail(400,'You cannot demote or deactivate yourself');
  if(who.level==='MANAGER'&&(active===false||(role&&role!==who.role&&(await roleLevel(role))!=='MANAGER'))&&!(await otherManagers(id)))fail(400,'At least one active Manager must remain');
  if(role){if(!await roleExists(role))fail(400,'Bad role');await q('UPDATE users SET role=$1 WHERE id=$2',[role,id])}
  if(typeof active==='boolean')await q('UPDATE users SET active=$1 WHERE id=$2',[active,id]);
  if(password){if(password.length<8)fail(400,'Password must be 8+ characters');await q('UPDATE users SET password_hash=$1 WHERE id=$2',[await bcrypt.hash(password,10),id])}
  res.json({ok:1})}));
app.delete('/api/users/:id',need('MANAGER'),wrap(async(req,res)=>{
  const id=+req.params.id;if(id===req.user.id)fail(400,'You cannot delete yourself');
  const u=await one('SELECT u.name,u.email,r.level FROM users u JOIN roles r ON r.key=u.role WHERE u.id=$1',[id]);if(!u)fail(404,'Not found');
  if(u.level==='MANAGER'&&!(await otherManagers(id)))fail(400,'At least one active Manager must remain');
  const used=await one(`SELECT (SELECT count(*) FROM cases WHERE assignee_id=$1 OR created_by=$1)+(SELECT count(*) FROM activity WHERE user_id=$1)+(SELECT count(*) FROM comments WHERE user_id=$1)+(SELECT count(*) FROM files WHERE uploaded_by=$1)+(SELECT count(*) FROM credentials WHERE created_by=$1)+(SELECT count(*) FROM credential_access WHERE user_id=$1) AS n`,[id]);
  if(+used.n)fail(400,'This person has work history. Deactivate them instead: their history stays correct.');
  await q('DELETE FROM users WHERE id=$1',[id]);await audit(req,'user.delete',`${u.name} <${u.email}>`);res.json({ok:1})}));
// ---- case types (flexible: add/edit any time)
const saveDocs=async(id,docs)=>{await q('DELETE FROM case_type_docs WHERE case_type_id=$1',[id]);let i=0;for(const n of docs.map(s=>String(s).trim()).filter(Boolean))await q('INSERT INTO case_type_docs(case_type_id,name,position) VALUES($1,$2,$3)',[id,n,i++])};
app.post('/api/case-types',need('MANAGER'),wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)fail(400,'Name required');
  try{const t=await one('INSERT INTO case_types(name,sop) VALUES($1,$2) RETURNING id',[name,String(req.body.sop||'').trim()||null]);await saveDocs(t.id,req.body.docs||[]);res.json(t)}catch(e){if(e.status)throw e;fail(400,'A case type with this name already exists')}}));
app.put('/api/case-types/:id',need('MANAGER'),wrap(async(req,res)=>{
  const id=+req.params.id;if(req.body.name)await q('UPDATE case_types SET name=$1 WHERE id=$2',[req.body.name.trim(),id]);
  if(typeof req.body.active==='boolean')await q('UPDATE case_types SET active=$1 WHERE id=$2',[req.body.active,id]);
  if(req.body.sop!==undefined)await q('UPDATE case_types SET sop=$1 WHERE id=$2',[String(req.body.sop).trim()||null,id]);
  if(req.body.docs)await saveDocs(id,req.body.docs);res.json({ok:1})}));
app.delete('/api/case-types/:id',need('MANAGER'),wrap(async(req,res)=>{
  const id=+req.params.id,t=await one('SELECT name FROM case_types WHERE id=$1',[id]);if(!t)fail(404,'Not found');
  if((await one('SELECT count(*)::int AS n FROM cases WHERE case_type_id=$1',[id])).n)fail(400,'Cases already use this type. Hide it instead.');
  await q('DELETE FROM case_types WHERE id=$1',[id]);await audit(req,'case_type.delete',t.name);res.json({ok:1})}));
// ---- clients, files, vault
app.post('/api/clients',wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)fail(400,'Client name required');
  res.json(await one('INSERT INTO clients(name,phone,email) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,name',[name,req.body.phone||null,req.body.email||null]))}));
app.patch('/api/clients/:id',wrap(async(req,res)=>{const {name,phone,email}=req.body,id=+req.params.id;
  if(name!==undefined){if(!['MANAGER','SENIOR'].includes(req.user.level))fail(403,'Only a Senior or Manager can rename a client');if(!String(name).trim())fail(400,'Name required');
   try{await q('UPDATE clients SET name=$1 WHERE id=$2',[String(name).trim(),id])}catch(e){fail(400,'A client with this name already exists')}}
  if(phone!==undefined)await q('UPDATE clients SET phone=$1 WHERE id=$2',[String(phone).trim()||null,id]);if(email!==undefined)await q('UPDATE clients SET email=$1 WHERE id=$2',[String(email).trim()||null,id]);res.json({ok:1})}));
app.delete('/api/clients/:id',need('MANAGER'),wrap(async(req,res)=>{
  const id=+req.params.id,c=await one('SELECT name FROM clients WHERE id=$1',[id]);if(!c)fail(404,'Not found');
  if((await one('SELECT count(*)::int AS n FROM cases WHERE client_id=$1',[id])).n)fail(400,'This client has cases. Delete or move those cases first.');
  await q('DELETE FROM clients WHERE id=$1',[id]);await audit(req,'client.delete',`${c.name} (with their documents and saved logins)`);res.json({ok:1})}));
const FILES='SELECT f.id,f.filename,f.mime,f.uploaded_by,f.size,f.case_doc_id,f.case_id,f.created_at,u.name AS by FROM files f LEFT JOIN users u ON u.id=f.uploaded_by';
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
  const f=await one('SELECT uploaded_by,filename FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  if(!['MANAGER','SENIOR'].includes(req.user.level)&&f.uploaded_by!==req.user.id)fail(403,'Only the uploader, a Senior or a Manager can delete this');
  await q('DELETE FROM files WHERE id=$1',[+req.params.id]);await audit(req,'file.delete',f.filename);res.json({ok:1})}));
app.patch('/api/files/:id',wrap(async(req,res)=>{
  const f=await one('SELECT uploaded_by FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  if(!['MANAGER','SENIOR'].includes(req.user.level)&&f.uploaded_by!==req.user.id)fail(403,'Only the uploader, a Senior or a Manager can rename this');
  const n=String(req.body.filename||'').trim().slice(0,200);if(!n)fail(400,'Name required');await q('UPDATE files SET filename=$1 WHERE id=$2',[n,+req.params.id]);res.json({ok:1})}));
app.post('/api/clients/:id/credentials',need('MANAGER','SENIOR'),wrap(async(req,res)=>{
  const {label,username,password}=req.body;if(!label||!password)fail(400,'Label and password are required');
  res.json(await one('INSERT INTO credentials(client_id,label,username,secret_enc,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[+req.params.id,label,username||null,enc(password),req.user.id]))}));
app.patch('/api/credentials/:id',need('MANAGER','SENIOR'),wrap(async(req,res)=>{
  const id=+req.params.id,c=await one('SELECT label FROM credentials WHERE id=$1',[id]);if(!c)fail(404,'Not found');const {label,username,password}=req.body;
  if(label!==undefined){if(!String(label).trim())fail(400,'Label required');await q('UPDATE credentials SET label=$1 WHERE id=$2',[String(label).trim(),id])}
  if(username!==undefined)await q('UPDATE credentials SET username=$1 WHERE id=$2',[String(username).trim()||null,id]);
  if(password)await q('UPDATE credentials SET secret_enc=$1 WHERE id=$2',[enc(password),id]);
  await audit(req,'credential.update',c.label+(password?' (password changed)':''));res.json({ok:1})}));
app.delete('/api/credentials/:id',need('MANAGER','SENIOR'),wrap(async(req,res)=>{
  const c=await one('SELECT label FROM credentials WHERE id=$1',[+req.params.id]);if(!c)fail(404,'Not found');
  await q('DELETE FROM credentials WHERE id=$1',[+req.params.id]);await audit(req,'credential.delete',c.label);res.json({ok:1})}));
app.post('/api/credentials/:id/reveal',wrap(async(req,res)=>{
  const c=await one('SELECT * FROM credentials WHERE id=$1',[+req.params.id]);if(!c)fail(404,'Not found');
  if(!['MANAGER','SENIOR'].includes(req.user.level)&&!await one(`SELECT 1 FROM cases WHERE client_id=$1 AND assignee_id=$2 AND status<>'done'`,[c.client_id,req.user.id]))fail(403,'You can open this only while an open case of this client is assigned to you');
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
   q('SELECT m.id,m.body,m.created_at,m.edited_at,m.user_id FROM comments m WHERE m.case_id=$1 ORDER BY m.id',[id]),q('SELECT text,created_at,user_id FROM activity WHERE case_id=$1 ORDER BY id DESC',[id]),
   q('SELECT id,label,username FROM credentials WHERE client_id=$1 ORDER BY id',[c.client_id])]);
  docs.forEach(d=>d.files=files.filter(f=>f.case_doc_id===d.id));
  const steps=await q('SELECT stage,idx FROM case_steps WHERE case_id=$1',[id]),sop=(await one('SELECT sop FROM case_types WHERE id=$1',[c.case_type_id])).sop;
  res.json({case:c,docs,comments,activity,creds,steps,sop})}));
app.patch('/api/cases/:id',need('MANAGER','SENIOR'),wrap(async(req,res)=>{
  const {assigneeId,due,clientId,caseTypeId}=req.body,id=+req.params.id,old=await caseInfo(id);if(!old)fail(404,'Case not found');
  if((clientId||caseTypeId)&&req.user.level!=='MANAGER')fail(403,'Only a Manager can change the client or case type');
  const ch=[];
  if(assigneeId&&+assigneeId!==old.who){await q('UPDATE cases SET assignee_id=$1 WHERE id=$2',[+assigneeId,id]);ch.push('assignee');if(+assigneeId!==req.user.id)WA.notify([+assigneeId],'brela_case_assigned',[old.code,old.client,old.type,due||old.due||'not set'])}
  if(due!==undefined&&(due||null)!==(old.due||null)){await q('UPDATE cases SET due=$1 WHERE id=$2',[due||null,id]);ch.push('due date')}
  if(clientId&&+clientId!==old.client_id){if(!await one('SELECT 1 FROM clients WHERE id=$1',[+clientId]))fail(400,'Client not found');await q('UPDATE cases SET client_id=$1 WHERE id=$2',[+clientId,id]);ch.push('client');await audit(req,'case.update',`${old.code}: client changed from ${old.client}`)}
  if(caseTypeId&&+caseTypeId!==old.case_type_id){if(!await one('SELECT 1 FROM case_types WHERE id=$1',[+caseTypeId]))fail(400,'Case type not found');await q('UPDATE cases SET case_type_id=$1 WHERE id=$2',[+caseTypeId,id]);ch.push('case type');await audit(req,'case.update',`${old.code}: case type changed from ${old.type}`)}
  if(ch.length)await log(id,req.user.id,'changed '+ch.join(', '));res.json({ok:1})}));
app.delete('/api/cases/:id',need('MANAGER'),wrap(async(req,res)=>{
  const c=await caseInfo(+req.params.id);if(!c)fail(404,'Case not found');
  await q('DELETE FROM cases WHERE id=$1',[c.id]);await audit(req,'case.delete',`${c.code} · ${c.client} · ${c.type} (${c.status})`);res.json({ok:1})}));
app.post('/api/cases/:id/docs',wrap(async(req,res)=>{
  const n=String(req.body.name||'').trim();if(!n)fail(400,'Name required');
  res.json(await one('INSERT INTO case_docs(case_id,name) VALUES($1,$2) RETURNING id',[+req.params.id,n]))}));
app.patch('/api/case-docs/:id',wrap(async(req,res)=>{const id=+req.params.id;
  if(req.body.name!==undefined){if(!['MANAGER','SENIOR'].includes(req.user.level))fail(403,'Only a Senior or Manager can rename items');const n=String(req.body.name).trim();if(!n)fail(400,'Name required');await q('UPDATE case_docs SET name=$1 WHERE id=$2',[n,id])}
  if(req.body.done!==undefined)await q('UPDATE case_docs SET done=$1 WHERE id=$2',[!!req.body.done,id]);res.json({ok:1})}));
app.delete('/api/case-docs/:id',need('MANAGER','SENIOR'),wrap(async(req,res)=>{await q('DELETE FROM case_docs WHERE id=$1',[+req.params.id]);res.json({ok:1})}));
app.post('/api/case-docs/:id/files',up,wrap(async(req,res)=>{
  const d=await one('SELECT d.id,d.case_id,c.client_id,d.name FROM case_docs d JOIN cases c ON c.id=d.case_id WHERE d.id=$1',[+req.params.id]);if(!d)fail(404,'Not found');
  const f=await putFile(req,{clientId:d.client_id,caseId:d.case_id,docId:d.id});
  await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[d.id]);await log(d.case_id,req.user.id,`uploaded "${f.filename}" for ${d.name}`);res.json(f)}));
app.post('/api/cases/:id/comments',wrap(async(req,res)=>{
  const b=String(req.body.body||'').trim();if(!b)fail(400,'Write something');
  await q('INSERT INTO comments(case_id,user_id,body) VALUES($1,$2,$3)',[+req.params.id,req.user.id,b]);res.json({ok:1})}));
app.patch('/api/comments/:id',wrap(async(req,res)=>{
  const m=await one('SELECT user_id FROM comments WHERE id=$1',[+req.params.id]);if(!m)fail(404,'Not found');if(m.user_id!==req.user.id)fail(403,'You can edit only your own comments');
  const b=String(req.body.body||'').trim();if(!b)fail(400,'Write something');await q('UPDATE comments SET body=$1,edited_at=now() WHERE id=$2',[b,+req.params.id]);res.json({ok:1})}));
app.delete('/api/comments/:id',wrap(async(req,res)=>{
  const m=await one('SELECT m.user_id,m.body,c.code FROM comments m JOIN cases c ON c.id=m.case_id WHERE m.id=$1',[+req.params.id]);if(!m)fail(404,'Not found');
  if(m.user_id!==req.user.id&&req.user.level!=='MANAGER')fail(403,'You can delete only your own comments');
  await q('DELETE FROM comments WHERE id=$1',[+req.params.id]);if(m.user_id!==req.user.id)await audit(req,'comment.delete',`${m.code}: "${m.body.slice(0,80)}"`);res.json({ok:1})}));
app.get('/api/audit',need('MANAGER'),wrap(async(req,res)=>res.json(await q('SELECT created_at,actor_name,action,details FROM audit_log ORDER BY id DESC LIMIT 100'))));
app.post('/api/cases/:id/move',wrap(async(req,res)=>{
  const id=+req.params.id,to=req.body.to,reason=String(req.body.reason||'').trim(),c=await one('SELECT * FROM cases WHERE id=$1',[id]);
  if(!c)fail(404,'Case not found');if(!STAGES.includes(to))fail(400,'Bad stage');if(to===c.status)return res.json({ok:1});
  const senior=['MANAGER','SENIOR'].includes(req.user.level);
  if(['ready','submitted','done'].includes(to)){const r=await one('SELECT count(*) FILTER (WHERE NOT done)::int AS open FROM case_docs WHERE case_id=$1',[id]);if(r.open)fail(400,'Complete all documents in the checklist first.')}
  if(['submitted','done','returned'].includes(to)&&!senior)fail(403,'Only a Senior or Manager can do this step.');
  if(to==='returned'&&!reason)fail(400,'Write what BRELA asked to correct.');
  const from=c.status;
  await q(`UPDATE cases SET status=$1,rounds=rounds+$2,note=$3,completed_at=CASE WHEN $1='done' THEN now() ELSE NULL END,submitted_at=CASE WHEN $1='submitted' THEN COALESCE(submitted_at,now()) ELSE submitted_at END WHERE id=$4`,[to,to==='returned'?1:0,to==='returned'?reason:(from==='returned'?null:c.note),id]);
  await log(id,req.user.id,to==='returned'?`marked as returned by BRELA (round ${c.rounds+1}): ${reason}`:`moved ${from} → ${to}`);  const ci=await caseInfo(id);
  if(to==='returned')WA.notify([...(await WA.managers()),ci.who].filter(x=>x&&x!==req.user.id),'brela_case_returned',[ci.code,ci.client,reason]);
  if(to==='done')WA.managers().then(ids=>WA.notify(ids.filter(x=>x!==req.user.id),'brela_case_approved',[ci.code,ci.client]));
  if(to==='ready')WA.seniors().then(ids=>WA.notify(ids.filter(x=>x!==req.user.id),'brela_ready_review',[ci.code,ci.client]));
  res.json({ok:1})}));
// ---- playbook: what each role does and how each stage works (Manager edits, everyone reads)
const strs=a=>(Array.isArray(a)?a:[]).map(x=>String(x).trim()).filter(Boolean).slice(0,30);
app.get('/api/playbook',wrap(async(req,res)=>res.json({roles:await q(`SELECT key AS role,name,level,team_queue,summary,duties FROM roles ORDER BY CASE level WHEN 'MANAGER' THEN 0 WHEN 'SENIOR' THEN 1 ELSE 2 END,name`),stages:await q('SELECT stage,owner_roles,steps,done_when FROM stage_playbook')})));
app.put('/api/playbook/roles/:role',need('MANAGER'),wrap(async(req,res)=>{
  if(!await roleExists(req.params.role))fail(400,'Unknown role');
  await q('UPDATE roles SET summary=$2,duties=$3::jsonb WHERE key=$1',[req.params.role,String(req.body.summary||'').trim(),JSON.stringify(strs(req.body.duties))]);res.json({ok:1})}));
app.put('/api/playbook/stages/:stage',need('MANAGER'),wrap(async(req,res)=>{
  if(!STAGES.includes(req.params.stage))fail(400,'Unknown stage');
  const validRoles=(await q('SELECT key FROM roles')).map(r=>r.key);
  await q(`INSERT INTO stage_playbook(stage,owner_roles,steps,done_when) VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT(stage) DO UPDATE SET owner_roles=EXCLUDED.owner_roles,steps=EXCLUDED.steps,done_when=EXCLUDED.done_when`,
   [req.params.stage,JSON.stringify(strs(req.body.owner_roles).filter(r=>validRoles.includes(r))),JSON.stringify(strs(req.body.steps)),String(req.body.done_when||'').trim()]);res.json({ok:1})}));
const roleKey=n=>String(n).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,30);
app.post('/api/roles',need('MANAGER'),wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim(),level=req.body.level,key=roleKey(name);
  if(name.length<2||name.length>40)fail(400,'Role name must be 2 to 40 characters');if(!key)fail(400,'Use letters or numbers in the role name');
  if(!LEVELS.includes(level))fail(400,'Choose an access level');
  if(await one('SELECT 1 FROM roles WHERE lower(name)=lower($1) OR key=$2',[name,key]))fail(400,'A role with this name already exists');
  await q('INSERT INTO roles(key,name,level,team_queue,summary,duties) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[key,name,level,!!req.body.team_queue,String(req.body.summary||'').trim(),JSON.stringify(strs(req.body.duties))]);
  await audit(req,'role.create',`${name} (${level})`);res.json({key})}));
app.put('/api/roles/:key',need('MANAGER'),wrap(async(req,res)=>{
  const k=req.params.key,r=await one('SELECT * FROM roles WHERE key=$1',[k]);if(!r)fail(404,'Role not found');
  const b=req.body,name=b.name!==undefined?String(b.name).trim():r.name,level=b.level!==undefined?b.level:r.level;
  if(name.length<2||name.length>40)fail(400,'Role name must be 2 to 40 characters');if(!LEVELS.includes(level))fail(400,'Choose an access level');
  if(await one('SELECT 1 FROM roles WHERE lower(name)=lower($1) AND key<>$2',[name,k]))fail(400,'A role with this name already exists');
  if(r.level==='MANAGER'&&level!=='MANAGER'&&!(await one(`SELECT 1 FROM users u JOIN roles x ON x.key=u.role WHERE u.active AND x.level='MANAGER' AND x.key<>$1 LIMIT 1`,[k])))fail(400,'At least one active Manager must remain');
  await q('UPDATE roles SET name=$2,level=$3,team_queue=$4,summary=$5,duties=$6::jsonb WHERE key=$1',[k,name,level,b.team_queue!==undefined?!!b.team_queue:r.team_queue,b.summary!==undefined?String(b.summary).trim():r.summary,JSON.stringify(b.duties!==undefined?strs(b.duties):r.duties)]);
  if(name!==r.name||level!==r.level)await audit(req,'role.update',`${r.name}${name!==r.name?' → '+name:''}${level!==r.level?`: access ${r.level} → ${level}`:''}`);res.json({ok:1})}));
app.delete('/api/roles/:key',need('MANAGER'),wrap(async(req,res)=>{
  const k=req.params.key,r=await one('SELECT * FROM roles WHERE key=$1',[k]);if(!r)fail(404,'Role not found');
  const n=(await one('SELECT count(*)::int AS n FROM users WHERE role=$1',[k])).n;if(n)fail(400,`${n} ${n===1?'person has':'people have'} this role. Move them to another role first.`);
  if(r.level==='MANAGER'&&!(await one(`SELECT 1 FROM roles WHERE level='MANAGER' AND key<>$1`,[k])))fail(400,'Keep at least one Manager-level role');
  await q('DELETE FROM roles WHERE key=$1',[k]);await q('UPDATE stage_playbook SET owner_roles=owner_roles - $1::text',[k]);
  await audit(req,'role.delete',`${r.name} (${r.level})`);res.json({ok:1})}));
app.post('/api/cases/:id/steps',wrap(async(req,res)=>{
  const {stage,idx,done}=req.body;if(!STAGES.includes(stage)||!Number.isInteger(idx)||idx<0||idx>29)fail(400,'Bad step');
  if(done)await q('INSERT INTO case_steps(case_id,stage,idx,by_user) VALUES($1,$2,$3,$4) ON CONFLICT(case_id,stage,idx) DO UPDATE SET by_user=EXCLUDED.by_user,at=now()',[+req.params.id,stage,idx,req.user.id]);
  else await q('DELETE FROM case_steps WHERE case_id=$1 AND stage=$2 AND idx=$3',[+req.params.id,stage,idx]);res.json({ok:1})}));
app.post('/api/me/seen-guide',wrap(async(req,res)=>{await q('UPDATE users SET seen_guide=TRUE WHERE id=$1',[req.user.id]);res.json({ok:1})}));
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
const DEFAULT_ROLES={
 MANAGER:['Receives jobs from clients, assigns the work and reports back to the client.',['Receive the client\'s request and confirm exactly what they need','Open the case, pick the case type, assign it and set a due date','Check requirements and documents are complete before work starts','Watch the board: overdue, returned and waiting cases','Send the final report and documents to the client when BRELA approves','Handle escalations and review the monthly report']],
 SENIOR:['Does the technical work: reviews cases, submits to BRELA and fixes corrections.',['Review every case before it goes to BRELA (names, IDs, forms, documents)','Submit the application on the client\'s BRELA account','Record BRELA\'s answer: approved, or returned with the reason','Fix BRELA corrections (or guide the Junior to) and send the case back for review','Guide Juniors and answer their questions in the case comments','Keep client account logins in the vault only']],
 JUNIOR:['Does routine tasks quickly and accurately.',['Prepare documents and forms for the cases assigned to you','Upload each document and tick it in the checklist','Ask questions in the case comments, not on WhatsApp','Mark the case ready for review when everything is complete','Never submit to BRELA yourself: a Senior reviews first']],
 SECRETARY:['Runs the office side: receives and files documents and follows up with clients.',['Receive documents from clients (physical, email, WhatsApp) and upload them','File WhatsApp Inbox documents under the right client, case and checklist item','Scan and name files clearly','Follow up with clients for missing documents and note it in the case comments','Keep client details and phone numbers up to date']],
 ASSOCIATE:['Takes on tasks assigned by the Manager.',['Work on the cases assigned to you and follow each case\'s guide','Upload documents and comment on your progress','Ask the Manager or a Senior when you are unsure']]};
const DEFAULT_STAGES={
 new:[['MANAGER'],['Read the client\'s request and confirm what they need','Check the client\'s details and phone number are saved on the client page','Confirm the case type and assign the right person with a due date','Tell the assignee anything special about this client'],'The case has the right assignee and due date.'],
 docs:[['SECRETARY','JUNIOR','ASSOCIATE'],['Open the documents checklist and see what is missing','Collect missing documents from the client (phone, WhatsApp, email)','Upload each document and check it is readable and complete','Check names and ID numbers match across all documents','Write in the comments if the client is slow to respond'],'Every item in the checklist is uploaded and ticked.'],
 ready:[['SENIOR','MANAGER'],['Open every document and check it is correct and readable','Check names, ID numbers and details match the application','Check the client\'s authorization is signed','Fix or send back anything wrong, with a comment','When everything is correct, submit to BRELA'],'A Senior is satisfied that everything is correct.'],
 submitted:[['SENIOR'],['Submit the application on the client\'s BRELA account (the vault has the login)','Write the BRELA reference number in a comment','Check the BRELA status regularly','When BRELA answers, record it here: approved, or returned with the reason'],'BRELA has approved or returned the application.'],
 returned:[['SENIOR','JUNIOR'],['Read BRELA\'s correction request carefully','Decide what must change and who will fix it','Fix the documents or details and upload the new versions','Comment on what was changed','Press "Corrections done" to send it back for review'],'All corrections are fixed and uploaded.'],
 done:[['MANAGER'],['Check BRELA\'s approval documents are uploaded to the case','Send the final report and documents to the client','Confirm in the comments that the client received them','Remind the client of the next deadline (for example the annual return)'],'The client has their documents.']};
const STARTER={'Business Name Registration':['Client ID / passport copy','Passport photo','Proposed business names (2-3)','Signed client authorization','Proof of address'],
 'Company Incorporation':['Directors & shareholders ID / passport copies','Passport photos','Proposed company names','MEMARTS (Memorandum & Articles)','Registered office address proof','Signed client authorization'],
 'Annual Return':['Previous annual return / certificate','Financial statements','Shareholders & directors details','Signed client authorization'],
 'Change of Directors':['New director ID / passport copy','Resignation letter (if any)','Board / shareholders resolution','Signed client authorization'],
 'Beneficial Ownership Update':['Beneficial owners ID / passport copies','Ownership structure / percentages','Signed client authorization']};
async function init(){
  await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  if(!(await one('SELECT 1 FROM roles LIMIT 1'))){
    const old=Object.fromEntries((await q('SELECT role,summary,duties FROM role_playbook').catch(()=>[])).map(r=>[r.role,r])),META={MANAGER:['Manager','MANAGER',true],SENIOR:['Senior','SENIOR',true],JUNIOR:['Junior','STAFF',false],SECRETARY:['Secretary','STAFF',true],ASSOCIATE:['Associate','STAFF',false]};
    for(const [k,[sum,d]] of Object.entries(DEFAULT_ROLES)){const o=old[k],m=META[k];await q('INSERT INTO roles(key,name,level,team_queue,summary,duties) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[k,m[0],m[1],m[2],o?o.summary:sum,JSON.stringify(o?o.duties:d)])}}
  if(!(await one('SELECT 1 FROM users LIMIT 1'))){
    const pw=process.env.ADMIN_PASSWORD||crypto.randomBytes(6).toString('base64url'),email=(process.env.ADMIN_EMAIL||'admin@example.com').toLowerCase();
    await q('INSERT INTO users(name,email,role,password_hash) VALUES($1,$2,$3,$4)',[process.env.ADMIN_NAME||'Manager',email,'MANAGER',await bcrypt.hash(pw,10)]);
    console.log(`First Manager created: ${email}${process.env.ADMIN_PASSWORD?'':' / temporary password: '+pw}`)}
  if(!(await one('SELECT 1 FROM stage_playbook LIMIT 1')))for(const [st,[o,steps,dw]] of Object.entries(DEFAULT_STAGES))await q('INSERT INTO stage_playbook(stage,owner_roles,steps,done_when) VALUES($1,$2::jsonb,$3::jsonb,$4)',[st,JSON.stringify(o),JSON.stringify(steps),dw]);
  if(!(await one('SELECT 1 FROM case_types LIMIT 1')))for(const [n,d] of Object.entries(STARTER)){const t=await one('INSERT INTO case_types(name) VALUES($1) RETURNING id',[n]);await saveDocs(t.id,d)}
  WA.startScheduler();app.listen(process.env.PORT||3000,()=>console.log('BRELA Desk running on port '+(process.env.PORT||3000)))}
init().catch(e=>{console.error(e);process.exit(1)});
