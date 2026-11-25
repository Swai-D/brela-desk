// Case chat: ask questions about ONE case. The answer is built from the case's own material (details, checklist, history,
// comments, company details and the text of its documents) using the AI chosen in Settings → AI assistant.
const fs=require('fs'),path=require('path'),R=require('./rag'),OCR=require('./ocr');
const FILES_DIR=process.env.FILES_DIR||'';
const SYSTEM=`You are the case assistant inside BRELA Desk, helping a consultant in Tanzania work on ONE BRELA case.
Answer only from the CASE MATERIAL you are given. Each part has an id such as [C3] or [D2]. After every statement that comes from the material, cite its id in square brackets, for example [D2] or [C3, D1].
If the material does not contain the answer, say so plainly and say what to check or upload. Never guess or invent names, numbers, dates, forms or BRELA rules.
When BRELA returned the case, first state exactly what BRELA asked to correct, then give the fix for each document or detail, one short point each.
Some sensitive numbers (ID, TIN, phone, account) are hidden from you by the privacy setting. If the user asks for one, say it is hidden and where to find it in the case.
Be short and practical: plain sentences, short lists when there are several points. Reply in the language the user writes in (English or Swahili).`;
const BUDGET=14000,HISTORY=6;
module.exports=(app,{q,one,wrap,fail,can,AI,E,contextFor,guard,run})=>{
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
 async function material(caseId,question,priv){
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
  for(const ch of R.rank(question,chunks,10)){const body=m(ch.text);if(used+body.length>BUDGET&&n>=3)break;n++;used+=body.length;add('D'+n,`${ch.file} (part ${ch.n})`,body,ch.file_id)}
  return{text:parts.join('\n\n'),cites,unreadable,scanned,readable:texts.length,hidden:hide}}
 const mine=(req,res,next)=>one('SELECT 1 FROM cases WHERE id=$1',[+req.params.id]).then(r=>r?next():res.status(404).json({error:'Case not found'})).catch(next);
 const rows=id=>q('SELECT * FROM (SELECT m.id,m.role,m.body,m.sources,m.created_at,m.user_id,u.name AS by FROM case_chat m LEFT JOIN users u ON u.id=m.user_id WHERE m.case_id=$1 ORDER BY m.id DESC LIMIT 60) x ORDER BY id',[id]);
 app.get('/api/cases/:id/chat',mine,wrap(async(req,res)=>{
  const id=+req.params.id,files=await q('SELECT f.id,f.filename,f.mime,t.error,t.ocr,(t.text<>\'\') AS ok FROM files f LEFT JOIN file_text t ON t.file_id=f.id AND t.size=f.size WHERE f.case_id=$1 AND NOT f.inbox ORDER BY f.id',[id]);
  res.json({messages:await rows(id),ai:await AI.status(req.user),files:files.length,unread:files.filter(f=>f.error).map(f=>({name:f.filename,why:f.error})),scanned:files.filter(f=>f.ocr).map(f=>f.filename)})}));
 app.post('/api/cases/:id/chat',mine,wrap(async(req,res)=>{
  const id=+req.params.id,msg=String((req.body||{}).message||'').trim();
  if(!msg)fail(400,'Write a question first.');if(msg.length>2000)fail(400,'Keep the question under 2000 characters.');
  await guard(req,'chat');const s=await AI.getSettings(),prior=await rows(id),mat=await material(id,msg+' '+prior.slice(-2).map(p=>p.role==='user'?p.body:'').join(' '),s.privacy);
  const hist=prior.slice(-HISTORY).map(p=>`${p.role==='user'?'User':'Assistant'}: ${p.body.slice(0,1500)}`).join('\n');
  const user=`CASE MATERIAL\n${mat.text}\n\n${mat.unreadable.length?`Documents whose text could not be read (do not guess their content): ${mat.unreadable.map(u=>u.name).join(', ')}.\n\n`:''}${hist?`CONVERSATION SO FAR\n${hist}\n\n`:''}QUESTION\n${msg}`;
  const um=await one('INSERT INTO case_chat(case_id,user_id,role,body) VALUES($1,$2,\'user\',$3) RETURNING id,role,body,sources,created_at,user_id',[id,req.user.id,msg]);
  const out=await run(req,{kind:'chat',mode:'ai',caseId:id,system:SYSTEM,user,maxTokens:1500});
  const used=[...new Set([...out.text.matchAll(/\[([CD]\d+(?:\s*,\s*[CD]\d+)*)\]/g)].flatMap(m=>m[1].split(',').map(x=>x.trim())))].filter(k=>mat.cites[k]).map(k=>mat.cites[k]);
  const am=await one('INSERT INTO case_chat(case_id,user_id,role,body,sources) VALUES($1,$2,\'assistant\',$3,$4::jsonb) RETURNING id,role,body,sources,created_at,user_id',[id,req.user.id,out.text.trim(),JSON.stringify(used)]);
  res.json({messages:[{...um,by:req.user.name},{...am,by:null}],unreadable:mat.unreadable,scanned:mat.scanned,readable:mat.readable,hidden:mat.hidden})}));
 app.delete('/api/cases/:id/chat',mine,wrap(async(req,res)=>{
  if(!can(req.user,'cases.edit'))fail(403,'Your role cannot clear the chat');
  await q('DELETE FROM case_chat WHERE case_id=$1',[+req.params.id]);res.json({ok:1})}));
};
