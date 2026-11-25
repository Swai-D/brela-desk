// AI settings, providers, keys, limits, usage (against the fake AI server in tests/mock-ai.js)
let fails=0;
const AP=process.env.ADMIN_PASSWORD,UP=['Pass','w0rd','123'].join(''),MOCK='http://localhost:4020';
const GOOD='test-'+Math.random().toString(36).slice(2,14);
let ck='';const PORT=process.env.PORT||3000,B=`http://localhost:${PORT}/api`;
const call=async(m,u,b)=>{const r=await fetch(B+u,{method:m,headers:{...(b?{'Content-Type':'application/json'}:{}),cookie:ck},body:b?JSON.stringify(b):undefined});const s=r.headers.get('set-cookie');if(s)ck=s.split(';')[0];return{s:r.status,j:await r.json().catch(()=>({})),raw:null}};
const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':String(JSON.stringify(x)).slice(0,600))};
const as=async(e,p)=>{ck='';await call('POST','/login',{email:e,password:p})};
const mlog=async()=>(await fetch(MOCK+'/__log')).json(),mreset=()=>fetch(MOCK+'/__reset');
(async()=>{
 await as('boss@test.co',AP);
 // ---- defaults
 const d=(await call('GET','/ai/settings')).j,s=d.settings;
 ok('good defaults are ready: Anthropic Sonnet, low temperature, a BRELA-focused system prompt, safe limits, privacy on',s.provider==='anthropic'&&s.models.anthropic==='claude-sonnet-5-5'&&s.temperature===0.2&&s.max_tokens===4096&&/BRELA/.test(s.system_prompt)&&/\[\[field_name\]\]/.test(s.system_prompt)&&s.daily_limit===200&&s.hourly_per_user===30&&s.privacy==='standard'&&s.min_level==='STAFF',s);
 ok('eight providers plus a custom endpoint are offered, each with model suggestions and where to get a key',Object.keys(d.providers).sort().join()==='anthropic,custom,deepseek,google,kimi,mistral,openai,openrouter,xai'&&d.providers.openai.models.length>=1&&d.providers.google.keyUrl&&Object.values(d.keys).every(k=>!k.set),Object.keys(d.providers));
 ok('loading models needs a saved key first',(await call('POST','/ai/models')).s===400);
 ok('the AI says clearly that it is not set up yet',(await call('GET','/ai/status')).j.configured===false);
 // ---- permissions
 await call('POST','/users',{name:'Juma Junior',email:'juma@test.co',role:'JUNIOR',password:UP});await call('POST','/users',{name:'Sia Senior',email:'sia@test.co',role:'SENIOR',password:UP});
 await as('juma@test.co',UP);
 ok('only a Manager can see or change AI settings, load models, test, or view usage',(await call('GET','/ai/settings')).s===403&&(await call('PUT','/ai/settings',{temperature:1})).s===403&&(await call('POST','/ai/models')).s===403&&(await call('POST','/ai/test')).s===403&&(await call('GET','/ai/usage')).s===403);
 ok('everyone can see whether the AI is available to them',(await call('GET','/ai/status')).s===200);
 await as('boss@test.co',AP);
 // ---- validation
 ok('bad values are refused',(await call('PUT','/ai/settings',{temperature:5})).s===400&&(await call('PUT','/ai/settings',{max_tokens:10})).s===400&&(await call('PUT','/ai/settings',{provider:'skynet'})).s===400&&(await call('PUT','/ai/settings',{api_key:'a b c d e f g h'})).s===400&&(await call('PUT','/ai/settings',{custom_base_url:'ftp://x'})).s===400&&(await call('PUT','/ai/settings',{system_prompt:'x'.repeat(8001)})).s===400&&(await call('PUT','/ai/settings',{min_level:'GOD'})).s===400&&(await call('PUT','/ai/settings',{daily_limit:0})).s===400);
 // ---- keys: stored encrypted, never returned
 let r=await call('PUT','/ai/settings',{provider:'anthropic',api_key:GOOD,temperature:1.7});
 ok('saving a key shows only that it is set and its last 4 characters',r.s===200&&r.j.keys.anthropic.set===true&&r.j.keys.anthropic.last4===GOOD.slice(-4)&&!JSON.stringify(r.j).includes(GOOD),r.j.keys);
 ok('the key never appears in settings, usage or the audit log',!JSON.stringify((await call('GET','/ai/settings')).j).includes(GOOD)&&!JSON.stringify((await call('GET','/ai/usage')).j).includes(GOOD)&&!JSON.stringify((await call('GET','/audit?size=100')).j).includes(GOOD));
 const {Pool}=require('pg');const pool=new Pool({connectionString:process.env.DATABASE_URL||'postgres://brela:brela@localhost:5432/brela'});const row=(await pool.query('SELECT keys,data FROM ai_settings WHERE id=1')).rows[0];await pool.end();
 ok('in the database the key is encrypted (no plain text anywhere)',!JSON.stringify(row).includes(GOOD)&&row.keys.anthropic.enc&&row.keys.anthropic.last4===GOOD.slice(-4));
 ok('the changes are in the audit log without secrets',(await call('GET','/audit?size=100')).j.items.some(x=>x.action==='ai.settings'&&/API key saved for anthropic/.test(x.details)&&/temperature 0.2 → 1.7/.test(x.details)));
 ok('status now shows the AI is ready',(r=>r.configured&&r.can_use&&r.provider==='anthropic'&&r.blocked===null)((await call('GET','/ai/status')).j));
 // ---- every provider speaks its own protocol correctly
 const wire={};
 for(const p of ['anthropic','openai','google','xai','mistral','kimi','deepseek','openrouter','custom']){
  const key=GOOD+'-'+p;await call('PUT','/ai/settings',{provider:p,models:{[p]:'m-'+p},custom_base_url:'http://localhost:4020/custom',temperature:1.7,max_tokens:4096,api_key:key});
  await mreset();const t=await call('POST','/ai/test');const lg=(await mlog()).filter(x=>x.method==='POST');wire[p]={t,e:lg[lg.length-1],key};
  ok(`${p}: the test call succeeds and is billed to the right endpoint`,t.s===200&&t.j.ok&&t.j.reply==='OK'&&t.j.model==='m-'+p&&wire[p].e&&wire[p].e.prov===p,t.j)}
 const A=wire.anthropic.e,O=wire.openai.e,G=wire.google.e;
 ok('anthropic: x-api-key header, version header, temperature capped at 1, max_tokens, system prompt with the built-in output rules',A.path==='/v1/messages'&&A.headers.xapikey===wire.anthropic.key&&A.headers.version==='2023-06-01'&&A.body.model==='m-anthropic'&&A.body.temperature===1&&A.body.max_tokens===64&&/BRELA/.test(A.body.system)&&/Non-negotiable output rules/.test(A.body.system),A.body);
 ok('openai: bearer key, system message, max_completion_tokens (not max_tokens), temperature as set; the connection test asks for only 64 tokens (cheap)',O.path==='/chat/completions'&&O.headers.auth==='Bearer '+wire.openai.key&&O.body.messages[0].role==='system'&&O.body.max_completion_tokens===64&&!('max_tokens' in O.body)&&O.body.temperature===1.7,O.body);
 ok('gemini: key header, systemInstruction, generationConfig',G.path==='/models/m-google:generateContent'&&G.headers.google===wire.google.key&&/BRELA/.test(G.body.systemInstruction.parts[0].text)&&G.body.generationConfig.maxOutputTokens===64&&G.body.generationConfig.temperature===1.7,G.body);
 ok('openrouter is told the app name (X-Title) and uses its own endpoint and key',wire.openrouter.e.headers.title==='BRELA Desk'&&wire.openrouter.e.headers.auth==='Bearer '+wire.openrouter.key&&wire.openrouter.e.path==='/chat/completions'&&!wire.openai.e.headers.title);
 ok('xai, mistral, kimi, deepseek, openrouter and a custom endpoint use the OpenAI-compatible format with max_tokens',['xai','mistral','kimi','deepseek','openrouter','custom'].every(p=>wire[p].e.path==='/chat/completions'&&wire[p].e.body.max_tokens===64&&wire[p].e.headers.auth==='Bearer '+wire[p].key));
 // ---- models are loaded live from each provider
 const models=async p=>{await call('PUT','/ai/settings',{provider:p});return (await call('POST','/ai/models')).j.models};
 ok('live model lists: anthropic, gemini (chat models only), openai (chat models only), xai',(await models('anthropic')).join()==='claude-haiku-5-5,claude-opus-5-5,claude-sonnet-5-5'&&(await models('google')).join()==='gemini-2.5-flash,gemini-2.5-pro'&&(await models('openai')).join()==='gpt-5,gpt-5-mini'&&(await models('xai')).includes('grok-4'));
 // ---- models that refuse temperature are handled automatically
 await call('PUT','/ai/settings',{provider:'mistral',models:{mistral:'strict-model'}});await mreset();const rt=await call('POST','/ai/test');const lg=(await mlog()).filter(x=>x.method==='POST');
 ok('a model that rejects the temperature setting is retried without it',rt.s===200&&lg.length===2&&('temperature' in lg[0].body)&&!('temperature' in lg[1].body),[rt.s,lg.length]);
 // ---- friendly errors
 await call('PUT','/ai/settings',{provider:'anthropic',api_key:'bad-key-0000'});let e=await call('POST','/ai/test');
 ok('a rejected key gives a clear message (and never the key)',e.s===502&&/rejected the API key/.test(e.j.error)&&!JSON.stringify(e.j).includes('bad-key'),e.j);
 await call('PUT','/ai/settings',{api_key:'quota-key-0000'});e=await call('POST','/ai/test');ok('quota or rate limits are explained',e.s===502&&/quota or rate limit/.test(e.j.error),e.j);
 await call('PUT','/ai/settings',{api_key:GOOD,models:{anthropic:'claude-sonnet-5-5'},temperature:0.2,provider:'anthropic'});
 ok('the key can be replaced and the AI works again',(await call('POST','/ai/test')).s===200);
 // ---- usage limits and who may use it
 const T=(await call('GET','/bootstrap')).j.types[0].id,c=(await call('POST','/cases',{clientName:'Limit Co',caseTypeId:T})).j,ex=u=>call('POST',`/cases/${c.id}/ai/extract`,{text:'Our company sells farm produce, capital one million shillings.'});
 await call('PUT','/ai/settings',{hourly_per_user:1});ok('first request goes through',(await ex()).s===200);const e2=await ex();ok('the hourly limit per person stops the second',e2.s===429&&/last hour/.test(e2.j.error),e2.j);
 await call('PUT','/ai/settings',{hourly_per_user:30,daily_limit:1});const e3=await ex();ok('the daily limit stops everyone',e3.s===429&&/daily AI limit/.test(e3.j.error),e3.j);
 await call('PUT','/ai/settings',{daily_limit:200});ok('raising the limit allows requests again; tests do not count',(await ex()).s===200);
 // industrial business plan: the AI drafts wording only, using the stored prompt; the answer is cleaned into form fields
 {const dr=await call('POST',`/cases/${c.id}/scenarios/industry/draft`,{answers:{main_activity:'Manufacture of lime',products_description:'Lime',factory_location:'Tanga'},only:['location_advantage','waste_types','marketing_bullets','benefits','products']}),lg=await (await fetch('http://localhost:4020/__log')).json(),last=lg[lg.length-1]||{};
  ok('the AI drafts the wording sections of a business plan, cleaned into fields (bullets without dashes, benefits as heading|text, unknown keys dropped)',dr.s===200&&dr.j.drafts.location_advantage==='Good road and port links.'&&dr.j.drafts.marketing_bullets==='Competitive pricing\nDealer network'&&dr.j.drafts.benefits==='Employment Creation|Direct jobs.\nLocal Market Stimulus|Local suppliers.'&&!('products' in dr.j.drafts),dr);
  ok('the business plan prompt is the stored industry prompt and carries only the facts',/business plan/i.test(JSON.stringify(last.body||{}).slice(0,3000))&&/FACTS \(use only these\)/.test(JSON.stringify(last.body||{}))&&/Manufacture of lime/.test(JSON.stringify(last.body||{})));
  const ps=(await call('GET','/ai/settings')).j;ok('the business plan prompt is listed with its default',/Business Plan for Establishing an Industry/.test(ps.settings.industry_prompt)&&ps.defaults.industry_prompt===ps.settings.industry_prompt);
  ok('an over-long business plan prompt is refused',(await call('PUT','/ai/settings',{industry_prompt:'x'.repeat(12001)})).s===400)}
 const cat=(await call('GET','/permissions')).j;await call('PUT','/roles/JUNIOR',{permissions:cat.presets.STAFF.filter(k=>k!=='ai.use')});await as('juma@test.co',UP);const eJ=await ex();await as('sia@test.co',UP);const eS=await ex();
 ok('the "Use the AI assistant" permission is enforced per role',eJ.s===403&&/not allowed/.test(eJ.j.error)&&eS.s===200&&(await call('GET','/ai/status')).j.can_use===true,[eJ.s,eS.s]);
 await as('juma@test.co',UP);ok('the status tells a blocked person they cannot use it',(await call('GET','/ai/status')).j.can_use===false);
 await as('boss@test.co',AP);await call('PUT','/roles/JUNIOR',{permissions:cat.presets.STAFF});
 // ---- usage report
 const u=(await call('GET','/ai/usage')).j;
 ok('usage: per person, per kind, recent runs (with errors) and no document text',u.byUser.some(x=>x.name==='Neema'&&x.runs>=1&&x.tokens_in>0)&&u.byKind.some(x=>x.kind==='extract')&&u.recent.length>=5&&u.recent.some(x=>x.ok===false)&&u.recent.every(x=>!('output' in x))&&u.daily_limit===200,u);
 // ---- removing a key
 await call('PUT','/ai/settings',{provider:'anthropic',clear_key:true});ok('a key can be removed',(await call('GET','/ai/status')).j.configured===false&&(await call('GET','/ai/settings')).j.keys.anthropic.set===false&&(await call('POST','/ai/test')).s===400);
 ok('generating without a key explains what to do',(r=>r.s===400&&/not set up/.test(r.j.error))(await ex()));
})().then(()=>{console.log(fails?'\n'+fails+' FAILED':'\nall passed');process.exit(fails?1:0)}).catch(e=>{console.error(e);process.exit(1)});
