// Doc Studio: private saved signatures, the file info endpoint, and saving signed / converted PDFs into the client folder and case.
let fails=0;let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b,raw)=>{const r=await fetch(B+u,{method:m,headers:{...(b&&!raw?{'Content-Type':'application/json'}:{}),cookie:ck},body:raw?b:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];const buf=Buffer.from(await r.arrayBuffer()),t=buf.toString('utf8');let j={};try{j=JSON.parse(t)}catch{}return{s:r.status,j,buf,type:r.headers.get('content-type')||''}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join('');
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
const pdf=n=>Buffer.from('%PDF-1.4\n% studio test '+'x'.repeat(n||0)+'\n%%EOF');
const form=(o,file,name,type)=>{const fd=new FormData();for(const [k,v] of Object.entries(o||{}))fd.append(k,String(v));if(file)fd.append('file',new Blob([file],{type}),name);return fd};
const sig=(o,file=PNG,type='image/png')=>call('POST','/me/signatures',form(o,file,'s.png',type),true);
const save=o=>call('POST','/studio/save',form(o.f,o.file===undefined?pdf():o.file,o.name||'out.pdf','application/pdf'),true);
(async()=>{
 await as('boss@test.co',AP);
 const mk=async(name,email,role)=>(await call('POST','/users',{name,email,role,password:UP})).j.id;
 const juma=await mk('Juma Junior','juma@test.co','JUNIOR'),kaya=await mk('Kaya Junior','kaya@test.co','JUNIOR');
 const t1=(await call('GET','/bootstrap')).j.types[0].id,cl=(await call('POST','/clients',{name:'Studio Client'})).j.id;
 const cs=(await call('POST','/cases',{clientId:cl,caseTypeId:t1,assigneeId:juma})).j,docs=(await call('GET','/cases/'+cs.id)).j.docs;

 // ---- saved signatures
 await as('juma@test.co',UP);
 ok('a new user has no saved signatures',(await call('GET','/me/signatures')).j.length===0);
 ok('a signature must be a PNG',(await sig({name:'Bad'},Buffer.from('not an image'),'image/png')).s===400);
 ok('a signature needs a file',(await call('POST','/me/signatures',form({name:'None'}),true)).s===400);
 const s1=(await sig({name:'Full signature'})).j;
 ok('the first signature is saved and becomes the default',!!s1.id&&s1.is_default===true&&s1.kind==='signature',s1);
 const s2=(await sig({name:'Initials'})).j;
 ok('a second signature is not the default unless asked',s2.is_default===false);
 const st=(await sig({name:'Company stamp',kind:'stamp',isDefault:1})).j;
 ok('a stamp never takes over as the default signature',st.kind==='stamp'&&st.is_default===false);
 const s3=(await sig({name:'Preferred',isDefault:1})).j;
 const list=(await call('GET','/me/signatures')).j;
 ok('asking for a new default moves the default',list.filter(x=>x.is_default).length===1&&list.find(x=>x.is_default).id===s3.id&&list.length===4,list);
 const img=await call('GET','/me/signatures/'+s1.id+'/image');
 ok('the owner can load the image back unchanged',img.s===200&&/image\/png/.test(img.type)&&img.buf.equals(PNG)&&/no-store/.test((await fetch(B+'/me/signatures/'+s1.id+'/image',{headers:{cookie:ck}})).headers.get('cache-control')||''));
 ok('rename works and an empty name is refused',(await call('PATCH','/me/signatures/'+s2.id,{name:'My initials'})).s===200&&(await call('PATCH','/me/signatures/'+s2.id,{name:'  '})).s===400);
 ok('the default can be set back',(await call('PATCH','/me/signatures/'+s1.id,{isDefault:true})).s===200&&(await call('GET','/me/signatures')).j.find(x=>x.is_default).id===s1.id);
 ok('a stamp cannot be made the default signature',(await call('PATCH','/me/signatures/'+st.id,{isDefault:true})).s===200&&(await call('GET','/me/signatures')).j.find(x=>x.is_default).id===s1.id);
 await as('kaya@test.co',UP);
 ok("nobody else can see or load someone's signature",(await call('GET','/me/signatures')).j.length===0&&(await call('GET','/me/signatures/'+s1.id+'/image')).s===404&&(await call('DELETE','/me/signatures/'+s1.id)).s===404&&(await call('PATCH','/me/signatures/'+s1.id,{name:'x'})).s===404);
 await as('juma@test.co',UP);
 ok('deleting the default hands the default to another signature (not a stamp)',(await call('DELETE','/me/signatures/'+s1.id)).s===200);
 const after=(await call('GET','/me/signatures')).j;
 ok('exactly one default signature remains after deleting the default',after.filter(x=>x.is_default).length===1&&after.find(x=>x.is_default).kind==='signature',after);
 let n=after.length;let over=null;while(n<12){const r=await sig({name:'Filler '+n});if(r.s!==200){over=r;break}n++}
 ok('a person can keep up to 12 signatures and stamps',n===12&&(await sig({name:'One too many'})).s===400,over);
 ok('an oversized signature image is refused',(await sig({name:'Huge'},Buffer.concat([PNG,Buffer.alloc(2.2*1024*1024)]))).s===400);

 // ---- file info
 const up=await call('POST','/case-docs/'+docs[0].id+'/files',form({},pdf(),'declaration.pdf','application/pdf'),true);
 const fid=up.j.id,info=(await call('GET','/files/'+fid+'/info')).j;
 ok('file info tells Studio where a file belongs',info.id===fid&&info.client_id===cl&&info.case_id===cs.id&&info.case_doc_id===docs[0].id&&info.doc_name===docs[0].name&&/pdf/.test(info.mime)&&info.case_code===cs.code,info);
 ok('file info for a missing file is a 404',(await call('GET','/files/999999/info')).s===404);

 // ---- saving results
 ok('only a real PDF can be saved',(await save({file:Buffer.from('hello'),f:{clientId:cl}})).s===400);
 ok('a client is required',(await save({f:{}})).s===400);
 ok('an unknown checklist item is refused',(await save({f:{caseDocId:999999}})).s===400);
 const r1=await save({name:'signed.pdf',f:{clientId:cl,filename:'My signed form',action:'sign',sigIds:s3.id,pages:2,source:'declaration.pdf'}});
 ok('a PDF can be saved into the client folder with .pdf added to the name',r1.s===200&&r1.j.filename==='My signed form.pdf'&&r1.j.clientId===cl&&r1.j.caseId===null,r1);
 ok('it is stored and downloadable like any file',(await call('GET','/files/'+r1.j.id)).buf.equals(pdf()));
 const d0=(await call('GET','/cases/'+cs.id)).j;
 const r2=await save({file:pdf(500),f:{caseDocId:docs[1].id,filename:'nida.pdf',action:'pdf',images:2,markDone:'1'}});
 const d1=(await call('GET','/cases/'+cs.id)).j;
 ok('saving against a checklist item files it under the case and ticks it',r2.s===200&&r2.j.caseId===cs.id&&r2.j.caseDocId===docs[1].id&&d1.docs.find(x=>x.id===docs[1].id).done===true&&d1.docs.find(x=>x.id===docs[1].id).files.some(f=>f.id===r2.j.id),r2);
 const r3=await save({f:{caseDocId:docs[2].id,filename:'later.pdf',action:'sign',markDone:'0'}});
 ok('the checklist item stays unticked when asked not to mark it ready',r3.s===200&&(await call('GET','/cases/'+cs.id)).j.docs.find(x=>x.id===docs[2].id).done===false);
 const r4=await save({f:{caseId:cs.id,filename:'case-level.pdf',action:'sign'}});
 ok('a result can be saved to a case without a checklist item',r4.s===200&&r4.j.caseId===cs.id&&r4.j.caseDocId===null);
 const hist=(await call('GET','/cases/'+cs.id+'/history?size=50')).j;const texts=JSON.stringify(hist);
 ok('the case history says what happened',/signed/.test(texts)&&/made \\"nida\.pdf\\" from 2 image/.test(texts),texts.slice(0,400));
 ok('the history names the checklist item',new RegExp('for '+docs[1].name.replace(/[()/\\.]/g,'.')).test(texts),texts.slice(0,300));

 // ---- replacing the original
 const before=(await call('GET','/files/'+fid)).buf;
 const rp=await save({file:pdf(900),f:{caseDocId:docs[0].id,mode:'replace',replaceFileId:fid,filename:'ignored.pdf',action:'sign',markDone:'1'}});
 const afterBuf=(await call('GET','/files/'+fid)).buf;
 ok('replace overwrites the original in place and keeps its name',rp.s===200&&rp.j.id===fid&&rp.j.filename==='declaration.pdf'&&!afterBuf.equals(before)&&afterBuf.equals(pdf(900)),rp);
 ok('replacing does not create a second file',(await call('GET','/cases/'+cs.id)).j.docs.find(x=>x.id===docs[0].id).files.length===1);
 await as('kaya@test.co',UP);
 ok('someone who did not upload the file cannot replace it',(await save({f:{caseDocId:docs[0].id,mode:'replace',replaceFileId:fid,action:'sign'}})).s===403);
 ok('but they can save their own new copy',(await save({f:{caseDocId:docs[0].id,filename:'kaya-copy.pdf',action:'sign'}})).s===200);
 await as('boss@test.co',AP);
 ok('a Manager can replace anyone\'s file',(await save({file:pdf(30),f:{caseDocId:docs[0].id,mode:'replace',replaceFileId:fid,action:'sign'}})).s===200);
 const png=await call('POST','/clients/'+cl+'/files',form({},PNG,'photo.png','image/png'),true);
 ok('only a PDF can be replaced by a PDF',(await save({f:{clientId:cl,mode:'replace',replaceFileId:png.j.id,action:'sign'}})).s===400);
 ok('replacing a missing file is a 404',(await save({f:{clientId:cl,mode:'replace',replaceFileId:999999,action:'sign'}})).s===404);
 ok('a result over 15 MB is refused',(await save({file:pdf(16*1024*1024),f:{clientId:cl}})).s===400);

 // ---- audit
 const au=(await call('GET','/audit?size=100')).j.items,acts=au.map(x=>x.action);
 ok('creating and deleting signatures is audited',acts.includes('signature.create')&&acts.includes('signature.delete'));
 ok('using a signature is audited with its name and the file',au.some(x=>x.action==='signature.use'&&/Preferred/.test(x.details)&&/My signed form\.pdf/.test(x.details)),au.filter(x=>/signature/.test(x.action)).slice(0,3));
 ok('converting images is audited',au.some(x=>x.action==='studio.pdf'&&/nida\.pdf/.test(x.details)));
 ok('only the signer\'s own signatures are named in the audit log',!au.some(x=>x.action==='signature.use'&&/Initials/.test(x.details)&&/later|case-level/.test(x.details)));
 // ---- pages and libraries are served
 const pg=await fetch(`http://localhost:${PORT}/studio.html`),html=await pg.text();
 ok('the Studio page is served with versioned scripts and the PDF libraries',pg.status===200&&/assets\/js\/studio\.js\?v=/.test(html)&&/assets\/js\/studio-tools\.js\?v=/.test(html)&&/pdf-lib\.min\.js\?v=/.test(html)&&/pdf\.min\.js\?v=/.test(html)&&/data-page="studio"/.test(html));
 const worker=await fetch(`http://localhost:${PORT}/assets/libs/pdfjs/pdf.worker.min.js`);
 ok('the pdf.js worker is served as JavaScript',worker.status===200&&/javascript/.test(worker.headers.get('content-type')||''));
 const idx=await (await fetch(`http://localhost:${PORT}/index.html`)).text();
 ok('every page has the Doc Studio menu entry',/href="studio\.html"/.test(idx)&&/Doc Studio/.test(idx));
 ok('signed-out people cannot reach signatures or saving',(ck='',(await call('GET','/me/signatures')).s===401&&(await save({f:{clientId:cl}})).s===401));
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
