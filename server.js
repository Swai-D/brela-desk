const express=require('express'),path=require('path'),fs=require('fs'),crypto=require('crypto');
const {Pool}=require('pg'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),multer=require('multer'),cookieParser=require('cookie-parser');
const PROD=process.env.NODE_ENV==='production',SEC=require('./security');
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:false}:false});
const q=(t,p)=>pool.query(t,p).then(r=>r.rows);
const one=async(t,p)=>(await q(t,p))[0];
const SECRET=process.env.JWT_SECRET||(PROD?null:'dev-secret-change-me');
const KEY=Buffer.from(process.env.ENCRYPTION_KEY||(PROD?'':'0'.repeat(64)),'hex');
if(!SECRET||KEY.length!==32){console.error('Set JWT_SECRET and ENCRYPTION_KEY (64 hex chars) in the environment.');process.exit(1)}
// FILES_DIR (optional): when set, uploads are written to this folder and only their path is kept in the DB; existing BYTEA rows are migrated on boot. Leave unset to keep storing file bytes in PostgreSQL.
const FILES_DIR=process.env.FILES_DIR||'';
if(FILES_DIR)fs.mkdirSync(FILES_DIR,{recursive:true});
const putDisk=(name,buf)=>{if(!FILES_DIR)return null;const p=crypto.randomUUID()+'_'+String(name).replace(/[\\/:*?"<>|]+/g,'_').slice(-140);fs.writeFileSync(path.join(FILES_DIR,p),buf);return p};
const enc=s=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',KEY,iv),e=Buffer.concat([c.update(s,'utf8'),c.final()]);return [iv,c.getAuthTag(),e].map(b=>b.toString('base64')).join('.')};
const dec=s=>{const [iv,t,e]=s.split('.').map(x=>Buffer.from(x,'base64')),d=crypto.createDecipheriv('aes-256-gcm',KEY,iv);d.setAuthTag(t);return Buffer.concat([d.update(e),d.final()]).toString('utf8')};
const LEVELS=['MANAGER','SENIOR','STAFF'], STAGES=['new','docs','ready','submitted','returned','done'];
const IDLE_TIMEOUT_MS=15*60*1000;
const LOCK_THEMES=[
 {name:'Leadership',imageCategory:'business',imageQuery:'teamwork leadership office',quoteCategory:'leadership'},
 {name:'Wisdom',imageCategory:'education',imageQuery:'learning books education',quoteCategory:'wisdom'},
 {name:'Inspiration',imageCategory:'feelings',imageQuery:'inspiration sunrise motivation',quoteCategory:'inspirational'},
 {name:'Success',imageCategory:'business',imageQuery:'business success goals',quoteCategory:'success'},
 {name:'Nature',imageCategory:'nature',imageQuery:'peaceful nature sunrise',quoteCategory:'nature'},
 {name:'Courage',imageCategory:'people',imageQuery:'confident people courage',quoteCategory:'courage'}
];
const LOCK_SLOTS=[{id:'morning',label:'Morning',start:5,end:12},{id:'afternoon',label:'Afternoon',start:12,end:17},{id:'evening',label:'Evening',start:17,end:5}];
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024}});
const app=express();app.set('trust proxy',1);app.disable('x-powered-by');app.use(SEC.headers);app.use(express.json({limit:'1mb',verify:(req,res,buf)=>{req.rawBody=buf}}));app.use(cookieParser());app.use('/api',SEC.sameOrigin);
const rateLimit=require('express-rate-limit');
if(process.env.NODE_ENV!=='test')app.use('/api',rateLimit({windowMs:60000,max:600,standardHeaders:true,legacyHeaders:false,message:{error:'Too many requests. Slow down a little.'}}));
const wrap=f=>(req,res)=>f(req,res).catch(e=>{if(!e.status)console.error(e);res.status(e.status||500).json({error:e.status?e.message:'Server error',...(e.status&&e.data?e.data:{})})});
const fail=(s,m,data)=>{const e=new Error(m);e.status=s;if(data)e.data=data;throw e};
const eastAfricaParts=()=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Dar_es_Salaam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
const eastAfricaDay=()=>{const p=eastAfricaParts();return`${p.year}-${p.month}-${p.day}`};
const lockSlot=()=>{const hour=+eastAfricaParts().hour;return LOCK_SLOTS.find(s=>s.start<s.end?hour>=s.start&&hour<s.end:hour>=s.start||hour<s.end).id};
const lockScreenConfigured=()=>!!(process.env.PIXABAY_API_KEY&&process.env.API_NINJAS_API_KEY);
const lockApiError=(message,cause)=>{const e=new Error(message,{cause});e.status=502;return e};
async function fetchLockQuote(category,used){
 const url=new URL('https://api.api-ninjas.com/v2/randomquotes');url.searchParams.set('categories',category);
 for(let attempt=0;attempt<4;attempt++){
  let response;
  try{response=await fetch(url,{headers:{'X-Api-Key':process.env.API_NINJAS_API_KEY},signal:AbortSignal.timeout(10000)})}
  catch(e){throw lockApiError('The quote service is temporarily unavailable',e)}
  if(!response.ok){console.error('Quote API request failed:',response.status);throw lockApiError('The quote service is temporarily unavailable')}
  let records;try{records=await response.json()}catch(e){throw lockApiError('The quote service returned an invalid response',e)}
  const record=Array.isArray(records)?records.find(x=>typeof x.quote==='string'&&x.quote.trim()&&typeof x.author==='string'&&x.author.trim()&&Array.isArray(x.categories)&&x.categories.includes(category)&&!used.has(x.quote.trim())):null;
  if(record){const quote={quote:record.quote.trim(),author:record.author.trim(),work:typeof record.work==='string'?record.work.trim():'',categories:record.categories};used.add(quote.quote);return quote}
 }
 throw lockApiError(`The quote service could not provide a distinct ${category} quote`);
}
async function fetchLockImage(theme){
 const pix=new URL('https://pixabay.com/api/');
 pix.searchParams.set('key',process.env.PIXABAY_API_KEY);pix.searchParams.set('q',theme.imageQuery);pix.searchParams.set('category',theme.imageCategory);pix.searchParams.set('image_type','photo');pix.searchParams.set('orientation','horizontal');pix.searchParams.set('safesearch','true');pix.searchParams.set('per_page','30');
 let response;
 try{response=await fetch(pix,{signal:AbortSignal.timeout(10000)})}catch(e){throw lockApiError('The image service is temporarily unavailable',e)}
 if(!response.ok){console.error('Pixabay API request failed:',response.status);throw lockApiError('The image service is temporarily unavailable')}
 let search;try{search=await response.json()}catch(e){throw lockApiError('The image service returned an invalid response',e)}
 const hits=Array.isArray(search.hits)?search.hits.filter(x=>x.largeImageURL&&x.pageURL&&x.user):[];
 if(!hits.length)throw lockApiError(`The image service returned no ${theme.imageCategory} images`);
 const hit=hits[crypto.randomInt(hits.length)];let imageUrl;
 try{imageUrl=new URL(hit.largeImageURL);if(imageUrl.protocol!=='https:'||!['pixabay.com','cdn.pixabay.com'].includes(imageUrl.hostname))throw new Error('Unexpected image host')}
 catch(e){throw lockApiError('The image service returned an invalid image URL',e)}
 try{response=await fetch(imageUrl,{signal:AbortSignal.timeout(15000)})}catch(e){throw lockApiError('Unable to download the selected image',e)}
 if(!response.ok)throw lockApiError('Unable to download the selected image');
 const mime=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();
 if(!['image/jpeg','image/png','image/webp'].includes(mime))throw lockApiError('The image service returned an unsupported image format');
 const declaredSize=Number(response.headers.get('content-length'));if(Number.isFinite(declaredSize)&&declaredSize>10*1024*1024)throw lockApiError('The selected image exceeds the 10 MB limit');
 let imageData;try{imageData=Buffer.from(await response.arrayBuffer())}catch(e){throw lockApiError('Unable to download the selected image',e)}
 if(!imageData.length||imageData.length>10*1024*1024)throw lockApiError('The selected image is empty or exceeds the 10 MB limit');
 let pageUrl;try{pageUrl=new URL(hit.pageURL);if(pageUrl.protocol!=='https:'||pageUrl.hostname!=='pixabay.com')throw new Error('Unexpected attribution URL')}
 catch(e){throw lockApiError('The image service returned an invalid attribution URL',e)}
 return{imageData,imageMime:mime,imageCredit:String(hit.user).slice(0,120),imagePageUrl:pageUrl.href};
}
async function buildLockScreenQuotes(){
 const used=new Set(),themes=LOCK_THEMES.slice(),quotes=[];
 for(const slot of LOCK_SLOTS){
  const theme=themes.splice(crypto.randomInt(themes.length),1)[0];
  quotes.push({slot:slot.id,label:slot.label,theme:theme.name,imageCategory:theme.imageCategory,imageQuery:theme.imageQuery,quoteCategory:theme.quoteCategory,...await fetchLockQuote(theme.quoteCategory,used)});
 }
 return quotes;
}
async function getLockScreenContent(){
 if(!lockScreenConfigured()){const e=new Error('Add PIXABAY_API_KEY and API_NINJAS_API_KEY to enable daily lock-screen content');e.status=503;throw e}
 const day=eastAfricaDay(),slot=lockSlot(),db=await pool.connect();
 try{
  await db.query('BEGIN');await db.query("SELECT pg_advisory_xact_lock(hashtext('brela-lock-screen-content'))");
  let result=await db.query('SELECT day::text,image_slot,theme,image_category,quote_category,image_credit,image_page_url,quotes FROM lock_screen_content WHERE day=$1',[day]),row=result.rows[0];
  const migratedQuotes=row&&Array.isArray(row.quotes)&&row.quotes.every(q=>q&&q.theme&&q.imageCategory&&q.imageQuery&&q.quoteCategory);
  if(!migratedQuotes){
   const quotes=await buildLockScreenQuotes(),quote=quotes.find(q=>q.slot===slot),image=await fetchLockImage(quote);
   result=await db.query(`INSERT INTO lock_screen_content(day,image_slot,theme,image_category,quote_category,image_data,image_mime,image_credit,image_page_url,quotes)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
    ON CONFLICT(day) DO UPDATE SET image_slot=EXCLUDED.image_slot,theme=EXCLUDED.theme,image_category=EXCLUDED.image_category,quote_category=EXCLUDED.quote_category,image_data=EXCLUDED.image_data,image_mime=EXCLUDED.image_mime,image_credit=EXCLUDED.image_credit,image_page_url=EXCLUDED.image_page_url,quotes=EXCLUDED.quotes,created_at=now()
    RETURNING day::text,image_slot,theme,image_category,quote_category,image_credit,image_page_url,quotes`,
   [day,slot,quote.theme,quote.imageCategory,quote.quoteCategory,image.imageData,image.imageMime,image.imageCredit,image.imagePageUrl,JSON.stringify(quotes)]);
   row=result.rows[0];
  }else if(row.image_slot!==slot){
   const quote=row.quotes.find(q=>q.slot===slot);if(!quote)throw lockApiError(`No quote is configured for the ${slot} period`);
   const image=await fetchLockImage(quote);
   result=await db.query(`UPDATE lock_screen_content SET image_slot=$2,theme=$3,image_category=$4,quote_category=$5,image_data=$6,image_mime=$7,image_credit=$8,image_page_url=$9,created_at=now()
    WHERE day=$1 RETURNING day::text,image_slot,theme,image_category,quote_category,image_credit,image_page_url,quotes`,
   [day,slot,quote.theme,quote.imageCategory,quote.quoteCategory,image.imageData,image.imageMime,image.imageCredit,image.imagePageUrl]);
   row=result.rows[0];
  }
  await db.query('DELETE FROM lock_screen_content WHERE day<>$1',[day]);
  await db.query('COMMIT');
  return{day:row.day,theme:row.theme,imageCategory:row.image_category,quoteCategory:row.quote_category,imageSlot:row.image_slot,imageCredit:row.image_credit,imagePageUrl:row.image_page_url,imageUrl:'/api/lock-screen/image?day='+encodeURIComponent(row.day)+'&slot='+encodeURIComponent(row.image_slot),quotes:row.quotes,activeSlot:slot}
 }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e}finally{db.release()}
}
async function serveLockScreenImage(req,res){
 const day=String(req.query.day||''),slot=String(req.query.slot||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!LOCK_SLOTS.some(s=>s.id===slot))return res.status(400).json({error:'Invalid image date or period'});
 const row=await one('SELECT image_data,image_mime FROM lock_screen_content WHERE day=$1 AND image_slot=$2',[day,slot]);
 if(!row)return res.status(404).json({error:'Daily lock-screen image not found'});
 res.set({'Content-Type':row.image_mime,'Cache-Control':'public,max-age=86400,immutable','X-Content-Type-Options':'nosniff'}).send(row.image_data);
}
const auth=async(req,res,next)=>{try{const t=jwt.verify(req.cookies.t,SECRET,{algorithms:['HS256']}),u=await one('SELECT u.id,u.name,u.email,u.phone,u.role,r.level,r.permissions,u.must_change_password,s.id AS session_id,s.last_activity FROM users u JOIN roles r ON r.key=u.role LEFT JOIN auth_sessions s ON s.user_id=u.id AND s.id=$2 WHERE u.id=$1 AND u.active',[t.id,t.jti]);if(!u)return res.status(401).json({error:'Please sign in',code:'SESSION_EXPIRED'});if(!u.session_id||Date.now()-new Date(u.last_activity).getTime()>=IDLE_TIMEOUT_MS){if(u.session_id)await q('DELETE FROM auth_sessions WHERE id=$1',[u.session_id]);return res.status(401).json({error:'Session expired due to inactivity',code:'SESSION_EXPIRED'})}req.user={id:u.id,name:u.name,email:u.email,phone:u.phone,role:u.role,level:u.level,perms:P.clean(u.permissions||P.preset(u.level)),must_change_password:u.must_change_password};req.sessionId=u.session_id;next()}catch(e){if(e.name==='JsonWebTokenError'||e.name==='TokenExpiredError'||e.name==='NotBeforeError')return res.status(401).json({error:'Please sign in',code:'SESSION_EXPIRED'});console.error('Authentication middleware failed:',e);res.status(500).json({error:'Authentication service unavailable'})}};
const P=require('./permissions');
// access is decided by the permissions ticked on the person's role (Settings → Roles); a route lets someone in if they hold any of the listed ones
const allow=(...p)=>(req,res,next)=>p.some(x=>req.user.perms.includes(x))?next():res.status(403).json({error:'Your role cannot do this'});
const can=(u,p)=>u.perms.includes(p);
const cleanTrack=v=>{const t=String(v??'').replace(/\s+/g,' ').trim();if(t.length>60)fail(400,'Track number is too long (max 60 characters)');return t||null};
const audit=(req,action,details)=>q('INSERT INTO audit_log(user_id,actor_name,action,details) VALUES($1,$2,$3,$4)',[req.user.id,req.user.name,action,details]).catch(()=>{});
const roleExists=async k=>!!(k&&await one('SELECT 1 FROM roles WHERE key=$1',[String(k)]));
const roleAdmin=async k=>!!(await one(`SELECT 1 FROM roles WHERE key=$1 AND permissions @> '["roles.manage"]'::jsonb`,[String(k)]));
const otherManagers=async excludeId=>(await one(`SELECT count(*)::int AS n FROM users u JOIN roles r ON r.key=u.role WHERE u.active AND r.permissions @> '["roles.manage"]'::jsonb AND u.id<>$1`,[excludeId||0])).n;
const log=(caseId,userId,text)=>q('INSERT INTO activity(case_id,user_id,text) VALUES($1,$2,$3)',[caseId,userId,text]);
const WA=require('./whatsapp')({q,one,putDisk});
const AI=require('./ai')({q,one,enc,dec}),E=require('./docs');
const caseInfo=id=>one(CASE_SQL+' WHERE c.id=$1',[id]);
app.get('/webhooks/whatsapp',WA.verify);app.post('/webhooks/whatsapp',WA.receive);
// ---- auth (with simple brute-force guard)
const tries=new Map(),DUMMY=bcrypt.hashSync('not-a-real-password',12);
// attempts are counted per address (8) AND per account (40): one address trying many accounts stops quickly, and many addresses trying one account stop too, without letting a stranger lock a real person out after a few tries
const throttle=(k,max=8)=>{const t=tries.get(k)||{n:0,at:Date.now()};if(Date.now()-t.at>6e5){t.n=0;t.at=Date.now()}tries.set(k,t);return t};
setInterval(()=>{for(const [k,t] of tries)if(Date.now()-t.at>6e5)tries.delete(k)},6e5).unref();
app.post('/api/login',wrap(async(req,res)=>{
  const em=String(req.body.email||'').trim().toLowerCase().slice(0,200),k='ip:'+req.ip,ka='acct:'+em,t=throttle(k),ta=throttle(ka);
  if(t.n>=8||ta.n>=40)fail(429,'Too many attempts. Try again in 10 minutes.');
  const u=await one('SELECT * FROM users WHERE lower(email)=lower($1) AND active',[em]);
  // the same work is done whether or not the account exists, so the response time does not reveal which emails are registered
  const good=await bcrypt.compare(String(req.body.password||''),u?u.password_hash:DUMMY);
  if(!u||!good){t.n++;ta.n++;fail(401,'Wrong email or password')}
  tries.delete(k);tries.delete(ka);
  await q('DELETE FROM auth_sessions WHERE last_activity<now()-interval \'30 days\'');
  const sessionId=crypto.randomUUID();await q('INSERT INTO auth_sessions(id,user_id) VALUES($1,$2)',[sessionId,u.id]);
  res.cookie('t',jwt.sign({id:u.id,role:u.role,name:u.name},SECRET,{jwtid:sessionId,expiresIn:'7d'}),{httpOnly:true,sameSite:'lax',secure:PROD,maxAge:6048e5});
  res.json({id:u.id,name:u.name,role:u.role,mustChange:!!u.must_change_password})}));
