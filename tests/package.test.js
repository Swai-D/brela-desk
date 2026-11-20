// The official Word template package: import into Templates, fill an original .docx from the case details
const E=require('../docs.js'),fs=require('fs'),path=require('path'),mammoth=require('mammoth');
let fails=0;
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join('');
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,700))};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const PKG=path.join(__dirname,'..','Templates_Package','Templates_Package');
(async()=>{
 // unit: the Node port of fill_template.py against the shipped sample data
 const man=JSON.parse(fs.readFileSync(path.join(PKG,'templates','manifest.json'),'utf8')),data=JSON.parse(fs.readFileSync(path.join(PKG,'sample_data_RAHU.json'),'utf8'));
 const buf=fs.readFileSync(path.join(PKG,'templates','T01_Members_Resolution_Appointment_of_Directors.docx'));
 let r=await E.docxFill(buf,{...data.common,...data.T01});
 ok('filler places the fields and reports the clause highlights',r.filled===49&&r.clauses===2&&r.missing.includes('?ABSENT NAMES'),[r.filled,r.clauses,r.missing]);
 r=await E.docxFill(buf,{...man.defaults,...data.common,...data.T01},{acceptClauses:true});
 ok('manifest defaults fill the rest; nothing stays yellow when clauses are accepted',r.filled===55&&r.missing.length===0&&r.clauses===0,[r.filled,r.missing,r.clauses]);
 {const Z=await require('jszip').loadAsync(r.buffer);let bad=[];for(const f of Object.keys(Z.files).filter(f=>/^word\/.+\.xml$/.test(f))){const x=await Z.file(f).async('string');if((x.match(/<\?xml/g)||[]).length!==1||!x.startsWith('<?xml'))bad.push(f)}
  ok('every XML part of the filled Word file has exactly one XML declaration, at the very start (Word refuses the file otherwise)',bad.length===0&&!!Z.file('word/document.xml'),bad)}
 const text=(await mammoth.extractRawText({buffer:r.buffer})).value;
 ok('the filled Word file contains the sample values',text.includes('RAHU MULTISERVICES COMPANY LIMITED')&&text.includes('Ronald Baraka Shelukindo'));
 // api
 await as('boss@test.co',AP);
 await call('POST','/users',{name:'Juma Junior',email:'juma@test.co',role:'JUNIOR',password:UP});
 const bs=(await call('GET','/bootstrap')).j,T=bs.types[0].id;
 const cl=(await call('POST','/clients',{name:'Kilimo Fresh Ltd',phone:'0712 345 678'})).j.id;
 const c=(await call('POST','/cases',{clientId:cl,caseTypeId:T})).j;
 await as('juma@test.co',UP);
 ok('staff cannot import the package',(await call('POST','/templates/import-package',{})).s===403);
 await as('boss@test.co',AP);
 let imp=await call('POST','/templates/import-package',{});
 ok('importing creates every package template',imp.s===200&&imp.j.created.length===man.templates.length&&imp.j.skipped.length===0,[imp.j.created&&imp.j.created.length,imp.j.skipped&&imp.j.skipped.length]);
 imp=await call('POST','/templates/import-package',{});
 ok('importing again skips the templates that already exist',imp.j.created.length===0&&imp.j.skipped.length===man.templates.length,imp.j);
 const list=(await call('GET','/templates')).j,t01=list.find(t=>t.name.startsWith("Members' Resolution"));
 const f05=list.find(t=>t.name.includes('Form 131'));
 ok('the imported templates carry their exact Word file and are drafts',list.length>=15&&t01.has_docx===true&&f05.kind==='FORM'&&f05.status==='DRAFT',[list.length,t01.has_docx,f05.kind]);
 const g1=(await call('GET','/templates/'+t01.id)).j;
 ok('the text version has {{fields}} in place of the yellow labels and the house rules in the notes',/\{\{company_name\}\}/.test(g1.body)&&/\{\{new_directors_names\}\}/.test(g1.body)&&/\{\{#directors\}\}/.test(g1.body)===false&&g1.ai_notes.includes('USE RULES')&&g1.ai_notes.includes('CLAUSES TO CONFIRM'),[g1.body.slice(0,300),g1.ai_notes&&g1.ai_notes.slice(0,200)]);
 // fill an official Word file from the case details
 await call('PATCH',`/clients/${cl}/profile`,{set:{company_name:'Kilimo Fresh Limited',registered_office:'Mbezi, Kinondoni, P.O. Box 1, Dar es Salaam, Tanzania.',chairman_name:'Zawadi Mushi'}});
 await call('POST',`/clients/${cl}/people`,{full_name:'Zawadi Mushi',roles:['director','secretary']});
 await call('POST',`/clients/${cl}/people`,{full_name:'Juma Kileo',roles:['director','shareholder']});
 await call('PATCH',`/cases/${c.id}/data`,{set:{members_meeting_date:'1 March 2026',new_directors_names:'Juma Kileo',existing_directors_names:'Zawadi Mushi',directors_number_provision:'Article 5 of the Articles',gm_quorum_word:'two',gm_quorum_provision:'Article 4(b)',members_meeting_time:'09:00',gm_notice_provision:'Article 4(a)'}});
 const gen=await call('POST',`/cases/${c.id}/ai/generate-docx`,{template_id:t01.id});
 ok('an official Word file is filled and attached to the case',gen.s===200&&gen.j.file.filename.endsWith('.docx')&&gen.j.filled>0&&Array.isArray(gen.j.missing),gen.j.filled);
 const dl=await fetch(`http://localhost:${PORT}/api/files/${gen.j.file.id}`,{headers:{cookie:ck}});
 ok('the filled file downloads as a real Word document',(await dl.arrayBuffer()).byteLength>5000&&dl.headers.get('content-type').includes('wordprocessingml'));
 const g2=gen.j;
 ok('details not on file are reported so the user can add them on the case',g2.missing.length>0&&g2.missing.includes('NEW_DIRECTOR_1_NAME')&&g2.missing.every(k=>/^[A-Z0-9_]+$/.test(k)),g2.missing);
 const after=(await call('GET','/cases/'+c.id)).j;
 ok('the fill is recorded in the case history',after.activity.some(a=>/official Word template/.test(a.text)),after.activity.map(a=>a.text));
 ok('only real templates can be filled this way',(await call('POST',`/cases/${c.id}/ai/generate-docx`,{template_id:99999})).s===404);
})();
