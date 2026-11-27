// Security rules: random addresses, headers, same-origin writes, password rules, login limits, no privilege climbing.
let fails=0;
const AP=process.env.ADMIN_PASSWORD,PORT=process.env.PORT||3000,ORIGIN=`http://localhost:${PORT}`,B=ORIGIN+'/api';
let ck='';
const call=async(m,u,b,h={})=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck,...h},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s&&/^t=/.test(s))ck=s.split(';')[0];return{s:r.status,h:r.headers,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const as=async(e,p)=>{ck='';return call('POST','/login',{email:e,password:p})};
const GOOD=['Kilimanjaro','-Peak-84'].join('');
(async()=>{
 await as('boss@test.co',AP);
 const types=(await call('GET','/bootstrap')).j.types;
 const c=(await call('POST','/cases',{clientName:'Secure Client',caseTypeId:types[0].id})).j;
 // ---- random addresses
 ok('a new case and client come back with a random 32-character code',/^[0-9a-f]{32}$/.test(c.uid||''),c);
 const bs=(await call('GET','/bootstrap')).j,bc=bs.cases.find(x=>x.id===c.id),bk=bs.clients.find(x=>x.id===bc.client_id);
 ok('the case list and client list carry the codes',bc&&bc.uid===c.uid&&bk&&/^[0-9a-f]{32}$/.test(bk.uid),{bc,bk});
 const byUid=await call('GET','/cases/'+c.uid);
 ok('a case opens by its code',byUid.s===200&&byUid.j.case.id===c.id&&byUid.j.case.uid===c.uid,byUid.s);
 ok('the sub-pages of a case open by code too',(await call('GET',`/cases/${c.uid}/history`)).s===200&&(await call('GET',`/cases/${c.uid}/comments`)).s===200);
 const k=await call('GET','/clients/'+bk.uid);
 ok('a client opens by its code',k.s===200&&k.j.client.id===bk.id&&k.j.client.uid===bk.uid,k.s);
 ok('an unknown code is "not found", a malformed one is "bad id"',(await call('GET','/cases/'+'0'.repeat(32))).s===404&&(await call('GET','/cases/abc')).s===400&&(await call('GET','/cases/'+'g'.repeat(32))).s===400);
 ok('a client code does not open a case (codes are per kind)',(await call('GET','/cases/'+bk.uid)).s===404);
 const codes=new Set([...bs.cases.map(x=>x.uid),...bs.clients.map(x=>x.uid)]);
 ok('every code is different',codes.size===bs.cases.length+bs.clients.length);
 const list=(await call('GET','/clients?size=5')).j;ok('the paged client list carries codes',list.items.every(x=>/^[0-9a-f]{32}$/.test(x.uid||'')),list.items[0]);
 // the pages themselves
 const fs=require('fs'),js=fs.readFileSync('public/assets/js/brela.js','utf8');
 ok('no link in the app puts a running number in the address bar',!/(case-detail|clients)\.html\?id=/.test(js)&&!/(case-detail|clients)\.html\?id=/.test(fs.readFileSync('public/assets/js/studio.js','utf8')));
 ok('Doc Studio links use codes too',!/studio\.html\?(case|client)=\$\{c\.id\}/.test(js)&&/toNumber\('cases'/.test(fs.readFileSync('public/assets/js/studio.js','utf8')));
 ok('old ?id= links are still understood and replaced by the code',/pageKey\('c'\)/.test(js)&&/pageKey\('k'\)/.test(js)&&/showUrl\(/.test(js));
 // files open by code too
 const fup=await fetch(B+`/clients/${bk.uid}/files`,{method:'POST',headers:{cookie:ck},body:(()=>{const f=new FormData();f.append('file',new Blob(['%PDF-1.4 x'],{type:'application/pdf'}),'a.pdf');return f})()}).then(r=>r.json());
 const finfo=await call('GET',`/files/${fup.id}/info`),fcode=(await call('GET',`/clients/${bk.uid}`)).j.files.find(x=>x.id===fup.id);
 ok('a file has a code and opens by it',/^[0-9a-f]{32}$/.test(fcode&&fcode.uid||'')&&(await call('GET',`/files/${fcode.uid}/info`)).j.id===fup.id&&finfo.s===200,[fcode,finfo.s]);
 ok('Doc Studio file links use the code',!/studio\.html\?file=\$\{f\.id\}/.test(js)&&/files\/'\+qs\.get\('file'\)/.test(fs.readFileSync('public/assets/js/studio.js','utf8')));
 // ---- headers
 const page=await fetch(ORIGIN+'/login.html'),h=page.headers;
 ok('pages are sent with a content security policy',/default-src 'self'/.test(h.get('content-security-policy')||'')&&/frame-ancestors 'self'/.test(h.get('content-security-policy')||''),h.get('content-security-policy'));
 ok('pages cannot be framed by other sites, sniffed or leaked through referrers',h.get('x-frame-options')==='SAMEORIGIN'&&h.get('x-content-type-options')==='nosniff'&&!!h.get('referrer-policy'));
 ok('the server does not announce what it runs on',!h.get('x-powered-by'));
 // ---- same-origin writes
 const evil=await call('POST','/cases',{clientName:'Evil',caseTypeId:types[0].id},{Origin:'https://evil.example'});
 ok('a write sent from another website is refused even with a valid sign-in',evil.s===403,evil.s);
 ok('a write from this website is accepted',(await call('POST','/cases',{clientName:'Fine',caseTypeId:types[0].id},{Origin:ORIGIN})).s===200);
 // ---- passwords
 const mk=pw=>call('POST','/users',{name:'Pw Test',email:'pw'+Math.random().toString(36).slice(2,8)+'@test.co',role:'JUNIOR',password:pw});
 ok('short passwords are refused',(await mk('Ab1!xyz')).s===400);
 ok('common words and number runs are refused',(await mk('password123')).s===400&&(await mk('1234567890')).s===400&&(await mk('aaaaaaaaaaaa')).s===400);
 const long=await mk(GOOD);ok('a long, unusual password is accepted',long.s===200,long);
 const em=`me${Date.now()}@test.co`;
 ok('a password containing the email name is refused',(await call('POST','/users',{name:'Em',email:em,role:'JUNIOR',password:em.split('@')[0]+'Zz9!'})).s===400);
 // ---- sign-in limits and wording
 const w1=await as('boss@test.co','wrong-'+Date.now()),w2=await as('nobody@test.co','wrong-'+Date.now());
 ok('a wrong password and an unknown email look the same',w1.s===401&&w2.s===401&&w1.j.error===w2.j.error,[w1.j,w2.j]);
 let last;for(let i=0;i<10;i++)last=await fetch(B+'/login',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.5'},body:JSON.stringify({email:'x'+i+'@test.co',password:'nope-'+i})});
 ok('many bad sign-ins from one address are stopped',last.status===429,last.status);
 // ---- no privilege climbing
 await as('boss@test.co',AP);
 const staffEmail=`staff${Date.now()}@test.co`;
 const staff=(await call('POST','/users',{name:'Staff Tester',email:staffEmail,role:'JUNIOR',password:GOOD+'1'})).j;
 ok('a created user is returned without a password hash',!JSON.stringify(staff).includes('password_hash'),staff);
 await as(staffEmail,GOOD+'1');
 const me=(await call('GET','/me')).j;ok('the signed-in profile does not carry the password hash',!('password_hash' in me),Object.keys(me));
 ok('someone without team access cannot add users, edit roles or read the audit log',(await mk(GOOD+'2')).s===403&&(await call('POST','/roles',{name:'Sneaky',level:'MANAGER'})).s===403&&(await call('GET','/audit')).s===403);
 ok('someone without access cannot widen their own role',(await call('PATCH','/users/'+me.id,{role:'MANAGER'})).s===403);
 // ---- files can never run in the page
 await as('boss@test.co',AP);
 const fd=new FormData();fd.append('file',new Blob(['<script>alert(1)</script>'],{type:'text/html'}),'x.html');
 const up=await fetch(B+`/clients/${bk.uid}/files`,{method:'POST',headers:{cookie:ck},body:fd}).then(r=>r.json());
 const dl=await fetch(B+'/files/'+up.id,{headers:{cookie:ck}});
 ok('an uploaded web page is downloaded, never shown inside the app',/attachment/.test(dl.headers.get('content-disposition')||'')&&/nosniff/.test(dl.headers.get('x-content-type-options')||''),[...dl.headers]);
 console.log(fails?`${fails} FAILED`:'all passed');process.exit(fails?1:0)})();
