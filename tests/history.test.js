let fails=0;
const AP=process.env.ADMIN_PASSWORD;
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
(async()=>{
 ok('history requires sign-in',(await call('GET','/cases/1/history')).s===401);
 await call('POST','/login',{email:'boss@test.co',password:AP});
 const t=(await call('GET','/bootstrap')).j.types[0].id,c=(await call('POST','/cases',{clientName:'History Co',caseTypeId:t})).j,c2=(await call('POST','/cases',{clientName:'Quiet Co',caseTypeId:t})).j;
 for(let i=1;i<=27;i++)await call('PATCH',`/cases/${c.id}/track`,{track_number:'TRK '+String(i).padStart(3,'0')});
 // 1 (created) + 27 (track changes) = 28 entries
 let d=(await call('GET','/cases/'+c.id)).j;
 ok('the case page carries only the newest 10 entries plus the total',d.activity.length===10&&d.activity_total===28&&d.activity[0].text.includes('TRK 027'),[d.activity.length,d.activity_total]);
 let p1=(await call('GET',`/cases/${c.id}/history`)).j;
 ok('history defaults: 10 per page, 3 pages, newest first',p1.items.length===10&&p1.total===28&&p1.pages===3&&p1.page===1&&p1.size===10&&p1.items[0].text.includes('TRK 027')&&p1.items[9].text.includes('TRK 018'),p1.items.map(x=>x.text));
 const p2=(await call('GET',`/cases/${c.id}/history?page=2`)).j,p3=(await call('GET',`/cases/${c.id}/history?page=3`)).j;
 ok('page 2 continues where page 1 stopped; last page holds the rest, ending with the creation entry',p2.items[0].text.includes('TRK 017')&&p2.items[9].text.includes('TRK 008')&&p3.items.length===8&&/created this case/.test(p3.items[7].text),[p2.items.map(x=>x.text.slice(-7)),p3.items.length]);
 const all=[];for(let p=1;p<=3;p++)all.push(...(await call('GET',`/cases/${c.id}/history?page=${p}`)).j.items.map(x=>x.text));
 ok('pages do not overlap or skip: all 28 entries exactly once',new Set(all).size===28&&all.length===28,all.length);
 ok('page numbers are clamped',(await call('GET',`/cases/${c.id}/history?page=99`)).j.page===3&&(await call('GET',`/cases/${c.id}/history?page=0`)).j.page===1&&(await call('GET',`/cases/${c.id}/history?page=abc`)).j.page===1);
 ok('page size: custom, capped at 50, bad values fall back to 10',(await call('GET',`/cases/${c.id}/history?size=25`)).j.pages===2&&(await call('GET',`/cases/${c.id}/history?size=500`)).j.size===50&&(await call('GET',`/cases/${c.id}/history?size=-3`)).j.size===10&&(await call('GET',`/cases/${c.id}/history?size=0`)).j.size===10);
 ok('a small history is a single page',(r=>r.total===1&&r.pages===1&&r.items.length===1)((await call('GET',`/cases/${c2.id}/history`)).j));
 ok('history only shows that case\'s entries',all.every(x=>!/Quiet/.test(x))&&(await call('GET',`/cases/${c2.id}/history`)).j.items[0].text.includes('created this case'));
 ok('unknown case is a clean 404',(await call('GET','/cases/999999/history')).s===404);
 await call('PATCH',`/cases/${c.id}/track`,{track_number:'TRK NEW'});
 ok('a new entry appears first on page 1 and the total grows',(r=>r.total===29&&r.items[0].text.includes('TRK NEW'))((await call('GET',`/cases/${c.id}/history`)).j));
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
