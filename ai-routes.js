// Routes for the AI assistant: settings, templates, company data, document generation.
const fs=require('fs'),path=require('path');
const SR=['MANAGER','SENIOR'],KEY=/^[a-z][a-z0-9_]{0,40}$/,ROLES=['director','shareholder','secretary','beneficial_owner','other'];
const COMMON_KEYS=['company_name','proposed_names','business_activity','registered_office','postal_address','share_capital','number_of_shares','share_value','date_of_incorporation','tin','financial_year_end','objects'];
const {parseRegistry,composeAddress}=require('./registry-import');
const SC=require('./scenarios'),WD=require('./wizard-dsl');
module.exports=(app,{q,one,wrap,fail,need,audit,caseInfo,log,up,AI,E})=>{
 const sr=u=>SR.includes(u.level);
 const clean=v=>String(v??'').replace(/\r/g,'').trim().slice(0,2000);
 // ---------- settings (Manager)
 app.get('/api/ai/settings',need('MANAGER'),wrap(async(req,res)=>res.json(await AI.publicSettings())));
 app.put('/api/ai/settings',need('MANAGER'),wrap(async(req,res)=>{
  const before=await AI.getSettings(),{api_key,clear_key,...patch}=req.body||{},after=await AI.saveSettings(patch,{apiKey:api_key,clearKey:!!clear_key});
  const ch=[];for(const k of ['provider','temperature','max_tokens','daily_limit','hourly_per_user','min_level','privacy','language','timeout_s','custom_base_url'])if(String(before[k])!==String(after[k]))ch.push(`${k} ${before[k]} → ${after[k]}`);
  if(before.models[after.provider]!==after.models[after.provider])ch.push(`model ${before.models[after.provider]||'-'} → ${after.models[after.provider]}`);
  if(before.system_prompt!==after.system_prompt)ch.push('system prompt changed');if(api_key)ch.push(`API key saved for ${after.provider}`);if(clear_key)ch.push(`API key removed for ${after.provider}`);
  if(ch.length)await audit(req,'ai.settings',ch.join('; '));res.json(await AI.publicSettings())}));
 app.post('/api/ai/models',need('MANAGER'),wrap(async(req,res)=>res.json({models:await AI.listModels()})));
 app.post('/api/ai/test',need('MANAGER'),wrap(async(req,res)=>{
  const s=await AI.getSettings();let out;
  try{out=await AI.call({user:'Reply with the single word OK.',maxTokens:64});await AI.record({userId:req.user.id,kind:'test',provider:out.provider,model:out.model,usage:out.usage,ms:out.ms});res.json({ok:true,reply:out.text.slice(0,80),provider:out.provider,model:out.model,ms:out.ms})}
  catch(e){await AI.record({userId:req.user.id,kind:'test',provider:s.provider,model:s.models[s.provider],ok:false,error:e.message});throw e}}));
 app.get('/api/ai/status',wrap(async(req,res)=>res.json(await AI.status(req.user))));
 app.get('/api/ai/usage',need('MANAGER'),wrap(async(req,res)=>{
  const [byUser,byKind,recent,lim]=await Promise.all([
   q(`SELECT coalesce(u.name,'—') AS name,count(*)::int AS runs,coalesce(sum(r.tokens_in),0)::int AS tokens_in,coalesce(sum(r.tokens_out),0)::int AS tokens_out FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id WHERE r.created_at>now()-interval '7 days' AND r.kind<>'fill' GROUP BY u.name ORDER BY runs DESC`),
   q(`SELECT kind,count(*)::int AS runs FROM ai_runs WHERE created_at>now()-interval '7 days' GROUP BY kind ORDER BY runs DESC`),
   q(`SELECT r.created_at,r.kind,r.mode,r.model,r.ok,r.error,r.ms,u.name AS who FROM ai_runs r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.id DESC LIMIT 10`),AI.limits(req.user.id)]);
  res.json({byUser,byKind,recent,used_24h:lim.used_24h,daily_limit:lim.daily_limit})}));

 // ---------- company data: profile (client), case data, people
 const patchJson=async(table,id,body)=>{
  const row=await one(`SELECT ${table==='cases'?'data':'profile'} AS j FROM ${table} WHERE id=$1`,[id]);if(!row)fail(404,'Not found');
  const j={...row.j};for(const [k,v] of Object.entries(body.set||{})){if(!KEY.test(k))fail(400,`"${k}" is not a valid field name (lowercase letters, digits and underscores, starting with a letter)`);const t=clean(v);if(t)j[k]=t;else delete j[k]}
  for(const k of body.remove||[])delete j[k];if(Object.keys(j).length>80)fail(400,'Too many fields (max 80)');
  await q(`UPDATE ${table} SET ${table==='cases'?'data':'profile'}=$1::jsonb WHERE id=$2`,[JSON.stringify(j),id]);return j};
 app.patch('/api/cases/:id/data',wrap(async(req,res)=>{const j=await patchJson('cases',+req.params.id,req.body||{});res.json({data:j})}));
 app.patch('/api/clients/:id/profile',wrap(async(req,res)=>{const j=await patchJson('clients',+req.params.id,req.body||{});res.json({profile:j})}));
 const PERSON=['full_name','nationality','id_type','id_number','dob','address','phone','email','shares','gender','share_class','share_value','ownership','occupation','previous_names','other_directorships'];
 const ADDR=['country','region','district','ward','subward','street','road','house','plot','block','pobox','postcode','unsurveyed','landmark'];
 const cleanAddr=a=>{const o={};for(const k of ADDR){const v=clean((a||{})[k]);if(v)o[k]=v}return o};
 const personVals=b=>{const roles=(Array.isArray(b.roles)?b.roles:[]).filter(r=>ROLES.includes(r));if(!clean(b.full_name))fail(400,'Name is required');
  const addr=cleanAddr(b.addr);let address=clean(b.address);if(Object.keys(addr).length)address=composeAddress(addr)||address;
  return{roles,addr,vals:PERSON.map(k=>k==='address'?(address||null):clean(b[k])||null)}};
 app.get('/api/clients/:id/people',wrap(async(req,res)=>res.json(await q('SELECT * FROM client_people WHERE client_id=$1 ORDER BY position,id',[+req.params.id]))));
 app.post('/api/clients/:id/people',wrap(async(req,res)=>{const v=personVals(req.body||{}),pos=(await one('SELECT coalesce(max(position),0)+1 AS n FROM client_people WHERE client_id=$1',[+req.params.id])).n;
  const cols=['client_id','roles',...PERSON,'addr','position'];
  res.json(await one(`INSERT INTO client_people(${cols.join(',')}) VALUES(${cols.map((c,i)=>'$'+(i+1)+(c==='roles'||c==='addr'?'::jsonb':'')).join(',')}) RETURNING *`,[+req.params.id,JSON.stringify(v.roles),...v.vals,JSON.stringify(v.addr),pos]))}));
 app.put('/api/people/:id',wrap(async(req,res)=>{const v=personVals(req.body||{});
  const r=await one(`UPDATE client_people SET roles=$2::jsonb,addr=$3::jsonb,${PERSON.map((c,i)=>c+'=$'+(i+4)).join(',')} WHERE id=$1 RETURNING *`,[+req.params.id,JSON.stringify(v.roles),JSON.stringify(v.addr),...v.vals]);if(!r)fail(404,'Not found');res.json(r)}));
 app.delete('/api/people/:id',wrap(async(req,res)=>{if(!await one('SELECT 1 FROM client_people WHERE id=$1',[+req.params.id]))fail(404,'Not found');await q('DELETE FROM client_people WHERE id=$1',[+req.params.id]);res.json({ok:1})}));
 // ---------- import a pasted BRELA registry "Company Details" page: preview first, then save (no AI: the text is read by rules)
 app.post('/api/clients/:id/registry-import',wrap(async(req,res)=>{
  const id=+req.params.id,text=String((req.body||{}).text||'');if(text.trim().length<30)fail(400,'Paste the BRELA Company Details page first');if(text.length>200000)fail(400,'That text is too long');
  const cl=await one('SELECT id,name,track_number,profile FROM clients WHERE id=$1',[id]);if(!cl)fail(404,'Client not found');
  const r=parseRegistry(text);if(!r.ok)fail(400,r.error);
  const have=await q('SELECT * FROM client_people WHERE client_id=$1 ORDER BY position,id',[id]),prof=cl.profile||{};
  const norm=v=>String(v||'').replace(/\s+/g,' ').trim().toLowerCase();
  const fields=Object.entries(r.values).map(([k,v])=>({key:k,value:v,old:prof[k]||'',status:!prof[k]?'new':norm(prof[k])===norm(v)?'same':'changed'}));
  const match=p=>have.find(h=>(p.id_number&&norm(h.id_number)===norm(p.id_number))||norm(h.full_name)===norm(p.full_name));
  const ppl=r.people.map(p=>{const h=match(p);const diff=h?PERSON.filter(f=>p[f]&&norm(h[f])!==norm(p[f])):[];const roles=h?[...new Set([...(h.roles||[]),...p.roles])]:p.roles;
   return{...p,existing_id:h?h.id:null,status:!h?'new':(diff.length||roles.length!==(h.roles||[]).length)?'update':'same',changes:diff}});
  const kept=have.filter(h=>!r.people.some(p=>match(p)===h)).map(h=>({id:h.id,full_name:h.full_name,roles:h.roles}));
  const out={fields,people:ppl,kept,activities:{count:r.activities.length,main:(r.activities.find(a=>a.main)||r.activities[0]||{}).name||''},warnings:r.warnings,tracking:r.tracking||'',client_tracking:cl.track_number||'',company_name:r.values.company_name||'',client_name:cl.name};
  if(!(req.body||{}).apply)return res.json({...out,applied:false});
  // save: company details are set, people are added or updated (people not in the registry are never removed)
  const j={...prof};for(const [k,v] of Object.entries(r.values)){if(!KEY.test(k))continue;const t=clean(v);if(t)j[k]=t}
  j.registry_updated=new Date(Date.now()+3*3600e3).toISOString().slice(0,10);if(Object.keys(j).length>80)fail(400,'Too many company fields (max 80)');
  await q('UPDATE clients SET profile=$1::jsonb WHERE id=$2',[JSON.stringify(j),id]);
  if(r.tracking&&!cl.track_number)await q('UPDATE clients SET track_number=$1 WHERE id=$2',[r.tracking,id]);
  let added=0,updated=0,pos=(await one('SELECT coalesce(max(position),0) AS n FROM client_people WHERE client_id=$1',[id])).n;
  for(const p of ppl){
   if(p.existing_id){const h=have.find(x=>x.id===p.existing_id);if(p.status==='same')continue;
    const roles=[...new Set([...(h.roles||[]),...p.roles])].filter(x=>ROLES.includes(x)),addr=Object.keys(p.addr||{}).length?cleanAddr(p.addr):(h.addr||{});
    await q(`UPDATE client_people SET roles=$2::jsonb,addr=$3::jsonb,${PERSON.map((c,i)=>c+'=$'+(i+4)).join(',')} WHERE id=$1`,[h.id,JSON.stringify(roles),JSON.stringify(addr),...PERSON.map(f=>clean(p[f])||h[f]||null)]);updated++}
   else{const cols=['client_id','roles',...PERSON,'addr','position'];
    await q(`INSERT INTO client_people(${cols.join(',')}) VALUES(${cols.map((c,i)=>'$'+(i+1)+(c==='roles'||c==='addr'?'::jsonb':'')).join(',')})`,[id,JSON.stringify(p.roles.filter(x=>ROLES.includes(x))),...PERSON.map(f=>clean(p[f])||null),JSON.stringify(cleanAddr(p.addr)),++pos]);added++}}
  if(r.activities.length)await q('UPDATE clients SET activities=$1::jsonb WHERE id=$2',[JSON.stringify(r.activities.slice(0,300).map(a=>({name:clean(a.name),code:clean(a.code),main:!!a.main}))),id]);
  await audit(req,'client.registry',`${cl.name}: company details imported from the BRELA registry (${fields.filter(f=>f.status!=='same').length} fields, ${added} people added, ${updated} updated)`);
  res.json({...out,applied:true,added,updated})}));
 const contextFor=async(caseId,opt={})=>{
  const c=await caseInfo(caseId);if(!c)fail(404,'Case not found');
  const [client,cd,people,who]=await Promise.all([one('SELECT * FROM clients WHERE id=$1',[c.client_id]),one('SELECT data FROM cases WHERE id=$1',[caseId]),q('SELECT * FROM client_people WHERE client_id=$1 ORDER BY position,id',[c.client_id]),c.who?one('SELECT name FROM users WHERE id=$1',[c.who]):null]);
  const mk=(profile,data)=>E.buildContext({client,caseRow:c,assignee:who&&who.name,profile,data,people});
  let ctx=mk(client.profile,{...cd.data,...(opt.over||{})}),blanks=[];
  // the company's own details come first; where the Company holds nothing, the standard Articles wording fills the provisions (Table A, quorum, notice...)
  if(opt.articles&&!opt.scn){const prof={...client.profile};for(const [k,,def] of SC.ARTICLE_KEYS)if(!String(prof[k]||'').trim())prof[k]=def;ctx=mk(prof,{...cd.data,...(opt.over||{})})}
  if(opt.scn){ // a scenario: worked-out wording, dates and amounts sit between the company's details and anything typed by hand on the case
   const s=opt.scn,a=opt.answers||{},{V,B}=s.derive(a,SC.companyView(ctx)),prof={...client.profile};
   for(const [k,def] of SC.ARTICLE_KEYS.map(x=>[x[0],x[2]]))prof[k]=a['art_'+k]||prof[k]||def;
   for(const [k,v] of Object.entries(V))if(String(v)!=='')prof[k]=String(v);
   blanks=[...B,...Object.entries(V).filter(([k,v])=>/_opt$/.test(k)&&String(v)==='').map(([k])=>k.toUpperCase())];
   ctx=mk(prof,{...cd.data,...(opt.over||{})})}
  return{c,client,cd:cd.data,people,ctx,blanks}};
 app.get('/api/cases/:id/context',wrap(async(req,res)=>{const x=await contextFor(+req.params.id);res.json({values:x.ctx.values,data:x.cd,profile:x.client.profile,people:x.people,keys:[...new Set([...COMMON_KEYS,...Object.keys(x.client.profile),...Object.keys(x.cd)])]})}));

 // ---------- templates
 const TLIST=`SELECT t.id,t.name,t.kind,t.description,t.case_type_id,ct.name AS case_type,t.keywords,t.status,t.version,t.uses,t.clean_runs,(t.docx_name IS NOT NULL) AS has_docx,t.updated_at FROM templates t LEFT JOIN case_types ct ON ct.id=t.case_type_id`;
 const bodyOf=async t=>(await one('SELECT body FROM template_versions WHERE template_id=$1 AND version=$2',[t.id,t.version])).body;
 const kindOf=k=>['FORM','DOCUMENT'].includes(k)?k:'DOCUMENT';
 const newVersion=async(t,body,note,source,user)=>{const v=t.version+1;await q('INSERT INTO template_versions(template_id,version,body,note,source,created_by) VALUES($1,$2,$3,$4,$5,$6)',[t.id,v,body,note||null,source,user]);await q(`UPDATE templates SET version=$2,status='DRAFT',clean_runs=0,updated_at=now() WHERE id=$1`,[t.id,v]);return v};
 app.get('/api/templates',wrap(async(req,res)=>{const qs=String(req.query.q||'').trim();res.json((await q(`${TLIST} WHERE ($1='' OR t.name ILIKE '%'||$1||'%' OR t.keywords ILIKE '%'||$1||'%') ORDER BY t.name`,[qs])).map(t=>({...t,wizard:WIZ_OF[tidOfTemplate(t)]||null})))}));
 app.get('/api/templates/:id',wrap(async(req,res)=>{
  const t=await one(`${TLIST} WHERE t.id=$1`,[+req.params.id]);if(!t)fail(404,'Template not found');
  const extra=await one('SELECT ai_notes FROM templates WHERE id=$1',[t.id]),body=await bodyOf(t),versions=await q('SELECT v.version,v.note,v.source,v.created_at,u.name AS by FROM template_versions v LEFT JOIN users u ON u.id=v.created_by WHERE v.template_id=$1 ORDER BY v.version DESC',[t.id]);
  res.json({...t,ai_notes:extra.ai_notes||'',body,fields:E.fields(body),versions})}));
 app.post('/api/templates',need(...SR),wrap(async(req,res)=>{
  const b=req.body||{},name=clean(b.name),body=String(b.body||'');if(!name)fail(400,'Give the template a name');if(!body.trim())fail(400,'The template text is empty');if(body.length>200000)fail(400,'The template is too long');
  const t=await one(`INSERT INTO templates(name,kind,description,ai_notes,case_type_id,keywords,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[name,kindOf(b.kind),clean(b.description)||null,clean(b.ai_notes)||null,+b.case_type_id||null,clean(b.keywords)||null,req.user.id]);
  await q('INSERT INTO template_versions(template_id,version,body,note,source,created_by) VALUES($1,1,$2,$3,$4,$5)',[t.id,body,clean(b.note)||'First version',b.source==='ai'?'ai':'manual',req.user.id]);res.json(t)}));
 app.put('/api/templates/:id',need(...SR),wrap(async(req,res)=>{
  const t=await one('SELECT * FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');const b=req.body||{};
  const name=b.name!==undefined?clean(b.name):t.name;if(!name)fail(400,'Give the template a name');
  await q('UPDATE templates SET name=$2,kind=$3,description=$4,ai_notes=$5,case_type_id=$6,keywords=$7,updated_at=now() WHERE id=$1',[t.id,name,b.kind!==undefined?kindOf(b.kind):t.kind,b.description!==undefined?clean(b.description)||null:t.description,b.ai_notes!==undefined?clean(b.ai_notes)||null:t.ai_notes,b.case_type_id!==undefined?(+b.case_type_id||null):t.case_type_id,b.keywords!==undefined?clean(b.keywords)||null:t.keywords]);
  let version=t.version;
  if(b.body!==undefined){const body=String(b.body);if(!body.trim())fail(400,'The template text is empty');if(body.length>200000)fail(400,'The template is too long');
   if(body!==await bodyOf(t)){version=await newVersion(t,body,clean(b.note),b.source==='learned'?'learned':'manual',req.user.id);if(t.status==='APPROVED')await audit(req,'template.edit',`${name}: approved template edited, back to draft (v${version})`)}}
  res.json({ok:1,version})}));
 app.post('/api/templates/:id/approve',need(...SR),wrap(async(req,res)=>{
  const t=await one('SELECT * FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');const on=req.body.approved!==false;
  await q('UPDATE templates SET status=$2,updated_at=now() WHERE id=$1',[t.id,on?'APPROVED':'DRAFT']);await audit(req,on?'template.approve':'template.unapprove',`${t.name} (v${t.version})`);res.json({ok:1,status:on?'APPROVED':'DRAFT'})}));
 app.post('/api/templates/:id/restore',need(...SR),wrap(async(req,res)=>{
  const t=await one('SELECT * FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');const old=await one('SELECT body FROM template_versions WHERE template_id=$1 AND version=$2',[t.id,+req.body.version]);if(!old)fail(404,'That version does not exist');
  res.json({ok:1,version:await newVersion(t,old.body,`Restored version ${+req.body.version}`,'manual',req.user.id)})}));
 app.delete('/api/templates/:id',need('MANAGER'),wrap(async(req,res)=>{const t=await one('SELECT name FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');await q('DELETE FROM templates WHERE id=$1',[+req.params.id]);await audit(req,'template.delete',t.name);res.json({ok:1})}));
 app.post('/api/templates/:id/preview',wrap(async(req,res)=>{
  const t=await one('SELECT * FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');const body=await bodyOf(t);
  const ctx=req.body.case_id?(await contextFor(+req.body.case_id)).ctx:{values:{today:new Date().toDateString()},lists:{}};res.json(E.render(body,ctx))}));

 // ---------- document view: the template as a real Word file (what the generated document looks like)
 const DOCX_MIME='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
 // placeholders become the yellow [gaps] of the Word file; list blocks keep one sample line
 const previewBody=b=>String(b||'').replace(/\{\{#[a-z][a-z0-9_]*\}\}\n?/g,'').replace(/\{\{\/[a-z][a-z0-9_]*\}\}\n?/g,'').replace(/\{\{\s*([a-z][a-z0-9_]*)(?:\s*\|[^}]*)?\}\}/g,'[[$1]]');
 const safeName=n=>String(n||'template').replace(/[\\/:*?"<>|]+/g,' ').trim()||'template';
 app.get('/api/templates/:id/docx',wrap(async(req,res)=>{
  const t=await one('SELECT * FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');
  const buf=t.docx_data?Buffer.from(t.docx_data):await E.textToDocx(previewBody(await bodyOf(t)),{title:t.name});
  res.set({'Content-Type':DOCX_MIME,'Content-Length':buf.length,'Content-Disposition':`${req.query.download?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(safeName(t.docx_name?t.docx_name.replace(/\.docx$/i,''):t.name)+'.docx')}`,'Cache-Control':'no-store'});res.send(buf)}));
 app.post('/api/templates/render-docx',wrap(async(req,res)=>{
  const b=req.body||{},body=String(b.body||'');if(body.length>200000)fail(400,'The template is too long');
  const buf=await E.textToDocx(previewBody(body),{title:clean(b.title)||'Template'});
  res.set({'Content-Type':DOCX_MIME,'Content-Length':buf.length,'Cache-Control':'no-store'});res.send(buf)}));
 // an edited Word file comes back: it replaces the official form (and re-reads its text), or, for a text template, is read into editable HTML
 app.post('/api/templates/docx-to-html',need(...SR),up,wrap(async(req,res)=>{
  if(!req.file)fail(400,'Choose a Word (.docx) file');if(!/\.docx$/i.test(Buffer.from(req.file.originalname,'latin1').toString('utf8')))fail(400,'Use a .docx file');
  let html;try{html=(await require('mammoth').convertToHtml({buffer:req.file.buffer})).value}catch{fail(400,'This Word file could not be read')}
  res.json({html})}));
 app.post('/api/templates/:id/upload-docx',need(...SR),up,wrap(async(req,res)=>{
  const t=await one('SELECT * FROM templates WHERE id=$1',[+req.params.id]);if(!t)fail(404,'Template not found');if(!t.docx_data)fail(400,'This template has no official Word form to replace');
  if(!req.file)fail(400,'Choose a Word (.docx) file');const name=Buffer.from(req.file.originalname,'latin1').toString('utf8');if(!/\.docx$/i.test(name))fail(400,'Use a .docx file');
  let raw;try{raw=(await require('mammoth').extractRawText({buffer:req.file.buffer})).value}catch{fail(400,'This Word file could not be read')}
  const l2k={};for(const k of Object.keys(t.docx_defaults||{}))l2k[E.labelFromKey(k)]=k;
  const body=E.docxTextToBody(raw,l2k);if(!body.trim())fail(400,'The Word file has no text');
  await q('UPDATE templates SET docx_name=$2,docx_data=$3,updated_at=now() WHERE id=$1',[t.id,name.slice(0,200),req.file.buffer]);
  const version=body!==await bodyOf(t)?await newVersion(t,body,'Word form replaced with an edited file','manual',req.user.id):t.version;
  await audit(req,'template.docx',`${t.name}: Word form replaced (${name})`);res.json({ok:1,version,body})}));

 // ---------- AI helpers
 async function guard(req,kind){
  const st=await AI.status(req.user);if(!st.configured)fail(400,'The AI is not set up yet. A Manager can add an API key in Settings → AI assistant.');
  if(!st.can_use)fail(403,'Your role is not allowed to use the AI. A Manager can change this in Settings → AI assistant.');if(st.blocked)fail(429,st.blocked);return st}
 async function run(req,{kind,mode,caseId,templateId,system,user,maxTokens}){
  let out;try{out=await AI.call({system,user,maxTokens})}catch(e){await AI.record({userId:req.user.id,caseId,templateId,kind,mode,ok:false,error:e.message});throw e}
  const rec=await AI.record({userId:req.user.id,caseId,templateId,kind,mode,provider:out.provider,model:out.model,usage:out.usage,ms:out.ms,output:out.text});return{...out,run_id:rec.id}}
 const loadTemplate=async id=>{if(!id)return null;const t=await one('SELECT * FROM templates WHERE id=$1',[+id]);if(!t)fail(404,'Template not found');return{...t,body:await bodyOf(t)}};
 const tryGuard=async(req,kind)=>{try{await guard(req,kind);return true}catch{return false}};
 const templatize=async(req,{kind,caseId,templateId,user,text})=>{try{const out=await run(req,{kind,mode:'ai',caseId,templateId,user,maxTokens:Math.min(16000,Math.max(2000,Math.ceil(text.length/2)))});return out.text.length>=text.length*0.6&&/\{\{[a-z#]/.test(out.text)?out.text:null}catch{return null}};

 app.get('/api/cases/:id/ai/suggest',wrap(async(req,res)=>{
  const c=await caseInfo(+req.params.id);if(!c)fail(404,'Case not found');const name=String(req.query.name||'');
  const all=await q(`${TLIST}`);res.json(all.map(t=>({...t,score:E.suggestScore(t,name,c.case_type_id)})).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)))}));

 // generate: approved template -> instant fill (no AI); otherwise the AI prepares it, following the template as the format guide
 app.post('/api/cases/:id/ai/generate',wrap(async(req,res)=>{
  const id=+req.params.id,b=req.body||{},x=await contextFor(id),t=await loadTemplate(b.template_id),docName=clean(b.doc_name)||(t&&t.name)||'Document';
  let mode=['auto','ai','fill'].includes(b.mode)?b.mode:'auto';if(mode==='fill'&&!t)fail(400,'Choose a template to fill');
  if(mode==='auto')mode=t&&t.status==='APPROVED'?'fill':'ai';
  if(mode==='fill'){const r=E.render(t.body,x.ctx);const rec=await AI.record({userId:req.user.id,caseId:id,templateId:t.id,kind:'fill',mode:'fill',output:r.text});
   return res.json({text:r.text,missing:r.missing,mode:'fill',run_id:rec.id,template:{id:t.id,name:t.name,status:t.status,version:t.version},doc_name:docName,ai_used:false})}
  await guard(req,'generate');const s=await AI.getSettings(),w=E.withhold(x.ctx,s.privacy);
  const vals=Object.fromEntries(Object.entries(w.values).filter(([k,v])=>String(v).trim()&&!/^person_\d+_/.test(k)));
  const user=[`DOCUMENT TO PREPARE: ${docName}`,`CASE: ${x.c.code}, ${x.c.type}, client: ${x.client.name}`,`LANGUAGE: ${s.language}`,
   t&&t.ai_notes?`RULES FOR THIS DOCUMENT TYPE:\n${t.ai_notes}`:'',clean(b.instructions)?`EXTRA INSTRUCTIONS FROM THE USER:\n${clean(b.instructions)}`:'',
   t?`TEMPLATE (follow its structure and wording exactly; {{...}} marks the variable parts, {{#list}}...{{/list}} repeats for each person):\n<<<TEMPLATE\n${t.body}\nTEMPLATE>>>`:'No template exists yet: use the standard layout for this kind of document.',
   `FACTS (JSON, use only these):\n${JSON.stringify({values:vals,people:w.lists.people})}`,
   w.withheld.length?`These values are withheld for privacy; write each one exactly as its {{token}} where it belongs: ${w.withheld.join(', ')}`:''].filter(Boolean).join('\n\n');
  const out=await run(req,{kind:'generate',mode:'ai',caseId:id,templateId:t&&t.id,user});
  const r=E.render(out.text,x.ctx);const missing=E.gaps(r.text);
  res.json({text:r.text,missing,mode:'ai',run_id:out.run_id,template:t?{id:t.id,name:t.name,status:t.status,version:t.version}:null,doc_name:docName,ai_used:true,model:out.model,withheld:w.withheld.length})}));

 app.post('/api/cases/:id/ai/apply-gaps',wrap(async(req,res)=>{
  const id=+req.params.id,b=req.body||{},vals=b.values||{};let text=String(b.text||'');
  text=E.applyGaps(text,vals);
  if(b.remember){const set={};for(const [k,v] of Object.entries(vals))if(KEY.test(k)&&clean(v))set[k]=v;if(Object.keys(set).length)await patchJson('cases',id,{set})}
  res.json({text,missing:E.gaps(text)})}));

 app.post('/api/cases/:id/ai/save',wrap(async(req,res)=>{
  const id=+req.params.id,b=req.body||{},c=await caseInfo(id);if(!c)fail(404,'Case not found');const text=String(b.text||'');if(text.trim().length<10)fail(400,'The document is empty');if(text.length>300000)fail(400,'The document is too long');
  let item=null;if(b.item_id){item=await one('SELECT id,name FROM case_docs WHERE id=$1 AND case_id=$2',[+b.item_id,id]);if(!item)fail(400,'That checklist item is not on this case')}
  const t=b.template_id?await one('SELECT id,name FROM templates WHERE id=$1',[+b.template_id]):null;
  let name=clean(b.filename)||`${(item&&item.name)||(t&&t.name)||'Document'}`;name=name.replace(/[\\/:*?"<>|]+/g,' ').replace(/\.docx$/i,'').trim().slice(0,120)||'Document';
  const buf=await E.textToDocx(text,{title:name}),gp=E.gaps(text);
  const f=await one(`INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,data,uploaded_by,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'ai') RETURNING id,filename`,[c.client_id,id,item?item.id:null,`${name}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buf.length,buf,req.user.id]);
  if(item&&!gp.length)await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[item.id]);
  await log(id,req.user.id,`prepared "${name}" with ${b.mode==='fill'?'a template':'AI'}${t?` (template: ${t.name})`:''}${gp.length?`, ${gp.length} gap(s) still to fill`:''}`);
  if(t){await q('UPDATE templates SET uses=uses+1,clean_runs=CASE WHEN $2 THEN clean_runs+1 ELSE 0 END WHERE id=$1',[t.id,!b.manual_edits&&!gp.length])}
  const tpl=t?await one('SELECT uses,clean_runs,status FROM templates WHERE id=$1',[t.id]):null;
  res.json({file:f,gaps:gp.length,ticked:!!(item&&!gp.length),template:tpl})}));

 // teach: turn the corrected final document into an improved template (proposal only, nothing is saved here)
 app.post('/api/cases/:id/ai/learn',need(...SR),wrap(async(req,res)=>{
  const id=+req.params.id,b=req.body||{},x=await contextFor(id),text=String(b.text||'');if(text.trim().length<20)fail(400,'There is no document text to learn from');
  const t=await loadTemplate(b.template_id),det=E.reverse(text,x.ctx.values);let body=det.body,aiUsed=false,replaced=det.replaced;
  if(b.use_ai!==false&&await tryGuard(req,'learn')){
   const keys=[...new Set([...Object.keys(x.ctx.values).filter(k=>!/^person_\d+_/.test(k)),...COMMON_KEYS])];
   const user=[`Turn this finished, accepted document into a reusable template.`,`Replace every detail that belongs to this particular client or case (names, addresses, numbers, dates, amounts, ID numbers) with a {{field_key}} placeholder. Prefer these existing keys when they fit: ${keys.join(', ')}. For repeated blocks about people use {{#directors}}...{{/directors}} (also shareholders, secretaries, beneficial_owners, people) with {{index}}, {{name}}, {{nationality}}, {{id_number}}, {{address}}, {{shares}} inside.`,
    `Keep all fixed wording, order, headings, numbering and formatting exactly as they are. Do not summarise, shorten, add or remove content. Output only the template.`,
    t?`The current template is below; keep its field names where they still apply.\n<<<CURRENT\n${t.body}\nCURRENT>>>`:'',`DOCUMENT:\n<<<\n${text}\n>>>`].filter(Boolean).join('\n\n');
   const out=await templatize(req,{kind:'learn',caseId:id,templateId:t&&t.id,user,text});if(out){body=out;aiUsed=true;replaced=E.fields(body).keys}}
  res.json({body,replaced,ai_used:aiUsed})}));

 // smart fill: read a pasted client message and suggest the company data (nothing is saved until the user applies it)
 app.post('/api/cases/:id/ai/extract',wrap(async(req,res)=>{
  const id=+req.params.id,text=String(req.body.text||'').trim();if(text.length<10)fail(400,'Paste the client\'s message or details first');if(text.length>20000)fail(400,'That text is too long (max 20,000 characters)');
  const x=await contextFor(id);await guard(req,'extract');
  const keys=[...new Set([...COMMON_KEYS,...Object.keys(x.client.profile),...Object.keys(x.cd)])];
  const user=`Read the client's message below and pull out company details.\nReturn ONLY a JSON object: {"values":{"field_key":"value"},"people":[{"full_name":"","roles":["director"|"shareholder"|"secretary"|"beneficial_owner"|"other"],"nationality":"","id_type":"","id_number":"","dob":"","address":"","phone":"","email":"","shares":""}],"notes":""}\nUse these field keys when they fit: ${keys.join(', ')}; you may add new keys (lowercase letters, digits, underscores). Include only what is stated; never guess; leave unknown parts out. Put doubts in "notes".\n\nMESSAGE:\n<<<\n${text}\n>>>`;
  const out=await run(req,{kind:'extract',mode:'ai',caseId:id,user,maxTokens:2000});const j=AI.parseJSON(out.text);
  const values={};for(const [k,v] of Object.entries(j.values||{}))if(KEY.test(k)&&clean(v))values[k]=clean(v);
  const people=(Array.isArray(j.people)?j.people:[]).slice(0,20).filter(p=>p&&clean(p.full_name)).map(p=>({roles:(Array.isArray(p.roles)?p.roles:[]).filter(r=>ROLES.includes(r)),...Object.fromEntries(PERSON.map(k=>[k,clean(p[k])]))}));
  res.json({values,people,notes:clean(j.notes)})}));

 // create a template from an accepted document (file or pasted text)
 app.post('/api/templates/from-document',need(...SR),up,wrap(async(req,res)=>{
  const b=req.body||{},name=clean(b.name);if(!name)fail(400,'Give the template a name');
  const text=req.file?await E.extractText(req.file.buffer,Buffer.from(req.file.originalname,'latin1').toString('utf8'),req.file.mimetype):String(b.text||'').trim();
  if(text.length<20)fail(400,'Upload a document or paste its text');
  let body=text,aiUsed=false;
  if(b.use_ai!=='false'&&await tryGuard(req,'template')){
   const user=[`Convert this accepted document into a reusable template.`,`Replace the details that change from client to client (names, addresses, numbers, dates, amounts, ID numbers) with {{field_key}} placeholders (lowercase letters, digits, underscores). Prefer these keys when they fit: ${COMMON_KEYS.join(', ')}, client_name, client_phone, client_email, case_code, today. For repeated person blocks use {{#directors}}...{{/directors}} (also shareholders, secretaries, beneficial_owners, people) with {{index}}, {{name}}, {{nationality}}, {{id_number}}, {{address}}, {{shares}} inside.`,
    `Keep all fixed wording, order, headings, numbering and formatting exactly as they are. Do not summarise, shorten, add or remove content. Output only the template.`,`DOCUMENT:\n<<<\n${text}\n>>>`].join('\n\n');
   const out=await templatize(req,{kind:'template',user,text});if(out){body=out;aiUsed=true}}
  const t=await one(`INSERT INTO templates(name,kind,description,ai_notes,case_type_id,keywords,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[name,kindOf(b.kind),clean(b.description)||null,clean(b.ai_notes)||null,+b.case_type_id||null,clean(b.keywords)||null,req.user.id]);
  await q('INSERT INTO template_versions(template_id,version,body,note,source,created_by) VALUES($1,1,$2,$3,$4,$5)',[t.id,body,aiUsed?'Created from an accepted document with AI':'Created from an uploaded document',aiUsed?'ai':'manual',req.user.id]);
  res.json({id:t.id,ai_used:aiUsed,fields:E.fields(body)})}));

 // import the official Word template package (Templates_Package): a text template + the exact .docx for each entry
 const PKG=path.join(__dirname,'Templates_Package','Templates_Package');
 app.post('/api/templates/import-package',need(...SR),wrap(async(req,res)=>{
  const mf=path.join(PKG,'templates','manifest.json');let man;
  try{man=JSON.parse(fs.readFileSync(mf,'utf8'))}catch{fail(400,'Templates_Package is not part of this deployment (templates/manifest.json is missing)')}
  const created=[],skipped=[];
  for(const m of man.templates||[]){
   const exists=await one('SELECT id FROM templates WHERE name=$1',[m.title]);if(exists){skipped.push(m.title);continue}
   const buf=fs.readFileSync(path.join(PKG,'templates',m.file));
   const raw=(await require('mammoth').extractRawText({buffer:buf})).value;
   const l2k={};for(const k of Object.keys(man.defaults||{}))l2k[E.labelFromKey(k)]=k;
   for(const p of m.placeholders||[]){l2k[p.label]=p.key;l2k[E.labelFromKey(p.key)]=p.key}
   const body=E.docxTextToBody(raw,l2k);
   const defaults={...man.defaults};for(const p of m.placeholders||[])defaults[p.key]=p.default===undefined?null:p.default;
   const notes=[m.use_rules?`USE RULES: ${m.use_rules}`:'',
    (m.clauses_to_confirm||[]).length?`CLAUSES TO CONFIRM (yellow in the Word form): ${[...new Set(m.clauses_to_confirm)].join(' | ')}`:'',
    (m.placeholders||[]).length?`FIELDS: ${m.placeholders.map(p=>`${p.key}${p.optional?' (optional)':''}`).join(', ')}`:''].filter(Boolean).join('\n\n');
   const t=await one(`INSERT INTO templates(name,kind,description,ai_notes,keywords,docx_name,docx_data,docx_defaults,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING id`,
    [m.title,String(m.id).startsWith('F')?'FORM':'DOCUMENT',`${m.category} — official Word template`,notes||null,`${m.id.toLowerCase()} ${String(m.title).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}`,m.file,buf,JSON.stringify(defaults),req.user.id]);
   await q('INSERT INTO template_versions(template_id,version,body,note,source,created_by) VALUES($1,1,$2,$3,$4,$5)',[t.id,body,'Imported from the official Word template package','manual',req.user.id]);
   created.push(m.title)}
  if(created.length)await audit(req,'template.import',`${created.length} template(s) from the Word template package`);
  res.json({created,skipped})}));

 // the official package templates and the wizard that makes each of them
 const WIZ_OF={T01:'directors',T02:'directors',F01:'directors',F02:'directors',F03:'shares',F04:'shares',T03:'shares',T04:'shares',T05:'shares',T06A:'shares',T06B:'shares',T07A:'shares',T07B:'shares',T08:'shares',F05:'annual'};
 const tidOfTemplate=t=>{const m=String((t&&t.keywords)||'').match(/^([tf]0\d[ab]?) /i);return m?m[1].toUpperCase():null};
 const saveDocx=async(req,x,t,r,name,item)=>{
  const id=x.c.id,f=await one(`INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,data,uploaded_by,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'template') RETURNING id,filename`,
   [x.c.client_id,id,item?item.id:null,`${name}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',r.buffer.length,r.buffer,req.user.id]);
  // a PDF copy next to the Word file (best effort: the server may not have a converter)
  const pdfBuf=await E.docxToPdf(r.buffer);
  if(pdfBuf){const pf=await one(`INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,data,uploaded_by,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'template') RETURNING id,filename`,
   [x.c.client_id,id,item?item.id:null,`${name}.pdf`,'application/pdf',pdfBuf.length,pdfBuf,req.user.id]);f.pdf={id:pf.id,filename:pf.filename}}
  if(item&&!r.missing.length)await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[item.id]);
  await AI.record({userId:req.user.id,caseId:id,templateId:t.id,kind:'fill',mode:'docx',output:`filled ${r.filled}, ${r.missing.length} missing`});
  await log(id,req.user.id,`filled official Word template "${t.name}"${item?` for "${item.name}"`:''} (${r.filled} detail${r.filled===1?'':'s'} placed${r.missing.length?`, ${r.missing.length} still missing`:''})`);
  await q('UPDATE templates SET uses=uses+1 WHERE id=$1',[t.id]);return f};
 // fill an original Word template (exact layout) from the case details
 app.post('/api/cases/:id/ai/generate-docx',wrap(async(req,res)=>{
  const id=+req.params.id,b=req.body||{},x=await contextFor(id,{articles:true});
  const t=await one('SELECT * FROM templates WHERE id=$1 AND docx_data IS NOT NULL',[+b.template_id]);if(!t)fail(404,'This template has no original Word file');
  const item=b.item_id?await one('SELECT id,name FROM case_docs WHERE id=$1 AND case_id=$2',[+b.item_id,id]):null;
  if(b.item_id&&!item)fail(400,'That checklist item is not on this case');
  // one way to make documents: an official form is made by its wizard from the saved answers, so the result is the same everywhere
  const tid=tidOfTemplate(t);
  if(tid){
   for(const w of await wizRows(true)){const s=SC.compose(w),answers=await savedAnswers(id,s.id),cv=SC.companyView((await contextFor(id,{scn:s,answers})).ctx);
    if(!s.jobs(answers,cv).some(j=>j.tid===tid))continue;
    const r=await runScenario(req,id,s,answers,true,tid),made=r.jobs.filter(j=>j.file);
    if(made.length){await log(id,req.user.id,`prepared ${made.length} document${made.length===1?'':'s'} for "${s.title}"`);
     const j=made[0];return res.json({file:{...j.file,pdf:j.pdf||null},files:made.map(m=>({...m.file,pdf:m.pdf||null,title:m.title})),missing:j.missing||[],clauses:0,filled:j.filled,people:r.people,rest:j.missing||[],wizard:s.id})}}
   const hint=WIZ_OF[tid]||'directors';fail(409,`This form is made by the "${(await getWizard(hint,true)||{title:hint}).title}" wizard. Open Prepare documents on the case, answer its questions, and press Prepare.`)}
  const values={...(t.docx_defaults||{}),...E.packageValues(x.ctx)};
  let r;try{r=await E.docxFill(t.docx_data,values)}catch(e){fail(400,'Could not fill this Word template: '+e.message)}
  const name=(item?item.name:t.name).replace(/[\\/:*?"<>|]+/g,' ').trim()||'Document';
  const f=await saveDocx(req,x,t,r,name,item);
  const needs=E.personNeeds(r.missing,x.ctx);
  res.json({file:f,missing:r.missing,clauses:r.clauses,filled:r.filled,people:needs.people,rest:needs.rest})}));


 // ---------- document wizards: stored in the database so a Manager can change the questions, documents, formulas and checks (Settings -> Document wizards)
 let wzSeeded=false;
 const ensureWizards=async()=>{if(wzSeeded)return;let pos=0;
  for(const b of SC.BUILTIN){pos++;const core=b.fields.map(f=>({...f,core:true})),row=await one('SELECT fields FROM wizards WHERE id=$1',[b.id]);
   if(!row){await q('INSERT INTO wizards(id,title,description,icon,match,engine,fields,position) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[b.id,b.title,b.desc,b.icon,b.match.source,b.id,JSON.stringify(core),pos]);continue}
   const have=new Set((row.fields||[]).map(f=>f.key)),isCore=new Set(core.map(f=>f.key)),next=[...(row.fields||[]).map(f=>isCore.has(f.key)?{...f,core:true}:f),...core.filter(f=>!have.has(f.key))];
   if(JSON.stringify(next)!==JSON.stringify(row.fields))await q('UPDATE wizards SET fields=$1::jsonb WHERE id=$2',[JSON.stringify(next),b.id])}
  wzSeeded=true};
 const wizRows=async activeOnly=>{await ensureWizards();return q(`SELECT * FROM wizards ${activeOnly?'WHERE active':''} ORDER BY position,created_at,id`)};
 const getWizard=async(id,activeOnly)=>{await ensureWizards();const r=await one(`SELECT * FROM wizards WHERE id=$1${activeOnly?' AND active':''}`,[id]);return r?SC.compose(r):null};
 const FTYPES=['text','longtext','number','money','date','time','bool','choice','person','people'],FROMS=['any','directors','shareholders','secretaries'];
 const cleanWizard=async(b,old)=>{
  const title=clean(b.title);if(!title)fail(400,'The wizard needs a name');
  const oldF=Object.fromEntries(((old&&old.fields)||[]).map(f=>[f.key,f])),fields=[],seen=new Set();
  for(const f of (Array.isArray(b.fields)?b.fields:[]).slice(0,60)){
   const key=clean(f.key);if(!KEY.test(key))fail(400,`"${clean(f.label)||key}": the field name must use lowercase letters, numbers and _ and start with a letter`);if(seen.has(key))fail(400,`Two questions use the name "${key}"`);seen.add(key);
   const o=oldF[key],label=clean(f.label).slice(0,160);if(!label)fail(400,'Every question needs a label');
   const maps=clean(f.maps_to).toLowerCase();if(maps&&!/^[a-z][a-z0-9_]{0,60}$/.test(maps))fail(400,`"${label}": the placeholder name is not valid`);
   const fmt=WD.FMT.some(x=>x[0]===f.fmt)?f.fmt:'';
   if(o&&o.core){fields.push({...o,label,help:clean(f.help).slice(0,300)||undefined,ph:clean(f.ph).slice(0,120)||undefined,group:clean(f.group).slice(0,60)||o.group,req:o.req===undefined?undefined:!!f.req,maps_to:maps||undefined,fmt:maps&&fmt?fmt:undefined});continue}
   const type=FTYPES.includes(f.type)?f.type:'text',nf={key,label,type,group:clean(f.group).slice(0,60)||'Questions'};
   if(f.req)nf.req=true;if(clean(f.help))nf.help=clean(f.help).slice(0,300);if(clean(f.ph))nf.ph=clean(f.ph).slice(0,120);
   if(type==='person'||type==='people'){nf.from=FROMS.includes(f.from)?f.from:'any';if(type==='people')nf.max=Math.min(10,Math.max(1,+f.max||2))}
   if(type==='choice'){nf.opts=(Array.isArray(f.opts)?f.opts:[]).slice(0,20).map(x=>[clean(x[0]).slice(0,60),clean(x[1]).slice(0,100)]).filter(x=>x[0]&&x[1]);if(!nf.opts.length)fail(400,`"${label}": add at least one choice`)}
   if(f.show&&typeof f.show==='object'){const sh={};if(Array.isArray(f.show.any))sh.any=f.show.any.map(clean).filter(Boolean);for(const [k,v] of Object.entries(f.show))if(k!=='any')sh[clean(k)]=clean(v).slice(0,60);if(sh.any&&!sh.any.length)delete sh.any;if(Object.keys(sh).length)nf.show=sh}
   if(maps){nf.maps_to=maps;if(fmt)nf.fmt=fmt}
   fields.push(nf)}
  for(const o of Object.values(oldF))if(o.core&&!seen.has(o.key))fields.push(o); // built-in questions cannot be removed
  for(const f of fields)if(f.show)for(const k of [...(f.show.any||[]),...Object.keys(f.show).filter(k=>k!=='any')])if(!fields.some(x=>x.key===k))fail(400,`"${f.label}" is shown only when "${k}" is answered, but there is no such question`);
  const docs=[];for(const d of (Array.isArray(b.docs)?b.docs:[]).slice(0,30)){
   const tid=+d.template_id;if(!tid)continue;const t=await one('SELECT id FROM templates WHERE id=$1 AND docx_data IS NOT NULL',[tid]);if(!t)fail(400,'One of the chosen templates no longer exists');
   const iff=clean(d.if),per=clean(d.per);if(iff&&!seen.has(iff))fail(400,`A document depends on "${iff}", which is not a question`);if(per&&!fields.some(f=>f.key===per&&(f.type==='person'||f.type==='people')))fail(400,'A "one document per person" setting must point at a person question');
   docs.push({template_id:tid,name:clean(d.name).slice(0,120)||'Document',if:iff||undefined,per:per||undefined})}
  const rules=[];for(const r of (Array.isArray(b.rules)?b.rules:[]).slice(0,40)){const key=clean(r.key).toLowerCase();if(!key&&!clean(r.expr))continue;if(!/^[a-z][a-z0-9_]{0,60}$/.test(key))fail(400,`Formula "${clean(r.key)}": the placeholder name is not valid`);const e=WD.check(r.expr);if(e)fail(400,`Formula for ${key.toUpperCase()}: ${e}`);rules.push({key,expr:clean(r.expr).slice(0,600),blank:!!r.blank})}
  const checks=[];for(const k of (Array.isArray(b.checks)?b.checks:[]).slice(0,20)){if(!clean(k.when)&&!clean(k.msg))continue;const e=WD.check(k.when);if(e)fail(400,`Check "${clean(k.msg).slice(0,40)}": ${e}`);if(!clean(k.msg))fail(400,'Every check needs a message');checks.push({when:clean(k.when).slice(0,600),msg:clean(k.msg).slice(0,300)})}
  return{title:title.slice(0,120),description:clean(b.description).slice(0,400),icon:/^bx[a-z]?-[a-z0-9-]{2,40}$/.test(clean(b.icon))?clean(b.icon):'bx-file',match:clean(b.match).slice(0,200),fields,docs,rules,checks,active:b.active!==false}};
 app.get('/api/wizards',need('MANAGER'),wrap(async(req,res)=>{
  const rows=await wizRows(false),ts=await q('SELECT id,name,docx_defaults FROM templates WHERE docx_data IS NOT NULL ORDER BY name');
  res.json({items:rows,templates:ts.map(t=>({id:t.id,name:t.name,keys:Object.keys(t.docx_defaults||{}).map(k=>k.toLowerCase())})),functions:WD.docs(),formats:WD.FMT,types:FTYPES})}));
 app.post('/api/wizards',need('MANAGER'),wrap(async(req,res)=>{
  await ensureWizards();const w=await cleanWizard(req.body||{},null);let id=w.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40)||'wizard',n=1;while(await one('SELECT 1 FROM wizards WHERE id=$1',[id]))id=id.replace(/-\d+$/,'')+'-'+(++n);
  const pos=(await one('SELECT coalesce(max(position),0)+1 AS n FROM wizards')).n;
  await q('INSERT INTO wizards(id,title,description,icon,match,fields,docs,rules,checks,position,active) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11)',[id,w.title,w.description,w.icon,w.match,JSON.stringify(w.fields),JSON.stringify(w.docs),JSON.stringify(w.rules),JSON.stringify(w.checks),pos,w.active]);
  await audit(req,'wizard.create',`Document wizard "${w.title}" created`);res.json({id})}));
 app.put('/api/wizards/:wid',need('MANAGER'),wrap(async(req,res)=>{
  await ensureWizards();const old=await one('SELECT * FROM wizards WHERE id=$1',[req.params.wid]);if(!old)fail(404,'Not found');const w=await cleanWizard(req.body||{},old);
  await q('UPDATE wizards SET title=$2,description=$3,icon=$4,match=$5,fields=$6::jsonb,docs=$7::jsonb,rules=$8::jsonb,checks=$9::jsonb,active=$10,updated_at=now() WHERE id=$1',[old.id,w.title,w.description,w.icon,w.match,JSON.stringify(w.fields),JSON.stringify(w.docs),JSON.stringify(w.rules),JSON.stringify(w.checks),w.active]);
  await audit(req,'wizard.update',`Document wizard "${w.title}" changed`);res.json({ok:1})}));
 app.delete('/api/wizards/:wid',need('MANAGER'),wrap(async(req,res)=>{
  await ensureWizards();const old=await one('SELECT id,title,engine FROM wizards WHERE id=$1',[req.params.wid]);if(!old)fail(404,'Not found');
  await q('DELETE FROM wizards WHERE id=$1',[old.id]);if(old.engine)wzSeeded=false; // a built-in wizard goes back to its original questions
  await audit(req,'wizard.delete',`Document wizard "${old.title}" ${old.engine?'reset to the original':'deleted'}`);res.json({ok:1,reset:!!old.engine})}));
 // ---------- case scenarios: a few questions -> every document of the case, filled
 const FORMKEY={F01:'213a',F02:'213b',F03:'57a',F04:'57b',F05:'131'};
 const cleanAnswers=(s,raw)=>{const o={};for(const f of s.fields){let v=clean((raw||{})[f.key]);if(f.type==='bool')v=v==='yes'?'yes':'';if(f.type==='people'||f.type==='person')v=v.split('|').map(x=>x.trim()).filter(Boolean).slice(0,f.max||1).join('|');if(v)o[f.key]=v}return o};
 const savedAnswers=async(caseId,sid)=>((await one('SELECT scn FROM cases WHERE id=$1',[caseId])).scn||{})[sid]||{};
 const saveAnswers=async(caseId,s,answers,clientId)=>{
  const art={};for(const f of s.fields)if(f.article&&answers[f.key])art[f.key.slice(4)]=answers[f.key];
  if(Object.keys(art).length){const cl=await one('SELECT profile FROM clients WHERE id=$1',[clientId]),j={...cl.profile,...art};await q('UPDATE clients SET profile=$1::jsonb WHERE id=$2',[JSON.stringify(j),clientId])}
  const row=await one('SELECT scn FROM cases WHERE id=$1',[caseId]),scn={...(row.scn||{}),[s.id]:answers};await q('UPDATE cases SET scn=$1::jsonb WHERE id=$2',[JSON.stringify(scn),caseId])};
 const tplFor=tid=>one(`SELECT id,name,docx_data,docx_defaults FROM templates WHERE docx_data IS NOT NULL AND keywords LIKE $1 ORDER BY id LIMIT 1`,[tid.toLowerCase()+' %']);
 // work out (and optionally save) every document of a scenario
 const runScenario=async(req,caseId,s,answers,generate,only)=>{
  const base=await contextFor(caseId,{scn:s,answers}),cv=SC.companyView(base.ctx),jobs=s.jobs(answers,cv).filter(j=>!only||j.tid===only),warnings=s.warn(answers,cv),out=[];
  for(const j of jobs){
   const t=j.template_id?await one('SELECT id,name,docx_data,docx_defaults FROM templates WHERE id=$1 AND docx_data IS NOT NULL',[j.template_id]):await tplFor(j.tid),row={tid:j.tid||'',name:j.name,who:j.who||'',title:j.who?`${j.name}: ${SC.tc(j.who)}`:j.name};
   if(!t){out.push({...row,error:'The official Word templates are not imported yet (open Templates and press Import).'});continue}
   const x=await contextFor(caseId,{scn:s,answers,over:j.over}),values={...(t.docx_defaults||{}),...E.packageValues(x.ctx)};
   for(const k of x.blanks)if(values[k]===undefined||values[k]===null)values[k]='';
   let r;try{r=await E.docxFill(t.docx_data,values)}catch(e){out.push({...row,error:'Could not fill this template: '+e.message});continue}
   row.missing=r.missing.filter(m=>!/^\?/.test(m)).map(m=>E.labelFromKey(m));row.filled=r.filled;
   if(generate){
    const fn=row.title.replace(/[\\/:*?"<>|]+/g,' ').trim(),item=FORMKEY[j.tid]?await one(`SELECT id,name FROM case_docs WHERE case_id=$1 AND name ILIKE $2 ORDER BY done,id LIMIT 1`,[caseId,'%'+FORMKEY[j.tid]+'%']):null;
    await q(`DELETE FROM files WHERE case_id=$1 AND source='template' AND filename IN ($2,$3)`,[caseId,fn+'.docx',fn+'.pdf']);
    const f=await saveDocx(req,x,t,r,fn,item);row.file={id:f.id,filename:f.filename};row.pdf=f.pdf||null}
   out.push(row)}
  // people whose details a form needs
  const ppl=[];for(const n of s.people(answers,cv)){const p=base.people.find(q=>SC.tc(q.full_name)===SC.tc(n.name));
   if(!p)ppl.push({name:n.name,why:n.why,missing:['not saved yet']});else{const m=n.need.filter(k=>!String(p[k]||'').trim());if(m.length)ppl.push({id:p.id,name:p.full_name,why:n.why,missing:m})}}
  return{jobs:out,warnings,people:ppl}};
 const loadScenario=async(req,res)=>{const id=+req.params.id,s=await getWizard(req.params.sid,true);if(!s)fail(404,'Unknown wizard');return{id,s,c:await caseInfo(id)}};
 app.get('/api/cases/:id/scenarios',wrap(async(req,res)=>{
  const id=+req.params.id,c=await caseInfo(id);if(!c)fail(404,'Case not found');
  const row=await one('SELECT scn,options FROM cases WHERE id=$1',[id]),opts=JSON.stringify(row.options||[])+' '+(c.type||''),ready=!!(await one(`SELECT 1 FROM templates WHERE docx_data IS NOT NULL AND keywords LIKE 't01 %'`));
  const ws=await wizRows(true);res.json({ready,items:ws.map(w=>SC.compose(w)).map(s=>({id:s.id,title:s.title,icon:s.icon,desc:s.desc,saved:Object.keys((row.scn||{})[s.id]||{}).length>0,suggested:s.match.test(opts)}))})}));
 app.get('/api/cases/:id/scenarios/:sid',wrap(async(req,res)=>{
  const {id,s,c}=await loadScenario(req);if(!c)fail(404,'Case not found');
  const x=await contextFor(id),answers=await savedAnswers(id,s.id);
  res.json({def:SC.publicDef(s,x.ctx,x.client.profile),answers,people:x.people.map(p=>({id:p.id,full_name:p.full_name,roles:p.roles,shares:p.shares})),client_id:c.client_id})}));
 app.put('/api/cases/:id/scenarios/:sid',wrap(async(req,res)=>{
  const {id,s,c}=await loadScenario(req);if(!c)fail(404,'Case not found');
  const answers=cleanAnswers(s,(req.body||{}).answers);await saveAnswers(id,s,answers,c.client_id);
  res.json({answers,...await runScenario(req,id,s,answers,false)})}));
 app.post('/api/cases/:id/scenarios/:sid/generate',wrap(async(req,res)=>{
  const {id,s,c}=await loadScenario(req);if(!c)fail(404,'Case not found');
  const answers=cleanAnswers(s,(req.body||{}).answers);await saveAnswers(id,s,answers,c.client_id);
  const r=await runScenario(req,id,s,answers,true),made=r.jobs.filter(j=>j.file).length;
  await log(id,req.user.id,`prepared ${made} document${made===1?'':'s'} for "${s.title}"`);
  res.json({answers,...r})}));
};