app.get('/api/lock-screen/content',wrap(async(req,res)=>res.json(await getLockScreenContent())));
app.get('/api/lock-screen/image',wrap(serveLockScreenImage));
app.use('/api',auth);
app.post('/api/logout',wrap(async(req,res)=>{await q('DELETE FROM auth_sessions WHERE id=$1',[req.sessionId]);res.clearCookie('t');res.json({ok:1})}));
// a person with a temporary password must set their own before anything else (tests skip the gate)
app.use('/api',(req,res,next)=>{if(req.user.must_change_password&&process.env.NODE_ENV!=='test'&&!/^(\/me\/password|\/logout|\/me|\/session\/activity|\/session\/lock)$/.test(req.url))return res.status(403).json({error:'Set a new password first'});next()});
// the address of a case or client is a random code; it is turned back into the internal number here, so every route below keeps working with numbers
app.param('id',(req,res,next,v)=>{
  if(/^\d+$/.test(v))return next();
  const tb=/^\/api\/cases\//.test(req.path)?'cases':/^\/api\/clients\//.test(req.path)?'clients':null;
  if(!tb||!/^[0-9a-f]{32}$/.test(v))return res.status(400).json({error:'Bad id'});
  one('SELECT id FROM '+tb+' WHERE uid=$1',[v]).then(r=>{if(!r)return res.status(404).json({error:'Not found'});req.params.id=String(r.id);next()},next)});
app.get('/api/me',(req,res)=>res.json(req.user));
app.post('/api/session/activity',wrap(async(req,res)=>{await q('UPDATE auth_sessions SET last_activity=now() WHERE id=$1',[req.sessionId]);res.json({ok:1})}));
app.post('/api/session/lock',wrap(async(req,res)=>{await q('DELETE FROM auth_sessions WHERE id=$1',[req.sessionId]);res.clearCookie('t');res.json({ok:1})}));
app.patch('/api/me/profile',wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim(),phone=String(req.body.phone||'').trim()||null;
  if(!name)fail(400,'Name required');
  await q('UPDATE users SET name=$1,phone=$2 WHERE id=$3',[name,phone,req.user.id]);
  res.json({ok:1,name,phone})}));
