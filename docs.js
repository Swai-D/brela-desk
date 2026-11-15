// Document engine: templates with {{fields}}, gaps [[field]], people loops, privacy withholding, .docx output, text extraction.
// Pure functions (no database): easy to test and safe to reuse.
const KEY='[a-z][a-z0-9_]*';
const ROLE_LISTS={directors:'director',shareholders:'shareholder',secretaries:'secretary',beneficial_owners:'beneficial_owner'};
const PERSON_FIELDS=['name','full_name','nationality','id_type','id_number','dob','address','phone','email','shares','roles'];
const SENSITIVE_KEY=/(^|_)(id|ids|passport|nida|tin|dob|birth|phone|mobile|email|bank|account|iban|swift|password|pin|tax)(_|$)/;
const SENSITIVE_PERSON=['id_type','id_number','dob','phone','email'];

const fields=body=>{const keys=new Set(),lists={};let rest=String(body||'');
 rest=rest.replace(new RegExp(`\\{\\{#(${KEY})\\}\\}([\\s\\S]*?)\\{\\{/\\1\\}\\}`,'g'),(m,name,inner)=>{lists[name]=[...new Set([...(lists[name]||[]),...[...inner.matchAll(new RegExp(`\\{\\{\\s*(${KEY})`,'g'))].map(x=>x[1])])];return ''});
 for(const m of rest.matchAll(new RegExp(`\\{\\{\\s*(${KEY})`,'g')))keys.add(m[1]);
 return{keys:[...keys],lists}};

const personScope=(p,i,n)=>({index:String(i+1),count:String(n),name:p.full_name||'',full_name:p.full_name||'',nationality:p.nationality||'',id_type:p.id_type||'',id_number:p.id_number||'',dob:p.dob||'',address:p.address||'',phone:p.phone||'',email:p.email||'',shares:p.shares||'',roles:(p.roles||[]).join(', ')});

function render(body,ctx){
 const values=ctx.values||{},lists=ctx.lists||{},missing=new Set();
 const sub=(tpl,scope)=>String(tpl).replace(new RegExp(`\\{\\{\\s*(${KEY})(?:\\s*\\|\\s*([^}]*?))?\\s*\\}\\}`,'g'),(m,k,def)=>{
  const v=scope&&scope[k]!==undefined&&scope[k]!==''?scope[k]:values[k];
  if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v);
  if(def!==undefined)return def;missing.add(k);return `[[${k}]]`});
 let out=String(body||'').replace(new RegExp(`\\{\\{#(${KEY})\\}\\}([\\s\\S]*?)\\{\\{/\\1\\}\\}`,'g'),(m,name,inner)=>{
  const list=lists[name]||[];if(!list.length){missing.add(name);return `[[${name}]]`}
  const tpl=inner.replace(/^\r?\n/,'').replace(/\r?\n$/,'');
  return list.map((p,i)=>sub(tpl,personScope(p,i,list.length))).join('\n')});
 out=sub(out,null);
 return{text:out,missing:[...missing]}}

const gaps=text=>[...new Set([...String(text||'').matchAll(new RegExp(`\\[\\[(${KEY})\\]\\]`,'g'))].map(m=>m[1]))];
const applyGaps=(text,vals)=>String(text||'').replace(new RegExp(`\\[\\[(${KEY})\\]\\]`,'g'),(m,k)=>vals&&vals[k]!==undefined&&String(vals[k]).trim()!==''?String(vals[k]):m);

