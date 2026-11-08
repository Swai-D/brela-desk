let fails=0;
const AP=process.env.ADMIN_PASSWORD;
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
(async()=>{
 ok('list requires sign-in',(await call('GET','/clients')).s===401);
 await call('POST','/login',{email:'boss@test.co',password:AP});
 let r=(await call('GET','/clients')).j;ok('no clients yet: total 0, one empty page',r.total===0&&r.pages===1&&r.page===1&&r.items.length===0,r);
 const ids={};
 for(let i=1;i<=23;i++){const n='Client '+String(i).padStart(2,'0');ids[n]=(await call('POST','/clients',{name:n,phone:i===7?'0712 345 678':null,email:i===9?'nine@example.com':null})).j.id}
 const pct=(await call('POST','/clients',{name:'100% Organic Ltd'})).j.id,under=(await call('POST','/clients',{name:'Plain_Name Co'})).j.id;
 r=(await call('GET','/clients')).j;
 ok('default page: 10 of 25, 3 pages, alphabetical',r.items.length===10&&r.total===25&&r.pages===3&&r.page===1&&r.size===10&&r.items[0].name==='100% Organic Ltd'&&r.items[1].name==='Client 01',r.items.map(x=>x.name));
 ok('last page holds the remainder',(await call('GET','/clients?page=3')).j.items.length===5);
 ok('page beyond the end clamps to the last page; page 0 or junk clamps to the first',(await call('GET','/clients?page=99')).j.page===3&&(await call('GET','/clients?page=0')).j.page===1&&(await call('GET','/clients?page=abc')).j.page===1);
 ok('page size is capped at 50 and never below 1',(await call('GET','/clients?size=500')).j.size===50&&(await call('GET','/clients?size=0')).j.size===10&&(await call('GET','/clients?size=-5')).j.size===10);
 const all=[];for(let p=1;p<=3;p++)all.push(...(await call('GET','/clients?page='+p)).j.items.map(x=>x.id));
 ok('pages do not overlap or skip anyone',new Set(all).size===25&&all.length===25,all.length);
 r=(await call('GET','/clients?q=client 1')).j;ok('search is case-insensitive and counts matches',r.total===10&&r.items.every(x=>/client 1/i.test(x.name)),r.total);
 ok('search by email',(await call('GET','/clients?q=nine@example')).j.items.map(x=>x.name).join()==='Client 09');
 ok('search by phone digits works when the stored number has spaces',(await call('GET','/clients?q=0712345678')).j.items.map(x=>x.name).join()==='Client 07'&&(await call('GET','/clients?q=712%20345')).j.total===1);
 ok('% and _ in a search are plain characters, not wildcards',(await call('GET','/clients?q='+encodeURIComponent('100%'))).j.total===1&&(await call('GET','/clients?q='+encodeURIComponent('%'))).j.total===1&&(await call('GET','/clients?q='+encodeURIComponent('_'))).j.total===1);
 ok('search with no match',(await call('GET','/clients?q=zzzz')).j.total===0);
 ok('paging works inside a search',(await call('GET','/clients?q=client&size=10&page=3')).j.items.length===3);
 r=(await call('GET','/clients?focus='+ids['Client 22'])).j;ok('focus jumps to the page that holds the client',r.page===3&&r.items.some(x=>x.id===ids['Client 22']),r.page);
 r=(await call('GET','/clients?focus='+ids['Client 03'])).j;ok('focus on a client early in the list stays on page 1',r.page===1&&r.items.some(x=>x.id===ids['Client 03']));
 ok('focus outside the current search is ignored',(await call('GET','/clients?q=client 1&focus='+ids['Client 22'])).j.page===1);
 // open-case counts
 const types=(await call('GET','/bootstrap')).j.types;
 const c1=(await call('POST','/cases',{clientId:ids['Client 02'],caseTypeId:types[0].id})).j,c2=(await call('POST','/cases',{clientId:ids['Client 02'],caseTypeId:types[0].id})).j;
 await call('PATCH','/case-docs/'+(await call('GET','/cases/'+c2.id)).j.docs[0].id,{done:true});
 const row=(await call('GET','/clients')).j.items.find(x=>x.id===ids['Client 02']);ok('rows show open and total case counts',row.open===2&&row.cases===2,row);
 const d=(await call('GET','/cases/'+c2.id)).j;for(const x of d.docs)await call('PATCH','/case-docs/'+x.id,{done:true});
 for(const to of ['ready','submitted','done'])await call('POST',`/cases/${c2.id}/move`,{to});
 const row2=(await call('GET','/clients')).j.items.find(x=>x.id===ids['Client 02']);ok('finished cases are not counted as open',row2.open===1&&row2.cases===2,row2);
 // deleting keeps the numbers right
 await call('DELETE','/clients/'+ids['Client 23']);r=(await call('GET','/clients?page=3')).j;ok('after a delete, totals and pages follow',r.total===24&&r.items.length===4);
 ok('the full list used by pickers is still available',(await call('GET','/bootstrap')).j.clients.length===24);
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
