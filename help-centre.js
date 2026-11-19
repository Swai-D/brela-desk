// Help centre: Markdown guides in help/{category}/{slug}.md with a small front-matter block (title, summary, keywords, order, role).
// Read once at start, searched in memory, turned into safe HTML (raw HTML in the files is escaped).
const fs=require('fs'),path=require('path'),DIR=path.join(__dirname,'help');
const CATEGORIES=[
 ['getting-started','Getting started','bx-rocket','Sign in, find your way and learn how a case flows'],
 ['daily-work','Daily work','bx-task','Dashboard, My Work, Case Board, Playbook, search and reports'],
 ['clients','Clients and company data','bx-buildings','Clients, people, the BRELA registry import and the vault'],
 ['cases','Cases','bx-folder-open','Create a case, work the checklist and move it through the stages'],
 ['documents','Documents and wizards','bx-bolt-circle','Prepare documents in one click, every wizard, templates and AI'],
 ['studio','Doc Studio','bx-edit-alt','Edit, sign and export documents'],
 ['whatsapp','WhatsApp','bxl-whatsapp','Incoming documents, alerts and the daily digest'],
 ['settings','Settings (Manager)','bx-cog','Team, roles, case types, wizards, AI and the audit log'],
 ['account','Your account','bx-user-circle','Profile, password, signatures, notifications and the lock screen'],
 ['help','Problems, answers and words','bx-support','Fixes, common questions and a glossary']];
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const slug=s=>String(s).toLowerCase().replace(/<[^>]+>/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'section';
const inline=s=>{let h=esc(s);
 h=h.replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/(^|[^*])\*([^*\s][^*]*)\*/g,'$1<em>$2</em>');
 h=h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,(m,t,u)=>/^help:[a-z0-9-]+\/[a-z0-9-]+$/.test(u)?`<a href="help.html#${u.slice(5)}">${t}</a>`:/^(https?:\/\/|[a-z0-9-]+\.html(\?[^"]*)?(#[^"]*)?$)/.test(u)?`<a href="${u}"${/^http/.test(u)?' target="_blank" rel="noopener"':''}>${t}</a>`:t);
 return h};
