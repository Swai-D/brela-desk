// Routes for the AI assistant: settings, templates, company data, document generation.
const fs=require('fs'),path=require('path');
const SR=['MANAGER','SENIOR'],KEY=/^[a-z][a-z0-9_]{0,40}$/,ROLES=['director','shareholder','secretary','beneficial_owner','other'];
const COMMON_KEYS=['company_name','proposed_names','business_activity','registered_office','postal_address','share_capital','number_of_shares','share_value','date_of_incorporation','tin','financial_year_end','objects'];
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
 const PERSON=['full_name','nationality','id_type','id_number','dob','address','phone','email','shares'];
 const personVals=b=>{const roles=(Array.isArray(b.roles)?b.roles:[]).filter(r=>ROLES.includes(r));if(!clean(b.full_name))fail(400,'Name is required');return[roles,...PERSON.map(k=>clean(b[k])||null)]};
 app.get('/api/clients/:id/people',wrap(async(req,res)=>res.json(await q('SELECT * FROM client_people WHERE client_id=$1 ORDER BY position,id',[+req.params.id]))));
 app.post('/api/clients/:id/people',wrap(async(req,res)=>{const v=personVals(req.body||{}),pos=(await one('SELECT coalesce(max(position),0)+1 AS n FROM client_people WHERE client_id=$1',[+req.params.id])).n;
  res.json(await one(`INSERT INTO client_people(client_id,roles,${['full_name','nationality','id_type','id_number','dob','address','phone','email','shares'].join(',')},position) VALUES($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[+req.params.id,JSON.stringify(v[0]),...v.slice(1),pos]))}));
 app.put('/api/people/:id',wrap(async(req,res)=>{const v=personVals(req.body||{});
  const r=await one(`UPDATE client_people SET roles=$2::jsonb,full_name=$3,nationality=$4,id_type=$5,id_number=$6,dob=$7,address=$8,phone=$9,email=$10,shares=$11 WHERE id=$1 RETURNING *`,[+req.params.id,JSON.stringify(v[0]),...v.slice(1)]);if(!r)fail(404,'Not found');res.json(r)}));
 app.delete('/api/people/:id',wrap(async(req,res)=>{if(!await one('SELECT 1 FROM client_people WHERE id=$1',[+req.params.id]))fail(404,'Not found');await q('DELETE FROM client_people WHERE id=$1',[+req.params.id]);res.json({ok:1})}));
 const contextFor=async caseId=>{
  const c=await caseInfo(caseId);if(!c)fail(404,'Case not found');
  const [client,cd,people,who]=await Promise.all([one('SELECT * FROM clients WHERE id=$1',[c.client_id]),one('SELECT data FROM cases WHERE id=$1',[caseId]),q('SELECT * FROM client_people WHERE client_id=$1 ORDER BY position,id',[c.client_id]),c.who?one('SELECT name FROM users WHERE id=$1',[c.who]):null]);
  return{c,client,cd:cd.data,people,ctx:E.buildContext({client,caseRow:c,assignee:who&&who.name,profile:client.profile,data:cd.data,people})}};
 app.get('/api/cases/:id/context',wrap(async(req,res)=>{const x=await contextFor(+req.params.id);res.json({values:x.ctx.values,data:x.cd,profile:x.client.profile,people:x.people,keys:[...new Set([...COMMON_KEYS,...Object.keys(x.client.profile),...Object.keys(x.cd)])]})}));

 // ---------- templates
 const TLIST=`SELECT t.id,t.name,t.kind,t.description,t.case_type_id,ct.name AS case_type,t.keywords,t.status,t.version,t.uses,t.clean_runs,(t.docx_name IS NOT NULL) AS has_docx,t.updated_at FROM templates t LEFT JOIN case_types ct ON ct.id=t.case_type_id`;
 const bodyOf=async t=>(await one('SELECT body FROM template_versions WHERE template_id=$1 AND version=$2',[t.id,t.version])).body;
 const kindOf=k=>['FORM','DOCUMENT'].includes(k)?k:'DOCUMENT';
 const newVersion=async(t,body,note,source,user)=>{const v=t.version+1;await q('INSERT INTO template_versions(template_id,version,body,note,source,created_by) VALUES($1,$2,$3,$4,$5,$6)',[t.id,v,body,note||null,source,user]);await q(`UPDATE templates SET version=$2,status='DRAFT',clean_runs=0,updated_at=now() WHERE id=$1`,[t.id,v]);return v};
 app.get('/api/templates',wrap(async(req,res)=>{const qs=String(req.query.q||'').trim();res.json(await q(`${TLIST} WHERE ($1='' OR t.name ILIKE '%'||$1||'%' OR t.keywords ILIKE '%'||$1||'%') ORDER BY t.name`,[qs]))}));
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

 // fill an original Word template (exact layout) from the case details
 app.post('/api/cases/:id/ai/generate-docx',wrap(async(req,res)=>{
  const id=+req.params.id,b=req.body||{},x=await contextFor(id);
  const t=await one('SELECT * FROM templates WHERE id=$1 AND docx_data IS NOT NULL',[+b.template_id]);if(!t)fail(404,'This template has no original Word file');
  const item=b.item_id?await one('SELECT id,name FROM case_docs WHERE id=$1 AND case_id=$2',[+b.item_id,id]):null;
  if(b.item_id&&!item)fail(400,'That checklist item is not on this case');
  const values={...(t.docx_defaults||{}),...E.packageValues(x.ctx)};
  let r;try{r=await E.docxFill(t.docx_data,values)}catch(e){fail(400,'Could not fill this Word template: '+e.message)}
  const name=(item?item.name:t.name).replace(/[\\/:*?"<>|]+/g,' ').trim()||'Document';
  const f=await one(`INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,data,uploaded_by,source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'template') RETURNING id,filename`,
   [x.c.client_id,id,item?item.id:null,`${name}.docx`,'application/vnd.openxmlformats-officedocument.wordprocessingml.document',r.buffer.length,r.buffer,req.user.id]);
  if(item&&!r.missing.length)await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[item.id]);
  await AI.record({userId:req.user.id,caseId:id,templateId:t.id,kind:'fill',mode:'docx',output:`filled ${r.filled}, ${r.missing.length} missing`});
  await log(id,req.user.id,`filled official Word template "${t.name}"${item?` for "${item.name}"`:''} (${r.filled} detail${r.filled===1?'':'s'} placed${r.missing.length?`, ${r.missing.length} still missing`:''})`);
  await q('UPDATE templates SET uses=uses+1 WHERE id=$1',[t.id]);
  res.json({file:f,missing:r.missing,clauses:r.clauses,filled:r.filled})}));
};
