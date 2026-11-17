// Case type options ("what kind of change?"): choices, sub-actions, grouped checklists, adding a change later
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,500))};
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join(''),B=`http://localhost:${process.env.PORT||3000}/api`;let ck='';
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const sc=r.headers.get('set-cookie');if(sc)ck=sc.split(';')[0];let j;try{j=await r.json()}catch{}return{s:r.status,j}};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
(async()=>{
 await as('boss@test.co',AP);await call('POST','/users',{name:'Juma Junior',email:'juma@test.co',role:'JUNIOR',password:UP});
 const bs=(await call('GET','/bootstrap')).j,cp=bs.types.find(t=>t.name==='Change of Particulars'),AR=bs.types.find(t=>t.name==='Annual Return');
 ok('Change of Particulars has the 7 choices; Directors and Secretary have Add / Remove / Update details',cp.options.map(o=>o.name).join()==='Company name,Registered office,Objects,Share capital,Share distribution,Directors,Secretary'&&cp.options.find(o=>o.name==='Directors').actions.map(a=>a.name).join()==='Add,Remove,Update details',cp.options.map(o=>o.name));
 const cl=(await call('POST','/clients',{name:'Options Test Ltd'})).j.id;
 const mk=b=>call('POST','/cases',{clientId:cl,caseTypeId:cp.id,...b});
 ok('a type with choices needs a choice',(await mk({})).s===400&&/Choose what kind/.test((await mk({options:[]})).j.error));
 ok('Directors needs an action; unknown choices are refused',/Choose what to do for Directors/.test((await mk({options:[{name:'Directors'}]})).j.error)&&(await mk({options:[{name:'Nonsense'}]})).s===400&&(await mk({options:[{name:'Directors',actions:['Fly']}]})).s===400);
 const r=await mk({options:[{name:'Registered office'},{name:'Directors',actions:['Add','Remove']}]});ok('case created',r.s===200,r.j);
 let d=(await call('GET','/cases/'+r.j.id)).j;
 ok('checklist = ticked choices only, grouped',d.docs.filter(x=>!x.grp).length===2&&['Registered office','Directors · Add','Directors · Remove'].every(g=>d.docs.some(x=>x.grp===g))&&!d.docs.some(x=>/Objects|Secretary|Share/.test(x.grp)),d.docs.map(x=>x.grp+': '+x.name));
 ok('the case remembers what was ticked',d.options.length===2&&d.options[1].actions.join()==='Add,Remove');
 ok('Form 213a / 213b items are in the checklist (so the matching templates are suggested)',d.docs.some(x=>/Form 213a/.test(x.name))&&d.docs.some(x=>/Form 213b/.test(x.name)));
 ok('history says what the case is about',(await call('GET','/cases/'+r.j.id)).j.activity.some(a=>/Registered office; Directors \(Add, Remove\)/.test(a.text)));
 // add another change later
 const a1=await call('POST',`/cases/${r.j.id}/options`,{options:[{name:'Secretary',actions:['Update details']},{name:'Directors',actions:['Add','Update details']}]});
 d=(await call('GET','/cases/'+r.j.id)).j;
 ok('another change adds its items and keeps the rest',a1.s===200&&d.docs.some(x=>x.grp==='Secretary · Update details')&&d.docs.some(x=>x.grp==='Directors · Update details')&&d.docs.filter(x=>x.grp==='Directors · Add').length===4,d.docs.map(x=>x.grp));
 ok('options on the case are merged',d.options.find(o=>o.name==='Directors').actions.join()==='Add,Remove,Update details'&&d.options.some(o=>o.name==='Secretary'));
 ok('adding the same change twice adds nothing',(await call('POST',`/cases/${r.j.id}/options`,{options:[{name:'Registered office'}]})).j.added===0);
 // types without choices behave exactly as before
 const old=await call('POST','/cases',{clientId:cl,caseTypeId:AR.id});ok('a type without choices works as before',old.s===200&&(await call('GET','/cases/'+old.j.id)).j.docs.length===AR.docs.length);
 // managing the choices
 const nt=(await call('POST','/case-types',{name:'Custom Change',docs:['Authorization'],options:[{name:'  Alpha ',docs:'one\n\n two '},{name:'alpha',docs:['dup']},{name:'Beta',docs:[],actions:[{name:'Go',docs:['x']},{name:'',docs:['y']}]},{name:''}]})).j;
 const t2=(await call('GET','/bootstrap')).j.types.find(t=>t.id===nt.id);
 ok('choices are cleaned: trimmed, no duplicates or empty names, items split by line',t2.options.length===2&&t2.options[0].name==='Alpha'&&t2.options[0].docs.join()==='one,two'&&t2.options[1].actions.length===1,t2.options);
 await call('PUT','/case-types/'+nt.id,{options:[]});ok('choices can be removed again',(await call('GET','/bootstrap')).j.types.find(t=>t.id===nt.id).options.length===0);
 await as('juma@test.co',UP);ok('only a Manager edits choices',(await call('PUT','/case-types/'+nt.id,{options:[{name:'X'}]})).s===403);
 console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
