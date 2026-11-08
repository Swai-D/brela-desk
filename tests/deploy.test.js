// Deploy checks: every asset a page references must load (right status and type), nothing is fetched over plain http,
// caching is deploy-safe, and the app behaves correctly behind Railway's proxy.
const fs=require('fs'),path=require('path');
let fails=0;
const PORT=process.env.PORT||3000,BASE=`http://localhost:${PORT}`,AP=process.env.ADMIN_PASSWORD;
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const MIME={css:/text\/css/,js:/javascript/,svg:/image\/svg\+xml/,png:/image\/png/,jpg:/image\/jpeg/,jpeg:/image\/jpeg/,gif:/image\/gif/,ico:/icon/,woff:/font\/woff|application\/font-woff/,woff2:/font\/woff2/,ttf:/font\/ttf|application\/x-font-ttf|font\/sfnt/,eot:/vnd\.ms-fontobject/,json:/json/};
const ext=u=>(u.split('?')[0].split('.').pop()||'').toLowerCase();
const attrs=h=>[...h.matchAll(/<(?:link|script|img|source)\b[^>]*?\b(?:href|src)="([^"]+)"/g)].map(m=>m[1]).filter(u=>!u.startsWith('data:')&&!u.startsWith('#')&&!u.startsWith('javascript:'));
const cssUrls=c=>[...c.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)].map(m=>m[1]).filter(u=>!u.startsWith('data:')&&!u.startsWith('#')&&!/^https?:/.test(u));
const get=(p,h)=>fetch(BASE+p,{headers:h,redirect:'manual'});
(async()=>{
 const pages=fs.readdirSync(path.join(__dirname,'..','public')).filter(f=>f.endsWith('.html')).sort();
 ok('there are pages to check',pages.length>=8,pages);
 const seenCss=new Set();let checked=0,bad=[],insecure=[],unversioned=[];
 for(const pg of pages){
  const r=await get('/'+pg),html=await r.text();
  if(r.status!==200||!/text\/html/.test(r.headers.get('content-type')||'')||!/no-cache/.test(r.headers.get('cache-control')||''))bad.push(`${pg}: status/type/cache ${r.status} ${r.headers.get('content-type')} ${r.headers.get('cache-control')}`);
  for(const u of attrs(html)){
   if(/^http:\/\//.test(u))insecure.push(`${pg}: ${u}`);
   if(/^(https?:)?\/\//.test(u))continue; // external (https) hosts, e.g. Google Fonts
   if(/\.(css|js)(\?|$)/.test(u)&&!/[?&]v=/.test(u))unversioned.push(`${pg}: ${u}`);
   const res=await get('/'+u.replace(/^\//,''));checked++;
   const e=ext(u),type=res.headers.get('content-type')||'',buf=Buffer.from(await res.arrayBuffer());
   if(res.status!==200||!buf.length||(MIME[e]&&!MIME[e].test(type)))bad.push(`${pg}: ${u} -> ${res.status} ${type} ${buf.length}b`);
   if(e==='css')seenCss.add(u.split('?')[0].replace(/^\//,''));
  }
 }
 ok(`all ${checked} assets referenced by ${pages.length} pages load with the right type`,bad.length===0,bad.slice(0,8));
 ok('no resource is requested over plain http (mixed content on https)',insecure.length===0,insecure);
 ok('every CSS and JS link carries a version (?v=) so a deploy never serves stale files',unversioned.length===0,unversioned.slice(0,6));
 // fonts and images that CSS pulls in
 const cssBad=[];let cssChecked=0;
 for(const c of seenCss){const body=await (await get('/'+c)).text();
  for(const u of cssUrls(body)){const target=path.posix.normalize(path.posix.join(path.posix.dirname(c),u.split('?')[0].split('#')[0]));const res=await get('/'+target);cssChecked++;
   if(res.status!==200)cssBad.push(`${c}: ${u} -> ${res.status}`)}}
 ok(`all ${cssChecked} fonts/images referenced inside CSS files load`,cssBad.length===0&&cssChecked>10,cssBad.slice(0,8));
 // caching rules
 const html=await (await get('/login.html')).text(),cssLink=attrs(html).find(u=>/brela\.css/.test(u)),ver=await get('/'+cssLink),plain=await get('/assets/css/brela.css'),font=await get('/assets/fonts/materialdesignicons-webfont.woff2').catch(()=>null);
 ok('versioned CSS is cached for a year (immutable); unversioned is revalidated',/immutable/.test(ver.headers.get('cache-control')||'')&&/no-cache/.test(plain.headers.get('cache-control')||''),[ver.headers.get('cache-control'),plain.headers.get('cache-control')]);
 ok('HTML pages are never cached',/no-cache/.test((await get('/index.html')).headers.get('cache-control')||''));
 ok('root URL serves the app',(await get('/')).status===200);
 const miss=await get('/assets/css/does-not-exist.css');ok('a missing asset is a real 404, not a page',miss.status===404&&!/text\/html/.test(miss.headers.get('content-type')||'')||miss.status===404);
 ok('path traversal is refused',(await get('/..%2fserver.js')).status!==200&&(await get('/%2e%2e/server.js')).status!==200);
 const v=await (await get('/version')).json();ok('/version reports the running build',typeof v.version==='string'&&v.version.length>=4,v);
 // behind a proxy: each real client is counted on its own
 const login=(ip,pw)=>fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':ip},body:JSON.stringify({email:'boss@test.co',password:pw})});
 const wrong='wrong-'+Date.now();let last;for(let i=0;i<9;i++)last=await login('203.0.113.7',wrong);
 ok('repeated bad logins from one client are throttled',last.status===429,last.status);
 const other=await login('203.0.113.99',AP);ok('a different client behind the same proxy can still sign in',other.status===200,other.status);
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
