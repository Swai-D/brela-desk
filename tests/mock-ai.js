// A fake AI provider server for tests: speaks the Anthropic, OpenAI-compatible and Gemini wire formats.
// Keys decide behaviour: 'bad-key-0000' -> 401, 'quota-key-0000' -> 429. Everything received is kept at /__log.
const http=require('http');let log=[];
const wordsOf=u=>u;
function answer(user,sysText){
 if(/Reply with the single word OK\./.test(user))return 'OK';
 if(/Return ONLY a JSON object/.test(user))return '```json\n'+JSON.stringify({values:{business_activity:'Retail of farm produce',share_capital:'TZS 1,000,000','Bad Key':'x'},people:[{full_name:'Zawadi Mushi',roles:['director','shareholder','astronaut'],nationality:'Tanzanian',id_number:'19900101-12345',shares:'100'},{full_name:''}],notes:'Capital was given in words only'})+'\n```';
 if(/(Turn this finished, accepted document|Convert this accepted document)/.test(user)){const d=(user.match(/DOCUMENT:\n<<<\n([\s\S]*?)\n>>>/)||[])[1]||'';return d.split('Kilimo Fresh Limited').join('{{company_name}}')}
 if(/^DOCUMENT TO PREPARE:/.test(user)){
  const name=(user.match(/^DOCUMENT TO PREPARE: (.*)$/m)||[])[1],lang=(user.match(/^LANGUAGE: (.*)$/m)||[])[1];let f={values:{},people:[]};try{f=JSON.parse((user.match(/FACTS \(JSON[^\n]*\):\n(.*)/)||[])[1])}catch{}
  const p=(f.people||[])[0]||{};
  return [`# ${name}`,`Company: ${f.values.company_name||'[[company_name]]'}`,`Activity: ${f.values.business_activity||'[[business_activity]]'}`,`Registered office: ${f.values.registered_office||'[[registered_office]]'}`,
   p.full_name?`Director: ${p.full_name}, ID ${p.id_number||'[[id_number]]'}`:'No people on file',`Phone: ${f.values.client_phone||'[[client_phone]]'}`,
   /TEMPLATE \(follow/.test(user)?'FOLLOWED TEMPLATE':'NO TEMPLATE',/RULES FOR THIS DOCUMENT TYPE/.test(user)?'RULES SEEN':'',/EXTRA INSTRUCTIONS/.test(user)?'INSTRUCTIONS SEEN':'',`LANG ${lang}`].filter(Boolean).join('\n')}
 if(/^FACTS \(use only these\)/.test(user))return JSON.stringify({location_advantage:'Good road and port links.',waste_types:'Dust and ash.',marketing_bullets:['- Competitive pricing','Dealer network'],benefits:[{title:'Employment Creation',text:'Direct jobs.'},{title:'Local Market Stimulus',text:'Local suppliers.'}],ignored_key:'x'});
 return 'Unrecognised prompt';
}
const fail=(res,code,msg)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:msg}}))};
http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
 const url=req.url.split('?')[0];
 if(url==='/__log'){res.writeHead(200);return res.end(JSON.stringify(log))}
 if(url==='/__reset'){log=[];res.writeHead(200);return res.end('{}')}
 const m=url.match(/^\/(anthropic|openai|google|xai|mistral|kimi|deepseek|custom)(\/.*)$/);if(!m){res.writeHead(404);return res.end('{}')}
 const [,prov,path]=m,key=req.headers['x-api-key']||req.headers['x-goog-api-key']||String(req.headers.authorization||'').replace(/^Bearer /,'');
 let body={};try{body=JSON.parse(b||'{}')}catch{}
 log.push({prov,path,method:req.method,key,headers:{auth:req.headers.authorization,xapikey:req.headers['x-api-key'],google:req.headers['x-goog-api-key'],version:req.headers['anthropic-version']},body});
 if(key==='bad-key-0000')return fail(res,401,'invalid x-api-key');if(key==='quota-key-0000')return fail(res,429,'rate limit');
 const send=o=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(o))};
 if(req.method==='GET'&&/models$/.test(path)){
  if(prov==='anthropic')return send({data:[{id:'claude-sonnet-5-5'},{id:'claude-opus-5-5'},{id:'claude-haiku-5-5'}]});
  if(prov==='google')return send({models:[{name:'models/gemini-2.5-pro',supportedGenerationMethods:['generateContent']},{name:'models/embedding-001',supportedGenerationMethods:['embedContent']},{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]});
  return send({data:[{id:'gpt-5'},{id:'gpt-5-mini'},{id:'text-embedding-3-small'},{id:'whisper-1'},{id:'grok-4'},{id:'mistral-large-latest'}]})}
 if(prov==='anthropic'&&/\/v1\/messages$/.test(path)){const u=((body.messages||[])[0]||{}).content||'';return send({content:[{type:'text',text:answer(u,body.system)}],usage:{input_tokens:111,output_tokens:22}})}
 if(prov==='google'&&/:generateContent$/.test(path)){const u=(((body.contents||[])[0]||{}).parts||[{}])[0].text||'';return send({candidates:[{content:{parts:[{text:answer(u)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:121,candidatesTokenCount:33}})}
 if(/\/chat\/completions$/.test(path)){
  if(/^strict-/.test(body.model||'')&&'temperature' in body)return fail(res,400,"Unsupported value: 'temperature' does not support 0.2 with this model.");
  if(prov==='openai'&&'max_tokens' in body)return fail(res,400,"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.");
  const u=((body.messages||[]).find(x=>x.role==='user')||{}).content||'';return send({choices:[{message:{content:answer(u)}}],usage:{prompt_tokens:131,completion_tokens:44}})}
 res.writeHead(404);res.end('{}')})}).listen(4020);
