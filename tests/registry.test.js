// Importing a pasted BRELA registry "Company Details" page: the reader (pure) and the save flow
const fs=require('fs'),path=require('path'),R=require('../registry-import.js'),E=require('../docs.js');
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,600))};
const SAMPLE=fs.readFileSync(path.join(__dirname,'fixtures','registry-sample.txt'),'utf8');
const AP=process.env.ADMIN_PASSWORD,B=`http://localhost:${process.env.PORT||3000}/api`;let ck='';
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)ck=sc.split(';')[0];let j;try{j=await r.json()}catch{}return{s:r.status,j}};
(async()=>{
 // ---- the reader
 const r=R.parseRegistry(SAMPLE),v=r.values;
 ok('reads the company details',r.ok&&v.company_name==='DEMOTOP ENTERPRISES COMPANY LIMITED'&&v.incorporation_no==='100000001'&&v.company_type==='Private company Limited by shares',v);
 ok('name is split for the two form boxes',v.company_name_line_1==='DEMOTOP ENTERPRISES'&&v.company_name_line_2==='COMPANY LIMITED');
 ok('incorporation date (M/D/Y) and financial year end',v.date_of_incorporation==='22 January 2015'&&v.date_of_incorporation_iso==='2015-01-22'&&v.financial_year_end==='31 December');
 ok('registered office is one clean line, empty parts skipped',v.registered_office==='Plot 336, Block 40, Togo Street, Kinondoni, Kinondoni, Dar Es Salaam, Tanzania'&&v.postal_address==='P.O. Box 71863, Dar Es Salaam',v.registered_office);
 ok('main business activity and the full list',v.business_activity==='Construction of other civil engineering projects'&&v.main_activity_code==='4290'&&v.business_activities.split('\n').length===28);
 ok('share capital',v.share_capital==='TZS 30,000,000'&&v.number_of_shares==='1000'&&v.nominal_value_per_share==='TZS 30,000'&&v.shares_issued_total==='950'&&v.share_class==='Ordinary',v);
 ok('3 people; one person with 3 roles is one record',r.people.length===3&&r.people.find(p=>p.full_name==='SALMA JUMA MREMA').roles.join()==='director,secretary,shareholder',r.people.map(p=>p.roles));
 const s1=r.people.find(p=>p.full_name==='JUMA HASSAN MREMA');
 ok('person details: NIDA number, date of birth, shares, clean address',s1.id_type==='NIDA'&&s1.id_number==='19700101141110000111'&&s1.dob==='22 March 1964'&&s1.shares==='750'&&/^House 448, Plot 1770, Block 4, Buzwagi Street/.test(s1.address)&&!/Land Mark/.test(s1.address),s1);
 ok('nationality TZ becomes Tanzanian; a missing one is flagged, not guessed',r.people.find(p=>p.full_name==='SALMA JUMA MREMA').nationality==='Tanzanian'&&s1.nationality===''&&r.warnings.some(w=>/Nationality is missing for JUMA/.test(w)),r.warnings);
 ok('conflicting emails are reported',r.warnings.some(w=>/two different email/.test(w)));
 ok('tracking number found',r.tracking==='G000001-0001');
 ok('text that is not a registry page is refused with advice',/does not look like a BRELA/.test(R.parseRegistry('hello world, this is just some other text pasted by mistake').error));
 ok('works with spaces instead of tabs and Windows line endings',R.parseRegistry(SAMPLE.replace(/\t/g,'    ').replace(/\n/g,'\r\n')).values.share_capital==='TZS 30,000,000');
 // ---- saving
 await call('POST','/login',{email:'boss@test.co',password:AP});
 const cl=(await call('POST','/clients',{name:'Registry Test Ltd',phone:'255700000009'})).j,cid=cl.id;
 const pv=await call('POST',`/clients/${cid}/registry-import`,{text:SAMPLE});
 ok('preview saves nothing',pv.s===200&&pv.j.applied===false&&pv.j.people.every(p=>p.status==='new')&&(await call('GET',`/clients/${cid}/people`)).j.length===0);
 const ap=await call('POST',`/clients/${cid}/registry-import`,{text:SAMPLE,apply:true});
 const full=(await call('GET',`/clients/${cid}`)).j,prof=(full.client||full).profile,ppl=full.people||(await call('GET',`/clients/${cid}/people`)).j;
 ok('apply saves the company details, people and tracking number',ap.s===200&&ap.j.added===3&&prof.incorporation_no==='100000001'&&prof.registry_updated&&ppl.length===3,ap.j&&ap.j.error);
 const again=await call('POST',`/clients/${cid}/registry-import`,{text:SAMPLE});
 ok('the same page again changes nothing',again.j.fields.every(f=>f.status==='same')&&again.j.people.every(p=>p.status==='same'));
 // a hand-edited detail and an extra person survive; a registry change is shown as changed
 const salma=ppl.find(p=>p.full_name==='SALMA JUMA MREMA');await call('PUT','/people/'+salma.id,{full_name:salma.full_name,roles:[...salma.roles,'beneficial_owner'],nationality:'Tanzanian',shares:'100'});
 await call('POST',`/clients/${cid}/people`,{full_name:'EXTRA PERSON',roles:['other']});
 const ch=await call('POST',`/clients/${cid}/registry-import`,{text:SAMPLE.replace('P.o.Box:71863','P.o.Box:99999')});
 ok('changed fields are flagged and extra people are kept',ch.j.fields.find(f=>f.key==='postal_address').status==='changed'&&ch.j.kept.some(k=>k.full_name==='EXTRA PERSON'));
 await call('POST',`/clients/${cid}/registry-import`,{text:SAMPLE,apply:true});
 const after=(await call('GET',`/clients/${cid}/people`)).j;
 ok('importing again keeps roles added by hand and does not delete anyone',after.length===4&&after.find(p=>p.full_name==='SALMA JUMA MREMA').roles.includes('beneficial_owner'),after.map(p=>p.roles));
 ok('bad input is refused; short text too',(await call('POST',`/clients/${cid}/registry-import`,{text:'x'.repeat(60)})).s===400&&(await call('POST',`/clients/${cid}/registry-import`,{text:'hi'})).s===400);
 ok('the import is audited',(await call('GET','/audit?size=100')).j.items.some(x=>x.action==='client.registry'));
 // ---- the data reaches the official forms
 const ctx=E.buildContext({client:{name:'Registry Test Ltd'},profile:prof,people:after}),pv2=E.packageValues(ctx);
 ok('official forms get directors, secretary, members and CAPITALS',pv2.DIRECTOR_1_NAME==='JUMA HASSAN MREMA'&&pv2.DIRECTOR_2_DOB==='01/10/1996'&&pv2.SECRETARY_NAME==='SALMA JUMA MREMA'&&pv2.COMPANY_NAME_LINE_1==='DEMOTOP ENTERPRISES'&&/TOGO STREET.*\.$/.test(pv2.REGISTERED_OFFICE)&&pv2.MEMBER_1_SHARES==='750'&&pv2.INCORPORATION_NO==='100000001',pv2);
 // end to end: an imported company fills an official BRELA form
 {await call('POST','/templates/import-package',{});const T=(await call('GET','/bootstrap')).j.types[0].id,tpl=(await call('GET','/templates')).j.find(t=>/Form 131/.test(t.name));
  const cs=(await call('POST','/cases',{clientId:cid,caseTypeId:T})).j,gen=await call('POST',`/cases/${cs.id}/ai/generate-docx`,{template_id:tpl.id});
  const dl=await fetch(`${B}/files/${gen.j.file.id}`,{headers:{cookie:ck}}),txt=(await require('mammoth').extractRawText({buffer:Buffer.from(await dl.arrayBuffer())})).value;
  ok('Form 131 comes out with the imported company name, number, office, activity and secretary',/DEMOTOP ENTERPRISES/.test(txt)&&/100000001/.test(txt)&&/TOGO STREET/.test(txt)&&/CONSTRUCTION OF OTHER CIVIL/i.test(txt)&&/SALMA JUMA MREMA/.test(txt),txt.slice(0,700))}
 console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