// profile picture: 3 MB max, image only; saving a new one replaces the old bytes in the same row (nothing accumulates)
const avUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024}});
app.post('/api/me/avatar',avUpload.single('file'),wrap(async(req,res)=>{
  if(!req.file)fail(400,'Choose a picture');
  if(!/^image\//.test(req.file.mimetype))fail(400,'Only image files (JPG, PNG, WebP)');
  await q('UPDATE users SET avatar=$1,avatar_mime=$2,avatar_at=now() WHERE id=$3',[req.file.buffer,req.file.mimetype,req.user.id]);
  res.json({ok:1,avatar:new Date().toISOString()})}));
app.get('/api/users/:id/avatar',wrap(async(req,res)=>{
  const u=await one('SELECT avatar,avatar_mime,avatar_at FROM users WHERE id=$1',[+req.params.id]);
  if(!u||!u.avatar)fail(404,'Not found');
  res.set({'Content-Type':u.avatar_mime||'image/jpeg','Cache-Control':'private,max-age=3600'});
  res.send(u.avatar)}));
app.post('/api/me/password',wrap(async(req,res)=>{
 const p=String(req.body.password||''),current=String(req.body.currentPassword||'');
 {const pr=SEC.passwordProblem(p,req.user.email);if(pr)fail(400,pr)}
 if(!req.user.must_change_password){const u=await one('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);if(!u||!await bcrypt.compare(current,u.password_hash))fail(400,'Current password is incorrect')}
 await q('UPDATE users SET password_hash=$1,must_change_password=FALSE WHERE id=$2',[await bcrypt.hash(p,12),req.user.id]);
 await q('DELETE FROM auth_sessions WHERE user_id=$1 AND id<>$2',[req.user.id,req.sessionId]); // every other sign-in of this person ends
 await audit(req,'user.password','Changed own password');
 res.json({ok:1})}));
app.get('/api/notifs',wrap(async(req,res)=>{
 const items=await q('SELECT n.id,n.case_id,n.body,n.read,n.created_at FROM notifs n WHERE n.user_id=$1 ORDER BY n.id DESC LIMIT 20',[req.user.id]);
 const u=await one('SELECT count(*)::int AS n FROM notifs WHERE user_id=$1 AND NOT read',[req.user.id]);
 res.json({items,unread:u.n})}));
app.post('/api/notifs/read',wrap(async(req,res)=>{
 await q('UPDATE notifs SET read=TRUE WHERE user_id=$1 AND NOT read',[req.user.id]);res.json({ok:1})}));
const CASE_SQL=`SELECT c.id,c.uid,c.code,c.track_number,c.status,c.completed_at,c.due::text AS due,c.rounds,c.note,c.assignee_id AS who,c.client_id,cl.name AS client,cl.profile->>'incorporation_no' AS reg_no,c.case_type_id,t.name AS type,c.created_at::date::text AS created,c.submitted_at::date::text AS submitted,
 (SELECT count(*) FROM case_docs d WHERE d.case_id=c.id AND d.done)::int AS docs_done,(SELECT count(*) FROM case_docs d WHERE d.case_id=c.id)::int AS docs_total
 FROM cases c JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id`;
app.get('/api/bootstrap',wrap(async(req,res)=>{
  const [users,types,docs,clients,cases,recent,inbox,guide,notifs,roles,performers]=await Promise.all([
   q('SELECT id,name,role,active'+(can(req.user,'team.manage')?',email,phone,wa_opt_in':'')+',avatar_at::text AS avatar FROM users ORDER BY id'),q('SELECT id,name,active,sop,options FROM case_types ORDER BY name'),
   q('SELECT case_type_id,name FROM case_type_docs ORDER BY position,id'),q("SELECT id,uid,name,phone,email,track_number,profile->>'incorporation_no' AS reg_no FROM clients ORDER BY name"),
   q(CASE_SQL+' ORDER BY c.id DESC'),
   q('SELECT a.text,a.created_at,a.user_id,a.case_id,c.code FROM activity a JOIN cases c ON c.id=a.case_id ORDER BY a.id DESC LIMIT 8'),one('SELECT count(*)::int AS n FROM files WHERE inbox'),one('SELECT seen_guide FROM users WHERE id=$1',[req.user.id]),one('SELECT count(*)::int AS n FROM notifs WHERE user_id=$1 AND NOT read',[req.user.id]),q(`SELECT key,name,level,team_queue,permissions FROM roles ORDER BY CASE level WHEN 'MANAGER' THEN 0 WHEN 'SENIOR' THEN 1 ELSE 2 END,name`),q(`SELECT user_id,count(*)::int AS completed FROM activity WHERE created_at>=now()-interval '7 days' AND text LIKE 'moved % → done' GROUP BY user_id ORDER BY completed DESC,user_id`)]);
  const weeklyWork=await one(`SELECT count(DISTINCT a.case_id)::int AS assigned,
    count(DISTINCT a.case_id) FILTER (WHERE EXISTS (
      SELECT 1 FROM activity done_event
      WHERE done_event.case_id=a.case_id
      AND done_event.created_at>=now()-interval '7 days'
      AND done_event.created_at>=a.assigned_at
      AND done_event.text LIKE 'moved % → done'
    ))::int AS completed
    FROM case_assignments a
    WHERE a.user_id=$1 AND a.assigned_at>=now()-interval '7 days'`,[req.user.id]);
  const weeklyPerformance={assigned:weeklyWork.assigned,completed:weeklyWork.completed,rate:weeklyWork.assigned?Math.round(weeklyWork.completed/weeklyWork.assigned*1000)/10:0};
  types.forEach(t=>t.docs=docs.filter(d=>d.case_type_id===t.id).map(d=>d.name));
  res.json({me:{...req.user,seenGuide:!!(guide&&guide.seen_guide)},roles,users,types,clients,cases,recent,inboxCount:inbox.n,notifs:notifs.n,performers,weeklyPerformance})}));
// ---- team
// Nobody can create, change, reset or delete someone whose role can do more than their own, or hand out a role that can do more than their own.
const permsOfRole=async k=>P.clean(((await one('SELECT permissions,level FROM roles WHERE key=$1',[String(k)]))||{}).permissions||[]);
const within=(user,perms)=>perms.every(p=>user.perms.includes(p));
const NOT_ABOVE='You cannot change someone whose role can do more than yours, or give a role that can do more than yours';
app.post('/api/users',allow('team.manage'),wrap(async(req,res)=>{
  const {name,email,role,password,phone}=req.body;if(!name||!email||!role||!password)fail(400,'Name, email, role and a password are required');{const pr=SEC.passwordProblem(password,email);if(pr)fail(400,pr)}
  if(!await roleExists(role))fail(400,'Choose a valid role');
  if(!within(req.user,await permsOfRole(role)))fail(403,NOT_ABOVE);
  try{res.json(await one('INSERT INTO users(name,email,role,password_hash,must_change_password,phone) VALUES($1,lower($2),$3,$4,TRUE,$5) RETURNING id,name,role,active',[name,email,role,await bcrypt.hash(password,12),phone||null]))}catch(e){fail(400,'That email is already used')}}));
app.patch('/api/users/:id',allow('team.manage'),wrap(async(req,res)=>{
  const {role,active,password,phone,waOptIn,name,email}=req.body,id=+req.params.id;
  const who=await one('SELECT u.name,u.email,u.role,r.permissions FROM users u JOIN roles r ON r.key=u.role WHERE u.id=$1',[id]);if(!who)fail(404,'Not found');
  // everything is checked first, so a refused change leaves nothing half done
  if(id!==req.user.id&&!within(req.user,P.clean(who.permissions)))fail(403,NOT_ABOVE);
  if(role&&role!==who.role){if(!await roleExists(role))fail(400,'Bad role');if(!within(req.user,await permsOfRole(role)))fail(403,NOT_ABOVE)}
  if(name!==undefined&&!String(name).trim())fail(400,'Name required');
  if(email!==undefined&&!/^\S+@\S+\.\S+$/.test(String(email).trim()))fail(400,'Enter a valid email');
  if(id===req.user.id&&(active===false||(role&&role!==who.role)))fail(400,'You cannot demote or deactivate yourself');
  if((who.permissions||[]).includes('roles.manage')&&(active===false||(role&&role!==who.role&&!(await roleAdmin(role))))&&!(await otherManagers(id)))fail(400,'At least one active Manager must remain');
  if(password){const pr=SEC.passwordProblem(password,who.email);if(pr)fail(400,pr)}
  if(email!==undefined){if(await one('SELECT 1 FROM users WHERE lower(email)=lower($1) AND id<>$2',[String(email).trim(),id]))fail(400,'That email is already used')}
  if(name!==undefined)await q('UPDATE users SET name=$1 WHERE id=$2',[String(name).trim(),id]);
  if(email!==undefined)await q('UPDATE users SET email=lower($1) WHERE id=$2',[String(email).trim(),id]);
  if(role||typeof active==='boolean'||password||name!==undefined||email!==undefined)await audit(req,'user.update',`${who.name}: ${[role&&`role ${who.role} → ${role}`,typeof active==='boolean'&&(active?'activated':'deactivated'),password&&'password reset',name!==undefined&&'name',email!==undefined&&'email'].filter(Boolean).join(', ')}`);
  if(phone!==undefined)await q('UPDATE users SET phone=$1 WHERE id=$2',[String(phone).trim()||null,id]);
  if(typeof waOptIn==='boolean')await q('UPDATE users SET wa_opt_in=$1 WHERE id=$2',[waOptIn,id]);
  if(role)await q('UPDATE users SET role=$1 WHERE id=$2',[role,id]);
  if(typeof active==='boolean'){await q('UPDATE users SET active=$1 WHERE id=$2',[active,id]);if(!active)await q('DELETE FROM auth_sessions WHERE user_id=$1',[id])}
  // a reset password signs the person out everywhere (a stolen session does not survive a reset)
  if(password){await q('UPDATE users SET password_hash=$1'+(id===req.user.id?'':',must_change_password=TRUE')+' WHERE id=$2',[await bcrypt.hash(password,12),id]);await q('DELETE FROM auth_sessions WHERE user_id=$1 AND id<>$2',[id,id===req.user.id?req.sessionId:'00000000-0000-0000-0000-000000000000'])}
  res.json({ok:1})}));
app.delete('/api/users/:id',allow('team.manage'),wrap(async(req,res)=>{
  const id=+req.params.id;if(id===req.user.id)fail(400,'You cannot delete yourself');
  const u=await one('SELECT u.name,u.email,r.permissions FROM users u JOIN roles r ON r.key=u.role WHERE u.id=$1',[id]);if(!u)fail(404,'Not found');
  if(!within(req.user,P.clean(u.permissions)))fail(403,NOT_ABOVE);
  if((u.permissions||[]).includes('roles.manage')&&!(await otherManagers(id)))fail(400,'At least one active Manager must remain');
  const used=await one(`SELECT (SELECT count(*) FROM cases WHERE assignee_id=$1 OR created_by=$1)+(SELECT count(*) FROM activity WHERE user_id=$1)+(SELECT count(*) FROM comments WHERE user_id=$1)+(SELECT count(*) FROM files WHERE uploaded_by=$1)+(SELECT count(*) FROM credentials WHERE created_by=$1)+(SELECT count(*) FROM credential_access WHERE user_id=$1) AS n`,[id]);
  if(+used.n)fail(400,'This person has work history. Deactivate them instead: their history stays correct.');
  await q('DELETE FROM users WHERE id=$1',[id]);await audit(req,'user.delete',`${u.name} <${u.email}>`);res.json({ok:1})}));
// ---- case types (flexible: add/edit any time)
const saveDocs=async(id,docs)=>{await q('DELETE FROM case_type_docs WHERE case_type_id=$1',[id]);let i=0;for(const n of docs.map(s=>String(s).trim()).filter(Boolean))await q('INSERT INTO case_type_docs(case_type_id,name,position) VALUES($1,$2,$3)',[id,n,i++])};
// "What kind of change?" options of a case type: [{name, docs:[], actions:[{name, docs:[]}]}]. A case copies the checklist of what was ticked.
const cleanList=a=>(Array.isArray(a)?a:String(a||'').split('\n')).map(x=>String(x).trim().slice(0,200)).filter(Boolean).slice(0,40);
const cleanOptions=o=>{if(!Array.isArray(o))return[];const seen=new Set();return o.slice(0,40).map(x=>({name:String((x&&x.name)||'').trim().slice(0,80),docs:cleanList(x&&x.docs),actions:(Array.isArray(x&&x.actions)?x.actions:[]).slice(0,12).map(a=>({name:String((a&&a.name)||'').trim().slice(0,80),docs:cleanList(a&&a.docs)})).filter(a=>a.name)})).filter(x=>{if(!x.name||seen.has(x.name.toLowerCase()))return false;seen.add(x.name.toLowerCase());return true})};
// checklist items for the chosen options; throws when a choice is missing or unknown
const chosenDocs=(type,sel)=>{const opts=type.options||[],out=[],chosen=[];
 if(!opts.length)return{docs:[],chosen:[]};
 if(!Array.isArray(sel)||!sel.length)fail(400,'Choose what kind of change this is');
 for(const s of sel){const o=opts.find(x=>x.name===(s&&s.name));if(!o)fail(400,`"${s&&s.name}" is not an option of this case type`);
  const acts=[];
  if(o.actions.length){const names=Array.isArray(s.actions)?s.actions:[];if(!names.length)fail(400,`Choose what to do for ${o.name}: ${o.actions.map(a=>a.name).join(', ')}`);
   for(const an of names){const a=o.actions.find(x=>x.name===an);if(!a)fail(400,`"${an}" is not an action of ${o.name}`);acts.push(a)}}
  o.docs.forEach(n=>out.push({name:n,grp:o.name}));acts.forEach(a=>a.docs.forEach(n=>out.push({name:n,grp:`${o.name} · ${a.name}`})));
  chosen.push({name:o.name,actions:acts.map(a=>a.name)})}
 return{docs:out,chosen}};
app.post('/api/case-types',allow('casetypes.manage'),wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)fail(400,'Name required');
  try{const t=await one('INSERT INTO case_types(name,sop,options) VALUES($1,$2,$3::jsonb) RETURNING id',[name,String(req.body.sop||'').trim()||null,JSON.stringify(cleanOptions(req.body.options))]);await saveDocs(t.id,req.body.docs||[]);res.json(t)}catch(e){if(e.status)throw e;fail(400,'A case type with this name already exists')}}));
app.put('/api/case-types/:id',allow('casetypes.manage'),wrap(async(req,res)=>{
  const id=+req.params.id;if(req.body.name)await q('UPDATE case_types SET name=$1 WHERE id=$2',[req.body.name.trim(),id]);
  if(typeof req.body.active==='boolean')await q('UPDATE case_types SET active=$1 WHERE id=$2',[req.body.active,id]);
  if(req.body.sop!==undefined)await q('UPDATE case_types SET sop=$1 WHERE id=$2',[String(req.body.sop).trim()||null,id]);
  if(req.body.options!==undefined)await q('UPDATE case_types SET options=$1::jsonb WHERE id=$2',[JSON.stringify(cleanOptions(req.body.options)),id]);
  if(req.body.docs)await saveDocs(id,req.body.docs);res.json({ok:1})}));
app.delete('/api/case-types/:id',allow('casetypes.manage'),wrap(async(req,res)=>{
  const id=+req.params.id,t=await one('SELECT name FROM case_types WHERE id=$1',[id]);if(!t)fail(404,'Not found');
  if((await one('SELECT count(*)::int AS n FROM cases WHERE case_type_id=$1',[id])).n)fail(400,'Cases already use this type. Hide it instead.');
  await q('DELETE FROM case_types WHERE id=$1',[id]);await audit(req,'case_type.delete',t.name);res.json({ok:1})}));
// ---- clients, files, vault
app.post('/api/clients',wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)fail(400,'Client name required');
  res.json(await one('INSERT INTO clients(name,phone,email,track_number) VALUES($1,$2,$3,$4) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id,uid,name',[name,req.body.phone||null,req.body.email||null,cleanTrack(req.body.track_number)]))}));
app.patch('/api/clients/:id',wrap(async(req,res)=>{const {name,phone,email,track_number}=req.body,id=+req.params.id;
  if(track_number!==undefined)await q('UPDATE clients SET track_number=$1 WHERE id=$2',[cleanTrack(track_number),id]);
  if(name!==undefined){if(!can(req.user,'clients.rename'))fail(403,'Only a Senior or Manager can rename a client');if(!String(name).trim())fail(400,'Name required');
   try{await q('UPDATE clients SET name=$1 WHERE id=$2',[String(name).trim(),id])}catch(e){fail(400,'A client with this name already exists')}}
  if(phone!==undefined)await q('UPDATE clients SET phone=$1 WHERE id=$2',[String(phone).trim()||null,id]);if(email!==undefined)await q('UPDATE clients SET email=$1 WHERE id=$2',[String(email).trim()||null,id]);res.json({ok:1})}));
