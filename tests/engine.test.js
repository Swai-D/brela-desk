// Pure tests of the document engine (no server or database needed)
const E=require('../docs.js'),mammoth=require('mammoth');
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
(async()=>{
 const f=E.fields('Dear {{name}}, {{ company_name | Acme }} on {{today}}.\n{{#directors}}\n{{index}}. {{name}} ({{id_number}}) of {{company_name}}\n{{/directors}}');
 ok('fields: finds plain fields and the fields of each people loop',f.keys.includes('name')&&f.keys.includes('company_name')&&f.keys.includes('today')&&f.lists.directors.includes('id_number')&&!f.keys.includes('id_number'),f);
 const people=[{full_name:'Asha Mwangi',roles:['director','shareholder'],id_number:'1990-1234',shares:'60'},{full_name:'John Kileo',roles:['director'],id_number:'',shares:''}];
 const ctx=E.buildContext({client:{name:'Kilimo Fresh Ltd',phone:'0712 000 111'},caseRow:{code:'BR-1042',type:'Company Incorporation',track_number:'TRK-9'},assignee:'Neema',profile:{business_activity:'Farming',company_name:'Kilimo Fresh Limited'},data:{capital:'TZS 1,000,000'},people});
 ok('context: built-ins, profile overrides, case data, people lists',ctx.values.client_name==='Kilimo Fresh Ltd'&&ctx.values.company_name==='Kilimo Fresh Limited'&&ctx.values.capital==='TZS 1,000,000'&&ctx.values.track_number==='TRK-9'&&ctx.lists.directors.length===2&&ctx.lists.shareholders.length===1&&ctx.values.person_1_full_name==='Asha Mwangi'&&ctx.values.directors_count==='2',ctx.values);
 let r=E.render('Company: {{company_name}}. Activity: {{business_activity}}. Capital {{capital}}. Office: {{office}}. Fallback {{nick|none}}.',ctx);
 ok('render: values, defaults and gaps for the unknown',r.text==='Company: Kilimo Fresh Limited. Activity: Farming. Capital TZS 1,000,000. Office: [[office]]. Fallback none.'&&r.missing.join()==='office',r);
 r=E.render('Directors ({{directors_count}}):\n{{#directors}}\n{{index}}/{{count}}. {{name}}, ID {{id_number}}, company {{company_name}}\n{{/directors}}\nEnd',ctx);
 ok('render: people loop (numbering, outer values, blank field becomes a gap)',r.text==='Directors (2):\n1/2. Asha Mwangi, ID 1990-1234, company Kilimo Fresh Limited\n2/2. John Kileo, ID [[id_number]], company Kilimo Fresh Limited\nEnd'&&r.missing.includes('id_number'),r);
 ok('render: an empty list becomes one gap',E.render('{{#secretaries}}{{name}}{{/secretaries}}',ctx).text==='[[secretaries]]');
 ok('gaps and applyGaps',E.gaps('a [[x]] b [[y_1]] c [[x]]').join()==='x,y_1'&&E.applyGaps('a [[x]] b [[y_1]]',{x:'ONE',y_1:''})==='a ONE b [[y_1]]');
 const rv=E.reverse('Kilimo Fresh Limited, farming company of Asha Mwangi. Keep {{already}} and [[gap]] as is. Kilimo Fresh Limited again.',{company_name:'Kilimo Fresh Limited',a:'Asha Mwangi',short:'ab',n:'12'});
 ok('reverse: values become fields (all occurrences), short or numeric values and existing tokens are left',rv.body==='{{company_name}}, farming company of {{a}}. Keep {{already}} and [[gap]] as is. {{company_name}} again.'&&rv.replaced.sort().join()==='a,company_name',rv);
 const rt=E.render(rv.body,{values:{company_name:'Other Co',a:'Someone'}});ok('reverse then render gives a new document',rt.text.startsWith('Other Co, farming company of Someone.'));
 // privacy round trip
 const w=E.withhold({values:{...ctx.values,id_number_main:'A123456',client_phone:'0712 000 111'},lists:ctx.lists},'standard');
 ok('withhold: sensitive values become tokens, the rest is visible',w.values.client_phone==='{{client_phone}}'&&w.values.id_number_main==='{{id_number_main}}'&&w.values.client_name==='Kilimo Fresh Ltd'&&w.lists.directors[0].id_number==='{{person_1_id_number}}'&&w.lists.directors[0].full_name==='Asha Mwangi'&&w.withheld.includes('person_1_id_number'),w.withheld);
 const aiOut='Asha Mwangi (ID {{person_1_id_number}}) phone {{client_phone}} of {{company_name}}.';
 ok('tokens the AI writes are filled in locally afterwards',E.render(aiOut,{values:{...ctx.values,id_number_main:'A123456'},lists:ctx.lists}).text==='Asha Mwangi (ID 1990-1234) phone 0712 000 111 of Kilimo Fresh Limited.');
 ok('withhold off shows everything',E.withhold(ctx,'off').values.client_phone==='0712 000 111');
 // suggestions
 const T=[{name:'Memorandum and Articles of Association',keywords:'memarts',case_type_id:2,status:'APPROVED'},{name:'Director consent letter',keywords:'consent',case_type_id:null,status:'DRAFT'}];
 ok('suggest: matches by words and case type',E.suggestScore(T[0],'MEMARTS draft',2)>E.suggestScore(T[1],'MEMARTS draft',2)&&E.suggestScore(T[1],'Signed director consent',2)>E.suggestScore(T[0],'Signed director consent',2));
 // docx
 const md='# CERTIFICATE\n\nCompany **{{x}}** of [[office]] with *care*.\n\n## Directors\n- Asha Mwangi\n- John Kileo\n\n| Name | Shares |\n|---|---|\n| Asha | 60 |\n| John | 40 |\n\n---\nSecond page';
 const buf=await E.textToDocx(md,{title:'T'});const back=(await mammoth.extractRawText({buffer:buf})).value;
 ok('docx: valid file that reads back with headings, text, bullets, a table and the highlighted gap',buf.slice(0,2).toString()==='PK'&&/CERTIFICATE/.test(back)&&/\[\[office\]\]/.test(back)&&/Asha Mwangi/.test(back)&&/John\s+40/.test(back.replace(/\n+/g,' '))&&/Second page/.test(back),back);
 const xml=await (await require('jszip').loadAsync(buf)).file('word/document.xml').async('string');ok('docx: the gap is highlighted in the file',/w:highlight/.test(xml)&&/Times New Roman/.test(await (await require('jszip').loadAsync(buf)).file('word/styles.xml').async('string')));
 // extraction
 ok('extract: docx, txt and md',(await E.extractText(buf,'a.docx')).includes('CERTIFICATE')&&(await E.extractText(Buffer.from('Plain text document with enough words in it.'),'a.txt')).startsWith('Plain text')&&(await E.extractText(Buffer.from('# Title with enough text here'),'b.md')).startsWith('# Title'));
 let e1;try{await E.extractText(Buffer.from('x'),'photo.png')}catch(e){e1=e}ok('extract: unsupported types are refused clearly',e1&&e1.status===400&&/Unsupported/.test(e1.message));
 let e2;try{await E.extractText(Buffer.from('hi'),'tiny.txt')}catch(e){e2=e}ok('extract: empty or unreadable files are refused',e2&&/No readable text/.test(e2.message));
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
