// Case chat: ask questions about ONE case. The answer is built from the case's own material (details, checklist, history,
// comments, company details and the text of its documents) using the AI chosen in Settings → AI assistant.
const fs=require('fs'),path=require('path'),R=require('./rag'),OCR=require('./ocr');
const FILES_DIR=process.env.FILES_DIR||'';

const BUDGET=14000,LAW=8000,HISTORY=6,FULLDOC=14000;
// asking to fix, rewrite, check or draft: the whole of the relevant documents is shown (not fragments) and the answer may be long
const FIX=/\b(fix|correct(ion|ed|ions)?|rewrite|re-?draft|draft|amend|rectify|redo|revise|improve|replace|resolve|comply|compliant|check|review|rekebish\w*|sahihish\w*|andika|badilish\w*|boresh\w*|tengeneza)\b/i;
module.exports=(app,{q,one,wrap,fail,can,need,audit,up,AI,E,contextFor,guard,run})=>{
 const refCache=new Map();
 // the active reference documents cut into sections (kept in memory until the text changes)
 async function refChunks(){
  const docs=await q('SELECT id,title,kind,size,text FROM reference_docs WHERE active ORDER BY id'),out=[];
  for(const d of docs){let c=refCache.get(d.id);if(!c||c.size!==d.size||c.title!==d.title){c={size:d.size,title:d.title,chunks:R.chunkAct(d.text,d.title)};refCache.set(d.id,c)}
   c.chunks.forEach((x,i)=>out.push({file:x.label,n:i+1,text:x.text,ref:d.title}))}
  return{docs,chunks:out}}
 const readFile=async f=>{if(f.path&&FILES_DIR){const fp=path.resolve(FILES_DIR,f.path);if(!fp.startsWith(path.resolve(FILES_DIR)))throw new Error('bad path');return fs.readFileSync(fp)}return f.data};
 // text of every readable document of the case, read once and kept (a replaced file is read again)
 async function caseTexts(caseId){
  const files=await q('SELECT id,filename,mime,size,path FROM files WHERE case_id=$1 AND NOT inbox ORDER BY id LIMIT 40',[caseId]),out=[],unreadable=[],scanned=[];
  for(const f of files){
   let row=await one('SELECT size,text,error,ocr FROM file_text WHERE file_id=$1',[f.id]);
   if(!row||row.size!==f.size){
    let text='',error=null,viaOcr=false;
    const full=await one('SELECT id,filename,mime,path,data FROM files WHERE id=$1',[f.id]);let buf;try{buf=await readFile(full)}catch(e){error='The file could not be opened.'}
    if(buf){try{if(/^image\//.test(f.mime||''))throw Object.assign(new Error('picture'),{scan:1});text=await E.extractText(buf,f.filename,f.mime)}
     catch(e){if(e.scan||/No readable text/.test(e.message)){try{text=await OCR.ocr(buf,f.filename,f.mime);viaOcr=true}catch(o){error=o.message}}else error=e.message}}
    await q('INSERT INTO file_text(file_id,size,text,error,ocr) VALUES($1,$2,$3,$4,$5) ON CONFLICT(file_id) DO UPDATE SET size=$2,text=$3,error=$4,ocr=$5,at=now()',[f.id,f.size,text,error,viaOcr]);row={text,error,ocr:viaOcr}}
   if(row.ocr)scanned.push(f.filename);
   if(row.text)out.push({id:f.id,name:f.filename,text:row.text,ocr:row.ocr});else unreadable.push({id:f.id,name:f.filename,why:row.error})}
  return{texts:out,unreadable,scanned}}
 const D=d=>d?new Date(d).toISOString().slice(0,10):'none';
 async function material(caseId,question,priv,fix){
  const x=await contextFor(caseId),c=x.c,hide=priv==='standard',m=t=>hide?R.mask(t):t,parts=[],cites={};
  const add=(id,label,body,file_id)=>{parts.push(`[${id}] ${label}\n${body}`);cites[id]={id,label,file_id:file_id||null}};
  const [docs,files,act,com]=await Promise.all([q('SELECT id,name,done,grp FROM case_docs WHERE case_id=$1 ORDER BY id',[caseId]),q('SELECT filename,case_doc_id,source,missing,checked_by FROM files WHERE case_id=$1 AND NOT inbox',[caseId]),
   q('SELECT a.text,a.created_at,u.name FROM activity a LEFT JOIN users u ON u.id=a.user_id WHERE a.case_id=$1 ORDER BY a.id DESC LIMIT 40',[caseId]),q('SELECT m.body,m.created_at,u.name FROM comments m LEFT JOIN users u ON u.id=m.user_id WHERE m.case_id=$1 ORDER BY m.id DESC LIMIT 30',[caseId])]);
  const opts=(x.cd&&x.cd.options)||[];
  add('C1','Case details',[`Code: ${c.code}`,`Client: ${c.client}`,`Case type: ${c.type}`,`Stage: ${c.status}${c.rounds?` (BRELA has returned it ${c.rounds} time${c.rounds===1?'':'s'})`:''}`,`Due: ${D(c.due)}`,`Assigned to: ${x.ctx.values.assignee||'nobody'}`,`BRELA track number: ${c.track_number||'not added yet'}`,c.note?`Case note: ${m(c.note)}`:''].filter(Boolean).join('\n'));
  add('C2','Document checklist',docs.length?docs.map(d=>{const fs_=files.filter(f=>f.case_doc_id===d.id);return `- ${d.name}: ${d.done?'ready':'NOT ready'}${fs_.length?` (files: ${fs_.map(f=>f.filename+(f.missing>0?` — ${f.missing} detail(s) still highlighted yellow`:'')+(f.source!=='upload'&&!f.checked_by?' — not yet checked by a second person':'')).join('; ')})`:' (no file yet)'}`}).join('\n'):'The checklist is empty.');
  add('C3','Case history (newest first, includes what BRELA asked to correct)',act.length?act.map(a=>`${D(a.created_at)} ${a.name||''}: ${m(a.text)}`).join('\n'):'No history yet.');
  add('C4','Comments (newest first)',com.length?com.map(a=>`${D(a.created_at)} ${a.name||''}: ${m(a.body)}`).join('\n'):'No comments.');
  const w=E.withhold(x.ctx,priv),vals=Object.entries(w.values).filter(([k,v])=>String(v).trim()&&!/^\{\{.*\}\}$/.test(String(v))).slice(0,60).map(([k,v])=>`${k.replace(/_/g,' ')}: ${m(String(v)).slice(0,300)}`);
  const ppl=(w.lists.people||[]).map(p=>[p.full_name,(p.roles||[]).join('/'),p.nationality,p.shares&&`shares ${p.shares}`].filter(v=>v&&!/^\{\{/.test(String(v))).join(', ')).filter(Boolean);
  if(vals.length||ppl.length)add('C5','Company details saved on the client',[...vals,ppl.length?'People: '+ppl.join(' | '):''].filter(Boolean).join('\n'));
  if(opts.length)add('C6','What kind of change this case is',opts.map(o=>`${o.name}${o.actions&&o.actions.length?': '+o.actions.join(', '):''}`).join('\n'));
  const {texts,unreadable,scanned}=await caseTexts(caseId),chunks=[];
  for(const t of texts)R.chunk(t.text).forEach((tx,i)=>chunks.push({file:t.name+(t.ocr?' (scan read by OCR: may contain misread characters)':''),file_id:t.id,n:i+1,text:tx}));
  let used=parts.join('\n\n').length,n=0;
  const lastRet=(act.find(a=>/marked as returned by BRELA/.test(a.text))||{}).text||'',top=R.rank(question+' '+lastRet,chunks,10),whole=[];
  if(fix){ // the two documents that match best are given in full
   for(const ch of top){if(!whole.includes(ch.file_id)&&whole.length<2)whole.push(ch.file_id)}
   for(const id of whole){const t=texts.find(x=>x.id===id);n++;used+=Math.min(t.text.length,FULLDOC);add('D'+n,t.name+(t.ocr?' (scan read by OCR: may contain misread characters)':'')+(t.text.length>FULLDOC?' (first part of a long document)':' (whole document)'),m(t.text.slice(0,FULLDOC)),id)}}
  for(const ch of top.filter(c=>!whole.includes(c.file_id)).slice(0,fix?4:10)){const body=m(ch.text);if(used+body.length>BUDGET&&n>=3)break;n++;used+=body.length;add('D'+n,`${ch.file} (part ${ch.n})`,body,ch.file_id)}
  // the law: ranked with the question and with what BRELA last asked to correct
  const lastReturn=lastRet,lib=await refChunks();let lawUsed=0,k=0;
  for(const ch of R.rank(question+' '+lastReturn,lib.chunks,6)){if(lawUsed+ch.text.length>LAW&&k>=2)break;k++;lawUsed+=ch.text.length;add('R'+k,ch.file,ch.text.length>2000?ch.text.slice(0,2000):ch.text)}
  return{text:parts.join('\n\n'),cites,unreadable,scanned,readable:texts.length,hidden:hide,reference:lib.docs.map(d=>d.title)}}
 const mine=(req,res,next)=>one('SELECT 1 FROM cases WHERE id=$1',[+req.params.id]).then(r=>r?next():res.status(404).json({error:'Case not found'})).catch(next);
 const rows=id=>q('SELECT * FROM (SELECT m.id,m.role,m.body,m.sources,m.created_at,m.user_id,u.name AS by FROM case_chat m LEFT JOIN users u ON u.id=m.user_id WHERE m.case_id=$1 ORDER BY m.id DESC LIMIT 60) x ORDER BY id',[id]);
 app.get('/api/cases/:id/chat',mine,wrap(async(req,res)=>{
  const id=+req.params.id,files=await q('SELECT f.id,f.filename,f.mime,t.error,t.ocr,(t.text<>\'\') AS ok FROM files f LEFT JOIN file_text t ON t.file_id=f.id AND t.size=f.size WHERE f.case_id=$1 AND NOT f.inbox ORDER BY f.id',[id]);
  res.json({messages:await rows(id),ai:await AI.status(req.user),files:files.length,unread:files.filter(f=>f.error).map(f=>({name:f.filename,why:f.error})),scanned:files.filter(f=>f.ocr).map(f=>f.filename),reference:(await q('SELECT title FROM reference_docs WHERE active ORDER BY id')).map(r=>r.title)})}));
 app.post('/api/cases/:id/chat',mine,wrap(async(req,res)=>{
  const id=+req.params.id,msg=String((req.body||{}).message||'').trim();
  if(!msg)fail(400,'Write a question first.');if(msg.length>2000)fail(400,'Keep the question under 2000 characters.');
  await guard(req,'chat');const s=await AI.getSettings(),prior=await rows(id),fix=FIX.test(msg),mat=await material(id,msg+' '+prior.slice(-2).map(p=>p.role==='user'?p.body:'').join(' '),s.privacy,fix);
  const hist=prior.slice(-HISTORY).map(p=>`${p.role==='user'?'User':'Assistant'}: ${p.body.slice(0,1500)}`).join('\n');
  const user=`CASE MATERIAL\n${mat.text}\n\n${mat.unreadable.length?`Documents whose text could not be read (do not guess their content): ${mat.unreadable.map(u=>u.name).join(', ')}.\n\n`:''}${hist?`CONVERSATION SO FAR\n${hist}\n\n`:''}QUESTION\n${msg}`;
  const um=await one('INSERT INTO case_chat(case_id,user_id,role,body) VALUES($1,$2,\'user\',$3) RETURNING id,role,body,sources,created_at,user_id',[id,req.user.id,msg]);
  const out=await run(req,{kind:'chat',mode:fix?'fix':'ask',caseId:id,system:s.chat_prompt,user,maxTokens:fix?4500:1500,plain:true});
  const used=[...new Set([...out.text.matchAll(/\[([CDR]\d+(?:\s*,\s*[CDR]\d+)*)\]/g)].flatMap(m=>m[1].split(',').map(x=>x.trim())))].filter(k=>mat.cites[k]).map(k=>mat.cites[k]);
  const am=await one('INSERT INTO case_chat(case_id,user_id,role,body,sources) VALUES($1,$2,\'assistant\',$3,$4::jsonb) RETURNING id,role,body,sources,created_at,user_id',[id,req.user.id,out.text.trim(),JSON.stringify(used)]);
  res.json({messages:[{...um,by:req.user.name},{...am,by:null}],unreadable:mat.unreadable,scanned:mat.scanned,reference:mat.reference,readable:mat.readable,hidden:mat.hidden})}));
 app.delete('/api/cases/:id/chat',mine,wrap(async(req,res)=>{
  if(!can(req.user,'cases.edit'))fail(403,'Your role cannot clear the chat');
  await q('DELETE FROM case_chat WHERE case_id=$1',[+req.params.id]);res.json({ok:1})}));

 // ---- reference library: the Companies Act and guides, added to every case chat
 const KINDS=['law','guide'];
 app.get('/api/reference',wrap(async(req,res)=>res.json(await q('SELECT r.id,r.title,r.kind,r.filename,r.size,length(r.text) AS chars,r.ocr,r.active,r.created_at,u.name AS by FROM reference_docs r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id'))));
 app.post('/api/reference',need('reference.manage'),up,wrap(async(req,res)=>{
  const b=req.body||{},title=String(b.title||'').trim().slice(0,120),kind=KINDS.includes(b.kind)?b.kind:'law';
  if(!req.file)fail(400,'Choose a file (.pdf, .docx or .txt).');if(!title)fail(400,'Give it a name, for example "Companies Act 2002".');
  const name=Buffer.from(req.file.originalname,'latin1').toString('utf8');let text,viaOcr=false;
  try{text=await E.extractText(req.file.buffer,name,req.file.mimetype,2000000)}
  catch(e){if(/No readable text/.test(e.message)){try{text=await OCR.ocr(req.file.buffer,name,req.file.mimetype);viaOcr=true}catch(o){fail(400,o.message)}}else throw e}
  const n=R.chunkAct(text,title).length;
  const r=await one('INSERT INTO reference_docs(title,kind,filename,size,text,ocr,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[title,kind,name,text.length,text,viaOcr,req.user.id]);
  await audit(req,'reference.add',`${title} (${n} sections)`);res.json({id:r.id,sections:n,ocr:viaOcr})}));
 app.patch('/api/reference/:id',need('reference.manage'),wrap(async(req,res)=>{
  const id=+req.params.id,r=await one('SELECT title,active FROM reference_docs WHERE id=$1',[id]);if(!r)fail(404,'Not found');
  const title=req.body.title!==undefined?String(req.body.title).trim().slice(0,120):r.title,active=typeof req.body.active==='boolean'?req.body.active:r.active;if(!title)fail(400,'Give it a name.');
  await q('UPDATE reference_docs SET title=$2,active=$3 WHERE id=$1',[id,title,active]);await audit(req,'reference.update',`${r.title}${title!==r.title?' → '+title:''}${active!==r.active?(active?': switched on':': switched off'):''}`);res.json({ok:1})}));
 app.delete('/api/reference/:id',need('reference.manage'),wrap(async(req,res)=>{
  const r=await one('SELECT title FROM reference_docs WHERE id=$1',[+req.params.id]);if(!r)fail(404,'Not found');
  await q('DELETE FROM reference_docs WHERE id=$1',[+req.params.id]);refCache.delete(+req.params.id);await audit(req,'reference.delete',r.title);res.json({ok:1})}));
};