app.delete('/api/clients/:id',allow('clients.delete'),wrap(async(req,res)=>{
  const id=+req.params.id,c=await one('SELECT name FROM clients WHERE id=$1',[id]);if(!c)fail(404,'Not found');
  if((await one('SELECT count(*)::int AS n FROM cases WHERE client_id=$1',[id])).n)fail(400,'This client has cases. Delete or move those cases first.');
  await q('DELETE FROM clients WHERE id=$1',[id]);await audit(req,'client.delete',`${c.name} (with their documents and saved logins)`);res.json({ok:1})}));
const FILES='SELECT f.id,f.filename,f.mime,f.uploaded_by,f.size,f.case_doc_id,f.case_id,f.created_at,f.source,f.missing,f.checked_by,f.checked_at,u.name AS by,cu.name AS checked_by_name FROM files f LEFT JOIN users u ON u.id=f.uploaded_by LEFT JOIN users cu ON cu.id=f.checked_by';
// Paginated list with search (name, email, phone: digits match even when the number has spaces) and 'focus' (jump to the page holding one client)
app.get('/api/clients',wrap(async(req,res)=>{
  const n0=parseInt(req.query.size),size=n0>0?Math.min(50,n0):10,qs=String(req.query.q||'').trim().slice(0,80),like='%'+qs.replace(/[\\%_]/g,m=>'\\'+m)+'%',digits=qs.replace(/\D/g,''),dl=digits.length>=3?'%'+digits+'%':'';
  const W=a=>`(${a}name ILIKE $1 OR ${a}profile->>'incorporation_no' ILIKE $1 OR ${a}email ILIKE $1 OR ${a}phone ILIKE $1 OR ${a}track_number ILIKE $1 OR EXISTS(SELECT 1 FROM cases x WHERE x.client_id=${a}id AND x.track_number ILIKE $1) OR ($2<>'' AND translate(coalesce(${a}phone,''),' +-().','') LIKE $2))`;
  const total=(await one(`SELECT count(*)::int AS n FROM clients cl WHERE ${W('cl.')}`,[like,dl])).n,pages=Math.max(1,Math.ceil(total/size));
  let page=Math.min(pages,Math.max(1,parseInt(req.query.page)||1));const focus=parseInt(req.query.focus);
  if(focus&&await one(`SELECT 1 FROM clients cl WHERE cl.id=$3 AND ${W('cl.')}`,[like,dl,focus]))page=Math.floor((await one(`SELECT count(*)::int AS n FROM clients cl WHERE ${W('cl.')} AND cl.name<(SELECT name FROM clients WHERE id=$3)`,[like,dl,focus])).n/size)+1;
  const items=await q(`SELECT cl.id,cl.uid,cl.name,cl.profile->>'incorporation_no' AS reg_no,cl.phone,cl.email,cl.track_number,(SELECT coalesce(json_agg(x.track_number ORDER BY x.id DESC),'[]'::json) FROM cases x WHERE x.client_id=cl.id AND x.track_number IS NOT NULL) AS tracks,(SELECT count(*)::int FROM cases c WHERE c.client_id=cl.id AND c.status<>'done') AS open,(SELECT count(*)::int FROM cases c WHERE c.client_id=cl.id) AS cases FROM clients cl WHERE ${W('cl.')} ORDER BY cl.name,cl.id LIMIT $3 OFFSET $4`,[like,dl,size,(page-1)*size]);
  res.json({items,total,page,pages,size})}));
// ---- universal search (navbar suggestions + results page): clients, cases, files, comments, vault labels
app.get('/api/search',wrap(async(req,res)=>{
  const qs=String(req.query.q||'').trim().slice(0,80);
  const empty={q:qs,clients:[],cases:[],files:[],comments:[],creds:[]};
  if(qs.length<2)return res.json(empty);
  const like='%'+qs.replace(/[\\%_]/g,m=>'\\'+m)+'%',digits=qs.replace(/\D/g,''),dl=digits.length>=3?'%'+digits+'%':'';
  const [clients,cases,files,comments,creds]=await Promise.all([
   q(`SELECT id,uid,name,phone,email,track_number,profile->>'incorporation_no' AS reg_no FROM clients WHERE name ILIKE $1 OR coalesce(profile->>'incorporation_no','') ILIKE $1 OR coalesce(email,'') ILIKE $1 OR coalesce(phone,'') ILIKE $1 OR coalesce(track_number,'') ILIKE $1 OR ($2<>'' AND translate(coalesce(phone,''),' +-().','') LIKE $2) ORDER BY name LIMIT 5`,[like,dl]),
   q(`SELECT c.id,c.code,c.status,c.track_number,c.note,cl.name AS client,t.name AS type FROM cases c JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id WHERE c.code ILIKE $1 OR c.track_number ILIKE $1 OR cl.name ILIKE $1 OR t.name ILIKE $1 OR c.note ILIKE $1 ORDER BY c.id DESC LIMIT 6`,[like]),
   q(`SELECT f.id,f.filename,coalesce(cl.name,cl2.name) AS client,c.id AS case_id,c.code AS case_code FROM files f LEFT JOIN cases c ON c.id=f.case_id LEFT JOIN clients cl ON cl.id=f.client_id LEFT JOIN clients cl2 ON cl2.id=c.client_id WHERE f.filename ILIKE $1 AND NOT f.inbox ORDER BY f.id DESC LIMIT 5`,[like]),
   q(`SELECT m.id,m.body,m.case_id,c.code AS case_code,cl.name AS client,u.name AS by FROM comments m JOIN cases c ON c.id=m.case_id JOIN clients cl ON cl.id=c.client_id LEFT JOIN users u ON u.id=m.user_id WHERE m.body ILIKE $1 ORDER BY m.id DESC LIMIT 5`,[like]),
   can(req.user,'vault.manage')?q(`SELECT cr.id,cr.label,cr.client_id,cl.name AS client FROM credentials cr JOIN clients cl ON cl.id=cr.client_id WHERE cr.label ILIKE $1 ORDER BY cr.id DESC LIMIT 4`,[like]):[]]);
  res.json({q:qs,clients,cases,files,comments,creds})}));
app.get('/api/clients/:id',wrap(async(req,res)=>{
  const id=+req.params.id,client=await one('SELECT id,uid,name,phone,email,track_number,profile,activities FROM clients WHERE id=$1',[id]);if(!client)fail(404,'Not found');
  const [cases,files,creds]=await Promise.all([q(CASE_SQL+' WHERE c.client_id=$1 ORDER BY c.id DESC',[id]),
   q(FILES+' WHERE f.client_id=$1 AND NOT f.inbox ORDER BY f.id DESC',[id]),
   q(`SELECT c.id,c.label,c.username,(SELECT u.name||' · '||to_char(a.created_at,'DD Mon HH24:MI') FROM credential_access a JOIN users u ON u.id=a.user_id WHERE a.credential_id=c.id ORDER BY a.id DESC LIMIT 1) AS last_access FROM credentials c WHERE c.client_id=$1 ORDER BY c.id`,[id])]);
  res.json({client,cases,files,creds,people:await q('SELECT * FROM client_people WHERE client_id=$1 ORDER BY position,id',[id])})}));
const putFile=async(req,{clientId,caseId,docId,name:nm})=>{
  if(!req.file)fail(400,'Choose a file');
  const name=nm||Buffer.from(req.file.originalname,'latin1').toString('utf8'),buf=req.file.buffer;
  if(FILES_DIR)return one('INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,path,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,filename',[clientId,caseId||null,docId||null,name,req.file.mimetype,req.file.size,putDisk(name,buf),req.user.id]);
  return one('INSERT INTO files(client_id,case_id,case_doc_id,filename,mime,size,data,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,filename',[clientId,caseId||null,docId||null,name,req.file.mimetype,req.file.size,buf,req.user.id])};
const up=(req,res,next)=>upload.single('file')(req,res,e=>e?res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'File too large (max 15 MB)':'Upload failed'}):next());
app.post('/api/clients/:id/files',up,wrap(async(req,res)=>res.json(await putFile(req,{clientId:+req.params.id}))));
app.get('/api/files/:id',wrap(async(req,res)=>{
  const f=await one('SELECT filename,mime,data,path FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  const inline=req.query.inline&&/^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i.test(f.mime||'');
  res.set({'Content-Type':f.mime||'application/octet-stream','Content-Disposition':`${inline?'inline':'attachment'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`,'X-Content-Type-Options':'nosniff','Content-Security-Policy':inline?"frame-ancestors 'self'":"sandbox; default-src 'none'"});
  if(f.path&&FILES_DIR){const fp=path.resolve(FILES_DIR,f.path);if(!fp.startsWith(path.resolve(FILES_DIR)))fail(404,'Not found');return res.send(fs.readFileSync(fp))}
  res.send(f.data)}));
app.get('/api/files/:id/info',wrap(async(req,res)=>{
  const f=await one('SELECT f.id,f.filename,f.mime,f.size,f.client_id,f.case_id,f.case_doc_id,f.uploaded_by,f.inbox,c.code AS case_code,d.name AS doc_name FROM files f LEFT JOIN cases c ON c.id=f.case_id LEFT JOIN case_docs d ON d.id=f.case_doc_id WHERE f.id=$1',[+req.params.id]);if(!f)fail(404,'Not found');res.json(f)}));
app.delete('/api/files/:id',wrap(async(req,res)=>{
  const f=await one('SELECT uploaded_by,filename,path FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  if(!can(req.user,'files.manage')&&f.uploaded_by!==req.user.id)fail(403,'Only the uploader, a Senior or a Manager can delete this');
  await q('DELETE FROM files WHERE id=$1',[+req.params.id]);
  if(f.path&&FILES_DIR)try{fs.unlinkSync(path.join(FILES_DIR,f.path))}catch{}
  await audit(req,'file.delete',f.filename);res.json({ok:1})}));
app.patch('/api/files/:id',wrap(async(req,res)=>{
  const f=await one('SELECT uploaded_by FROM files WHERE id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  if(!can(req.user,'files.manage')&&f.uploaded_by!==req.user.id)fail(403,'Only the uploader, a Senior or a Manager can rename this');
  const n=String(req.body.filename||'').trim().slice(0,200);if(!n)fail(400,'Name required');await q('UPDATE files SET filename=$1 WHERE id=$2',[n,+req.params.id]);res.json({ok:1})}));
// Review step: a document the app generated counts as done only after a second person has checked it.
// The person who generated it cannot check it (a Manager may, because a small firm sometimes has no one else).
app.post('/api/files/:id/check',wrap(async(req,res)=>{
  const f=await one('SELECT f.id,f.filename,f.case_id,f.case_doc_id,f.uploaded_by,f.source,f.missing,f.checked_by FROM files f WHERE f.id=$1',[+req.params.id]);if(!f)fail(404,'Not found');
  if(!['template','ai'].includes(f.source))fail(400,'Only documents made by the app need to be checked.');
  if(!f.case_id)fail(400,'This document is not on a case.');
  if(f.checked_by)fail(409,'This document has already been checked.');
  if(f.uploaded_by===req.user.id&&!can(req.user,'docs.selfcheck'))fail(403,'A second person must check this document. Ask a colleague to open it and press "Mark as checked".');
  if(f.missing>0&&!req.body.confirm_missing)fail(409,`${f.missing} detail${f.missing===1?'':'s'} ${f.missing===1?'is':'are'} still highlighted in yellow. Fill them in, or confirm that they were handled.`,{need_confirm:true,missing:f.missing});
  const base=f.filename.replace(/\.[^.]+$/,'');
  await q(`UPDATE files SET checked_by=$1,checked_at=now() WHERE case_id=$2 AND source IN ('template','ai') AND checked_by IS NULL AND (id=$3 OR (case_doc_id IS NOT DISTINCT FROM $4 AND regexp_replace(filename,'\\.[^.]+$','')=$5))`,[req.user.id,f.case_id,f.id,f.case_doc_id,base]);
  if(f.case_doc_id)await q(`UPDATE case_docs SET done=NOT EXISTS(SELECT 1 FROM files g WHERE g.case_doc_id=$1 AND g.source IN ('template','ai') AND g.checked_by IS NULL AND g.id>$2) WHERE id=$1`,[f.case_doc_id,f.id]);
  await log(f.case_id,req.user.id,`checked "${f.filename}"${f.uploaded_by===req.user.id?' (own document, checked by a Manager)':''}`);
  await audit(req,'file.check',f.filename);res.json({ok:1})}));
// ---- Doc Studio: each person's saved signatures (private to them) and saving edited PDFs back into the client folder / case
const sigUpload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024}});
const sigUp=(req,res,next)=>sigUpload.single('file')(req,res,e=>e?res.status(400).json({error:e.code==='LIMIT_FILE_SIZE'?'Signature image is too large (max 2 MB)':'Upload failed'}):next());
const isPng=b=>!!b&&b.length>8&&b.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
const isPdf=b=>!!b&&b.length>5&&b.subarray(0,5).toString('latin1')==='%PDF-';
app.get('/api/me/signatures',wrap(async(req,res)=>res.json(await q('SELECT id,name,kind,is_default,created_at FROM user_signatures WHERE user_id=$1 ORDER BY is_default DESC,id',[req.user.id]))));
app.get('/api/me/signatures/:id/image',wrap(async(req,res)=>{
  const s=await one('SELECT image,mime FROM user_signatures WHERE id=$1 AND user_id=$2',[+req.params.id,req.user.id]);if(!s)fail(404,'Not found');
  res.set({'Content-Type':s.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}).send(s.image)}));
