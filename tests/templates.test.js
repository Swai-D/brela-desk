// Templates, company data, document generation (fill and AI), gaps, saving as .docx, learning, extraction (fake AI server)
const E=require('../docs.js'),mammoth=require('mammoth');
let fails=0;
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join(''),MOCK='http://localhost:4020',GOOD='test-'+Math.random().toString(36).slice(2,14);
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b,raw)=>{const r=await fetch(B+u,{method:m,headers:{...(b&&!raw?{'Content-Type':'application/json'}:{}),cookie:ck},body:raw?b:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({}))}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,700))};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const mlog=async()=>(await fetch(MOCK+'/__log')).json(),mreset=()=>fetch(MOCK+'/__reset');
const lastPrompt=async()=>{const l=(await mlog()).filter(x=>x.method==='POST'&&x.prov==='anthropic');const b=l[l.length-1].body;return b.messages[0].content};
const BODY=`# MEMORANDUM OF ASSOCIATION
Name of company: {{company_name}}
Registered office: {{registered_office}}
Activity: {{business_activity}}
Capital: {{share_capital|TZS 0}}
Directors:
{{#directors}}
{{index}}. {{name}} ({{nationality}}), ID {{id_number}}
{{/directors}}`;
(async()=>{
 await as('boss@test.co',AP);await call('PUT','/ai/settings',{provider:'anthropic',api_key:GOOD});
 await call('POST','/users',{name:'Juma Junior',email:'juma@test.co',role:'JUNIOR',password:UP});await call('POST','/users',{name:'Sia Senior',email:'sia@test.co',role:'SENIOR',password:UP});
 const bs=(await call('GET','/bootstrap')).j,T=bs.types[0].id;
 const cl=(await call('POST','/clients',{name:'Kilimo Fresh Ltd',phone:'0712 345 678',email:'info@kilimo.co'})).j.id;
 const c=(await call('POST','/cases',{clientId:cl,caseTypeId:T})).j,detail=(await call('GET','/cases/'+c.id)).j,item=detail.docs[0];
 // ================= templates
 await as('juma@test.co',UP);
 ok('staff can read templates but not create them',(await call('POST','/templates',{name:'X',body:'x {{a}}'})).s===403&&(await call('GET','/templates')).s===200);
 await as('sia@test.co',UP);
 ok('creating needs a name and some text',(await call('POST','/templates',{body:'x'})).s===400&&(await call('POST','/templates',{name:'N',body:'  '})).s===400);
 const t1=(await call('POST','/templates',{name:'Memorandum and Articles of Association',kind:'FORM',description:'Company incorporation',ai_notes:'Use clause numbering. Margins 2.5cm.',case_type_id:T,keywords:'memarts memart articles',body:BODY})).j.id;
 let g=(await call('GET','/templates/'+t1)).j;
 ok('a senior creates a draft template; its fields and people loops are detected',g.status==='DRAFT'&&g.version===1&&g.body===BODY&&g.fields.keys.includes('registered_office')&&g.fields.lists.directors.includes('id_number')&&g.ai_notes.includes('clause numbering')&&g.versions.length===1,g);
 const t2=(await call('POST','/templates',{name:'Director consent letter',keywords:'consent',body:'I {{name}} consent.'})).j.id;
 let sg=(await call('GET',`/cases/${c.id}/ai/suggest?name=${encodeURIComponent('MEMARTS draft')}`)).j;
 ok('suggestions rank the matching template first for a checklist item',sg[0].id===t1&&sg.length===2&&sg[0].score>sg[1].score,sg.map(x=>[x.name,x.score]));
 ok('the list can be searched',(await call('GET','/templates?q=consent')).j.map(x=>x.id).join()===String(t2));
 await call('PUT','/templates/'+t1,{body:BODY+'\nEnd of document',note:'added an ending'});g=(await call('GET','/templates/'+t1)).j;
 ok('editing the text makes a new version (the old one is kept)',g.version===2&&g.versions.length===2&&g.versions[0].note==='added an ending'&&g.body.endsWith('End of document'));
 ok('only the metadata changing does not create a version',(await call('PUT','/templates/'+t1,{description:'Incorporation forms'})).j.version===2);
 await as('juma@test.co',UP);ok('staff cannot approve',(await call('POST',`/templates/${t1}/approve`,{})).s===403);
 await as('sia@test.co',UP);
 ok('a senior approves',(await call('POST',`/templates/${t1}/approve`,{})).j.status==='APPROVED'&&(await call('GET','/templates/'+t1)).j.status==='APPROVED');
 await call('PUT','/templates/'+t1,{body:BODY});g=(await call('GET','/templates/'+t1)).j;
 ok('editing an approved template sends it back to draft (needs a new approval)',g.status==='DRAFT'&&g.version===3);
 ok('an old version can be restored (as a new version)',(await call('POST',`/templates/${t1}/restore`,{version:1})).j.version===4&&(await call('GET','/templates/'+t1)).j.body===BODY&&(await call('POST',`/templates/${t1}/restore`,{version:99})).s===404);
 // ================= company data
 await as('juma@test.co',UP);
 ok('staff can record company details (they gather them)',(await call('PATCH',`/clients/${cl}/profile`,{set:{company_name:'Kilimo Fresh Limited',tin:'123-456-789'}})).s===200);
 ok('field names must be simple, and values are tidied',(await call('PATCH',`/clients/${cl}/profile`,{set:{'Bad Name':'x'}})).s===400&&(r=>r.j.profile.company_name==='Kilimo Fresh Limited')(await call('PATCH',`/clients/${cl}/profile`,{set:{notes:'  spaced  '},remove:['tin']}))&&(await call('GET','/clients/'+cl)).j.client.profile.notes==='spaced'&&!('tin' in (await call('GET','/clients/'+cl)).j.client.profile));
 const p1=(await call('POST',`/clients/${cl}/people`,{full_name:'Zawadi Mushi',roles:['director','shareholder','astronaut'],nationality:'Tanzanian',id_type:'NIDA',id_number:'19900101-12345',shares:'100'})).j,p2=(await call('POST',`/clients/${cl}/people`,{full_name:'Juma Kileo',roles:['director'],nationality:'Tanzanian'})).j;
 ok('people (directors, shareholders...) are saved with valid roles only',p1.roles.join()==='director,shareholder'&&p2.roles.join()==='director'&&(await call('POST',`/clients/${cl}/people`,{full_name:' '})).s===400&&(await call('GET','/clients/'+cl)).j.people.length===2);
 ok('a person can be edited and removed',(await call('PUT','/people/'+p2.id,{full_name:'Juma Kileo',roles:['director','secretary'],address:'Dar es Salaam'})).j.roles.join()==='director,secretary'&&(await call('DELETE','/people/9999')).s===404);
 await call('PATCH',`/cases/${c.id}/data`,{set:{share_capital:'TZS 5,000,000'}});
 let cx=(await call('GET',`/cases/${c.id}/context`)).j;
 ok('the context combines built-ins, client details, case details and people',cx.values.client_name==='Kilimo Fresh Ltd'&&cx.values.company_name==='Kilimo Fresh Limited'&&cx.values.share_capital==='TZS 5,000,000'&&cx.values.case_code===c.code&&cx.values.directors_count==='2'&&cx.keys.includes('registered_office'),cx.values);
 // ================= fill mode (approved template: instant, no AI)
 await as('sia@test.co',UP);await call('POST',`/templates/${t1}/approve`,{});await mreset();
 let gen=(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1})).j;
 ok('an approved template is filled instantly without calling the AI',gen.mode==='fill'&&gen.ai_used===false&&(await mlog()).length===0,gen.mode);
 ok('values, defaults and the people list are merged; unknown details become gaps',gen.text.includes('Name of company: Kilimo Fresh Limited')&&gen.text.includes('Capital: TZS 5,000,000')&&gen.text.includes('1. Zawadi Mushi (Tanzanian), ID 19900101-12345')&&gen.text.includes('2. Juma Kileo ([[nationality]]), ID [[id_number]]')&&gen.missing.includes('nationality')&&gen.missing.includes('registered_office')&&gen.missing.includes('business_activity')&&gen.missing.includes('id_number'),gen);
 await as('juma@test.co',UP);
 let ap=(await call('POST',`/cases/${c.id}/ai/apply-gaps`,{text:gen.text,values:{registered_office:'Plot 12, Mikocheni, Dar es Salaam'},remember:true})).j;
 ok('filling a gap updates the text and remembers the value on the case',ap.text.includes('Registered office: Plot 12, Mikocheni, Dar es Salaam')&&!ap.missing.includes('registered_office')&&(await call('GET',`/cases/${c.id}/context`)).j.data.registered_office==='Plot 12, Mikocheni, Dar es Salaam');
 gen=(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,mode:'fill'})).j;ok('next time the remembered value is already there',gen.text.includes('Registered office: Plot 12')&&!gen.missing.includes('registered_office'));
 ok('filling a draft or choosing "fill" without a template is handled',(await call('POST',`/cases/${c.id}/ai/generate`,{mode:'fill'})).s===400&&(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:9999})).s===404);
 // ================= AI mode (draft template is a format guide)
 await as('sia@test.co',UP);await call('POST',`/templates/${t1}/approve`,{approved:false});await mreset();
 gen=(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,instructions:'Keep it short',doc_name:'MEMARTS'})).j;let pr=await lastPrompt();
 ok('a draft template makes the AI prepare the document, guided by the template, its notes and the extra instructions',gen.mode==='ai'&&gen.ai_used&&/FOLLOWED TEMPLATE/.test(gen.text)&&/RULES SEEN/.test(gen.text)&&/INSTRUCTIONS SEEN/.test(gen.text)&&/LANG English/.test(gen.text)&&pr.includes('DOCUMENT TO PREPARE: MEMARTS')&&pr.includes('Use clause numbering')&&pr.includes('<<<TEMPLATE'),gen.text);
 ok('PRIVACY: ID numbers, phone and email are NOT sent to the AI; names and company details are',!pr.includes('19900101-12345')&&!pr.includes('0712 345 678')&&!pr.includes('info@kilimo.co')&&pr.includes('{{person_1_id_number}}')&&pr.includes('Zawadi Mushi')&&pr.includes('Kilimo Fresh Limited')&&gen.withheld>0);
 ok('…yet the finished document has the real values, filled in locally',gen.text.includes('ID 19900101-12345')&&gen.text.includes('Phone: 0712 345 678')&&gen.text.includes('Director: Zawadi Mushi'),gen.text);
 ok('details the AI could not know stay as gaps for people to fill',gen.missing.includes('business_activity')&&!gen.missing.includes('registered_office')&&gen.text.includes('[[business_activity]]'),gen.missing);
 await as('boss@test.co',AP);await call('PUT','/ai/settings',{privacy:'off'});await mreset();await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,mode:'ai'});pr=await lastPrompt();
 ok('with privacy switched off the AI sees everything (a Manager\'s choice)',pr.includes('19900101-12345')&&pr.includes('0712 345 678')&&pr.includes('info@kilimo.co'));
 await call('PUT','/ai/settings',{privacy:'standard'});
 await as('sia@test.co',UP);await mreset();gen=(await call('POST',`/cases/${c.id}/ai/generate`,{doc_name:'Resolution of directors'})).j;pr=await lastPrompt();
 ok('without any template the AI uses the standard layout (the first step of teaching it)',gen.mode==='ai'&&gen.template===null&&/NO TEMPLATE/.test(gen.text)&&pr.includes('No template exists yet'));
 // ================= saving as a Word document
 const gapped=(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,mode:'ai'})).j;
 let sv=(await call('POST',`/cases/${c.id}/ai/save`,{text:gapped.text,item_id:item.id,filename:'MEMARTS draft',template_id:t1,mode:'ai'})).j;
 ok('saving with gaps still left stores the file but does not tick the checklist item',sv.file.filename==='MEMARTS draft.docx'&&sv.gaps>=1&&sv.ticked===false&&(await call('GET','/cases/'+c.id)).j.docs.find(x=>x.id===item.id).done===false);
 const fileRes=await fetch(B+'/files/'+sv.file.id,{headers:{cookie:ck}}),buf=Buffer.from(await fileRes.arrayBuffer()),back=(await mammoth.extractRawText({buffer:buf})).value;
 ok('the saved file is a real Word document attached to the checklist item',buf.slice(0,2).toString()==='PK'&&back.includes('Name of company')===false&&back.includes('Director: Zawadi Mushi')&&(await call('GET','/cases/'+c.id)).j.docs.find(x=>x.id===item.id).files.some(f=>f.id===sv.file.id),back);
 const filled=(await call('POST',`/cases/${c.id}/ai/apply-gaps`,{text:gapped.text,values:{business_activity:'Retail of farm produce'}})).j.text;
 sv=(await call('POST',`/cases/${c.id}/ai/save`,{text:filled,item_id:item.id,template_id:t1,mode:'ai'})).j;
 ok('a complete document ticks the item, and the history says how it was made',sv.gaps===0&&sv.ticked===true&&(await call('GET','/cases/'+c.id)).j.activity.some(x=>/prepared ".*" with AI \(template: Memorandum/.test(x.text)),sv);
 ok('a clean run (no manual edits, no gaps) counts towards trusting the template',sv.template.uses===2&&sv.template.clean_runs===1,sv.template);
 await call('POST',`/cases/${c.id}/ai/save`,{text:filled,template_id:t1});await call('POST',`/cases/${c.id}/ai/save`,{text:filled,template_id:t1});
 ok('three clean runs in a row: ready to approve',(await call('GET','/templates/'+t1)).j.clean_runs===3);
 await call('POST',`/cases/${c.id}/ai/save`,{text:filled+' edited by hand',template_id:t1,manual_edits:true});
 ok('a manual edit resets the streak (the template still needs teaching)',(await call('GET','/templates/'+t1)).j.clean_runs===0);
 ok('saving needs real text and an item from this case',(await call('POST',`/cases/${c.id}/ai/save`,{text:'short'})).s===400&&(await call('POST',`/cases/${c.id}/ai/save`,{text:filled,item_id:99999})).s===400);
 // ================= teaching
 await as('juma@test.co',UP);ok('staff cannot teach templates',(await call('POST',`/cases/${c.id}/ai/learn`,{text:filled,template_id:t1})).s===403);
 await as('sia@test.co',UP);const finalText='MEMORANDUM\nCompany: Kilimo Fresh Limited\nSigned by Zawadi Mushi.\nThe company will sell goods.';
 let lr=(await call('POST',`/cases/${c.id}/ai/learn`,{text:finalText,template_id:t1})).j;
 ok('teach (AI): the corrected document comes back as an improved template proposal',lr.ai_used===true&&lr.body.includes('{{company_name}}')&&!lr.body.includes('Kilimo Fresh Limited')&&lr.body.includes('The company will sell goods.'),lr);
 lr=(await call('POST',`/cases/${c.id}/ai/learn`,{text:finalText,template_id:t1,use_ai:false})).j;
 ok('teach (no AI): known values are swapped for fields automatically (people blocks need the AI to become loops)',lr.ai_used===false&&lr.body.includes('{{company_name}}')&&lr.replaced.includes('company_name')&&lr.body.includes('Signed by Zawadi Mushi.'),lr);
 await call('PUT','/templates/'+t1,{body:lr.body,note:'Learned from BR case',source:'learned'});g=(await call('GET','/templates/'+t1)).j;
 ok('the proposal is saved as a new version marked as learned',g.versions[0].source==='learned'&&g.status==='DRAFT'&&g.body.includes('{{company_name}}'));
 // ================= smart fill from a client's message
 await as('juma@test.co',UP);const before=(await call('GET',`/cases/${c.id}/context`)).j.data;
 let ex=(await call('POST',`/cases/${c.id}/ai/extract`,{text:'Hello, our company sells farm produce, capital one million shillings. Directors Zawadi Mushi...'})).j;
 ok('smart fill suggests company details and people from a pasted message (bad field names and roles dropped)',ex.values.business_activity==='Retail of farm produce'&&ex.values.share_capital==='TZS 1,000,000'&&!('Bad Key' in ex.values)&&ex.people.length===1&&ex.people[0].full_name==='Zawadi Mushi'&&ex.people[0].roles.join()==='director,shareholder'&&/words only/.test(ex.notes),ex);
 ok('…and saves nothing until a person applies it',JSON.stringify((await call('GET',`/cases/${c.id}/context`)).j.data)===JSON.stringify(before));
 ok('too little text is refused',(await call('POST',`/cases/${c.id}/ai/extract`,{text:'hi'})).s===400);
 // ================= template from an accepted document
 await as('sia@test.co',UP);const docx=await E.textToDocx('# CERTIFICATE\nThis certifies that Kilimo Fresh Limited is registered.\nKilimo Fresh Limited, Dar es Salaam.','');
 const fd=(extra={})=>{const f=new FormData();f.append('file',new Blob([docx]),'accepted.docx');f.append('name','Certificate');for(const [k,v] of Object.entries(extra))f.append(k,v);return f};
 let fr=await call('POST','/templates/from-document',fd(),true);g=(await call('GET','/templates/'+fr.j.id)).j;
 ok('an accepted Word document becomes a template with fields (AI finds the variable parts)',fr.s===200&&fr.j.ai_used===true&&g.body.includes('{{company_name}}')&&g.versions[0].source==='ai'&&g.status==='DRAFT',[fr.s,fr.j,g.body]);
 fr=await call('POST','/templates/from-document',fd({use_ai:'false'}),true);g=(await call('GET','/templates/'+fr.j.id)).j;
 ok('without AI the text is kept as is, ready to mark up by hand',fr.j.ai_used===false&&g.body.includes('Kilimo Fresh Limited')&&!g.body.includes('{{'));
 const tf=new FormData();tf.append('name','From notes');tf.append('text','A plain letter of consent for {{name}} to act as a director of the company.');
 ok('pasted text works too',(await call('POST','/templates/from-document',tf,true)).s===200);
 const bad=new FormData();bad.append('file',new Blob(['x']),'photo.png');bad.append('name','Img');
 ok('unsupported files are refused clearly, a name is required, staff cannot',(r=>r.s===400&&/Unsupported/.test(r.j.error))(await call('POST','/templates/from-document',bad,true))&&(await call('POST','/templates/from-document',(()=>{const f=new FormData();f.append('text','some text that is long enough');return f})(),true)).s===400);
 await as('juma@test.co',UP);ok('staff cannot create templates from documents',(await call('POST','/templates/from-document',fd(),true)).s===403);
 // ================= when the AI is unavailable
 await as('boss@test.co',AP);await call('PUT','/ai/settings',{provider:'anthropic',api_key:'bad-key-0000'});
 let eg=await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,mode:'ai'});
 ok('a rejected key gives a clear error, and the failed attempt is logged',eg.s===502&&/rejected the API key/.test(eg.j.error)&&(await call('GET','/ai/usage')).j.recent.some(x=>x.ok===false&&x.kind==='generate'));
 ok('filling a template still works without the AI',(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,mode:'fill'})).j.mode==='fill');
 await call('PUT','/ai/settings',{clear_key:true});
 ok('no key: AI generation and smart fill explain what to do; learning falls back to automatic mode',(await call('POST',`/cases/${c.id}/ai/generate`,{template_id:t1,mode:'ai'})).s===400&&(await call('POST',`/cases/${c.id}/ai/extract`,{text:'some long enough client message text'})).s===400&&(await call('POST',`/cases/${c.id}/ai/learn`,{text:finalText,template_id:t1})).j.ai_used===false);
 // ================= Word / PDF view of a template
 await as('boss@test.co',AP);
 {const raw=async(m,u,b,h)=>{const r=await fetch(B+u,{method:m,headers:{cookie:ck,...(h||{})},body:b});return {s:r.status,buf:Buffer.from(await r.arrayBuffer()),h:r.headers}};
  const g=await raw('GET',`/templates/${t1}/docx`);const gt=(await mammoth.extractRawText({buffer:g.buf})).value;
  ok('a template opens as a Word file built like the real output; field names show as gaps',g.s===200&&/wordprocessingml/.test(g.h.get('content-type'))&&/MEMORANDUM/.test(gt)&&/\[\[company_name\]\]/.test(gt)&&!/\{\{/.test(gt),gt.slice(0,200));
  ok('download=1 sends it as an attachment',/attachment/.test((await raw('GET',`/templates/${t1}/docx?download=1`)).h.get('content-disposition')));
  const rd=await raw('POST','/templates/render-docx',JSON.stringify({body:'# Live preview\nHello {{client_name|friend}}',title:'x'}),{'Content-Type':'application/json'});
  ok('unsaved text renders to Word for the live view',rd.s===200&&/Live preview/.test((await mammoth.extractRawText({buffer:rd.buf})).value));
  ok('an unknown template gives 404',(await raw('GET','/templates/99999/docx')).s===404);
  const fd2=()=>{const f=new FormData();f.append('file',new Blob([g.buf]),'edited.docx');return f};
  const h2=await raw('POST','/templates/docx-to-html',fd2());ok('an edited Word file is read back into HTML',h2.s===200&&/MEMORANDUM/.test(JSON.parse(h2.buf).html));
  ok('a text template has no official form to replace',(await raw('POST',`/templates/${t1}/upload-docx`,fd2())).s===400);
  await as('juma@test.co',UP);ok('staff can view but not upload',(await raw('GET',`/templates/${t1}/docx`)).s===200&&(await raw('POST','/templates/docx-to-html',fd2())).s===403);await as('boss@test.co',AP)}
 // ================= deleting
 await as('sia@test.co',UP);ok('a senior cannot delete a template; a Manager can (and it is audited)',(await call('DELETE','/templates/'+t2)).s===403);
 await as('boss@test.co',AP);ok('manager deletes',(await call('DELETE','/templates/'+t2)).s===200&&(await call('GET','/templates/'+t2)).s===404&&(await call('GET','/audit?size=100')).j.items.some(x=>x.action==='template.delete'&&/Director consent/.test(x.details))&&(await call('GET','/audit?size=100')).j.items.some(x=>x.action==='template.approve'));
 ok('deleting a client removes their people too',(await call('DELETE','/clients/'+cl)).s===400&&(await call('DELETE','/cases/'+c.id)).s===200&&(await call('DELETE','/clients/'+cl)).s===200);
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
