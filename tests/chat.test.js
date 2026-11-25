// Case chat: answers built from one case's own material (details, checklist, history, comments, documents)
let fails=0;
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join(''),MOCK='http://localhost:4020';
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b,raw)=>{const r=await fetch(B+u,{method:m,headers:{...(b&&!raw?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?(raw?b:JSON.stringify(b)):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,600))};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const mlog=async()=>(await fetch(MOCK+'/__log')).json(),mreset=()=>fetch(MOCK+'/__reset');
const upload=async(docId,name,text,type='text/plain')=>{const f=new FormData();f.append('file',new Blob([text],{type}),name);return call('POST','/case-docs/'+docId+'/files',f,true)};
(async()=>{
 await as('boss@test.co',AP);
 await call('POST','/users',{name:'Juma Junior',email:'juma@test.co',role:'JUNIOR',password:UP});
 const types=(await call('GET','/bootstrap')).j.types,cs=(await call('POST','/cases',{clientName:'Chat Client',caseTypeId:types[0].id})).j,d=(await call('GET','/cases/'+cs.id)).j;
 ok('the chat starts empty and says the AI is not set up',(await call('GET',`/cases/${cs.id}/chat`)).j.messages.length===0&&(await call('GET',`/cases/${cs.id}/chat`)).j.ai.configured===false);
 ok('asking before the AI is set up explains what to do',/not set up/.test((await call('POST',`/cases/${cs.id}/chat`,{message:'hello'})).j.error||''));
 await call('PUT','/ai/settings',{provider:'anthropic',api_key:'test-chatkey-0001'});
 ok('an empty or over-long question is refused',(await call('POST',`/cases/${cs.id}/chat`,{message:'  '})).s===400&&(await call('POST',`/cases/${cs.id}/chat`,{message:'x'.repeat(2001)})).s===400);
 ok('a case that does not exist gives 404',(await call('POST','/cases/999999/chat',{message:'hi'})).s===404);
 // material: a text document with a call number and an ID number, a comment, and BRELA's return
 const doc=d.docs[0];
 await upload(doc.id,'resolution.txt','Resolution of the members.\n\nThe registered office of Kilimo Fresh is at Plot 12, Sokoine Road, Arusha.\n\nDirector Zawadi Mushi, national ID 19900101123450000123, phone +255 712 345 678, signed on 2025-03-12.');
 await upload(doc.id,'scan.png','not text','image/png');
 let scanOk=false;try{const cp=require('child_process');cp.execSync('convert -size 760x120 xc:white -pointsize 28 -annotate +20+60 "The lease is signed by Mama Neema in Moshi" /tmp/chat-scan.png',{stdio:'ignore'});cp.execSync('tesseract --version',{stdio:'ignore'});await upload(doc.id,'lease-scan.png',require('fs').readFileSync('/tmp/chat-scan.png'),'image/png');scanOk=true}catch{}
 await call('POST',`/cases/${cs.id}/comments`,{body:'Client will bring the lease on Friday'});
 for(const x of d.docs)await call('PATCH','/case-docs/'+x.id,{done:true});
 await call('POST',`/cases/${cs.id}/move`,{to:'ready'});await call('POST',`/cases/${cs.id}/move`,{to:'submitted'});await call('POST',`/cases/${cs.id}/move`,{to:'returned',reason:'Director address is missing on Form 213a'});
 await mreset();
 const r=await call('POST',`/cases/${cs.id}/chat`,{message:'Where is the registered office? Who signed the lease?'});
 ok('a question gets an answer, stored as a question and an answer',r.s===200&&r.j.messages.length===2&&r.j.messages[0].role==='user'&&r.j.messages[1].role==='assistant'&&/Mock answer/.test(r.j.messages[1].body),r);
 const sent=JSON.stringify((await mlog()).filter(x=>/messages$/.test(x.path)).pop().body);
 ok('the AI is given the case details, checklist, history with BRELA\'s return, comments and the document passage that matches the question',/CASE MATERIAL/.test(sent)&&/\[C1\] Case details/.test(sent)&&/\[C2\] Document checklist/.test(sent)&&/Director address is missing on Form 213a/.test(sent)&&/Client will bring the lease on Friday/.test(sent)&&/Plot 12, Sokoine Road, Arusha/.test(sent)&&/resolution\.txt/.test(sent),sent.slice(0,400));
 ok('privacy is on: the ID number and phone are hidden from the AI but the date and address are not',!/19900101123450000123/.test(sent)&&!/712 345 678/.test(sent)&&/number withheld/.test(sent)&&/2025-03-12/.test(sent));
 ok('the instructions say to answer only from the material and to cite',/only from the CASE MATERIAL/.test(sent)&&/cite/i.test(sent));
 if(scanOk)ok('a scanned picture is read by text recognition, its text is searchable, and the AI is told it came from a scan',/Mama Neema/.test(sent)&&/read by OCR/.test(sent)&&(r.j.scanned||[]).includes('lease-scan.png'),[r.j.scanned,sent.slice(-900)]);
 ok('a picture is reported as unreadable instead of guessed',r.j.unreadable.some(u=>u.name==='scan.png'&&u.why)&&/scan\.png/.test(sent)&&!r.j.unreadable.some(u=>u.name==='lease-scan.png')||!scanOk);
 ok('only sources the AI really cited, and that exist, are shown (the made-up one is dropped)',JSON.stringify(r.j.messages[1].sources.map(s=>s.id))==='["D1","C1","C2"]'&&r.j.messages[1].sources[0].file_id>0&&!r.j.messages[1].sources.some(s=>s.id==='X9'),r.j.messages[1].sources);
 const h=await call('GET',`/cases/${cs.id}/chat`);
 ok('the conversation is kept for the case and tells who asked',h.j.messages.length===2&&h.j.messages[0].by==='Neema'&&h.j.unread.some(u=>u.name==='scan.png'));
 await mreset();await call('POST',`/cases/${cs.id}/chat`,{message:'And who signed?'});
 const sent2=JSON.stringify((await mlog()).filter(x=>/messages$/.test(x.path)).pop().body);
 ok('earlier turns are sent along, so follow-up questions make sense',/CONVERSATION SO FAR/.test(sent2)&&/Where is the registered office\?/.test(sent2));
 // privacy off shows everything
 await call('PUT','/ai/settings',{privacy:'off'});await mreset();await call('POST',`/cases/${cs.id}/chat`,{message:'What is the director ID number?'});
 ok('with privacy off the numbers are sent',/19900101123450000123/.test(JSON.stringify((await mlog()).filter(x=>/messages$/.test(x.path)).pop().body)));
 await call('PUT','/ai/settings',{privacy:'standard'});
 // roles
 await as('juma@test.co',UP);
 ok('a junior who may use the AI can ask and read the same conversation',(await call('POST',`/cases/${cs.id}/chat`,{message:'What is missing?'})).s===200&&(await call('GET',`/cases/${cs.id}/chat`)).j.messages.length>=6);
 ok('but cannot clear it',(await call('DELETE',`/cases/${cs.id}/chat`)).s===403);
 await as('boss@test.co',AP);
 await call('PUT','/roles/JUNIOR',{permissions:[]});await as('juma@test.co',UP);
 ok('a role without "Use the AI assistant" is refused',(await call('POST',`/cases/${cs.id}/chat`,{message:'hello'})).s===403);
 await as('boss@test.co',AP);await call('PUT','/roles/JUNIOR',{permissions:['ai.use']});
 ok('a manager can clear the conversation',(await call('DELETE',`/cases/${cs.id}/chat`)).s===200&&(await call('GET',`/cases/${cs.id}/chat`)).j.messages.length===0);
 ok('chat runs are in the AI usage report as their own kind',(await call('GET','/ai/usage')).j.byKind.some(x=>x.kind==='chat'));
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
