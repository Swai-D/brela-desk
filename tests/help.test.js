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
 console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
