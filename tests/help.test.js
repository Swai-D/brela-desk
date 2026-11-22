// Help centre: guides load, render safely, link to each other, are searchable; pages carry the Help entry
const fs=require('fs'),path=require('path'),H=require('../help-centre.js');
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,500))};
const AP=process.env.ADMIN_PASSWORD,B=`http://localhost:${process.env.PORT||3000}/api`;let ck='';
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)ck=sc.split(';')[0];let j=null;try{j=await r.json()}catch{}return{s:r.status,j}};
const pub=path.join(__dirname,'..','public');
(async()=>{
 const all=H.load();
 ok('guides are found in every category',all.length>=15&&H.CATEGORIES.every(c=>all.some(a=>a.category===c[0])),all.length);
 ok('every guide has a title and a summary',all.every(a=>a.title&&a.summary&&a.title!==a.slug),all.filter(a=>!a.summary).map(a=>a.slug));
 const bad=[];for(const a of all){const h=H.render(a.body).html;for(const m of h.matchAll(/help\.html#([a-z0-9-]+)\/([a-z0-9-]+)/g))if(!all.some(y=>y.category===m[1]&&y.slug===m[2]))bad.push(a.slug+'→'+m[0])}
 ok('every link between guides points to a guide that exists',!bad.length,bad);
 ok('raw HTML in a guide is escaped',/&lt;script&gt;/.test(H.render('Hi <script>alert(1)</script>').html)&&!/javascript:/.test(H.render('[x](javascript:alert(1))').html)&&!/<a /.test(H.render('[x](javascript:alert(1))').html));
 ok('headings get an id for the "On this page" list; tables and lists render',(()=>{const r=H.render('## Hello world\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- one\n- two');return r.toc[0].id==='hello-world'&&/<table/.test(r.html)&&/<ul><li>one/.test(r.html)})());
 ok('search finds guides by words in the title, keywords and text',H.search('import company')[0].slug==='import-from-brela'&&H.search('prepare documents')[0].slug==='prepare-documents'&&H.search('xyzzynothing').length===0);
 ok('every guide the app links to exists',['documents/prepare-documents','settings/document-wizards','help/contact'].every(k=>all.some(a=>a.category+'/'+a.slug===k)));
 // pages carry the Help menu and the top bar icon
 const pages=fs.readdirSync(pub).filter(f=>/\.html$/.test(f)&&/id="side-menu"/.test(fs.readFileSync(path.join(pub,f),'utf8')));
 ok('every page with the side menu has the Help item',pages.length>5&&pages.every(f=>/href="help\.html"/.test(fs.readFileSync(path.join(pub,f),'utf8'))),pages.filter(f=>!/href="help\.html"/.test(fs.readFileSync(path.join(pub,f),'utf8'))));
 ok('the top bar has a ? icon and the Help page script is wired',/id="help-link"/.test(fs.readFileSync(path.join(pub,'assets/js/topbar.js'),'utf8'))&&/PAGES\.help=/.test(fs.readFileSync(path.join(pub,'assets/js/brela.js'),'utf8'))&&/assets\/js\/help\.js/.test(fs.readFileSync(path.join(pub,'help.html'),'utf8')));

 // ---- coverage: every page, wizard, stage, settings pane and tool has a guide, and every guide is real documentation
 const has=k=>all.some(a=>a.category+'/'+a.slug===k),SC=require('../scenarios.js');
 const PAGE_GUIDE={'index.html':'daily-work/dashboard','my-work.html':'daily-work/my-work','playbook.html':'daily-work/playbook','cases-board.html':'daily-work/case-board','clients.html':'clients/find-a-client','case-detail.html':'cases/case-page','templates.html':'documents/templates','inbox.html':'whatsapp/inbox','studio.html':'studio/doc-studio','reports.html':'daily-work/reports','settings.html':'settings/team-and-roles','profile.html':'account/profile','search.html':'daily-work/search'};
 const topbarJs=fs.readFileSync(path.join(pub,'assets/js/topbar.js'),'utf8');
 ok('every app page has a guide and the ? icon opens it',Object.entries(PAGE_GUIDE).every(([f,g])=>fs.existsSync(path.join(pub,f))&&has(g)&&topbarJs.includes("'"+f+"':'"+g+"'")),Object.entries(PAGE_GUIDE).filter(([f,g])=>!has(g)));
 const pagesInApp=fs.readdirSync(pub).filter(f=>/\.html$/.test(f)&&!/^(auth-|login|help)/.test(f));
 ok('no app page was added without a help mapping',pagesInApp.every(f=>PAGE_GUIDE[f]),pagesInApp.filter(f=>!PAGE_GUIDE[f]));
 ok('every built-in wizard has its own guide',SC.BUILTIN.every(b=>all.some(a=>a.category==='documents'&&a.slug.startsWith('wizard-')&&new RegExp(b.id==='directors'?'directors':b.id==='secretary'?'secretary':b.id==='shares'?'shares':'annual').test(a.slug))),SC.BUILTIN.map(b=>b.id));
 const mention=(txt,words)=>words.filter(w=>!all.some(a=>(a.title+' '+a.keywords+' '+a.body).toLowerCase().includes(w.toLowerCase())));
 ok('every stage of a case is explained',mention('',['Gathering Docs','Ready to Submit','Submitted to BRELA','Returned (Correction)','Completed','BRELA round']).length===0);
 ok('every Settings pane and wizard-builder part is explained',['team-and-roles','roles-and-access-levels','case-types','whatsapp-settings','ai-settings','audit-log','document-wizards','wizard-questions','wizard-documents-and-placeholders','wizard-formulas','wizard-checks','wizard-built-in-vs-custom','wizard-recipe-new-wizard'].every(s=>has('settings/'+s)));
 const WD=require('../wizard-dsl.js'),fx=all.find(a=>a.slug==='wizard-formulas');
 ok('every formula function is in the formulas reference',WD.docs().every(d=>fx.body.includes('`'+d.name+'(')||fx.body.includes(d.name+'(')||fx.body.includes('`'+d.name+'`')||fx.body.includes(d.name)),WD.docs().filter(d=>!fx.body.includes(d.name)).map(d=>d.name));
 const fm=all.find(a=>a.slug==='wizard-documents-and-placeholders');
 ok('every answer format is described',WD.FMT.every(f=>fm.body.toLowerCase().includes(f[1].split(':')[0].toLowerCase())),WD.FMT.map(f=>f[1]));
 ok('every Doc Studio tool and the whole account area are covered',['sign-a-pdf','edit-pdf-text','pages-tool','photos-to-pdf'].every(s=>has('studio/'+s))&&['profile','sign-in-and-sign-out','first-sign-in','forgot-password','change-password','lock-screen','notifications','weekly-performance'].every(s=>has('account/'+s)));
 ok('every error the app shows to users has an entry in the error list',['Complete all documents in the checklist first.','Only a Senior or Manager can do this step.','Write what BRELA asked to correct.','Wrong email or password','Too many attempts','Current password is incorrect','This client has cases','Cases already use this type','At least one active Manager must remain'].every(m=>all.some(a=>a.body.includes(m))),'');
 const thin=all.filter(a=>a.body.split(/\s+/).length<80&&!['audit-log','history'].includes(a.slug));
 ok('no guide is a stub (80+ words), every guide has keywords and a summary',thin.length===0&&all.every(a=>a.keywords.split(',').length>=3&&a.summary.length>20),thin.map(a=>a.slug));
 ok('the FAQ has 30 or more questions and the glossary the key BRELA terms',(all.find(a=>a.slug==='faq').body.match(/^\*\*/gm)||[]).length>=30&&['Form 213a','Form 57b','Forfeiture','MEMARTS','Track number'].every(t=>all.find(a=>a.slug==='glossary').body.includes(t)));
 ok('the Help has 80+ guides',all.length>=80,all.length);
 // API
 ok('guides need a sign-in',(await call('GET','/help')).s===401);
 await call('POST','/login',{email:'boss@test.co',password:AP});
 const l=await call('GET','/help');
 ok('the topic list comes with categories and their guides',l.s===200&&l.j.categories.length>=5&&l.j.categories[0].articles.length>0,l.j);
 const g=await call('GET','/help/documents/prepare-documents');
 ok('a guide comes as HTML with its contents list and neighbours',g.s===200&&/<h2 id=/.test(g.j.html)&&g.j.toc.length>2&&g.j.next,g.j&&Object.keys(g.j));
 ok('an unknown guide is a 404, a path trick is not served',(await call('GET','/help/documents/nope')).s===404&&(await call('GET','/help/..%2Fpackage/json')).s===404);
 const s=await call('GET','/help/search?q=wizard');
 ok('search over the API',s.s===200&&s.j.items.length>=2&&s.j.items[0].snippet,s.j);

 // ---- getting-started checklist
 const ob=await call('GET','/onboarding');
 ok('the checklist lists steps for a Manager with progress',ob.s===200&&ob.j.steps.length===11&&ob.j.total===11&&typeof ob.j.percent==='number'&&ob.j.steps.every(x=>x.title&&x.href&&all.some(a=>a.category+'/'+a.slug===x.guide)),ob.j);
 const before=ob.j.done;
 const cl=(await call('POST','/clients',{name:'Checklist Test Ltd',phone:'255700000099'})).j;
 const T=(await call('GET','/bootstrap')).j.types[0].id;await call('POST','/cases',{clientId:cl.id,caseTypeId:T});
 const ob2=await call('GET','/onboarding'),by=k=>ob2.j.steps.find(x=>x.key===k);
 ok('steps tick themselves from the data (client, case)',by('client').done&&by('case').done&&ob2.j.done>before,ob2.j.steps.map(x=>x.key+':'+x.done));
 await call('POST','/onboarding/hide',{});
 ok('it can be hidden and shown again, per account',(await call('GET','/onboarding')).j.hidden===true&&(await call('POST','/onboarding/show',{})).s===200&&(await call('GET','/onboarding')).j.hidden===false);
 const jr=await call('POST','/users',{name:'Staff Checklist',email:'staff.cl@test.co',role:'JUNIOR',password:'Secret123!'});
 const ck0=ck;await call('POST','/logout',{});ck='';await call('POST','/login',{email:'staff.cl@test.co',password:'Secret123!'});
 const st=await call('GET','/onboarding');
 ok('a Staff member sees only the steps for them (no templates, team, WhatsApp, AI)',st.s===200&&st.j.steps.length===7&&!st.j.steps.some(x=>['templates','team','whatsapp','ai'].includes(x.key)),st.j.steps&&st.j.steps.map(x=>x.key));
 await call('POST','/logout',{});ck='';await call('POST','/login',{email:'boss@test.co',password:AP});
 ok('the Dashboard shows the checklist and the Help can bring it back',/async function checklistCard/.test(fs.readFileSync(path.join(pub,'assets/js/brela.js'),'utf8'))&&/checklistCard\(\)/.test(fs.readFileSync(path.join(pub,'assets/js/brela.js'),'utf8'))&&/hc-ob/.test(fs.readFileSync(path.join(pub,'assets/js/help.js'),'utf8')));
 ok('the project rule to update the Help with every change is written down',/Every change to the app updates the Help/.test(fs.readFileSync(path.join(__dirname,'..','CLAUDE.md'),'utf8')));
 console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
