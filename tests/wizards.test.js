// Editable wizards (Settings): CRUD, core-field protection, formula DSL, a custom wizard that fills a template
const fs=require('fs'),path=require('path'),mammoth=require('mammoth'),WD=require('../wizard-dsl.js');
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,700))};
const SAMPLE=fs.readFileSync(path.join(__dirname,'fixtures','registry-sample-2.txt'),'utf8');
const AP=process.env.ADMIN_PASSWORD,B=`http://localhost:${process.env.PORT||3000}/api`;let ck='';
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)ck=sc.split(';')[0];let j=null;try{j=await r.json()}catch{}return{s:r.status,j}};
(async()=>{
 // DSL
 ok('formula checker accepts good and rejects bad formulas',WD.check('upper(concat(a," ",b))')===''&&WD.check('nope(a)')!==''&&WD.check('upper(')!=='');
 ok('formulas run',WD.run('upper(concat(a," ",b))',{a:'x',b:'y'},{})==='X Y'&&WD.run('add(2,3)',{},{})==='5'&&WD.run('words(2500000)',{},{})==='two million and five hundred thousand');
 ok('formulas have no access to code',WD.check('constructor')===''&&WD.run('constructor',{},{})!=='function Object() { [native code] }');
 await call('POST','/login',{email:'boss@test.co',password:AP});
 await call('POST','/templates/import-package',{});
 const L=await call('GET','/wizards');
 ok('manager sees the 4 built-in wizards, the templates and the function list',L.s===200&&L.j.items.length>=4&&L.j.templates.length>5&&L.j.functions.length>10,L.j&&L.j.items&&L.j.items.map(i=>i.id));
 const dir=L.j.items.find(i=>i.id==='directors');
 ok('built-in questions are marked core',dir.fields.length>0&&dir.fields.some(f=>f.core));
 // core protection
 const keep=await call('PUT','/wizards/directors',{title:'Directors renamed',description:dir.description,icon:dir.icon,match:dir.match,fields:[],docs:[],rules:[],checks:[]});
 const d2=(await call('GET','/wizards')).j.items.find(i=>i.id==='directors');
 ok('a built-in wizard can be renamed but its core questions cannot be removed',keep.s===200&&d2.title==='Directors renamed'&&d2.fields.filter(f=>f.core).length===dir.fields.filter(f=>f.core).length,d2.fields);
 const rs=await call('DELETE','/wizards/directors');
 ok('deleting a built-in wizard resets it to the original',rs.j.reset===true&&(await call('GET','/wizards')).j.items.find(i=>i.id==='directors').title===dir.title);
 // validation
 ok('bad field name, bad formula, unknown template and a missing choice list are rejected',
  (await call('POST','/wizards',{title:'X',fields:[{key:'Bad Key',label:'A',type:'text'}]})).s===400&&
  (await call('POST','/wizards',{title:'X',fields:[],rules:[{key:'a',expr:'nope(1)'}]})).s===400&&
  (await call('POST','/wizards',{title:'X',fields:[],docs:[{template_id:999999}]})).s===400&&
  (await call('POST','/wizards',{title:'X',fields:[{key:'c',label:'C',type:'choice',opts:[]}]})).s===400&&
  (await call('POST','/wizards',{title:''})).s===400);
 // a custom wizard that fills a real template placeholder
 const tpl=L.j.templates.find(t=>t.keys.includes('company_name'))||L.j.templates[0];
 const mk=await call('POST','/wizards',{title:'Test custom wizard',description:'d',icon:'bx-file',match:'zzzmatch',
  fields:[{key:'greeting',label:'Greeting',type:'text',req:true},{key:'on',label:'Extra',type:'bool'}],
  docs:[{template_id:tpl.id,name:'Custom doc'}],rules:[{key:'company_name',expr:'upper(concat(greeting," – ",company_name))'}],checks:[{when:'empty(greeting)',msg:'Say hello'}]});
 ok('a custom wizard can be created',mk.s===200&&mk.j.id,mk.j);
 const cl=(await call('POST','/clients',{name:'Wizard Test Ltd',phone:'255700000031'})).j;
 await call('POST',`/clients/${cl.id}/registry-import`,{text:SAMPLE,apply:true});
 const T=(await call('GET','/bootstrap')).j.types[0].id,cs=(await call('POST','/cases',{clientId:cl.id,caseTypeId:T})).j;
 const list=(await call('GET',`/cases/${cs.id}/scenarios`)).j;
 ok('it appears on the case next to the built-in ones',list.items.some(i=>i.id===mk.j.id),list.items.map(i=>i.id));
 const pv=await call('PUT',`/cases/${cs.id}/scenarios/${mk.j.id}`,{answers:{}});
 ok('its check warns when the question is empty',pv.s===200&&pv.j.warnings.includes('Say hello'),pv.j);
 const gen=await call('POST',`/cases/${cs.id}/scenarios/${mk.j.id}/generate`,{answers:{greeting:'Hello'}});
 ok('it generates the extra document',gen.s===200&&gen.j.jobs.length===1&&gen.j.jobs[0].file,gen.j);
 if(gen.j.jobs&&gen.j.jobs[0]&&gen.j.jobs[0].file){const r=await fetch(`${B}/files/${gen.j.jobs[0].file.id}`,{headers:{cookie:ck}});const t=(await mammoth.extractRawText({buffer:Buffer.from(await r.arrayBuffer())})).value;
  ok('the formula result is in the file',/HELLO – /.test(t),t.slice(0,400))}
 // turn off, then delete
 await call('PUT',`/wizards/${mk.j.id}`,{...(await call('GET','/wizards')).j.items.find(i=>i.id===mk.j.id),active:false});
 ok('a wizard that is switched off is hidden from cases',!(await call('GET',`/cases/${cs.id}/scenarios`)).j.items.some(i=>i.id===mk.j.id));
 ok('a custom wizard can be deleted',(await call('DELETE',`/wizards/${mk.j.id}`)).s===200&&!(await call('GET','/wizards')).j.items.some(i=>i.id===mk.j.id));
 // roles
 await call('POST','/logout',{});ck='';
 ok('anonymous cannot read or change wizards',(await call('GET','/wizards')).s===401);
 console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
