let fails=0;
const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL||'postgres://brela:brela@localhost:5432/brela'});
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
(async()=>{
 await call('POST','/login',{email:'boss@test.co',password:'Secret123!'});
 const juma=(await call('POST','/users',{name:'Juma Kileo',email:'juma@test.co',role:'JUNIOR',password:'Junior123!'})).j.id;
 const q=(t,p)=>pool.query(t,p).then(r=>r.rows);
 const t1=(await q('select id from case_types order by id limit 1'))[0].id,t2=(await q('select id from case_types order by id offset 1 limit 1'))[0].id;
 const cA=(await q("insert into clients(name) values('Client A') returning id"))[0].id,cB=(await q("insert into clients(name) values('Client B') returning id"))[0].id;
 const mk=async(code,cl,t,who,created,status,completed,rounds,due)=>(await q('insert into cases(code,client_id,case_type_id,assignee_id,created_at,status,completed_at,rounds,due) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id',[code,cl,t,who,created,status,completed,rounds,due]))[0].id;
 const c1=await mk('BR-2001',cA,t1,juma,'2026-11-03T06:00:00Z','done','2026-11-10T06:00:00Z',0,null);
 const c2=await mk('BR-2002',cA,t1,juma,'2026-11-05T06:00:00Z','done','2026-11-12T06:00:00Z',2,null);
 const c3=await mk('BR-2003',cB,t2,1,'2026-11-07T06:00:00Z','returned',null,1,'2026-11-01');
 await mk('BR-2004',cB,t2,juma,'2026-10-31T21:30:00Z','docs',null,0,null); // Nov 1 00:30 EAT -> counts in November
 await mk('BR-2005',cB,t2,juma,'2026-11-30T21:30:00Z','docs',null,0,null); // Dec 1 EAT -> not November
 const c6=await mk('BR-2006',cA,t1,juma,'2026-10-05T06:00:00Z','done','2026-10-20T06:00:00Z',0,null);
 await mk('BR-2007',cA,t1,juma,'2026-10-08T06:00:00Z','docs',null,0,null);
 const act=(c,u,t,at)=>q('insert into activity(case_id,user_id,text,created_at) values($1,$2,$3,$4)',[c,u,t,at]);
 await act(c2,1,'marked as returned by BRELA (round 1): Fix ID scan','2026-11-08T08:00:00Z');await act(c2,1,'marked as returned by BRELA (round 2): Wrong stamp','2026-11-09T08:00:00Z');
 await act(c3,1,'marked as returned by BRELA (round 1): Missing address proof','2026-11-15T08:00:00Z');await act(c6,1,'marked as returned by BRELA (round 1): Old one','2026-10-12T08:00:00Z');
 await q("update cases set submitted_at='2026-11-09T06:00:00Z' where id=$1",[c1]);
 const r=(await call('GET','/reports/monthly?month=2026-11')).j,s=r.summary;
 ok('received (incl. Nov 1 EAT boundary, excl. Dec 1 EAT)',s.received===4,s);ok('completed',s.completed===2,s);ok('returns',s.returns===3,s);ok('submitted',s.submitted===1,s);
 ok('avg turnaround 7 days',s.avgDays===7,s);ok('first-time approval 50%',s.firstTimeRate===50,s);ok('overdue now = 1',s.overdueNow===1,s);
 ok('previous month compare',r.prev.received===2&&r.prev.completed===1&&r.prev.returns===1,r.prev);
 const jp=r.byPerson.find(p=>p.name==='Juma Kileo');ok('per-person numbers',jp.received===3&&jp.completed===2&&jp.returns===2&&jp.openNow===3,jp);
 ok('by type',r.byType.find(t=>t.completed===2&&t.returns===2&&t.avgDays===7),r.byType);ok('by client sorted',r.byClient[0].client==='Client A',r.byClient);
 ok('return reasons listed w/o prefix',r.returnsList.some(x=>x.reason==='Missing address proof')&&r.returnsList.length===3,r.returnsList);
 ok('completed list',r.completed.length===2&&r.completed[0].code==='BR-2001'&&r.completed[0].days===7,r.completed);
 const oct=(await call('GET','/reports/monthly?month=2026-10')).j.summary;ok('october',oct.received===2&&oct.completed===1,oct);
 ok('bad month falls back to current',(await call('GET','/reports/monthly?month=abc')).s===200);
 // live workflow sets timestamps
 const c=(await call('POST','/cases',{clientId:cA,caseTypeId:t1,assigneeId:juma})).j;const d=(await call('GET','/cases/'+c.id)).j;for(const x of d.docs)await call('PATCH','/case-docs/'+x.id,{done:true});
 for(const to of ['ready','submitted','done'])await call('POST',`/cases/${c.id}/move`,{to});
 const row=(await q('select completed_at,submitted_at from cases where id=$1',[c.id]))[0];ok('move sets submitted_at & completed_at',row.completed_at&&row.submitted_at,row);
 await call('POST',`/cases/${c.id}/move`,{to:'docs'});ok('reopen clears completed_at',(await q('select completed_at from cases where id=$1',[c.id]))[0].completed_at===null);
 ck='';await call('POST','/login',{email:'juma@test.co',password:'Junior123!'});ok('non-manager blocked',(await call('GET','/reports/monthly')).s===403);
 await pool.end()})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
