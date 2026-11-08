// WhatsApp Business Cloud API: team alerts (templates) + inbound client documents (webhook -> Inbox)
const crypto=require('crypto');
module.exports=({q,one})=>{
 const E=process.env,V=E.WA_API_VERSION||'v23.0',BASE=E.WA_GRAPH_BASE||'https://graph.facebook.com',CC=E.DEFAULT_COUNTRY_CODE||'255',LANG=E.WA_TEMPLATE_LANG||'en',MAX=15*1024*1024;
 const configured=()=>!!(E.WHATSAPP_TOKEN&&E.WHATSAPP_PHONE_NUMBER_ID);
 const norm=p=>{let d=String(p||'').replace(/\D/g,'');if(!d)return null;if(d.startsWith('00'))d=d.slice(2);else if(d.startsWith('0'))d=CC+d.slice(1);return d};
 const clean=s=>String(s??'').replace(/[\r\n\t]+/g,' ').replace(/ {4,}/g,'   ').trim().slice(0,300)||'-';
 // Templates to create in Meta WhatsApp Manager (category: Utility, language: English). Variables are positional.
 const TEMPLATES={
  brela_case_assigned:'Hi {{1}}, case {{2}} for {{3}} ({{4}}) has been assigned to you. Due: {{5}}.',
  brela_case_returned:'Hi {{1}}, BRELA returned case {{2}} for {{3}}. Reason: {{4}}',
  brela_ready_review:'Hi {{1}}, case {{2}} for {{3}} is ready for review and submission to BRELA.',
  brela_case_approved:'Hi {{1}}, BRELA approved case {{2}} for {{3}}. Please send the final report and documents to the client.',
  brela_client_doc:'Hi {{1}}, {{2}} sent a document on WhatsApp: {{3}}. Please file it in the WhatsApp Inbox.',
  brela_daily_digest:'Good morning {{1}}. Your cases today: {{2}}'};
 const gfetch=(url,o={})=>fetch(url.startsWith('http')?url:`${BASE}/${V}/${url}`,{...o,headers:{Authorization:'Bearer '+E.WHATSAPP_TOKEN,...(o.headers||{})}});
 async function post(to,body,label,userId){
  if(!configured())return{ok:false,error:'WhatsApp is not configured'};
  let ok=false,error=null;
  try{const r=await gfetch(`${E.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to,...body})});
   if(r.ok)ok=true;else{const j=await r.json().catch(()=>({}));error=(j.error&&j.error.message)||('HTTP '+r.status)}}catch(e){error=e.message}
  await q('INSERT INTO wa_log(user_id,to_phone,template,ok,error) VALUES($1,$2,$3,$4,$5)',[userId||null,to,label,ok,error]).catch(()=>{});
  return{ok,error}}
 const sendTemplate=(to,name,params,userId,lang)=>post(to,{type:'template',template:{name,language:{code:lang||LANG},components:params.length?[{type:'body',parameters:params.map(t=>({type:'text',text:clean(t)}))}]:[]}},name,userId);
 const sendText=(to,text)=>post(to,{type:'text',text:{body:text}},'text-reply');
 // notify(userIds, template, paramsAfterName): never throws, never blocks the request
 function notify(userIds,name,params){
  if(!configured()||!userIds.length)return;
  q('SELECT id,name,phone FROM users WHERE id=ANY($1) AND active AND wa_opt_in AND phone IS NOT NULL',[[...new Set(userIds)]])
   .then(us=>us.forEach(u=>{const to=norm(u.phone);if(to)sendTemplate(to,name,[u.name.split(' ')[0],...params],u.id)}))
   .catch(e=>console.error('wa notify',e.message))}
 const managers=()=>q(`SELECT u.id FROM users u JOIN roles r ON r.key=u.role WHERE u.active AND r.level='MANAGER'`).then(r=>r.map(x=>x.id));
 const seniors=()=>q(`SELECT u.id FROM users u JOIN roles r ON r.key=u.role WHERE u.active AND r.level IN ('MANAGER','SENIOR')`).then(r=>r.map(x=>x.id));
 // ---- webhook
 function verify(req,res){const t=E.WHATSAPP_VERIFY_TOKEN;if(req.query['hub.mode']==='subscribe'&&t&&req.query['hub.verify_token']===t)return res.status(200).send(req.query['hub.challenge']);res.sendStatus(403)}
 function receive(req,res){
  const sec=E.WHATSAPP_APP_SECRET,sig=req.get('x-hub-signature-256')||'',exp='sha256='+crypto.createHmac('sha256',sec||'').update(req.rawBody||'').digest('hex');
  if(!sec||sig.length!==exp.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(exp)))return res.sendStatus(401);
  res.sendStatus(200);handle(req.body).catch(e=>console.error('wa webhook',e.message))}
 const EXT={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
 async function handle(body){
  for(const en of (body&&body.entry)||[])for(const ch of en.changes||[]){const v=ch.value||{};
   for(const m of v.messages||[]){
    if(!['document','image'].includes(m.type))continue;
    if(!(await one('INSERT INTO wa_messages(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[m.id])))continue;
    const media=m[m.type],from=norm(m.from),name=((v.contacts||[]).find(c=>c.wa_id===m.from)||{}).profile?.name||null;
    const info=await (await gfetch(media.id)).json();
    if(!info.url||(info.file_size&&info.file_size>MAX)){console.error('wa media skipped',m.id);continue}
    const buf=Buffer.from(await (await gfetch(info.url)).arrayBuffer());if(buf.length>MAX)continue;
    const mime=info.mime_type||media.mime_type||'application/octet-stream',stamp=new Date().toISOString().slice(0,16).replace(/[-:T]/g,'');
    const fname=media.filename||`whatsapp-${m.type}-${stamp}.${EXT[mime]||'bin'}`;
    const cl=(await q('SELECT id,name,phone FROM clients WHERE phone IS NOT NULL')).find(c=>norm(c.phone)===from);
    const f=await one(`INSERT INTO files(client_id,filename,mime,size,data,source,sender_phone,sender_name,note,inbox) VALUES($1,$2,$3,$4,$5,'whatsapp',$6,$7,$8,TRUE) RETURNING id`,[cl?cl.id:null,fname,mime,buf.length,buf,from,name,media.caption||null]);
    const who=cl?cl.name:(name||'+'+from),ids=await managers();
    if(cl)(await q(`SELECT DISTINCT assignee_id FROM cases WHERE client_id=$1 AND status<>'done' AND assignee_id IS NOT NULL`,[cl.id])).forEach(r=>ids.push(r.assignee_id));
    notify(ids,'brela_client_doc',[who,fname]);
    if(E.WA_AUTOREPLY==='true')sendText(from,'✅ Document received. Our team will attach it to your case.');
    console.log('WhatsApp doc stored',f.id,fname)}}}
 // ---- daily digest (07:00 East Africa Time, not Sundays); claims the day atomically in the database
 const eat=()=>new Date(Date.now()+(+E.TZ_OFFSET_HOURS||3)*3600e3);
 async function runDigest(force){
  const now=eat(),day=now.toISOString().slice(0,10);
  if(!force){if(now.getUTCHours()<(+E.DIGEST_HOUR||7)||now.getUTCDay()===0)return 0;
   if(!(await one(`INSERT INTO kv(key,value) VALUES('digest_last',$1) ON CONFLICT(key) DO UPDATE SET value=$1 WHERE kv.value<>$1 RETURNING value`,[day])))return 0}
  const tom=new Date(now.getTime()+864e5).toISOString().slice(0,10);
  const rows=await q(`SELECT c.assignee_id,c.code,cl.name AS client,c.status,c.due::text AS due FROM cases c JOIN clients cl ON cl.id=c.client_id WHERE c.status<>'done' AND c.assignee_id IS NOT NULL AND (c.status='returned' OR c.due<=$1) ORDER BY c.due`,[tom]);
  const by={};rows.forEach(r=>(by[r.assignee_id]=by[r.assignee_id]||[]).push(`${r.code} ${r.client} (${r.status==='returned'?'returned by BRELA':r.due<day?'overdue':r.due===day?'due today':'due tomorrow'})`));
  Object.entries(by).forEach(([id,l])=>notify([+id],'brela_daily_digest',[l.slice(0,6).join('; ')+(l.length>6?` +${l.length-6} more`:'')]));
  return Object.keys(by).length}
 const startScheduler=()=>{if(configured())setInterval(()=>runDigest().catch(e=>console.error('digest',e.message)),15*60e3)};
 return{configured,norm,TEMPLATES,notify,managers,seniors,sendTemplate,verify,receive,runDigest,startScheduler,webhookReady:()=>!!(E.WHATSAPP_APP_SECRET&&E.WHATSAPP_VERIFY_TOKEN)}};
