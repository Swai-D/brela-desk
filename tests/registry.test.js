// Importing a pasted BRELA registry "Company Details" page: the reader (pure) and the save flow
const fs=require('fs'),path=require('path'),R=require('../registry-import.js'),E=require('../docs.js');
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,600))};
const SAMPLE=fs.readFileSync(path.join(__dirname,'fixtures','registry-sample.txt'),'utf8'),SAMPLE2=fs.readFileSync(path.join(__dirname,'fixtures','registry-sample-2.txt'),'utf8');
const AP=process.env.ADMIN_PASSWORD,B=`http://localhost:${process.env.PORT||3000}/api`;let ck='';
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)ck=sc.split(';')[0];let j;try{j=await r.json()}catch{}return{s:r.status,j}};
(async()=>{
 // ---- the reader
 const r=R.parseRegistry(SAMPLE),v=r.values;
 ok('reads the company details',r.ok&&v.company_name==='DEMOTOP ENTERPRISES COMPANY LIMITED'&&v.incorporation_no==='100000001'&&v.company_type==='Private company Limited by shares',v);
 ok('name is split for the two form boxes',v.company_name_line_1==='DEMOTOP ENTERPRISES'&&v.company_name_line_2==='COMPANY LIMITED');
 ok('incorporation date (M/D/Y) and financial year end',v.date_of_incorporation==='22 January 2015'&&v.date_of_incorporation_iso==='2015-01-22'&&v.financial_year_end==='31 December');
 ok('registered office is one clean line, empty parts skipped',v.registered_office==='Plot 336, Block 40, Togo Street, Kinondoni, Kinondoni, Dar Es Salaam, Tanzania'&&v.postal_address==='P.O. Box 71863, Dar Es Salaam',v.registered_office);
 ok('main business activity and the full list',v.business_activity==='Construction of other civil engineering projects'&&v.main_activity_code==='4290'&&r.activities.length===28&&r.activities.filter(a=>a.main).length===1&&!v.business_activities);
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
 // ---- second page layout: empty street fields, "--", Unsurveyed Area, 5 shareholders, 40 activities, share table with class and value
 {const r2=R.parseRegistry(SAMPLE2),v2=r2.values,al=r2.people.find(p=>p.full_name==='ALI OMARI KAZI'),bk=r2.people.find(p=>p.full_name==='BAKARI JUMA LEO');
  ok('page 2: all 40 activities kept, none marked main -> first is used with a warning',r2.activities.length===40&&v2.business_activity===r2.activities[0].name&&r2.warnings.some(w=>/No activity is marked as Main/.test(w)),r2.warnings);
  ok('page 2: registered office with empty street/block/plot is clean',v2.registered_office==='Demoward, Temeke, Dar Es Salaam, Tanzania'&&v2.registered_po_box==='47'&&v2.postal_code==='15000'&&v2.company_address_line_1==='Demoward',v2);
  ok('page 2: 3 directors, 5 shareholders, ALI has 3 roles and nationality from the secretary section',r2.counts.directors===3&&r2.counts.shareholders===5&&al.roles.join()==='director,secretary,shareholder'&&al.nationality==='Tanzanian'&&bk.nationality==='',r2.counts);
  ok('page 2: nothing is lost: gender, structured address, unsurveyed area, share class and value',al.gender==='Male'&&al.addr.unsurveyed==='Karibu na shule Demotown'&&al.addr.postcode==='15001'&&al.addr.region==='Dar Es Salaam'&&!al.addr.street&&!al.addr.pobox&&al.share_class==='Ordinary'&&al.share_value==='5000'&&al.ownership==='Direct'&&/^Karibu na shule Demotown, Demotown, Temeke/.test(al.address),al);
  ok('page 2: share totals add up (no mismatch warning)',v2.shares_issued_total==='7120'&&!r2.warnings.some(w=>/Shareholders hold/.test(w)));
  // save: every detail is stored and shown back
  const c2=(await call('POST','/clients',{name:'Registry Two Ltd',phone:'255700000010'})).j.id;
  const pv=await call('POST',`/clients/${c2}/registry-import`,{text:SAMPLE2});
  ok('preview reports the activities',pv.j.activities.count===40,pv.j.activities);
  await call('POST',`/clients/${c2}/registry-import`,{text:SAMPLE2,apply:true});
  const f2=(await call('GET',`/clients/${c2}`)).j,pp=f2.people.find(p=>p.full_name==='ALI OMARI KAZI');
  ok('all 40 activities are stored on the client; people keep gender, address parts, share class',f2.client.activities.length===40&&pp.gender==='Male'&&pp.addr.unsurveyed&&pp.share_class==='Ordinary'&&pp.share_value==='5000',pp);
  // a hand edit of the extra fields survives a second import
  await call('PUT','/people/'+pp.id,{...pp,occupation:'Businessman',previous_names:'',addr:{...pp.addr,street:'Mfano Street'}});
  const e2=(await call('GET',`/clients/${c2}`)).j.people.find(p=>p.id===pp.id);
  ok('editing a person saves occupation and rebuilds the address line from the parts',e2.occupation==='Businessman'&&/^Mfano Street, Karibu na shule/.test(e2.address),e2.address);
  await call('POST',`/clients/${c2}/registry-import`,{text:SAMPLE2,apply:true});
  const e3=(await call('GET',`/clients/${c2}`)).j.people.find(p=>p.id===pp.id);
  ok('a later import keeps the occupation typed by hand',e3.occupation==='Businessman');
  // the forms: Form 131 and 213a need no typing except what the registry does not hold
  const prof2=(await call('GET',`/clients/${c2}`)).j.client,ppl2=(await call('GET',`/clients/${c2}`)).j.people;
  const x=E.packageValues(E.buildContext({client:{name:prof2.name,activities:prof2.activities},profile:prof2.profile,people:ppl2}));
  ok('Form 131: return date, totals, members as NAME - ADDRESS in alphabetical order',/^15 AUGUST 20\d\d$/.test(x.RETURN_DATE)&&x.SHARES_ISSUED_TOTAL==='7,120'&&x.AGGREGATE_NOMINAL_VALUE_TOTAL==='35,600,000'&&/^ALI OMARI KAZI - /.test(x.MEMBER_1_NAME_ADDRESS_OPT)&&x.MEMBER_1_SHARES_HELD_OPT==='2,000'&&/^EMMANUEL JOHN TARIMO - /.test(x.MEMBER_5_NAME_ADDRESS_OPT)&&x.MEMBER_5_SHARES_HELD_OPT==='10',x);
  ok('Form 213a: names split, date of birth in capitals, address on three lines (the registry address wins on re-import)',x.FIRST_NAMES==='ALI OMARI'&&x.SURNAME==='KAZI'&&x.DOB==='31 JANUARY 1970'&&x.ADDRESS_LINE_1==='KARIBU NA SHULE DEMOTOWN'&&x.ADDRESS_LINE_2==='DEMOTOWN, TEMEKE'&&x.ADDRESS_LINE_3_OPT==='DAR ES SALAAM, TANZANIA'&&x.OCCUPATION==='BUSINESSMAN'&&x.ROLE_UPPER==='DIRECTOR',x);
  ok('the business activities list is built from the stored activities',E.buildContext({client:{activities:prof2.activities},profile:{}}).values.business_activities.split('\n').length===40);
 }
 // end to end: an imported company fills an official BRELA form
 {await call('POST','/templates/import-package',{});const T=(await call('GET','/bootstrap')).j.types[0].id,tpl=(await call('GET','/templates')).j.find(t=>/Form 131/.test(t.name));
  const cs=(await call('POST','/cases',{clientId:cid,caseTypeId:T})).j,gen=await call('POST',`/cases/${cs.id}/ai/generate-docx`,{template_id:tpl.id});
  const dl=await fetch(`${B}/files/${gen.j.file.id}`,{headers:{cookie:ck}}),txt=(await require('mammoth').extractRawText({buffer:Buffer.from(await dl.arrayBuffer())})).value;
  ok('Form 131 comes out with the imported company name, number, office, activity and secretary',/DEMOTOP ENTERPRISES/.test(txt)&&/100000001/.test(txt)&&/TOGO STREET/.test(txt)&&/CONSTRUCTION OF OTHER CIVIL/i.test(txt)&&/SALMA JUMA MREMA/.test(txt),txt.slice(0,700))}
 console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
