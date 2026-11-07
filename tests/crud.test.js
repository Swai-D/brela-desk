let fails=0;
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b,raw)=>{const r=await fetch(B+u,{method:m,headers:{...(b&&!raw?{'Content-Type':'application/json'}:{}),cookie:ck},body:raw?b:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join(''),OP=['old','-pass'].join(''),NP=['new','-pass'].join('');
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const upload=async(path,name)=>{const fd=new FormData();fd.append('file',new Blob(['data'],{type:'application/pdf'}),name);return call('POST',path,fd,true)};
(async()=>{
 await as('boss@test.co',AP);
 const mk=async(name,email,role)=>(await call('POST','/users',{name,email,role,password:UP})).j.id;
 const sia=await mk('Sia Senior','sia@test.co','SENIOR'),juma=await mk('Juma Junior','juma@test.co','JUNIOR'),kaya=await mk('Kaya Junior','kaya@test.co','JUNIOR'),temp=await mk('Temp Person','temp@test.co','ASSOCIATE');
 // ---- team
 ok('manager edits name and email',(await call('PATCH','/users/'+kaya,{name:'Kaya Kileo',email:'Kaya.K@test.co'})).s===200&&(await call('GET','/bootstrap')).j.users.find(u=>u.id===kaya).email==='kaya.k@test.co');
 ok('duplicate email rejected',(await call('PATCH','/users/'+kaya,{email:'juma@test.co'})).s===400);
 ok('invalid email rejected',(await call('PATCH','/users/'+kaya,{email:'nope'})).s===400);
 ok('cannot delete yourself',(await call('DELETE','/users/1')).s===400);
 ok('delete a person with no history',(await call('DELETE','/users/'+temp)).s===200&&!(await call('GET','/bootstrap')).j.users.some(u=>u.id===temp));
 // ---- types, clients, cases
 const types=(await call('GET','/bootstrap')).j.types;const t1=types[0].id,t2=types[1].id;
 const unused=(await call('POST','/case-types',{name:'Unused type',docs:['x']})).j.id;
 ok('delete an unused case type',(await call('DELETE','/case-types/'+unused)).s===200);
 const a=(await call('POST','/clients',{name:'Client A'})).j.id,b=(await call('POST','/clients',{name:'Client B'})).j.id,empty=(await call('POST','/clients',{name:'Empty Client'})).j.id;
 const c1=(await call('POST','/cases',{clientId:a,caseTypeId:t1,assigneeId:juma,due:'2026-12-01'})).j;
 ok('cannot delete a case type in use',(await call('DELETE','/case-types/'+t1)).s===400);
 ok('cannot delete a client with cases',(await call('DELETE','/clients/'+a)).s===400);
 ok('delete a client without cases',(await call('DELETE','/clients/'+empty)).s===200);
 // client rename permissions
 await as('juma@test.co',UP);
 ok('junior cannot rename a client but can fix a phone',(await call('PATCH','/clients/'+a,{name:'Hacked'})).s===403&&(await call('PATCH','/clients/'+a,{phone:'0712 000 111'})).s===200);
 await as('sia@test.co',UP);
 ok('senior renames a client; duplicate name rejected',(await call('PATCH','/clients/'+a,{name:'Client A Ltd'})).s===200&&(await call('PATCH','/clients/'+a,{name:'Client B'})).s===400);
 ok('senior cannot change a case client or type',(await call('PATCH','/cases/'+c1.id,{clientId:b})).s===403&&(await call('PATCH','/cases/'+c1.id,{caseTypeId:t2})).s===403);
 ok('senior can change assignee and clear the due date',(await call('PATCH','/cases/'+c1.id,{assigneeId:kaya,due:''})).s===200);
 ok('senior cannot delete a case',(await call('DELETE','/cases/'+c1.id)).s===403);
 await as('boss@test.co',AP);
 ok('manager moves a case to another client and type',(await call('PATCH','/cases/'+c1.id,{clientId:b,caseTypeId:t2})).s===200);
 let d=(await call('GET','/cases/'+c1.id)).j;
 ok('changes stuck, due cleared, history logged',d.case.client_id===b&&d.case.case_type_id===t2&&d.case.due===null&&d.activity[0].text.includes('changed'),d.case);
 // ---- docs, files, comments
 const doc=d.docs[0];
 await as('juma@test.co',UP);ck=ck;
 ok('junior cannot rename a checklist item',(await call('PATCH','/case-docs/'+doc.id,{name:'x'})).s===403);
 const up=await upload(`/case-docs/${doc.id}/files`,'scan.pdf');
 ok('uploader renames own file',(await call('PATCH','/files/'+up.j.id,{filename:'ID scan (clear).pdf'})).s===200);
 await as('kaya.k@test.co',UP);
 ok('another junior cannot rename or delete it',(await call('PATCH','/files/'+up.j.id,{filename:'x'})).s===403&&(await call('DELETE','/files/'+up.j.id)).s===403);
 const cm=(await call('POST',`/cases/${c1.id}/comments`,{body:'my note'}));
 await as('juma@test.co',UP);
 await call('POST',`/cases/${c1.id}/comments`,{body:'juma note'});
 let cs=(await call('GET','/cases/'+c1.id)).j.comments;const mine=cs.find(x=>x.body==='juma note'),kn=cs.find(x=>x.body==='my note');
 ok('edit own comment (marked edited); not others\'',(await call('PATCH','/comments/'+mine.id,{body:'juma note v2'})).s===200&&(await call('PATCH','/comments/'+kn.id,{body:'x'})).s===403&&(await call('GET','/cases/'+c1.id)).j.comments.find(x=>x.id===mine.id).edited_at!==null);
 ok('cannot delete someone else\'s comment',(await call('DELETE','/comments/'+kn.id)).s===403);
 await as('sia@test.co',UP);
 ok('senior renames a checklist item',(await call('PATCH','/case-docs/'+doc.id,{name:'Renamed item'})).s===200&&(await call('GET','/cases/'+c1.id)).j.docs[0].name==='Renamed item');
 // ---- vault
 const cred=(await call('POST',`/clients/${b}/credentials`,{label:'ORS',username:'u1',password:OP})).j.id;
 ok('senior edits a credential; new password works',(await call('PATCH','/credentials/'+cred,{label:'BRELA ORS',username:'u2',password:NP})).s===200&&(await call('POST',`/credentials/${cred}/reveal`)).j.password===NP);
 await as('juma@test.co',UP);
 ok('junior cannot edit or delete credentials',(await call('PATCH','/credentials/'+cred,{label:'x'})).s===403&&(await call('DELETE','/credentials/'+cred)).s===403);
 await as('boss@test.co',AP);
 ok('manager deletes another person\'s comment',(await call('DELETE','/comments/'+kn.id)).s===200);
 ok('manager deletes a file',(await call('DELETE','/files/'+up.j.id)).s===200);
 ok('manager deletes a credential',(await call('DELETE','/credentials/'+cred)).s===200&&(await call('GET','/clients/'+b)).j.creds.length===0);
 ok('cannot delete a person with work history',(await call('DELETE','/users/'+juma)).s===400);
 // ---- delete case
 ok('manager deletes a case with all its content',(await call('DELETE','/cases/'+c1.id)).s===200&&(await call('GET','/cases/'+c1.id)).s===404);
 ok('delete unknown case is a clean 404',(await call('DELETE','/cases/999999')).s===404);
 ok('client can now be deleted',(await call('DELETE','/clients/'+b)).s===200);
 // ---- audit
 const au=(await call('GET','/audit')).j;const acts=au.map(x=>x.action);
 ok('audit log records sensitive actions',['user.delete','user.update','case_type.delete','client.delete','case.update','case.delete','credential.update','credential.delete','comment.delete','file.delete'].every(x=>acts.includes(x))&&au[0].actor_name==='Neema',acts);
 await as('juma@test.co',UP);ok('audit log is Manager only',(await call('GET','/audit')).s===403);
 ok('only a Manager can delete users and types',(await call('DELETE','/users/'+sia)).s===403&&(await call('DELETE','/case-types/'+t2)).s===403);
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
