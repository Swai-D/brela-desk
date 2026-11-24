let fails=0;
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join('');
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
(async()=>{
 await as('boss@test.co',AP);
 let bs=(await call('GET','/bootstrap')).j;
 ok('built-in roles migrated with access levels',['MANAGER','SENIOR','JUNIOR','SECRETARY','ASSOCIATE'].every(k=>bs.roles.some(r=>r.key===k))&&bs.roles.find(r=>r.key==='SENIOR').level==='SENIOR'&&bs.roles.find(r=>r.key==='JUNIOR').level==='STAFF'&&bs.roles.find(r=>r.key==='SECRETARY').team_queue===true,bs.roles);
 // ---- create
 const a=await call('POST','/roles',{name:'Accountant',level:'STAFF',team_queue:true,summary:'Handles fees and receipts.',duties:['Pay BRELA fees ','','Keep receipts']});
 ok('manager creates a role',a.s===200&&a.j.key==='ACCOUNTANT',a);
 const pb=(await call('GET','/playbook')).j,acc=pb.roles.find(r=>r.role==='ACCOUNTANT');
 ok('new role appears in the playbook with its duties',acc&&acc.name==='Accountant'&&acc.duties.length===2&&acc.summary==='Handles fees and receipts.'&&acc.team_queue===true,acc);
 ok('duplicate name rejected (any letter case)',(await call('POST','/roles',{name:'accountant',level:'STAFF'})).s===400);
 ok('bad level or name rejected',(await call('POST','/roles',{name:'X',level:'STAFF'})).s===400&&(await call('POST','/roles',{name:'Clerk',level:'GOD'})).s===400);
 // ---- users with custom roles
 const accU=(await call('POST','/users',{name:'Amani Accountant',email:'amani@test.co',role:'ACCOUNTANT',password:UP})).j.id;
 ok('cannot give someone a role that does not exist',(await call('POST','/users',{name:'X',email:'x@test.co',role:'NOPE',password:UP})).s===400&&(await call('PATCH','/users/'+accU,{role:'NOPE'})).s===400);
 // ---- access level decides permissions, and changes apply immediately
 const types=(await call('GET','/bootstrap')).j.types;const c=(await call('POST','/cases',{clientName:'Role Client',caseTypeId:types[0].id,assigneeId:accU})).j;
 const d=(await call('GET','/cases/'+c.id)).j;for(const x of d.docs)await call('PATCH','/case-docs/'+x.id,{done:true});
 await call('POST',`/cases/${c.id}/move`,{to:'ready'});
 await as('amani@test.co',UP);
 ok('Staff level: cannot submit, open reports or settings data',(await call('POST',`/cases/${c.id}/move`,{to:'submitted'})).s===403&&(await call('GET','/reports/monthly')).s===403&&(await call('GET','/audit')).s===403);
 const staffSession=ck;
 await as('boss@test.co',AP);
 ok('manager raises the role to Senior level',(await call('PUT','/roles/ACCOUNTANT',{level:'SENIOR'})).s===200);
 ck=staffSession;
 ok('same session: Senior-level powers apply immediately (no new login)',(await call('POST',`/cases/${c.id}/move`,{to:'submitted'})).s===200&&(await call('GET','/reports/monthly')).s===403);
 await as('boss@test.co',AP);
 await call('PUT','/roles/ACCOUNTANT',{level:'MANAGER'});ck=staffSession;
 ok('Manager level: full access',(await call('GET','/reports/monthly')).s===200&&(await call('GET','/audit')).s===200);
 await as('boss@test.co',AP);
 await call('PUT','/roles/ACCOUNTANT',{level:'STAFF'});
 // ---- deactivation is immediate too
 ck=staffSession;ok('session works while active',(await call('GET','/me')).s===200);
 await as('boss@test.co',AP);await call('PATCH','/users/'+accU,{active:false});
 ck=staffSession;ok('deactivated person is locked out at once',(await call('GET','/bootstrap')).s===401);
 await as('boss@test.co',AP);await call('PATCH','/users/'+accU,{active:true});
 // ---- edit
 const e=await call('PUT','/roles/ACCOUNTANT',{name:'Finance Officer',summary:'Fees and receipts',duties:['Pay fees'],team_queue:false});
 const acc2=(await call('GET','/playbook')).j.roles.find(r=>r.role==='ACCOUNTANT');
 ok('manager edits name, text and queue flag (key stays the same)',e.s===200&&acc2.name==='Finance Officer'&&acc2.duties.length===1&&acc2.team_queue===false&&acc2.summary==='Fees and receipts',acc2);
 ok('rename to an existing role name rejected',(await call('PUT','/roles/ACCOUNTANT',{name:'senior'})).s===400);
 // ---- stage ownership and delete
 await call('PUT','/playbook/stages/docs',{owner_roles:['JUNIOR','ACCOUNTANT'],steps:['One'],done_when:'x'});
 ok('stage owners can include a custom role',(await call('GET','/playbook')).j.stages.find(s=>s.stage==='docs').owner_roles.includes('ACCOUNTANT'));
 const del1=await call('DELETE','/roles/ACCOUNTANT');ok('cannot delete a role people still have',del1.s===400&&/1 person has/.test(del1.j.error),del1);
 await call('PATCH','/users/'+accU,{role:'JUNIOR'});
 ok('delete the role once nobody has it',(await call('DELETE','/roles/ACCOUNTANT')).s===200&&!(await call('GET','/bootstrap')).j.roles.some(r=>r.key==='ACCOUNTANT'));
 ok('deleted role is removed from stage owners',!(await call('GET','/playbook')).j.stages.find(s=>s.stage==='docs').owner_roles.includes('ACCOUNTANT'));
 ok('delete unknown role is a clean 404',(await call('DELETE','/roles/NOPE')).s===404);
 // ---- keep at least one manager
 ok('cannot delete the last Manager-level role',(await call('DELETE','/roles/MANAGER')).s===400);
 ok('cannot lower the last Manager role while it is the only one with an active Manager',(await call('PUT','/roles/MANAGER',{level:'SENIOR'})).s===400);
 const m2=(await call('POST','/users',{name:'Second Boss',email:'boss2@test.co',role:'MANAGER',password:UP})).j.id;
 ok('manager cannot demote or deactivate themselves',(await call('PATCH','/users/1',{role:'SENIOR'})).s===400&&(await call('PATCH','/users/1',{active:false})).s===400);
 await as('boss2@test.co',UP);
 ok('another Manager can demote the first (a Manager remains)',(await call('PATCH','/users/1',{role:'SENIOR'})).s===200);
 ok('but cannot then demote or remove the last Manager (themselves)',(await call('PATCH','/users/'+m2,{role:'JUNIOR'})).s===400);
 await as('boss@test.co',AP);
 ok('demoted manager lost manager powers immediately',(await call('GET','/reports/monthly')).s===403);
 await as('boss2@test.co',UP);await call('PATCH','/users/1',{role:'MANAGER'});
 // a custom Manager-level role keeps the rule satisfied
 await call('POST','/roles',{name:'Director',level:'MANAGER'});const dir=(await call('POST','/users',{name:'Dir',email:'dir@test.co',role:'DIRECTOR',password:UP})).j.id;
 ok('a custom Manager-level role counts as a Manager',(await call('PATCH','/users/1',{role:'JUNIOR'})).s===200&&(await call('PATCH','/users/1',{role:'MANAGER'})).s===200&&dir>0);
 // ---- permissions and audit
 await as('juma@test.co','x');await call('POST','/login',{email:'amani@test.co',password:UP});
 ok('only a Manager can create, edit or delete roles',(await call('POST','/roles',{name:'Hack',level:'MANAGER'})).s===403&&(await call('PUT','/roles/JUNIOR',{name:'x'})).s===403&&(await call('DELETE','/roles/JUNIOR')).s===403);
 await as('boss2@test.co',UP);
 const acts=(await call('GET','/audit?size=100')).j.items.map(x=>x.action);
 ok('role changes are in the audit log',['role.create','role.update','role.delete'].every(x=>acts.includes(x)),acts);

 // ---- tick boxes: what each role can do is editable
 await as('boss@test.co',AP);
 const cat=(await call('GET','/permissions')).j,keys=cat.groups.flatMap(g=>g.items.map(i=>i.key));
 ok('the permission list is grouped, and each preset adds to the one below',cat.groups.length>=4&&keys.length===new Set(keys).size&&cat.presets.STAFF.every(k=>cat.presets.SENIOR.includes(k))&&cat.presets.SENIOR.every(k=>cat.presets.MANAGER.includes(k))&&cat.presets.MANAGER.length===keys.length&&cat.presets.STAFF.includes('ai.use')&&!cat.presets.STAFF.includes('cases.submit'),cat.presets);
 bs=(await call('GET','/bootstrap')).j;
 const pm=k=>(bs.roles.find(r=>r.key===k)||{}).permissions||[];
 ok('roles made before permissions existed start with their level\'s ticks (nothing changes for anyone)',pm('MANAGER').length===keys.length&&pm('SENIOR').includes('cases.submit')&&pm('SENIOR').includes('vault.manage')&&!pm('SENIOR').includes('reports.view')&&!pm('JUNIOR').includes('cases.submit')&&pm('JUNIOR').includes('ai.use'),[pm('SENIOR'),pm('JUNIOR')]);
 const ty=bs.types[0],mk=async n=>{const cs=(await call('POST','/cases',{clientName:'Tick '+n,caseTypeId:ty.id})).j,dd=(await call('GET','/cases/'+cs.id)).j;for(const x of dd.docs)await call('PATCH','/case-docs/'+x.id,{done:true});await call('POST',`/cases/${cs.id}/move`,{to:'ready'});return cs};
 const tc=await mk(1);
 const au=await call('POST','/roles',{name:'Fee Auditor',permissions:['reports.view','audit.view','nonsense.key','reports.view']});
 ok('a role can be made with just the ticks it needs; unknown ticks are dropped',au.s===200&&pm.length>=0&&(await call('GET','/bootstrap')).j.roles.find(r=>r.key==='FEE_AUDITOR').permissions.join()==='reports.view,audit.view');
 const audU=(await call('POST','/users',{name:'Fee Auditor',email:'fee@test.co',role:'FEE_AUDITOR',password:UP})).j.id;
 await as('fee@test.co',UP);const feeSession=ck;
 ok('the person gets exactly those powers: Reports and audit yes, submitting, roles and WhatsApp no',(await call('GET','/reports/monthly')).s===200&&(await call('GET','/audit')).s===200&&(await call('POST',`/cases/${tc.id}/move`,{to:'submitted'})).s===403&&(await call('POST','/roles',{name:'Nope',level:'STAFF'})).s===403&&(await call('GET','/whatsapp/status')).s===403&&(await call('GET','/me')).j.perms.join()==='reports.view,audit.view');
 await as('boss@test.co',AP);
 ok('ticking another box takes effect in the same session',(await call('PUT','/roles/FEE_AUDITOR',{permissions:['reports.view','audit.view','cases.submit']})).s===200&&(ck=feeSession,(await call('POST',`/cases/${tc.id}/move`,{to:'submitted'})).s===200));
 await as('boss@test.co',AP);
 await call('PUT','/roles/FEE_AUDITOR',{permissions:['cases.retarget']});ck=feeSession;
 ok('changing the client or case type and changing the assignee are separate ticks',(await call('PATCH','/cases/'+tc.id,{assigneeId:1})).s===403&&(await call('PATCH','/cases/'+tc.id,{caseTypeId:ty.id})).s===200&&(await call('GET','/reports/monthly')).s===403);
 await as('boss@test.co',AP);
 await call('PUT','/roles/FEE_AUDITOR',{permissions:['vault.manage','files.manage']});
 ok('a role with all the ticks is shown as Manager level, one with a few as Staff',(await call('PUT','/roles/FEE_AUDITOR',{permissions:keys})).s===200&&(await call('GET','/playbook')).j.roles.find(r=>r.role==='FEE_AUDITOR').level==='MANAGER'&&(await call('PUT','/roles/FEE_AUDITOR',{permissions:['vault.manage']})).s===200&&(await call('GET','/playbook')).j.roles.find(r=>r.role==='FEE_AUDITOR').level==='STAFF');
 ok('a role in use cannot be deleted; an empty one can',(await call('DELETE','/roles/FEE_AUDITOR')).s===400&&(await call('PATCH','/users/'+audU,{role:'JUNIOR'})).s===200&&(await call('DELETE','/roles/FEE_AUDITOR')).s===200);
 const al=(await call('GET','/audit?size=100')).j.items.filter(x=>x.action==='role.update').map(x=>x.details).join(' | ');
 ok('the audit log says which ticks were added and removed',/allowed cases\.submit/.test(al)&&/no longer [^|]*cases\.submit/.test(al),al);
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
