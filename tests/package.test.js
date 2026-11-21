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
 ok('filler places the fields and keeps the standard optional wording (no clause left yellow)',r.filled===43&&r.clauses===0&&r.missing.includes('?ABSENT NAMES'),[r.filled,r.clauses,r.missing]);
 r=await E.docxFill(buf,{...man.defaults,...data.common,...data.T01},{acceptClauses:true});
 ok('manifest defaults fill the rest; nothing stays yellow when clauses are accepted',r.filled===49&&r.missing.length===0&&r.clauses===0,[r.filled,r.missing,r.clauses]);
 {const Z=await require('jszip').loadAsync(r.buffer);let bad=[];for(const f of Object.keys(Z.files).filter(f=>/^word\/.+\.xml$/.test(f))){const x=await Z.file(f).async('string');if((x.match(/<\?xml/g)||[]).length!==1||!x.startsWith('<?xml'))bad.push(f)}
  ok('every XML part of the filled Word file has exactly one XML declaration, at the very start (Word refuses the file otherwise)',bad.length===0&&!!Z.file('word/document.xml'),bad)}
 const text=(await mammoth.extractRawText({buffer:r.buffer})).value;
 ok('the filled Word file contains the sample values',text.includes('RAHU MULTISERVICES COMPANY LIMITED')&&text.includes('Ronald Baraka Shelukindo'));
 // repeating people: slots follow the real number of directors, members and attendees; optional details are blank, not yellow
 {const JSZ=require('jszip'),PERSON=(n,roles)=>({full_name:n,roles,nationality:'TANZANIAN',address:'PLOT 1, DAR ES SALAAM',dob:'1980-01-01',occupation:'BUSINESS',shares:'1000'});
  const vals=(nd,nm)=>{const ppl=[...Array.from({length:nd},(_,i)=>PERSON('DIRECTOR NUMBER '+(i+1),['director','shareholder'])),PERSON('SECRETARY ONE',['secretary']),...Array.from({length:Math.max(0,nm-nd)},(_,i)=>PERSON('EXTRA MEMBER '+(i+1),['shareholder']))];
   const ctx=E.buildContext({client:{name:'LOOP CO LIMITED'},profile:{...Object.fromEntries(Object.entries(data.common).map(([k,v])=>[k.toLowerCase(),v])),date_of_incorporation_iso:'2015-01-22',principal_activities:'TRADING',shares_issued_total:'5000',nominal_value_per_share:'1000',share_class:'Ordinary'},people:ppl});return{...man.defaults,...E.packageValues(ctx)}};
  const fill=async(file,v)=>{const r=await E.docxFill(fs.readFileSync(path.join(PKG,'templates',fs.readdirSync(path.join(PKG,'templates')).find(f=>f.startsWith(file)))),v,{acceptClauses:true});const z=await JSZ.loadAsync(r.buffer),xml=await z.file('word/document.xml').async('string');return{r,xml,txt:(await mammoth.extractRawText({buffer:r.buffer})).value}};
  const f5=await fill('F05',vals(5,5));
  ok('Form 131 lists all 5 directors (the template only has 3 blocks) and nothing is left yellow',[1,2,3,4,5].every(n=>f5.txt.includes('DIRECTOR NUMBER '+n))&&f5.r.missing.length===0&&!/\[DIRECTOR \d/.test(f5.txt),[f5.r.missing]);
  const f1=await fill('F05',vals(1,1));
  ok('a company with one director gets one director block, with no empty slots left over',f1.txt.includes('DIRECTOR NUMBER 1')&&!/\[DIRECTOR|Business occupation:\s*\n+\s*Business occupation/.test(f1.txt)&&(f1.txt.match(/Business occupation/g)||[]).length===1&&f1.r.missing.length===0,[(f1.txt.match(/Business occupation/g)||[]).length,f1.r.missing]);
  ok('optional "IF ANY" details with no value are blank instead of staying yellow',!/IF ANY/.test(f5.txt)&&!/IF ANY/.test(f1.txt)&&!f5.r.missing.some(k=>/_OPT$|IF ANY/.test(k)));
  const t2=await fill('T02',vals(2,2));
  ok('the attendance list of a resolution has one line per director, no spare numbered lines',t2.txt.includes('Director Number 1')&&t2.txt.includes('Director Number 2')&&!/\[ATTENDEE/.test(t2.txt),t2.txt.slice(0,600));
  const t1=await fill('T01',vals(2,8));
  ok('the member lists grow beyond the 7 slots of the template (8 members listed, with their shares)',[1,2,3,4,5,6,7,8].every(n=>(t1.txt.match(/shares\), attended in person|Ordinary, 1,000 shares\)/g)||[]).length>=8)&&/EXTRA MEMBER 6/.test(t1.txt),(t1.txt.match(/attended in person/g)||[]).length);
  ok('the changed file stays valid: one XML declaration, and every table cell ends with a paragraph',[f5,f1,t1,t2].every(x=>(x.xml.match(/<\?xml/g)||[]).length===1)&&[f5,f1].every(x=>!/<\/w:tbl><\/w:tc>/.test(x.xml)),0)}
 // nationality and occupation come from the Company; occupation defaults to the office held
 {const JSZ=require('jszip'),base={...Object.fromEntries(Object.entries(data.common).map(([k,v])=>[k.toLowerCase(),v]))};
  const run=async(file,people,extra={})=>{const ctx=E.buildContext({client:{name:'NAT CO LIMITED'},profile:{...base,...extra},people});const v={...man.defaults,...E.packageValues(ctx)};
   const r=await E.docxFill(fs.readFileSync(path.join(PKG,'templates',fs.readdirSync(path.join(PKG,'templates')).find(f=>f.startsWith(file)))),v,{acceptClauses:true});return{r,txt:(await mammoth.extractRawText({buffer:r.buffer})).value,ctx,v}};
  const P=(n,roles,x={})=>({full_name:n,roles,address:'PLOT 1, DAR',dob:'1980-01-01',...x});
  const f5=await run('F05',[P('ANNA ONE',['director'],{nationality:'TZ'}),P('BEN TWO',['director','secretary'],{nationality:'Tanzania',occupation:'Engineer'}),P('CARL THREE',['director'],{nationality:'Kenya'})]);
  ok('a country written instead of the nationality becomes the nationality (TZ, Tanzania, Kenya)',f5.v.DIRECTOR_1_NATIONALITY==='TANZANIAN'&&f5.v.DIRECTOR_2_NATIONALITY==='TANZANIAN'&&f5.v.DIRECTOR_3_NATIONALITY==='KENYAN',[f5.v.DIRECTOR_1_NATIONALITY,f5.v.DIRECTOR_2_NATIONALITY,f5.v.DIRECTOR_3_NATIONALITY]);
  ok('business occupation: what is saved wins, otherwise Director',f5.v.DIRECTOR_1_OCCUPATION==='DIRECTOR'&&f5.v.DIRECTOR_2_OCCUPATION==='ENGINEER'&&f5.v.DIRECTOR_3_OCCUPATION==='DIRECTOR'&&!/\[DIRECTOR \d OCCUPATION\]/.test(f5.txt),[f5.v.DIRECTOR_1_OCCUPATION,f5.v.DIRECTOR_2_OCCUPATION]);
  const f1d=await run('F01',[P('ANNA ONE',['director'],{nationality:'Tanzanian'})],{});
  ok('Form 213a for a director: occupation is Director and the nationality is filled',f1d.v.OCCUPATION==='DIRECTOR'&&f1d.v.NATIONALITY==='TANZANIAN',[f1d.v.OCCUPATION,f1d.v.NATIONALITY]);
  const f1s=await run('F01',[P('SARA SEC',['secretary'],{nationality:'Tanzanian'})],{});
  ok('Form 213a for a secretary: occupation is Secretary',f1s.v.OCCUPATION==='SECRETARY'&&f1s.v.ROLE_UPPER==='SECRETARY',[f1s.v.OCCUPATION,f1s.v.ROLE_UPPER]);
  const dup=await run('F05',[P('Dan Four',['director'],{nationality:''}),P('DAN  FOUR',['shareholder','director'],{nationality:'Tanzanian',occupation:'Farmer'})]);
  ok('the same person saved twice is one person: nationality and occupation are taken from whichever record has them',dup.v.DIRECTOR_1_NATIONALITY==='TANZANIAN'&&dup.v.DIRECTOR_1_OCCUPATION==='FARMER'&&!dup.v.DIRECTOR_2_NAME,[dup.v.DIRECTOR_1_NATIONALITY,dup.v.DIRECTOR_1_OCCUPATION,dup.v.DIRECTOR_2_NAME]);
  const none=await run('F05',[P('Eve Five',['director'],{nationality:''})]);
  const nd=E.personNeeds(none.r.missing,none.ctx);
  ok('a detail that is really missing is reported with the person\'s name (so it is added on the Company tab)',nd.people.some(x=>x.name==='Eve Five'&&x.fields.includes('nationality'))&&!nd.rest.includes('DIRECTOR_1_NATIONALITY'),nd)}
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
 ok('each official template says which wizard makes it, so the case opens the wizard',t01.wizard==='directors'&&f05.wizard==='annual'&&list.find(t=>/Notice of Call/i.test(t.name)).wizard==='shares',[t01.wizard,f05.wizard]);
 ok('the imported templates carry their exact Word file and are drafts',list.length>=15&&t01.has_docx===true&&f05.kind==='FORM'&&f05.status==='DRAFT',[list.length,t01.has_docx,f05.kind]);
 const g1=(await call('GET','/templates/'+t01.id)).j;
 ok('the text version has {{fields}} in place of the yellow labels and the house rules in the notes',/\{\{company_name\}\}/.test(g1.body)&&/\{\{new_directors_names\}\}/.test(g1.body)&&/\{\{#directors\}\}/.test(g1.body)===false&&g1.ai_notes.includes('USE RULES')&&g1.ai_notes.includes('CLAUSES TO CONFIRM'),[g1.body.slice(0,300),g1.ai_notes&&g1.ai_notes.slice(0,200)]);
 // fill an official Word file from the case details
 await call('PATCH',`/clients/${cl}/profile`,{set:{company_name:'Kilimo Fresh Limited',registered_office:'Mbezi, Kinondoni, P.O. Box 1, Dar es Salaam, Tanzania.',chairman_name:'Zawadi Mushi'}});
 await call('POST',`/clients/${cl}/people`,{full_name:'Zawadi Mushi',roles:['director','secretary']});
 await call('POST',`/clients/${cl}/people`,{full_name:'Juma Kileo',roles:['director','shareholder']});
 ok('an official form is made by its wizard: without answers the case asks for them (one way to make documents)',(await call('POST',`/cases/${c.id}/ai/generate-docx`,{template_id:t01.id})).s===409);
 await call('PUT',`/cases/${c.id}/scenarios/directors`,{answers:{appoint:'Juma Kileo',members_meeting_date:'2026-03-01',members_meeting_time:'09:00'}});
 const gen=await call('POST',`/cases/${c.id}/ai/generate-docx`,{template_id:t01.id});
 ok('an official Word file is filled and attached to the case',gen.s===200&&gen.j.file.filename.endsWith('.docx')&&gen.j.filled>0&&Array.isArray(gen.j.missing)&&gen.j.wizard==='directors',[gen.s,gen.j]);
 const dl=await fetch(`http://localhost:${PORT}/api/files/${gen.j.file.id}`,{headers:{cookie:ck}});
 ok('the filled file downloads as a real Word document',(await dl.arrayBuffer()).byteLength>5000&&dl.headers.get('content-type').includes('wordprocessingml'));
 const g2=gen.j;
 ok('details not on file are reported so the user can add them on the case',g2.missing.every(k=>/^[A-Z0-9 ]+$/.test(k)),g2.missing);
 const after=(await call('GET','/cases/'+c.id)).j;
 ok('the fill is recorded in the case history',after.activity.some(a=>/prepared 1 document/.test(a.text)),after.activity.map(a=>a.text));
 {const c2=(await call('POST','/cases',{clientId:cl,caseTypeId:T})).j;await call('PUT',`/cases/${c2.id}/scenarios/directors`,{answers:{appoint:'Juma Kileo',members_meeting_date:'2026-03-01'}});const g3=await call('POST',`/cases/${c2.id}/ai/generate-docx`,{template_id:t01.id}),miss=(g3.j.missing||[]).map(k=>k.replace(/ /g,'_'));
  ok('a template fills from the Company first: the Articles wording (notice, quorum, Table A) is used when the company has no own provision, so it is not left yellow',g3.s===200&&!miss.some(k=>/^(GM_NOTICE_PROVISION|GM_QUORUM_WORD|GM_QUORUM_PROVISION|TABLE_A_PROVISION|DIRECTORS_NUMBER_PROVISION)$/.test(k)),miss)}
 {const JSZ=require('jszip'),T=d=>fs.readFileSync(path.join(PKG,'templates',fs.readdirSync(path.join(PKG,'templates')).find(f=>f.startsWith(d))));
  const V={...Object.fromEntries(Object.entries(data.common).map(([k,v])=>[k.toLowerCase(),v])),...data.common,COMPANY_NAME:'Rahu Multiservices Company Limited',COMPANY_NAME_LINE_1:'RAHU MULTISERVICES',COMPANY_NAME_LINE_2:'COMPANY LIMITED',RETURN_DATE:'22 JANUARY 2026',SIGNING_DATE_OPT:'1 JANUARY 2020'};
  for(const f of ['F01','F02','F03','F05']){const r=await E.docxFill(T(f),V,{acceptClauses:true}),txt=(await mammoth.extractRawText({buffer:r.buffer})).value;
   ok(f+': the company name is one full name in a single row, with no second name line',txt.includes('RAHU MULTISERVICES COMPANY LIMITED')&&!/COMPANY NAME LINE/.test(txt),txt.slice(0,300))}
  const pv=E.packageValues?E.packageValues({values:{RETURN_DATE:'22 JANUARY 2026'},lists:{}}):null;
  if(pv)ok('Form 131 is signed on the day the return is made up to',pv.SIGNING_DATE_OPT==='22 JANUARY 2026',pv.SIGNING_DATE_OPT)}
 {const T=d=>fs.readFileSync(path.join(PKG,'templates',fs.readdirSync(path.join(PKG,'templates')).find(f=>f.startsWith(d))));
  const pv=E.packageValues({values:{company_name:'Demo Ltd',allottee_1_name:'X'},lists:{directors:[{full_name:'SALMA JUMA MREMA',nationality:'Tanzanian'},{full_name:'Zawadi Kileo'}],secretaries:[],shareholders:[]}});
  ok('names in the body of a resolution read in one style (capitals from the registry become Title Case)',pv.ATTENDEE_1_NAME==='Salma Juma Mrema'&&pv.ATTENDEE_2_NAME==='Zawadi Kileo',[pv.ATTENDEE_1_NAME,pv.ATTENDEE_2_NAME]);
  const base={...data.common,...man.defaults,ALLOTTEE_1_NAME:'ONE',ALLOTTEE_1_SHARES:'30',ALLOTTEE_1_ADDRESS:'A',ALLOTTEE_1_CONSENT_DATE:'1st May 2026',ALLOTTEE_2_NAME:'TWO',ALLOTTEE_2_SHARES:'20',ALLOTTEE_2_ADDRESS:'B',ALLOTTEE_2_CONSENT_DATE:'1st May 2026'};
  const r=await E.docxFill(T('F03'),base,{acceptClauses:true}),txt=(await mammoth.extractRawText({buffer:r.buffer})).value;
  ok('Form 57a: unused allottee slots are removed and are not reported as missing (the default "Ordinary" class does not count as a person)',!/ALLOTTEE [34]/.test(txt)&&!r.missing.some(k=>/^ALLOTTEE_[34]_/.test(k)),r.missing)}
 {const T=d=>fs.readFileSync(path.join(PKG,"templates",fs.readdirSync(path.join(PKG,"templates")).find(f=>f.startsWith(d)))),text=async r=>{const f=await fetch(`http://localhost:${PORT}/api/files/${r.j.file.id}`,{headers:{cookie:ck}});return (await mammoth.extractRawText({buffer:Buffer.from(await f.arrayBuffer())})).value};
  const t1=await text(gen);ok('the standard wording is kept, not left yellow, when nothing says otherwise',/with effect from the time of receipt of that consent/.test(t1),t1.slice(0,200));
  await call('PUT',`/cases/${c.id}/scenarios/directors`,{answers:{appoint:'Juma Kileo',members_meeting_date:'2026-03-01',consent_effect:'resolution'}});
  const g4=await call('POST',`/cases/${c.id}/ai/generate-docx`,{template_id:t01.id}),t2=await text(g4);
  ok('a wizard question removes optional wording: "effect on receipt of consent" is taken out cleanly',!/receipt of that consent/.test(t2)&&!/\s,/.test(t2.split('\n').find(l=>/RESOLVED/.test(l))||''),t2.slice(0,300));
  const r1=await E.docxFill(T('T07B'),{...man.defaults,...data.common,...data.T07B,CLAUSE_AT_NOMINAL:'no'}),x1=(await mammoth.extractRawText({buffer:r1.buffer})).value;
  ok('"at nominal value" is removed when the price differs from the nominal value and kept otherwise',!/at nominal value/.test(x1)&&/allotted to/.test(x1)&&!/ ,/.test(x1.replace(/\n/g,' ')),x1.slice(0,50));
  const r2=await E.docxFill(T('T07B'),{...man.defaults,...data.common,...data.T07B}),x2=(await mammoth.extractRawText({buffer:r2.buffer})).value;
  ok('no optional wording is left highlighted once the wizard has decided',r2.clauses===0&&/at nominal value/.test(x2),r2.clauses)}
 {const T4=fs.readFileSync(path.join(PKG,'templates',fs.readdirSync(path.join(PKG,'templates')).find(f=>f.startsWith('T04')))),r=await E.docxFill(T4,{...man.defaults,...data.common,...data.T04,CLAUSE_PAY_BANK:'no'}),x=(await mammoth.extractRawText({buffer:r.buffer})).value;
  ok('removing "or into a bank account..." leaves clean punctuation (no ",.")',/registered office of the company\./.test(x)&&!/company,\./.test(x),x.slice(0,10))}
 ok('only real templates can be filled this way',(await call('POST',`/cases/${c.id}/ai/generate-docx`,{template_id:99999})).s===404);
})();
