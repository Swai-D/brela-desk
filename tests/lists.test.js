// Pagination of case comments and of the audit log
let fails=0;
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join('');
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const num=i=>'note '+String(i).padStart(2,'0');
(async()=>{
 ok('comments list requires sign-in',(await call('GET','/cases/1/comments')).s===401&&(await call('GET','/audit')).s===401);
 await as('boss@test.co',AP);
 const t=(await call('GET','/bootstrap')).j.types[0].id,c=(await call('POST','/cases',{clientName:'Chatty Co',caseTypeId:t})).j,c2=(await call('POST','/cases',{clientName:'Silent Co',caseTypeId:t})).j;
 for(let i=1;i<=27;i++)await call('POST',`/cases/${c.id}/comments`,{body:num(i)});
 await call('POST',`/cases/${c2.id}/comments`,{body:'other case'});
 // ---- comments
 let d=(await call('GET','/cases/'+c.id)).j;
 ok('the case page carries only the newest 10 comments (oldest first) plus the total',d.comments.length===10&&d.comments_total===27&&d.comments[0].body===num(18)&&d.comments[9].body===num(27),[d.comments.length,d.comments_total]);
 const p1=(await call('GET',`/cases/${c.id}/comments`)).j,p2=(await call('GET',`/cases/${c.id}/comments?page=2`)).j,p3=(await call('GET',`/cases/${c.id}/comments?page=3`)).j;
 ok('page 1 is the newest 10, in reading order',p1.items.length===10&&p1.total===27&&p1.pages===3&&p1.page===1&&p1.size===10&&p1.items[0].body===num(18)&&p1.items[9].body===num(27),p1.items.map(x=>x.body));
 ok('page 2 holds the next older 10; the last page the 7 oldest',p2.items[0].body===num(8)&&p2.items[9].body===num(17)&&p3.items.length===7&&p3.items[0].body===num(1)&&p3.items[6].body===num(7));
 const all=[...p1.items,...p2.items,...p3.items].map(x=>x.body);ok('every comment appears exactly once across the pages',new Set(all).size===27&&all.length===27);
 ok('page numbers and sizes are clamped',(await call('GET',`/cases/${c.id}/comments?page=99`)).j.page===3&&(await call('GET',`/cases/${c.id}/comments?page=0`)).j.page===1&&(await call('GET',`/cases/${c.id}/comments?size=500`)).j.size===50&&(await call('GET',`/cases/${c.id}/comments?size=-1`)).j.size===10);
 ok('a case only lists its own comments',(r=>r.total===1&&r.items[0].body==='other case')((await call('GET',`/cases/${c2.id}/comments`)).j)&&(await call('GET','/cases/999999/comments')).s===404);
 const target=p2.items[3];await call('PATCH','/comments/'+target.id,{body:'edited text'});
 ok('an edit shows on its page, marked as edited, without moving',(r=>r.items[3].id===target.id&&r.items[3].body==='edited text'&&r.items[3].edited_at)((await call('GET',`/cases/${c.id}/comments?page=2`)).j));
 await call('DELETE','/comments/'+p1.items[9].id);
 ok('after a delete the totals and pages follow',(r=>r.total===26&&r.pages===3&&r.items.length===10)((await call('GET',`/cases/${c.id}/comments`)).j)&&(await call('GET',`/cases/${c.id}/comments?page=3`)).j.items.length===6);
 // ---- audit log (needs plenty of entries: rename a person 40 times)
 const u=(await call('POST','/users',{name:'Name 00',email:'rename@test.co',role:'JUNIOR',password:UP})).j.id;
 for(let i=1;i<=40;i++)await call('PATCH','/users/'+u,{name:'Name '+String(i).padStart(2,'0')});
 let a1=(await call('GET','/audit')).j;
 ok('audit log is paginated: 20 per page by default, with totals',Array.isArray(a1.items)&&a1.items.length===20&&a1.total>=40&&a1.pages===Math.ceil(a1.total/20)&&a1.page===1&&a1.size===20,[a1.items&&a1.items.length,a1.total,a1.pages]);
 ok('newest first',a1.items[0].details==='Name 39: name'&&a1.items[0].actor_name==='Neema'&&a1.items[1].details==='Name 38: name',a1.items.slice(0,2));
 const seen=[];let pg=1,last;do{last=(await call('GET',`/audit?size=15&page=${pg}`)).j;seen.push(...last.items.map(x=>x.details));pg++}while(pg<=last.pages);
 ok('walking every page returns each entry once and the total matches',seen.length===last.total&&new Set(seen.filter(x=>/^Name \d\d: name$/.test(x))).size===40,[seen.length,last.total]);
 ok('audit pages and sizes are clamped',(await call('GET','/audit?page=999')).j.page===a1.pages&&(await call('GET','/audit?page=0')).j.page===1&&(await call('GET','/audit?size=1000')).j.size===100&&(await call('GET','/audit?size=0')).j.size===20);
 await as('rename@test.co',UP);ok('only a Manager can read the audit log',(await call('GET','/audit')).s===403);
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