// Turn a finished document back into a template: known values become {{fields}}. Existing {{...}} and [[...]] are left alone.
function reverse(text,values){
 const pairs=Object.entries(values||{}).filter(([k,v])=>typeof v==='string'&&v.trim().length>=3&&!/^\d{1,3}$/.test(v.trim())&&!/^person_\d+_/.test(k)&&!['today','today_iso','year'].includes(k)).sort((a,b)=>b[1].length-a[1].length);
 const replaced=new Set();
 const body=String(text||'').split(/(\{\{[^}]*\}\}|\[\[[^\]]*\]\])/).map(seg=>{
  if(/^(\{\{|\[\[)/.test(seg))return seg;
  for(const [k,v] of pairs){const t=v.trim();if(seg.includes(t)){seg=seg.split(t).join(`{{${k}}}`);replaced.add(k)}}
  return seg}).join('');
 return{body,replaced:[...replaced]}}

const fmtDate=d=>new Date(d).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Africa/Dar_es_Salaam'});
function buildContext({client={},caseRow={},assignee='',profile={},data={},people=[]}){
 const v={client_name:client.name||'',company_name:client.name||'',client_phone:client.phone||'',client_email:client.email||'',client_track_number:client.track_number||'',
  case_code:caseRow.code||'',case_type:caseRow.type||'',case_track_number:caseRow.track_number||'',track_number:caseRow.track_number||client.track_number||'',
  due_date:caseRow.due?fmtDate(caseRow.due):'',assignee_name:assignee||'',today:fmtDate(Date.now()),today_iso:new Date(Date.now()+3*3600e3).toISOString().slice(0,10),year:String(new Date(Date.now()+3*3600e3).getUTCFullYear())};
 Object.assign(v,profile,data);
 const ordered=[...people].sort((a,b)=>(a.position||0)-(b.position||0)||(a.id||0)-(b.id||0));
 const lists={people:ordered};for(const [name,role] of Object.entries(ROLE_LISTS))lists[name]=ordered.filter(p=>(p.roles||[]).includes(role));
 ordered.forEach((p,i)=>{const s=personScope(p,i,ordered.length);for(const f of PERSON_FIELDS)if(s[f])v[`person_${i+1}_${f}`]=s[f]});
 v.directors_count=String(lists.directors.length);v.shareholders_count=String(lists.shareholders.length);v.people_count=String(ordered.length);
 return{values:v,lists}}

// Privacy: what the AI is allowed to see. Sensitive values are replaced by {{tokens}} that are filled in locally after generation.
function withhold(ctx,mode){
 if(mode==='off')return{values:ctx.values,lists:ctx.lists,withheld:[]};
 const withheld=new Set(),values={};
 for(const [k,v] of Object.entries(ctx.values)){if(SENSITIVE_KEY.test(k)&&String(v).trim()){values[k]=`{{${k}}}`;withheld.add(k)}else values[k]=v}
 const order=ctx.lists.people||[],idx=new Map(order.map((p,i)=>[p,i+1]));
 const lists={};
 for(const [name,arr] of Object.entries(ctx.lists))lists[name]=arr.map(p=>{const n=idx.get(p),o={...p};for(const f of SENSITIVE_PERSON)if(p[f]){o[f]=`{{person_${n}_${f}}}`;withheld.add(`person_${n}_${f}`)}return o});
 return{values,lists,withheld:[...withheld]}}

const tokenize=s=>new Set(String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w.length>2));
function suggestScore(t,itemName,caseTypeId){
 const a=tokenize(itemName),b=new Set([...tokenize(t.name),...tokenize(t.keywords)]);let n=0;for(const w of a)if(b.has(w))n++;
 return n*3+(caseTypeId&&t.case_type_id===caseTypeId?3:0)+(t.status==='APPROVED'?1:0)}

// ---- .docx
async function textToDocx(text,{title=''}={}){
 const D=require('docx');
 const runs=(s,base={})=>s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[\[[a-z][a-z0-9_]*\]\])/).filter(x=>x!=='').map(t=>
  /^\[\[/.test(t)?new D.TextRun({text:t,highlight:'yellow',...base}):/^\*\*/.test(t)?new D.TextRun({text:t.slice(2,-2),bold:true,...base}):/^\*[^*]/.test(t)?new D.TextRun({text:t.slice(1,-1),italics:true,...base}):new D.TextRun({text:t,...base}));
 const kids=[],lines=String(text||'').replace(/\r/g,'').split('\n');
 for(let i=0;i<lines.length;i++){const l=lines[i];
  if(/^\s*\|/.test(l)){const rows=[];while(i<lines.length&&/^\s*\|/.test(lines[i])){if(!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i]))rows.push(lines[i].trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));i++}i--;
   const n=Math.max(...rows.map(r=>r.length));
   kids.push(new D.Table({width:{size:100,type:D.WidthType.PERCENTAGE},rows:rows.map((r,ri)=>new D.TableRow({children:Array.from({length:n},(_,c)=>new D.TableCell({children:[new D.Paragraph({children:runs(r[c]||'',ri===0?{bold:true}:{})})]}))}))}));kids.push(new D.Paragraph({}));continue}
  let m;
  if(m=l.match(/^(#{1,3})\s+(.*)$/))kids.push(new D.Paragraph({heading:[D.HeadingLevel.HEADING_1,D.HeadingLevel.HEADING_2,D.HeadingLevel.HEADING_3][m[1].length-1],alignment:m[1].length===1?D.AlignmentType.CENTER:undefined,children:runs(m[2],{bold:true})}));
  else if(m=l.match(/^\s*[-*]\s+(.*)$/))kids.push(new D.Paragraph({bullet:{level:0},children:runs(m[1])}));
  else if(/^\s*-{3,}\s*$/.test(l))kids.push(new D.Paragraph({children:[new D.PageBreak()]}));
  else kids.push(new D.Paragraph({spacing:{after:l.trim()?120:0},children:runs(l)}))}
 const doc=new D.Document({title,styles:{default:{document:{run:{font:'Times New Roman',size:24}}}},sections:[{children:kids}]});
 return D.Packer.toBuffer(doc)}

// ---- reading uploaded files (accepted documents used to create templates)
async function extractText(buf,name='',mime=''){
 const ext=(String(name).split('.').pop()||'').toLowerCase();let text;
 if(ext==='docx'||/wordprocessingml/.test(mime))text=(await require('mammoth').extractRawText({buffer:buf})).value;
 else if(ext==='pdf'||mime==='application/pdf')text=(await require('pdf-parse/lib/pdf-parse.js')(buf)).text;
 else if(['txt','md','text'].includes(ext)||/^text\//.test(mime))text=buf.toString('utf8');
 else{const e=new Error('Unsupported file type. Use .docx, .pdf (with real text, not a scan), .txt or paste the text.');e.status=400;throw e}
 text=String(text||'').replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 if(text.length<20){const e=new Error('No readable text found in this file (scanned documents are not supported yet: paste the text instead).');e.status=400;throw e}
 return text.slice(0,60000)}

module.exports={fields,render,gaps,applyGaps,reverse,buildContext,withhold,suggestScore,textToDocx,extractText,personScope,SENSITIVE_KEY,ROLE_LISTS};