app.post('/api/me/signatures',sigUp,wrap(async(req,res)=>{
  if(!req.file||!isPng(req.file.buffer))fail(400,'The signature must be a PNG image');
  const kind=['signature','stamp'].includes(req.body.kind)?req.body.kind:'signature',name=String(req.body.name||'').trim().slice(0,60)||(kind==='stamp'?'Stamp':'Signature');
  if((await one('SELECT count(*)::int AS n FROM user_signatures WHERE user_id=$1',[req.user.id])).n>=12)fail(400,'You can keep up to 12 signatures and stamps. Delete one first.');
  const makeDefault=kind==='signature'&&(!(await one(`SELECT 1 FROM user_signatures WHERE user_id=$1 AND kind='signature'`,[req.user.id]))||req.body.isDefault==='1');
  if(makeDefault)await q('UPDATE user_signatures SET is_default=FALSE WHERE user_id=$1',[req.user.id]);
  const s=await one('INSERT INTO user_signatures(user_id,name,kind,image,mime,is_default) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,kind,is_default',[req.user.id,name,kind,req.file.buffer,'image/png',makeDefault]);
  await audit(req,'signature.create',name);res.json(s)}));
app.patch('/api/me/signatures/:id',wrap(async(req,res)=>{
  const id=+req.params.id,s=await one('SELECT id FROM user_signatures WHERE id=$1 AND user_id=$2',[id,req.user.id]);if(!s)fail(404,'Not found');
  if(req.body.name!==undefined){const n=String(req.body.name).trim().slice(0,60);if(!n)fail(400,'Name required');await q('UPDATE user_signatures SET name=$1 WHERE id=$2',[n,id])}
  if(req.body.isDefault&&(await one('SELECT kind FROM user_signatures WHERE id=$1',[id])).kind==='signature'){await q('UPDATE user_signatures SET is_default=(id=$2) WHERE user_id=$1',[req.user.id,id])}
  res.json({ok:1})}));
app.delete('/api/me/signatures/:id',wrap(async(req,res)=>{
  const id=+req.params.id,s=await one('SELECT name,is_default FROM user_signatures WHERE id=$1 AND user_id=$2',[id,req.user.id]);if(!s)fail(404,'Not found');
  await q('DELETE FROM user_signatures WHERE id=$1',[id]);
  if(s.is_default)await q(`UPDATE user_signatures SET is_default=TRUE WHERE id=(SELECT id FROM user_signatures WHERE user_id=$1 AND kind='signature' ORDER BY id LIMIT 1)`,[req.user.id]);
  await audit(req,'signature.delete',s.name);res.json({ok:1})}));