// small Markdown: ## / ### headings, paragraphs, - and 1. lists, > tips, | tables |, ---
const render=md=>{const L=md.replace(/\r/g,'').split('\n'),out=[],toc=[];let i=0;
 while(i<L.length){const l=L[i];
  if(!l.trim()){i++;continue}
  let m;
  if((m=l.match(/^(#{2,3})\s+(.+)$/))){const t=m[2].trim();if(m[1]==='##'){const id=slug(t);toc.push({id,title:t});out.push(`<h2 id="${id}">${inline(t)}</h2>`)}else out.push(`<h3>${inline(t)}</h3>`);i++;continue}
  if(/^---+$/.test(l.trim())){out.push('<hr>');i++;continue}
  if(/^>/.test(l)){const b=[];while(i<L.length&&/^>/.test(L[i]))b.push(L[i++].replace(/^>\s?/,''));out.push(`<div class="hc-tip">${inline(b.join(' '))}</div>`);continue}
  if(/^\|/.test(l)&&/^\|[\s:|-]+\|?\s*$/.test(L[i+1]||'')){const row=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(x=>x.trim()),h=row(l);i+=2;const rows=[];while(i<L.length&&/^\|/.test(L[i]))rows.push(row(L[i++]));
   out.push(`<div class="table-responsive"><table class="table table-sm"><thead><tr>${h.map(x=>`<th>${inline(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${inline(x)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);continue}
  if(/^\s*([-*]|\d+\.)\s+/.test(l)){const ord=/^\s*\d+\./.test(l),it=[];while(i<L.length&&/^\s*([-*]|\d+\.)\s+/.test(L[i]))it.push(L[i++].replace(/^\s*([-*]|\d+\.)\s+/,''));out.push(`<${ord?'ol':'ul'}>${it.map(x=>`<li>${inline(x)}</li>`).join('')}</${ord?'ol':'ul'}>`);continue}
  const p=[];while(i<L.length&&L[i].trim()&&!/^(#{2,3}\s|>|\||---+$|\s*([-*]|\d+\.)\s)/.test(L[i]))p.push(L[i++]);out.push(`<p>${inline(p.join(' '))}</p>`)}
 return{html:out.join('\n'),toc}};
let cache=null;
const load=()=>{if(cache&&process.env.NODE_ENV!=='development')return cache;const all=[];
 for(const [cat] of CATEGORIES){const d=path.join(DIR,cat);if(!fs.existsSync(d))continue;
  for(const f of fs.readdirSync(d).filter(x=>/^[a-z0-9-]+\.md$/.test(x))){
   const raw=fs.readFileSync(path.join(d,f),'utf8'),m=raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/),meta={};
   if(m)for(const ln of m[1].split('\n')){const k=ln.match(/^(\w+):\s*(.*)$/);if(k)meta[k[1]]=k[2].trim()}
   const body=m?m[2]:raw;all.push({category:cat,slug:f.slice(0,-3),title:meta.title||f.slice(0,-3),summary:meta.summary||'',keywords:meta.keywords||'',order:+meta.order||99,role:(meta.role||'').toUpperCase(),body})}}
 all.sort((a,b)=>CATEGORIES.findIndex(c=>c[0]===a.category)-CATEGORIES.findIndex(c=>c[0]===b.category)||a.order-b.order||a.title.localeCompare(b.title));
 return cache=all};
const brief=a=>({category:a.category,slug:a.slug,title:a.title,summary:a.summary,role:a.role});
const STOP=new Set('a an the to of in on for and or is are was be do does did how what why where when can i my me we you it its with not no cannot cant dont from at by this that working work works problem issue'.split(' '));
const search=term=>{const q0=String(term||'').toLowerCase();let words=String(term||'').toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean);const real=words.filter(w=>!STOP.has(w));if(real.length)words=real;words=words.slice(0,8);if(!words.length)return[];const need=Math.ceil(words.length/2),hits=[];
 for(const a of load()){const t=a.title.toLowerCase(),k=a.keywords.toLowerCase(),s=a.summary.toLowerCase(),b=a.body.toLowerCase();let score=0,n=0;for(const ph of a.keywords.toLowerCase().split(','))if(ph.trim().length>=4&&q0.includes(ph.trim()))score+=15;
  for(const w of words){const x=(t.includes(w)?10:0)+(k.includes(w)?6:0)+(s.includes(w)?3:0)+(b.includes(w)?1:0);if(x){n++;score+=x}}
  if(n<need)continue;const w0=words.find(w=>b.includes(w)),i=w0?b.indexOf(w0):-1,flat=a.body.replace(/[#*|>`\n]+/g,' ').replace(/\s+/g,' ').trim(),pos=i<0?0:Math.max(0,flat.toLowerCase().indexOf(w0)-60);
  hits.push({n,score:score+n*20,...brief(a),snippet:i<0?a.summary:(pos>0?'… ':'')+flat.slice(pos,pos+180)})}
 return hits.sort((x,y)=>y.n-x.n||y.score-x.score).slice(0,30).map(({n,score,...r})=>r)};
// ---- getting-started checklist on the Dashboard: steps are worked out from the data, so they tick themselves
const STEPS=[
 {key:'profile',title:'Add your phone number to your profile',hint:'So WhatsApp alerts and the morning digest reach you.',href:'profile.html',guide:'account/profile',level:'STAFF'},
 {key:'playbook',title:'Read the Playbook for your role',hint:'Your responsibilities and how a case flows.',href:'playbook.html',guide:'daily-work/playbook',level:'STAFF'},
 {key:'templates',title:'Import the official Word templates',hint:'The wizards fill these forms; do it once.',href:'templates.html',guide:'documents/import-official-templates',level:'SENIOR'},
 {key:'client',title:'Add your first client',hint:'A company or person you work for.',href:'clients.html',guide:'clients/add-a-client',level:'STAFF'},
 {key:'company',title:'Import a company from BRELA',hint:'Paste the Company Details page and the people and activities are saved.',href:'clients.html',guide:'clients/import-from-brela',level:'STAFF'},
 {key:'case',title:'Create your first case',hint:'Choose the client and what is changing.',href:'cases-board.html',guide:'cases/create-a-case',level:'STAFF'},
 {key:'wizard',title:'Prepare documents with a wizard',hint:'Answer a few questions and the forms are filled.',href:'cases-board.html',guide:'documents/prepare-documents',level:'STAFF'},
 {key:'team',title:'Add your team members',hint:'Create their logins and choose their roles.',href:'settings.html#team',guide:'settings/team-and-roles',level:'MANAGER'},
 {key:'whatsapp',title:'Connect WhatsApp (optional)',hint:'Receive client documents and send alerts.',href:'settings.html#wa',guide:'whatsapp/whatsapp-setup',level:'MANAGER'},
 {key:'ai',title:'Set up the AI assistant (optional)',hint:'Only for Smart fill and drafting templates; the wizards do not need it.',href:'settings.html#ai',guide:'settings/ai-settings',level:'MANAGER'}];
const RANK={STAFF:0,SENIOR:1,MANAGER:2};
module.exports=(app,{wrap,fail,q,one,WA})=>{
 const done=async u=>{const n=async sql=>(await one(sql)).n,AIr=await one('SELECT keys FROM ai_settings WHERE id=1').catch(()=>null),AIok=!!(AIr&&AIr.keys&&Object.values(AIr.keys).some(Boolean));
  const me=await one('SELECT phone,seen_guide,checklist_hidden FROM users WHERE id=$1',[u.id]);
  return{hidden:!!me.checklist_hidden,done:{
   profile:!!(me.phone&&String(me.phone).trim()),playbook:!!me.seen_guide,
   templates:await n("SELECT count(*)::int AS n FROM templates WHERE docx_data IS NOT NULL")>0,
   client:await n('SELECT count(*)::int AS n FROM clients')>0,
   company:await n('SELECT count(*)::int AS n FROM client_people')>0,
   case:await n('SELECT count(*)::int AS n FROM cases')>0,
   wizard:await n("SELECT count(*)::int AS n FROM files WHERE source='template'")>0,
   team:await n('SELECT count(*)::int AS n FROM users WHERE active')>1,
   whatsapp:!!(WA&&WA.configured&&WA.configured()),
   ai:AIok}}};
 app.get('/api/onboarding',wrap(async(req,res)=>{const r=await done(req.user),lv=RANK[req.user.level]||0,steps=STEPS.filter(s=>RANK[s.level]<=lv).map(s=>({key:s.key,title:s.title,hint:s.hint,href:s.href,guide:s.guide,done:!!r.done[s.key]})),d=steps.filter(s=>s.done).length;
  res.json({hidden:r.hidden,steps,done:d,total:steps.length,percent:steps.length?Math.round(d/steps.length*100):100})}));
 app.post('/api/onboarding/hide',wrap(async(req,res)=>{await q('UPDATE users SET checklist_hidden=TRUE WHERE id=$1',[req.user.id]);res.json({ok:1})}));
 app.post('/api/onboarding/show',wrap(async(req,res)=>{await q('UPDATE users SET checklist_hidden=FALSE WHERE id=$1',[req.user.id]);res.json({ok:1})}));
 app.get('/api/help',wrap(async(req,res)=>{const all=load();res.json({categories:CATEGORIES.map(([key,title,icon,description])=>({key,title,icon,description,articles:all.filter(a=>a.category===key).map(brief)})).filter(c=>c.articles.length)})}));
 app.get('/api/help/search',wrap(async(req,res)=>res.json({items:search(req.query.q)})));
 app.get('/api/help/:cat/:slug',wrap(async(req,res)=>{const a=load().find(x=>x.category===req.params.cat&&x.slug===req.params.slug);if(!a)fail(404,'Guide not found');
  const r=render(a.body),all=load().filter(x=>x.category===a.category),i=all.indexOf(a);
  res.json({...brief(a),html:r.html,toc:r.toc,prev:i>0?brief(all[i-1]):null,next:i<all.length-1?brief(all[i+1]):null})}))};
module.exports.render=render;module.exports.search=search;module.exports.load=load;module.exports.CATEGORIES=CATEGORIES;