// Save the result of an edit (signed PDF, or images turned into a PDF). The browser builds the PDF; the server checks it, stores it like any other upload,
// ticks the checklist item, and writes the case history and audit log. mode "replace" overwrites the original (same rules as renaming a file).
app.post('/api/studio/save',up,wrap(async(req,res)=>{
  if(!req.file||!isPdf(req.file.buffer))fail(400,'The result must be a PDF');
  const b=req.body,action=b.action==='pdf'?'pdf':'sign';
  let clientId=+b.clientId||null,caseId=null,docId=null,doc=null;
  if(b.caseDocId){doc=await one('SELECT d.id,d.case_id,d.name,c.client_id FROM case_docs d JOIN cases c ON c.id=d.case_id WHERE d.id=$1',[+b.caseDocId]);if(!doc)fail(400,'Checklist item not found');clientId=doc.client_id;caseId=doc.case_id;docId=doc.id}
  else if(b.caseId){const c=await one('SELECT id,client_id FROM cases WHERE id=$1',[+b.caseId]);if(!c)fail(400,'Case not found');clientId=c.client_id;caseId=c.id}
  if(!clientId||!await one('SELECT 1 FROM clients WHERE id=$1',[clientId]))fail(400,'Choose a client');
  let name=String(b.filename||Buffer.from(req.file.originalname,'latin1').toString('utf8')).trim().replace(/[\\/:*?"<>|]+/g,'_').slice(0,190)||'document';
  if(!/\.pdf$/i.test(name))name+='.pdf';
  req.file.mimetype='application/pdf';
  const buf=req.file.buffer;let saved;
  if(b.mode==='replace'&&b.replaceFileId){
    const old=await one('SELECT id,uploaded_by,filename,path,client_id,case_id,case_doc_id,mime FROM files WHERE id=$1 AND NOT inbox',[+b.replaceFileId]);if(!old)fail(404,'The original file was not found');
    if(!can(req.user,'files.manage')&&old.uploaded_by!==req.user.id)fail(403,'Only the uploader, a Senior or a Manager can replace this file');
    if(!/pdf/i.test(old.mime||''))fail(400,'Only a PDF can be replaced by a PDF');
    if(FILES_DIR){const p=putDisk(old.filename,buf);await q('UPDATE files SET size=$1,path=$2,data=NULL WHERE id=$3',[buf.length,p,old.id]);if(old.path)try{fs.unlinkSync(path.join(FILES_DIR,old.path))}catch{}}
    else await q('UPDATE files SET size=$1,data=$2,path=NULL WHERE id=$3',[buf.length,buf,old.id]);
    saved={id:old.id,filename:old.filename};if(!caseId&&old.case_id){caseId=old.case_id;docId=old.case_doc_id}
  }else saved=await putFile(req,{clientId,caseId,docId,name});
  if(doc&&b.markDone==='1')await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[doc.id]);
  const pages=Math.max(0,Math.min(999,+b.pages||0)),src=String(b.source||'').slice(0,190),verb=b.mode==='replace'?'replaced':'saved';
  if(caseId)await log(caseId,req.user.id,action==='pdf'?`made "${saved.filename}" from ${+b.images||'some'} image(s)${doc?' for '+doc.name:''}`:`signed ${src?'"'+src+'" and ':''}${verb} "${saved.filename}"${doc?' for '+doc.name:''}`);
  if(action==='sign'){
    const ids=String(b.sigIds||'').split(',').map(x=>+x).filter(Boolean).slice(0,10);
    const used=ids.length?await q('SELECT name FROM user_signatures WHERE id=ANY($1::int[]) AND user_id=$2',[ids,req.user.id]):[];
    await audit(req,'signature.use',`${used.map(x=>x.name).join(', ')||'signature/stamp'} → ${saved.filename}${pages?' ('+pages+' pages)':''}`)}
  else await audit(req,'studio.pdf',`${saved.filename} (${+b.images||0} images)`);
  res.json({id:saved.id,filename:saved.filename,size:buf.length,caseId,caseDocId:docId,clientId})}));
app.post('/api/clients/:id/credentials',allow('vault.manage'),wrap(async(req,res)=>{
  const {label,username,password}=req.body;if(!label||!password)fail(400,'Label and password are required');
  res.json(await one('INSERT INTO credentials(client_id,label,username,secret_enc,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[+req.params.id,label,username||null,enc(password),req.user.id]))}));
app.patch('/api/credentials/:id',allow('vault.manage'),wrap(async(req,res)=>{
  const id=+req.params.id,c=await one('SELECT label FROM credentials WHERE id=$1',[id]);if(!c)fail(404,'Not found');const {label,username,password}=req.body;
  if(label!==undefined){if(!String(label).trim())fail(400,'Label required');await q('UPDATE credentials SET label=$1 WHERE id=$2',[String(label).trim(),id])}
  if(username!==undefined)await q('UPDATE credentials SET username=$1 WHERE id=$2',[String(username).trim()||null,id]);
  if(password)await q('UPDATE credentials SET secret_enc=$1 WHERE id=$2',[enc(password),id]);
  await audit(req,'credential.update',c.label+(password?' (password changed)':''));res.json({ok:1})}));
app.delete('/api/credentials/:id',allow('vault.manage'),wrap(async(req,res)=>{
  const c=await one('SELECT label FROM credentials WHERE id=$1',[+req.params.id]);if(!c)fail(404,'Not found');
  await q('DELETE FROM credentials WHERE id=$1',[+req.params.id]);await audit(req,'credential.delete',c.label);res.json({ok:1})}));
app.post('/api/credentials/:id/reveal',wrap(async(req,res)=>{
  const c=await one('SELECT * FROM credentials WHERE id=$1',[+req.params.id]);if(!c)fail(404,'Not found');
  if(!can(req.user,'vault.manage')&&!await one(`SELECT 1 FROM cases WHERE client_id=$1 AND assignee_id=$2 AND status<>'done'`,[c.client_id,req.user.id]))fail(403,'You can open this only while an open case of this client is assigned to you');
  await q('INSERT INTO credential_access(credential_id,user_id) VALUES($1,$2)',[c.id,req.user.id]);
  res.json({username:c.username,password:dec(c.secret_enc)})}));
// ---- cases
app.post('/api/cases',wrap(async(req,res)=>{
  const {clientId,clientName,caseTypeId,assigneeId,due,options}=req.body;
  let cid=+clientId;if(!cid){const n=String(clientName||'').trim();if(!n)fail(400,'Client required');cid=(await one('INSERT INTO clients(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id',[n])).id}
  const t=await one('SELECT id,name,options FROM case_types WHERE id=$1 AND active',[+caseTypeId]);if(!t)fail(400,'Pick a case type');const pick=chosenDocs(t,options);
  const c=await one(`INSERT INTO cases(code,client_id,case_type_id,assignee_id,due,created_by) VALUES('BR-'||nextval('case_code_seq'),$1,$2,$3,$4,$5) RETURNING id,uid,code`,[cid,t.id,+assigneeId||req.user.id,due||null,req.user.id]);
  await q('UPDATE cases SET options=$1::jsonb WHERE id=$2',[JSON.stringify(pick.chosen),c.id]);
  await q('INSERT INTO case_assignments(case_id,user_id) VALUES($1,$2)',[c.id,+assigneeId||req.user.id]);
  await q('INSERT INTO case_docs(case_id,name) SELECT $1,name FROM case_type_docs WHERE case_type_id=$2 ORDER BY position,id',[c.id,t.id]);
  for(const d of pick.docs)await q('INSERT INTO case_docs(case_id,name,grp) VALUES($1,$2,$3)',[c.id,d.name,d.grp]);
  await log(c.id,req.user.id,`created this case (${t.name}${pick.chosen.length?': '+pick.chosen.map(x=>x.name+(x.actions.length?' ('+x.actions.join(', ')+')':'')).join('; '):''})`);
  const ci=await caseInfo(c.id);if(ci.who&&ci.who!==req.user.id)WA.notify([ci.who],'brela_case_assigned',[ci.code,ci.client,ci.type,ci.due||'not set']);
  res.json(c)}));
app.get('/api/cases/:id',wrap(async(req,res)=>{
  const id=+req.params.id,c=await one(CASE_SQL+' WHERE c.id=$1',[id]);if(!c)fail(404,'Case not found');
  const [docs,files,comments,activity,creds]=await Promise.all([q('SELECT id,name,done,grp FROM case_docs WHERE case_id=$1 ORDER BY id',[id]),q(FILES+' WHERE f.case_id=$1 ORDER BY f.id',[id]),
   q('SELECT * FROM (SELECT m.id,m.body,m.created_at,m.edited_at,m.user_id FROM comments m WHERE m.case_id=$1 ORDER BY m.id DESC LIMIT 10) x ORDER BY id',[id]),q('SELECT text,created_at,user_id FROM activity WHERE case_id=$1 ORDER BY id DESC LIMIT 10',[id]),
   q('SELECT id,label,username FROM credentials WHERE client_id=$1 ORDER BY id',[c.client_id])]);
  docs.forEach(d=>d.files=files.filter(f=>f.case_doc_id===d.id));
  const activity_total=(await one('SELECT count(*)::int AS n FROM activity WHERE case_id=$1',[id])).n,comments_total=(await one('SELECT count(*)::int AS n FROM comments WHERE case_id=$1',[id])).n,steps=await q('SELECT stage,idx FROM case_steps WHERE case_id=$1',[id]),sop=(await one('SELECT sop FROM case_types WHERE id=$1',[c.case_type_id])).sop;
  const copt=await one('SELECT options FROM cases WHERE id=$1',[id]),topt=await one('SELECT options FROM case_types WHERE id=$1',[c.case_type_id]);
  res.json({case:c,docs,comments,comments_total,activity,activity_total,creds,steps,sop,options:copt.options,type_options:topt.options})}));
// Paginated comments of one case: page 1 is the newest; items inside a page are in reading order (oldest first)
app.get('/api/cases/:id/comments',wrap(async(req,res)=>{
  const id=+req.params.id;if(!await one('SELECT 1 FROM cases WHERE id=$1',[id]))fail(404,'Case not found');
  const n0=parseInt(req.query.size),size=n0>0?Math.min(50,n0):10,total=(await one('SELECT count(*)::int AS n FROM comments WHERE case_id=$1',[id])).n,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.max(1,parseInt(req.query.page)||1));
  const items=(await q('SELECT m.id,m.body,m.created_at,m.edited_at,m.user_id FROM comments m WHERE m.case_id=$1 ORDER BY m.id DESC LIMIT $2 OFFSET $3',[id,size,(page-1)*size])).reverse();
  res.json({items,total,page,pages,size})}));
// Paginated history of one case (newest first)
app.get('/api/cases/:id/history',wrap(async(req,res)=>{
  const id=+req.params.id;if(!await one('SELECT 1 FROM cases WHERE id=$1',[id]))fail(404,'Case not found');
  const n0=parseInt(req.query.size),size=n0>0?Math.min(50,n0):10,total=(await one('SELECT count(*)::int AS n FROM activity WHERE case_id=$1',[id])).n,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.max(1,parseInt(req.query.page)||1));
  const items=await q('SELECT text,created_at,user_id FROM activity WHERE case_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3',[id,size,(page-1)*size]);
  res.json({items,total,page,pages,size})}));
app.patch('/api/cases/:id/track',wrap(async(req,res)=>{
  const id=+req.params.id,c=await caseInfo(id);if(!c)fail(404,'Case not found');
  const v=cleanTrack(req.body.track_number);
  if((c.track_number||null)!==v){await q('UPDATE cases SET track_number=$1 WHERE id=$2',[v,id]);await log(id,req.user.id,v?`set the BRELA track number to ${v}`:'cleared the BRELA track number')}
  const duplicates=v?(await q(`SELECT code FROM cases WHERE id<>$1 AND upper(translate(track_number,' ',''))=upper(translate($2,' ',''))`,[id,v])).map(r=>r.code):[];
  res.json({ok:1,track_number:v,duplicates})}));
app.patch('/api/cases/:id',allow('cases.edit','cases.retarget'),wrap(async(req,res)=>{
  const {assigneeId,due,clientId,caseTypeId}=req.body,id=+req.params.id,old=await caseInfo(id);if(!old)fail(404,'Case not found');
  if((clientId||caseTypeId)&&!can(req.user,'cases.retarget'))fail(403,'Only a Manager can change the client or case type');
  if((assigneeId||due!==undefined)&&!can(req.user,'cases.edit'))fail(403,'Your role cannot change the assignee or due date');
  const ch=[];
  if(assigneeId&&+assigneeId!==old.who){await q('UPDATE cases SET assignee_id=$1 WHERE id=$2',[+assigneeId,id]);await q('INSERT INTO case_assignments(case_id,user_id) VALUES($1,$2)',[id,+assigneeId]);ch.push('assignee');if(+assigneeId!==req.user.id)WA.notify([+assigneeId],'brela_case_assigned',[old.code,old.client,old.type,due||old.due||'not set'])}
  if(due!==undefined&&(due||null)!==(old.due||null)){await q('UPDATE cases SET due=$1 WHERE id=$2',[due||null,id]);ch.push('due date')}
  if(clientId&&+clientId!==old.client_id){if(!await one('SELECT 1 FROM clients WHERE id=$1',[+clientId]))fail(400,'Client not found');await q('UPDATE cases SET client_id=$1 WHERE id=$2',[+clientId,id]);ch.push('client');await audit(req,'case.update',`${old.code}: client changed from ${old.client}`)}
  if(caseTypeId&&+caseTypeId!==old.case_type_id){if(!await one('SELECT 1 FROM case_types WHERE id=$1',[+caseTypeId]))fail(400,'Case type not found');await q('UPDATE cases SET case_type_id=$1 WHERE id=$2',[+caseTypeId,id]);ch.push('case type');await audit(req,'case.update',`${old.code}: case type changed from ${old.type}`)}
  if(ch.length)await log(id,req.user.id,'changed '+ch.join(', '));res.json({ok:1})}));
app.delete('/api/cases/:id',allow('cases.delete'),wrap(async(req,res)=>{
  const c=await caseInfo(+req.params.id);if(!c)fail(404,'Case not found');
  await q('DELETE FROM cases WHERE id=$1',[c.id]);await audit(req,'case.delete',`${c.code} · ${c.client} · ${c.type} (${c.status})`);res.json({ok:1})}));
app.post('/api/cases/:id/docs',wrap(async(req,res)=>{
  const n=String(req.body.name||'').trim();if(!n)fail(400,'Name required');
  res.json(await one('INSERT INTO case_docs(case_id,name) VALUES($1,$2) RETURNING id',[+req.params.id,n]))}));
// add another change to an existing case: its checklist is added, nothing already there is touched
app.post('/api/cases/:id/options',wrap(async(req,res)=>{
  const id=+req.params.id,c=await one('SELECT c.id,c.options,t.options AS topts,t.name AS tname FROM cases c JOIN case_types t ON t.id=c.case_type_id WHERE c.id=$1',[id]);if(!c)fail(404,'Case not found');
  const pick=chosenDocs({options:c.topts},req.body.options);const have=await q('SELECT name,grp FROM case_docs WHERE case_id=$1',[id]);
  let added=0;for(const d of pick.docs)if(!have.some(h=>h.name===d.name&&h.grp===d.grp)){await q('INSERT INTO case_docs(case_id,name,grp) VALUES($1,$2,$3)',[id,d.name,d.grp]);added++}
  const cur=[...(c.options||[])];for(const p of pick.chosen){const e=cur.find(x=>x.name===p.name);if(e)e.actions=[...new Set([...(e.actions||[]),...p.actions])];else cur.push(p)}
  await q('UPDATE cases SET options=$1::jsonb WHERE id=$2',[JSON.stringify(cur),id]);
  await log(id,req.user.id,`added to this case: ${pick.chosen.map(x=>x.name+(x.actions.length?' ('+x.actions.join(', ')+')':'')).join('; ')}`);
  res.json({ok:1,added,options:cur})}));
app.patch('/api/case-docs/:id',wrap(async(req,res)=>{const id=+req.params.id;
  if(req.body.name!==undefined){if(!can(req.user,'checklist.edit'))fail(403,'Only a Senior or Manager can rename items');const n=String(req.body.name).trim();if(!n)fail(400,'Name required');await q('UPDATE case_docs SET name=$1 WHERE id=$2',[n,id])}
  if(req.body.done!==undefined)await q('UPDATE case_docs SET done=$1 WHERE id=$2',[!!req.body.done,id]);res.json({ok:1})}));
app.delete('/api/case-docs/:id',allow('checklist.edit'),wrap(async(req,res)=>{await q('DELETE FROM case_docs WHERE id=$1',[+req.params.id]);res.json({ok:1})}));
app.post('/api/case-docs/:id/files',up,wrap(async(req,res)=>{
  const d=await one('SELECT d.id,d.case_id,c.client_id,d.name FROM case_docs d JOIN cases c ON c.id=d.case_id WHERE d.id=$1',[+req.params.id]);if(!d)fail(404,'Not found');
  const f=await putFile(req,{clientId:d.client_id,caseId:d.case_id,docId:d.id});
  await q('UPDATE case_docs SET done=TRUE WHERE id=$1',[d.id]);await log(d.case_id,req.user.id,`uploaded "${f.filename}" for ${d.name}`);res.json(f)}));
app.post('/api/cases/:id/comments',wrap(async(req,res)=>{
  const b=String(req.body.body||'').trim();if(!b)fail(400,'Write something');
  await q('INSERT INTO comments(case_id,user_id,body) VALUES($1,$2,$3)',[+req.params.id,req.user.id,b]);
  const cse=await one('SELECT code,assignee_id,created_by FROM cases WHERE id=$1',[+req.params.id]);
  if(cse){const prev=(await q('SELECT DISTINCT user_id FROM comments WHERE case_id=$1 AND user_id IS NOT NULL',[+req.params.id])).map(x=>x.user_id);
   const to=[...new Set([cse.assignee_id,cse.created_by,...prev])].filter(x=>x&&x!==req.user.id);
   if(to.length)await q('INSERT INTO notifs(user_id,case_id,body) SELECT x,$1,$2 FROM unnest($3::int[]) x',[+req.params.id,`${req.user.name} commented on ${cse.code}: ${b.slice(0,80)}`,to])}
  res.json({ok:1})}));
app.patch('/api/comments/:id',wrap(async(req,res)=>{
  const m=await one('SELECT user_id FROM comments WHERE id=$1',[+req.params.id]);if(!m)fail(404,'Not found');if(m.user_id!==req.user.id)fail(403,'You can edit only your own comments');
  const b=String(req.body.body||'').trim();if(!b)fail(400,'Write something');await q('UPDATE comments SET body=$1,edited_at=now() WHERE id=$2',[b,+req.params.id]);res.json({ok:1})}));
app.delete('/api/comments/:id',wrap(async(req,res)=>{
  const m=await one('SELECT m.user_id,m.body,c.code FROM comments m JOIN cases c ON c.id=m.case_id WHERE m.id=$1',[+req.params.id]);if(!m)fail(404,'Not found');
  if(m.user_id!==req.user.id&&!can(req.user,'comments.delete'))fail(403,'You can delete only your own comments');
  await q('DELETE FROM comments WHERE id=$1',[+req.params.id]);if(m.user_id!==req.user.id)await audit(req,'comment.delete',`${m.code}: "${m.body.slice(0,80)}"`);res.json({ok:1})}));
app.get('/api/audit',allow('audit.view'),wrap(async(req,res)=>{
  const n0=parseInt(req.query.size),size=n0>0?Math.min(100,n0):20,total=(await one('SELECT count(*)::int AS n FROM audit_log')).n,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.max(1,parseInt(req.query.page)||1));
  const items=await q('SELECT created_at,actor_name,action,details FROM audit_log ORDER BY id DESC LIMIT $1 OFFSET $2',[size,(page-1)*size]);
  res.json({items,total,page,pages,size})}));
// Paginated dashboard activity (newest first)
app.get('/api/activity',wrap(async(req,res)=>{
  const n0=parseInt(req.query.size),size=n0>0?Math.min(50,n0):5,total=(await one('SELECT count(*)::int AS n FROM activity')).n,pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.max(1,parseInt(req.query.page)||1));
  const items=await q('SELECT a.text,a.created_at,a.user_id,a.case_id,c.code FROM activity a JOIN cases c ON c.id=a.case_id ORDER BY a.id DESC LIMIT $1 OFFSET $2',[size,(page-1)*size]);
  res.json({items,total,page,pages,size})}));
app.post('/api/cases/:id/move',wrap(async(req,res)=>{
  const id=+req.params.id,to=req.body.to,reason=String(req.body.reason||'').trim(),c=await one('SELECT * FROM cases WHERE id=$1',[id]);
  if(!c)fail(404,'Case not found');if(!STAGES.includes(to))fail(400,'Bad stage');if(to===c.status)return res.json({ok:1});
  const senior=can(req.user,'cases.submit');
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
app.get('/api/playbook',wrap(async(req,res)=>res.json({roles:await q(`SELECT key AS role,name,level,permissions,team_queue,summary,duties FROM roles ORDER BY CASE level WHEN 'MANAGER' THEN 0 WHEN 'SENIOR' THEN 1 ELSE 2 END,name`),stages:await q('SELECT stage,owner_roles,steps,done_when FROM stage_playbook')})));
app.put('/api/playbook/roles/:role',allow('playbook.edit'),wrap(async(req,res)=>{
  if(!await roleExists(req.params.role))fail(400,'Unknown role');
  await q('UPDATE roles SET summary=$2,duties=$3::jsonb WHERE key=$1',[req.params.role,String(req.body.summary||'').trim(),JSON.stringify(strs(req.body.duties))]);res.json({ok:1})}));
app.put('/api/playbook/stages/:stage',allow('playbook.edit'),wrap(async(req,res)=>{
  if(!STAGES.includes(req.params.stage))fail(400,'Unknown stage');
  const validRoles=(await q('SELECT key FROM roles')).map(r=>r.key);
  await q(`INSERT INTO stage_playbook(stage,owner_roles,steps,done_when) VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT(stage) DO UPDATE SET owner_roles=EXCLUDED.owner_roles,steps=EXCLUDED.steps,done_when=EXCLUDED.done_when`,
   [req.params.stage,JSON.stringify(strs(req.body.owner_roles).filter(r=>validRoles.includes(r))),JSON.stringify(strs(req.body.steps)),String(req.body.done_when||'').trim()]);res.json({ok:1})}));
const roleKey=n=>String(n).trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,30);
// what a role can do: tick boxes (permissions); sending only a starting `level` ticks that preset
const rolePerms=(b,old)=>b.permissions!==undefined?P.clean(b.permissions):b.level!==undefined?P.preset(b.level):old;
const goodLevel=l=>l===undefined||LEVELS.includes(l);
app.get('/api/permissions',(req,res)=>res.json({groups:P.GROUPS,presets:Object.fromEntries(LEVELS.map(l=>[l,P.preset(l)]))}));
app.post('/api/roles',allow('roles.manage'),wrap(async(req,res)=>{
  const name=String(req.body.name||'').trim(),key=roleKey(name);
  if(name.length<2||name.length>40)fail(400,'Role name must be 2 to 40 characters');if(!key)fail(400,'Use letters or numbers in the role name');
  if(!goodLevel(req.body.level)||(req.body.level===undefined&&req.body.permissions===undefined))fail(400,'Choose an access level');
  if(await one('SELECT 1 FROM roles WHERE lower(name)=lower($1) OR key=$2',[name,key]))fail(400,'A role with this name already exists');
  const perms=rolePerms(req.body,[]);
  if(!within(req.user,perms))fail(403,'You can only give a role the permissions you have yourself');
  await q('INSERT INTO roles(key,name,level,permissions,team_queue,summary,duties) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb)',[key,name,P.levelOf(perms),JSON.stringify(perms),!!req.body.team_queue,String(req.body.summary||'').trim(),JSON.stringify(strs(req.body.duties))]);
  await audit(req,'role.create',`${name}: ${perms.length} permission${perms.length===1?'':'s'}`);res.json({key})}));
app.put('/api/roles/:key',allow('roles.manage'),wrap(async(req,res)=>{
  const k=req.params.key,r=await one('SELECT * FROM roles WHERE key=$1',[k]);if(!r)fail(404,'Role not found');
  const b=req.body,name=b.name!==undefined?String(b.name).trim():r.name;
  if(name.length<2||name.length>40)fail(400,'Role name must be 2 to 40 characters');if(!goodLevel(b.level))fail(400,'Choose an access level');
  if(await one('SELECT 1 FROM roles WHERE lower(name)=lower($1) AND key<>$2',[name,k]))fail(400,'A role with this name already exists');
  const old=P.clean(r.permissions||P.preset(r.level)),perms=rolePerms(b,old);
  if(!within(req.user,old)||!within(req.user,perms))fail(403,'You can only change a role that has permissions you have yourself, and give only permissions you have yourself');
  if(old.includes('roles.manage')&&!perms.includes('roles.manage')&&!(await one(`SELECT 1 FROM users u JOIN roles x ON x.key=u.role WHERE u.active AND x.permissions @> '["roles.manage"]'::jsonb AND x.key<>$1 LIMIT 1`,[k])))fail(400,'At least one active Manager must remain');
  await q('UPDATE roles SET name=$2,level=$3,permissions=$4::jsonb,team_queue=$5,summary=$6,duties=$7::jsonb WHERE key=$1',[k,name,P.levelOf(perms),JSON.stringify(perms),b.team_queue!==undefined?!!b.team_queue:r.team_queue,b.summary!==undefined?String(b.summary).trim():r.summary,JSON.stringify(b.duties!==undefined?strs(b.duties):r.duties)]);
  const added=perms.filter(x=>!old.includes(x)),removed=old.filter(x=>!perms.includes(x));
  if(name!==r.name||added.length||removed.length)await audit(req,'role.update',`${r.name}${name!==r.name?' → '+name:''}${added.length?`: allowed ${added.join(', ')}`:''}${removed.length?`${added.length?';':':'} no longer ${removed.join(', ')}`:''}`);res.json({ok:1})}));
app.delete('/api/roles/:key',allow('roles.manage'),wrap(async(req,res)=>{
  const k=req.params.key,r=await one('SELECT * FROM roles WHERE key=$1',[k]);if(!r)fail(404,'Role not found');
  if(!within(req.user,P.clean(r.permissions)))fail(403,'You can only delete a role whose permissions you have yourself');
  const n=(await one('SELECT count(*)::int AS n FROM users WHERE role=$1',[k])).n;if(n)fail(400,`${n} ${n===1?'person has':'people have'} this role. Move them to another role first.`);
  if((r.permissions||[]).includes('roles.manage')&&!(await one(`SELECT 1 FROM roles WHERE permissions @> '["roles.manage"]'::jsonb AND key<>$1`,[k])))fail(400,'Keep at least one Manager-level role');
  await q('DELETE FROM roles WHERE key=$1',[k]);await q('UPDATE stage_playbook SET owner_roles=owner_roles - $1::text',[k]);
  await audit(req,'role.delete',r.name);res.json({ok:1})}));
app.post('/api/cases/:id/steps',wrap(async(req,res)=>{
  const {stage,idx,done}=req.body;if(!STAGES.includes(stage)||!Number.isInteger(idx)||idx<0||idx>29)fail(400,'Bad step');
  if(done)await q('INSERT INTO case_steps(case_id,stage,idx,by_user) VALUES($1,$2,$3,$4) ON CONFLICT(case_id,stage,idx) DO UPDATE SET by_user=EXCLUDED.by_user,at=now()',[+req.params.id,stage,idx,req.user.id]);
  else await q('DELETE FROM case_steps WHERE case_id=$1 AND stage=$2 AND idx=$3',[+req.params.id,stage,idx]);res.json({ok:1})}));
app.post('/api/me/seen-guide',wrap(async(req,res)=>{await q('UPDATE users SET seen_guide=TRUE WHERE id=$1',[req.user.id]);res.json({ok:1})}));
// ---- monthly report (Manager). Months are counted in East Africa Time.
const LOC=c=>`(${c} AT TIME ZONE 'Africa/Dar_es_Salaam')::date`,INR=c=>`${LOC(c)} >= $1::date AND ${LOC(c)} < ($1::date + interval '1 month')`;
const monthCounts=async s=>({received:(await one(`SELECT count(*)::int n FROM cases WHERE ${INR('created_at')}`,[s])).n,completed:(await one(`SELECT count(*)::int n FROM cases WHERE ${INR('completed_at')}`,[s])).n,
  submitted:(await one(`SELECT count(*)::int n FROM cases WHERE ${INR('submitted_at')}`,[s])).n,returns:(await one(`SELECT count(*)::int n FROM activity WHERE text LIKE 'marked as returned%' AND ${INR('created_at')}`,[s])).n});
app.get('/api/reports/monthly',allow('reports.view'),wrap(async(req,res)=>{
  let m=String(req.query.month||'');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))m=new Date(Date.now()+3*3600e3).toISOString().slice(0,7);
  const s=m+'-01',prevS=(await one(`SELECT to_char($1::date - interval '1 month','YYYY-MM-DD') d`,[s])).d;
  const base=`SELECT c.id,c.code,c.track_number,c.rounds,c.assignee_id AS who,cl.name AS client,t.name AS type,cl.id AS client_id`;
  const from=` FROM cases c JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id`;
  const [recv,done,rets,open,users,sub,prev,performance]=await Promise.all([
   q(base+from+` WHERE ${INR('c.created_at')}`,[s]),
   q(base+`,c.created_at::date::text AS created,${LOC('c.completed_at')}::text AS completed,extract(epoch FROM (c.completed_at-c.created_at))/86400 AS days`+from+` WHERE ${INR('c.completed_at')} ORDER BY c.completed_at`,[s]),
   q(`SELECT a.created_at,c.code,c.assignee_id AS who,cl.name AS client,t.name AS type,a.text FROM activity a JOIN cases c ON c.id=a.case_id JOIN clients cl ON cl.id=c.client_id JOIN case_types t ON t.id=c.case_type_id WHERE a.text LIKE 'marked as returned%' AND ${INR('a.created_at')} ORDER BY a.created_at`,[s]),
   q(`SELECT c.assignee_id AS who,c.due<(now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date AS late FROM cases c WHERE c.status<>'done'`),
   q('SELECT id,name,role,active FROM users ORDER BY id'),
   one(`SELECT count(*)::int n FROM cases WHERE ${INR('submitted_at')}`,[s]),monthCounts(prevS),
   q(`SELECT u.id,u.name,u.role,count(DISTINCT a.case_id)::int AS assigned,
      count(DISTINCT a.case_id) FILTER (WHERE EXISTS (
        SELECT 1 FROM activity done_event
        WHERE done_event.case_id=a.case_id
        AND done_event.text LIKE 'moved % → done'
        AND ${INR('done_event.created_at')}
        AND done_event.created_at>=a.assigned_at
        AND NOT EXISTS (
          SELECT 1 FROM case_assignments later
          WHERE later.case_id=a.case_id
          AND (later.assigned_at>a.assigned_at OR (later.assigned_at=a.assigned_at AND later.id>a.id))
          AND later.assigned_at<=done_event.created_at
        )
      ))::int AS completed
      FROM users u
      LEFT JOIN case_assignments a ON a.user_id=u.id AND ${INR('a.assigned_at')}
      WHERE u.active OR a.id IS NOT NULL
      GROUP BY u.id ORDER BY u.id`,[s])]);
  const cnt=(arr,f)=>arr.filter(f).length,avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10:null;
  const days=done.map(d=>+d.days),reason=t=>t.replace(/^marked as returned by BRELA \(round \d+\):\s*/,'');
  const byType=[...new Set([...recv,...done,...rets].map(r=>r.type))].sort().map(t=>({type:t,received:cnt(recv,r=>r.type===t),completed:cnt(done,r=>r.type===t),returns:cnt(rets,r=>r.type===t),avgDays:avg(done.filter(r=>r.type===t).map(r=>+r.days))}));
  const byPerson=users.filter(u=>u.active||recv.some(r=>r.who===u.id)||done.some(r=>r.who===u.id)).map(u=>({name:u.name,role:u.role,received:cnt(recv,r=>r.who===u.id),completed:cnt(done,r=>r.who===u.id),returns:cnt(rets,r=>r.who===u.id),openNow:cnt(open,r=>r.who===u.id),overdueNow:cnt(open,r=>r.who===u.id&&r.late)}));
  const byClient=[...new Set([...recv,...done].map(r=>r.client))].map(c=>({client:c,received:cnt(recv,r=>r.client===c),completed:cnt(done,r=>r.client===c)})).sort((a,b)=>b.received+b.completed-a.received-a.completed).slice(0,10);
  res.json({month:m,summary:{received:recv.length,completed:done.length,submitted:sub.n,returns:rets.length,avgDays:avg(days),firstTimeRate:done.length?Math.round(cnt(done,d=>d.rounds===0)/done.length*100):null,openNow:open.length,overdueNow:cnt(open,o=>o.late)},
   prev,byType,byPerson,teamPerformance:performance.map(p=>({id:p.id,name:p.name,role:p.role,assigned:p.assigned,completed:p.completed,rate:p.assigned?Math.round(p.completed/p.assigned*1000)/10:0})),byClient,completed:done.map(d=>({id:d.id,code:d.code,track:d.track_number,client:d.client,type:d.type,who:d.who,created:d.created,completed:d.completed,days:Math.round(+d.days*10)/10,rounds:d.rounds})),
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
app.get('/api/whatsapp/status',allow('whatsapp.manage'),wrap(async(req,res)=>res.json({configured:WA.configured(),webhookReady:WA.webhookReady(),webhookPath:'/webhooks/whatsapp',templates:WA.TEMPLATES,
  log:await q('SELECT l.created_at,l.template,l.ok,l.error,l.to_phone,u.name FROM wa_log l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 10')})));
app.post('/api/whatsapp/test',allow('whatsapp.manage'),wrap(async(req,res)=>{
  const u=await one('SELECT phone FROM users WHERE id=$1',[req.user.id]);const to=WA.norm(u&&u.phone);if(!to)fail(400,'Add your phone number in Settings → Team first');
  const r=await WA.sendTemplate(to,'hello_world',[],req.user.id,'en_US');if(!r.ok)fail(400,r.error||'Send failed');res.json({ok:1})}));
app.post('/api/whatsapp/digest-now',allow('whatsapp.manage'),wrap(async(req,res)=>res.json({people:await WA.runDigest(true)})));
// ---- static + boot
require('./ai-routes')(app,{q,one,wrap,fail,need:allow,can,P,audit,caseInfo,log,up,AI,E});
require('./help-centre')(app,{wrap,fail,q,one,WA});
// ---- static files, safe across deploys (Railway sits behind a proxy/CDN)
// HTML is never cached and links to CSS/JS carry the build id (?v=...), so a new deploy can never be paired with old styles or scripts.
const PUB=path.join(__dirname,'public'),VER=String(process.env.RAILWAY_GIT_COMMIT_SHA||process.env.SOURCE_COMMIT||process.env.GIT_SHA||Date.now().toString(36)).slice(0,12);
const stamp=h=>h.replace(/((?:href|src)=")(assets\/[^"?]+\.(?:css|js))(")/g,`$1$2?v=${VER}$3`);
app.get('/version',(req,res)=>res.json({version:VER}));
app.get(/^\/(?:([\w-]+)\.html)?$/,(req,res,next)=>{
  const f=path.join(PUB,(req.params[0]||'index')+'.html');if(!fs.existsSync(f))return next();
  res.set({'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'}).send(stamp(fs.readFileSync(f,'utf8')))});
app.use('/assets',(req,res,next)=>{if(req.query.v&&/\.(css|js)$/.test(req.path))res.set('Cache-Control','public, max-age=31536000, immutable');next()});
app.use(express.static(PUB,{index:false,cacheControl:false,setHeaders:(res,fp)=>{if(!res.getHeader('Cache-Control'))res.setHeader('Cache-Control',/\.(css|js|html)$/.test(fp)?'no-cache':'public, max-age=604800')}}));
app.use((req,res)=>res.status(404).type('text/plain').send('Not found'));
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
 submitted:[['SENIOR'],['Submit the application on the client\'s BRELA account (the vault has the login)','Enter the BRELA track number in the Track number field at the top of the case','Check the BRELA status regularly','When BRELA answers, record it here: approved, or returned with the reason'],'BRELA has approved or returned the application.'],
 returned:[['SENIOR','JUNIOR'],['Read BRELA\'s correction request carefully','Decide what must change and who will fix it','Fix the documents or details and upload the new versions','Comment on what was changed','Press "Corrections done" to send it back for review'],'All corrections are fixed and uploaded.'],
 done:[['MANAGER'],['Check BRELA\'s approval documents are uploaded to the case','Send the final report and documents to the client','Confirm in the comments that the client received them','Remind the client of the next deadline (for example the annual return)'],'The client has their documents.']};
const STARTER={'Business Name Registration':['Client ID / passport copy','Passport photo','Proposed business names (2-3)','Signed client authorization','Proof of address'],
 'Company Incorporation':['Directors & shareholders ID / passport copies','Passport photos','Proposed company names','MEMARTS (Memorandum & Articles)','Registered office address proof','Signed client authorization'],
 'Annual Return':['Previous annual return / certificate','Financial statements','Shareholders & directors details','Signed client authorization'],
 'Change of Directors':['New director ID / passport copy','Resignation letter (if any)','Board / shareholders resolution','Signed client authorization'],
 'Beneficial Ownership Update':['Beneficial owners ID / passport copies','Ownership structure / percentages','Signed client authorization']};
// Starter choices for "Change of Particulars" (editable in Settings: the team adjusts them to how BRELA is asking today)
const PARTICULARS_DOCS=['Signed client authorization','Copy of the Certificate of Incorporation'];
const PARTICULARS_OPTIONS=[
 {name:'Company name',docs:['Proposed new company names (2-3)','Members\' special resolution approving the change of name','Notice of change of name'],actions:[]},
 {name:'Registered office',docs:['Resolution approving the new registered office','Proof of the new address (lease, utility bill)','Notice of change of registered office'],actions:[]},
 {name:'Objects',docs:['Members\' special resolution altering the objects','Amended objects clause or Memorandum'],actions:[]},
 {name:'Share capital',docs:['Members\' resolution changing the share capital','Notice of change of share capital','Amended Memorandum and Articles (if the capital clause changes)'],actions:[]},
 {name:'Share distribution',docs:['Directors\' resolution (allotment or transfer of shares)','Form 57a - Return of allotment of shares (for new shares)','Share transfer form signed by both sides (for a transfer)','ID / passport copies of the new shareholders','Updated register of members'],actions:[]},
 {name:'Directors',docs:[],actions:[
  {name:'Add',docs:['Form 213a - Appointment of director','ID / passport copy of the new director','Signed consent to act as director','Members\' resolution appointing the director']},
  {name:'Remove',docs:['Form 213b - Termination of appointment','Resignation letter or removal resolution','Directors\' or members\' resolution accepting it']},
  {name:'Update details',docs:['Proof of the changed details (new ID, address or name)','Written notice of the change signed by the director']}]},
 {name:'Secretary',docs:[],actions:[
  {name:'Add',docs:['Form 213a - Appointment of secretary','ID / passport copy of the new secretary','Signed consent to act as secretary','Directors\' resolution appointing the secretary']},
  {name:'Remove',docs:['Form 213b - Termination of appointment','Resignation letter or removal resolution','Directors\' resolution accepting it']},
  {name:'Update details',docs:['Proof of the changed details (new ID, address or name)','Written notice of the change signed by the secretary']}]}];
async function init(){
  await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));
  await q('DELETE FROM lock_screen_content WHERE day<$1',[eastAfricaDay()]);
  // retention: system logs are trimmed on boot (case history/activity is kept in full)
  const RET=Math.max(30,+process.env.RETENTION_DAYS||730),cut=new Date(Date.now()-RET*864e5);
  for(const t of ['audit_log','wa_log','wa_messages','notifs']){const r=await pool.query(`DELETE FROM ${t} WHERE created_at<$1`,[cut]);if(r.rowCount)console.log(`Trimmed ${r.rowCount} old row(s) from ${t}`)}
  try{await WA.escalate()}catch(e){console.error('escalate',e.message)}
  if(FILES_DIR){
    const rows=await q('SELECT id,filename,data FROM files WHERE path IS NULL AND data IS NOT NULL');
    for(const r of rows){const p=putDisk(r.filename,r.data);await q('UPDATE files SET path=$1,data=NULL WHERE id=$2',[p,r.id])}
    if(rows.length)console.log('Moved '+rows.length+' file(s) from the database to '+FILES_DIR)}
  if(!(await one('SELECT 1 FROM roles LIMIT 1'))){
    const old=Object.fromEntries((await q('SELECT role,summary,duties FROM role_playbook').catch(()=>[])).map(r=>[r.role,r])),META={MANAGER:['Manager','MANAGER',true],SENIOR:['Senior','SENIOR',true],JUNIOR:['Junior','STAFF',false],SECRETARY:['Secretary','STAFF',true],ASSOCIATE:['Associate','STAFF',false]};
    for(const [k,[sum,d]] of Object.entries(DEFAULT_ROLES)){const o=old[k],m=META[k];await q('INSERT INTO roles(key,name,level,permissions,team_queue,summary,duties) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7::jsonb)',[k,m[0],m[1],JSON.stringify(P.preset(m[1])),m[2],o?o.summary:sum,JSON.stringify(o?o.duties:d)])}}
  // roles made before permissions existed start with their level's preset, so nobody gains or loses access; the old "who can use the AI" setting becomes the AI permission
  {const minLv=(await AI.getSettings()).min_level,rank=l=>LEVELS.length-1-LEVELS.indexOf(l);
   for(const r of await q('SELECT key,level FROM roles WHERE permissions IS NULL')){const p=P.preset(r.level).filter(k=>k!=='ai.use');if(rank(r.level)>=rank(minLv))p.push('ai.use');await q('UPDATE roles SET permissions=$2::jsonb WHERE key=$1',[r.key,JSON.stringify(p)])}}
  // the reference library permission is new: roles that can manage roles get it once (after that it is theirs to untick)
  if(!(await one(`SELECT 1 FROM audit_log WHERE action='system.migrate' AND details='reference.manage'`))){
   await q(`UPDATE roles SET permissions=permissions||'["reference.manage"]'::jsonb WHERE permissions @> '["roles.manage"]'::jsonb AND NOT permissions @> '["reference.manage"]'::jsonb`);
   await q(`INSERT INTO audit_log(actor_name,action,details) VALUES('system','system.migrate','reference.manage')`)}
  if(!(await one('SELECT 1 FROM users LIMIT 1'))){
    const pw=process.env.ADMIN_PASSWORD||crypto.randomBytes(6).toString('base64url'),email=(process.env.ADMIN_EMAIL||'admin@example.com').toLowerCase();
    await q('INSERT INTO users(name,email,role,password_hash) VALUES($1,$2,$3,$4)',[process.env.ADMIN_NAME||'Manager',email,'MANAGER',await bcrypt.hash(pw,10)]);
    console.log(`First Manager created: ${email}${process.env.ADMIN_PASSWORD?'':' / temporary password: '+pw}`)}
  if(!(await one('SELECT 1 FROM stage_playbook LIMIT 1')))for(const [st,[o,steps,dw]] of Object.entries(DEFAULT_STAGES))await q('INSERT INTO stage_playbook(stage,owner_roles,steps,done_when) VALUES($1,$2::jsonb,$3::jsonb,$4)',[st,JSON.stringify(o),JSON.stringify(steps),dw]);
  if(!(await one('SELECT 1 FROM case_types LIMIT 1')))for(const [n,d] of Object.entries(STARTER)){const t=await one('INSERT INTO case_types(name) VALUES($1) RETURNING id',[n]);await saveDocs(t.id,d)}
  // once: give "Change of Particulars" its starter choices (created on a fresh install; an existing one of that name only gets choices if it has none)
  if(!(await one("SELECT 1 FROM kv WHERE key='particulars_options_seeded'"))){
   const ex=await one("SELECT id,options FROM case_types WHERE name ILIKE 'change of particulars%' ORDER BY id LIMIT 1");
   if(ex){if(!(ex.options||[]).length)await q('UPDATE case_types SET options=$1::jsonb WHERE id=$2',[JSON.stringify(PARTICULARS_OPTIONS),ex.id])}
   else if(!(await one('SELECT 1 FROM cases LIMIT 1'))){const t=await one('INSERT INTO case_types(name,options) VALUES($1,$2::jsonb) RETURNING id',['Change of Particulars',JSON.stringify(PARTICULARS_OPTIONS)]);await saveDocs(t.id,PARTICULARS_DOCS)}
   await q("INSERT INTO kv(key,value) VALUES('particulars_options_seeded','1') ON CONFLICT DO NOTHING")}
  WA.startScheduler();
  if(lockScreenConfigured()&&process.env.NODE_ENV!=='test'){
    const refresh=()=>getLockScreenContent().catch(e=>console.error('lock-screen content refresh failed:',e.message));
    refresh();setInterval(refresh,60*1000).unref();
  }
  app.listen(process.env.PORT||3000,()=>console.log('BRELA Desk running on port '+(process.env.PORT||3000)))}
init().catch(e=>{console.error(e);process.exit(1)});
