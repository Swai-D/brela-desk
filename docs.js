// Document engine: templates with {{fields}}, gaps [[field]], people loops, privacy withholding, .docx output, text extraction.
// Pure functions (no database): easy to test and safe to reuse.
const KEY='[a-z][a-z0-9_]*';
const ROLE_LISTS={directors:'director',shareholders:'shareholder',secretaries:'secretary',beneficial_owners:'beneficial_owner'};
const PERSON_FIELDS=['name','full_name','first_names','surname','nationality','id_type','id_number','dob','gender','address','phone','email','shares','share_class','share_value','occupation','previous_names','other_directorships','roles'];
const SENSITIVE_KEY=/(^|_)(id|ids|passport|nida|tin|dob|birth|phone|mobile|email|bank|account|iban|swift|password|pin|tax)(_|$)/;
const SENSITIVE_PERSON=['id_type','id_number','dob','phone','email'];

const fields=body=>{const keys=new Set(),lists={};let rest=String(body||'');
 rest=rest.replace(new RegExp(`\\{\\{#(${KEY})\\}\\}([\\s\\S]*?)\\{\\{/\\1\\}\\}`,'g'),(m,name,inner)=>{lists[name]=[...new Set([...(lists[name]||[]),...[...inner.matchAll(new RegExp(`\\{\\{\\s*(${KEY})`,'g'))].map(x=>x[1])])];return ''});
 for(const m of rest.matchAll(new RegExp(`\\{\\{\\s*(${KEY})`,'g')))keys.add(m[1]);
 return{keys:[...keys],lists}};

const splitName=n=>{const w=String(n||'').trim().split(/\s+/).filter(Boolean);return w.length<2?{first:'',last:w[0]||''}:{first:w.slice(0,-1).join(' '),last:w[w.length-1]}};
const personScope=(p,i,n)=>({index:String(i+1),count:String(n),name:p.full_name||'',full_name:p.full_name||'',first_names:splitName(p.full_name).first,surname:splitName(p.full_name).last,nationality:p.nationality||'',id_type:p.id_type||'',id_number:p.id_number||'',dob:p.dob||'',gender:p.gender||'',address:p.address||'',phone:p.phone||'',email:p.email||'',shares:p.shares||'',share_class:p.share_class||'',share_value:p.share_value||'',occupation:p.occupation||'',previous_names:p.previous_names||'',other_directorships:p.other_directorships||'',roles:(p.roles||[]).join(', ')});

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
// A country written instead of the nationality ("TZ", "Tanzania", "Kenya") becomes the nationality the forms need ("Tanzanian", "Kenyan").
const NATION={tz:'Tanzanian',tza:'Tanzanian',tanzania:'Tanzanian',tanzanian:'Tanzanian',ke:'Kenyan',kenya:'Kenyan',ug:'Ugandan',uganda:'Ugandan',rw:'Rwandan',rwanda:'Rwandan',bi:'Burundian',burundi:'Burundian',cd:'Congolese',drc:'Congolese',zm:'Zambian',zambia:'Zambian',mw:'Malawian',malawi:'Malawian',mz:'Mozambican',mozambique:'Mozambican',za:'South African','south africa':'South African',in:'Indian',india:'Indian',cn:'Chinese',china:'Chinese',gb:'British',uk:'British','united kingdom':'British',us:'American',usa:'American','united states':'American',ae:'Emirati'};
const natName=x=>{const t=String(x||'').replace(/\s+/g,' ').trim();return NATION[t.toLowerCase()]||t};
// The same person saved twice (typed by hand and imported, or with different capitals) is one person: details missing on one record are taken from the other.
function mergePeople(list){
 const norm=x=>String(x||'').replace(/\s+/g,' ').trim().toLowerCase(),out=[];
 for(const p of list){
  const hit=out.find(o=>norm(o.full_name)&&norm(o.full_name)===norm(p.full_name)&&!(norm(o.id_number)&&norm(p.id_number)&&norm(o.id_number)!==norm(p.id_number)));
  if(!hit){out.push({...p,roles:[...(p.roles||[])]});continue}
  for(const [k,v] of Object.entries(p)){if(k==='roles')hit.roles=[...new Set([...(hit.roles||[]),...(v||[])])];else if(k==='addr'){if(!hit.addr||!Object.keys(hit.addr).length)hit.addr=v}else if(hit[k]===undefined||hit[k]===null||String(hit[k]).trim()==='')hit[k]=v}}
 return out}
function buildContext({client={},caseRow={},assignee='',profile={},data={},people=[]}){
 const v={client_name:client.name||'',company_name:client.name||'',client_phone:client.phone||'',client_email:client.email||'',client_track_number:client.track_number||'',
  case_code:caseRow.code||'',case_type:caseRow.type||'',case_track_number:caseRow.track_number||'',track_number:caseRow.track_number||client.track_number||'',
  due_date:caseRow.due?fmtDate(caseRow.due):'',assignee_name:assignee||'',today:fmtDate(Date.now()),today_iso:new Date(Date.now()+3*3600e3).toISOString().slice(0,10),year:String(new Date(Date.now()+3*3600e3).getUTCFullYear())};
 Object.assign(v,profile,data);
 const acts=Array.isArray(client.activities)?client.activities:[];
 if(acts.length&&!v.business_activities){v.business_activities=acts.map(a=>`${a.code}  ${a.name}${a.main?' (main)':''}`).join('\n');v.activities_count=String(acts.length)}
 const ordered=mergePeople(people).map(p=>({...p,nationality:natName(p.nationality)})).sort((a,b)=>(a.position||0)-(b.position||0)||(a.id||0)-(b.id||0));
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

// ---- .docx template package: fill the yellow [LABELS] of an original Word template (port of Templates_Package/fill_template.py) ----
const W_NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main',XML_NS='http://www.w3.org/XML/1998/namespace';
const labelFromKey=k=>{const o=/_OPT$/.test(k);const b=o?k.slice(0,-4):k;return b.replace(/_/g,' ')+(o?', IF ANY':'')};
function docxTargets(zip){return Object.keys(zip.files).filter(f=>!zip.files[f].dir&&/^word\/.+\.xml$/.test(f)&&/document|header|footer/.test(f))}

// ---- repeating people: the official templates have a fixed number of numbered slots (DIRECTOR 1..3, MEMBER 1..7, ATTENDEE 1..5 ...).
// Count how many people the company really has, drop the empty slots and copy the last slot for any extra person, so nothing is left yellow
// and nobody is left out. A slot is the paragraph, table row or table that holds only that person's labels.
const SLOT_RE=/^(NEW DIRECTOR|OTHER MEMBER|DIRECTOR|MEMBER|ATTENDEE|ALLOTTEE|RESIGNING) (\d+)(?: .+)?$/;
// In a members' resolution the "Present" list carries MEMBER 3-7 after the chairman and the secretary; those lines mean "the other members".
function renamePresent(doc,values){
 if(values.OTHER_MEMBER_1_NAME===undefined)return;
 const W=W_NS,txt=e=>Array.from(e.getElementsByTagNameNS(W,'t')).map(t=>t.textContent).join('');let inside=false;
 for(const p of Array.from(doc.getElementsByTagNameNS(W,'p'))){const t=txt(p).trim();
  if(t==='Present'){inside=true;continue}if(t==='Absent'){inside=false;continue}
  if(!inside)continue;
  for(const r of Array.from(p.childNodes).filter(n=>n.nodeType===1&&n.localName==='r')){const ts=Array.from(r.getElementsByTagNameNS(W,'t')),x=ts.map(a=>a.textContent).join(''),m=x.match(/^MEMBER (\d+) NAME$/);
   if(m&&+m[1]>=3&&ts.length){ts[0].textContent='OTHER MEMBER '+(+m[1]-2)+' NAME';for(const e of ts.slice(1))e.textContent=''}}}}
function restructureSlots(doc,values){
 const rPrOf=el=>Array.from(el.childNodes).find(n=>n.nodeType===1&&n.namespaceURI===W_NS&&n.localName==='rPr');
 const isHl=r=>{const rp=rPrOf(r);return !!rp&&!!Array.from(rp.childNodes).find(n=>n.localName==='highlight')};
 const textOf=e=>Array.from(e.getElementsByTagNameNS(W_NS,'t')).map(t=>t.textContent).join('');
 const hlRuns=()=>Array.from(doc.getElementsByTagNameNS(W_NS,'r')).filter(isHl);
 const have=new Map();// prefix -> highest n that has any value
 for(const [k,v] of Object.entries(values)){const m=k.match(/^(NEW_DIRECTOR|OTHER_MEMBER|DIRECTOR|MEMBER|ATTENDEE|ALLOTTEE|RESIGNING)_(\d+)_/);if(m&&String(v??'').trim()!==''&&!/^(NEW_DIRECTOR|OTHER_MEMBER|DIRECTOR|MEMBER|ATTENDEE|ALLOTTEE|RESIGNING)_\d+_(CLASS|POSSESSIVE)$/.test(k)){const p=m[1].replace('_',' ');have.set(p,Math.max(have.get(p)||0,+m[2]))}}
 const slotsOf=prefix=>{const g=new Map(),keyOf=new Map();
  for(const r of hlRuns()){const m=textOf(r).trim().match(SLOT_RE);if(m){keyOf.set(r,m[1]+'|'+m[2]);if(m[1]===prefix){if(!g.has(+m[2]))g.set(+m[2],[]);g.get(+m[2]).push(r)}}}
  const owns=(el,key)=>Array.from(el.getElementsByTagNameNS(W_NS,'r')).every(r=>!isHl(r)||keyOf.get(r)===key);
  const contains=(a,b)=>{for(let x=b.parentNode;x;x=x.parentNode)if(x===a)return true;return false};
  const out=new Map();
  for(const [n,rs] of g){const key=prefix+'|'+n,set=[];
   for(const r of rs){let best=null;
    for(let a=r.parentNode;a&&a.nodeType===1&&a.localName!=='body';a=a.parentNode){const nm=a.localName;
     if(nm==='tc'){if(best&&best.localName==='tbl'&&textOf(a).replace(/\s/g,'')!==textOf(best).replace(/\s/g,''))break;continue}
     if(nm!=='p'&&nm!=='tr'&&nm!=='tbl')continue;
     if(!owns(a,key))break;best=a}
    if(best&&!set.includes(best))set.push(best)}
   const top=set.filter(b=>!set.some(o=>o!==b&&contains(o,b)));
   top.sort((a,b)=>a===b?0:(a.compareDocumentPosition(b)&4)?-1:1);
   out.set(n,top)}
  return out};
 const renumber=(el,prefix,n)=>{for(const r of Array.from(el.getElementsByTagNameNS(W_NS,'r'))){if(!isHl(r))continue;const ts=Array.from(r.getElementsByTagNameNS(W_NS,'t')),t=ts.map(x=>x.textContent).join('');
   const m=t.trim().match(SLOT_RE);if(m&&m[1]===prefix&&ts.length){ts[0].textContent=t.replace(new RegExp('^(\\s*'+prefix+' )\\d+'),'$1'+n);for(const x of ts.slice(1))x.textContent=''}}};
 let changed=0;
 for(const [prefix,count] of have){
  const slots=slotsOf(prefix);if(!slots.size)continue;
  const nums=[...slots.keys()].sort((a,b)=>a-b),max=nums[nums.length-1];
  // unused slots go (slot 1 always stays, so a company with nobody saved still shows what is needed)
  for(const n of nums)if(n>count&&n>1){for(const b of slots.get(n)||[])if(b.parentNode){b.parentNode.removeChild(b);changed++}}
  // more people than slots: copy the last slot
  if(count>max){const last=slots.get(max)||[],ins=last.map(b=>b);
   for(let n=max+1;n<=count;n++)last.forEach((b,i)=>{if(!b.parentNode)return;const c=b.cloneNode(true);renumber(c,prefix,n);ins[i].parentNode.insertBefore(c,ins[i].nextSibling);ins[i]=c;changed++})}}
 if(changed){// a table cell must end with a paragraph, and may not be empty
  for(const tc of Array.from(doc.getElementsByTagNameNS(W_NS,'tc'))){const kids=Array.from(tc.childNodes).filter(n=>n.nodeType===1&&n.localName!=='tcPr');
   if(!kids.length||kids[kids.length-1].localName!=='p')tc.appendChild(doc.createElementNS(W_NS,'w:p'))}}
 return changed}

// The forms split the company name over two boxes (COMPANY NAME LINE 1 / LINE 2). Put the whole name in one box and take the second away.
function mergeNameRows(doc,values){
 const rPrOf=el=>Array.from(el.childNodes).find(n=>n.nodeType===1&&n.namespaceURI===W_NS&&n.localName==='rPr');
 const isHl=r=>{const rp=rPrOf(r);return !!rp&&!!Array.from(rp.childNodes).find(n=>n.localName==='highlight')};
 const textOf=e=>Array.from(e.getElementsByTagNameNS(W_NS,'t')).map(t=>t.textContent).join('').trim();
 const l2=Array.from(doc.getElementsByTagNameNS(W_NS,'r')).filter(r=>isHl(r)&&textOf(r)==='COMPANY NAME LINE 2');
 let changed=0;
 for(const r of l2){let blk=null;
  for(let a=r.parentNode;a&&a.nodeType===1&&a.localName!=='body';a=a.parentNode){
   if(a.localName==='tr'){const hl=Array.from(a.getElementsByTagNameNS(W_NS,'r')).filter(isHl);if(hl.every(x=>textOf(x)==='COMPANY NAME LINE 2')&&a.parentNode&&Array.from(a.parentNode.childNodes).filter(n=>n.localName==='tr').length>1)blk=a;break}}
  if(blk){blk.parentNode.removeChild(blk);changed++}}

 // widen the name box to the edge of the section it sits in, so a long name stays on one line
 const l1=Array.from(doc.getElementsByTagNameNS(W_NS,'r')).filter(r=>isHl(r)&&textOf(r)==='COMPANY NAME LINE 1');
 const kid=(el,n)=>Array.from(el.childNodes).find(x=>x.nodeType===1&&x.namespaceURI===W_NS&&x.localName===n);
 const wv=(el,n)=>{const e=el&&kid(el,n);return e?+(e.getAttributeNS(W_NS,'w')||e.getAttribute('w:w')||0):0};
 for(const r of l1){let tbl=null,outer=null;
  for(let a=r.parentNode;a&&a.nodeType===1;a=a.parentNode){if(a.localName==='tbl'&&!tbl)tbl=a;else if(a.localName==='tc'&&tbl){outer=a;break}}
  if(!tbl||!outer)continue;
  const pr=kid(tbl,'tblPr'),ind=wv(pr,'tblInd'),ow=wv(kid(outer,'tcPr'),'tcW'),target=ow-ind-200;
  const grid=kid(tbl,'tblGrid'),cols=grid?Array.from(grid.childNodes).filter(x=>x.localName==='gridCol'):[];
  if(!ow||cols.length!==1||target<=wv({childNodes:[]},'x')||target<=+(cols[0].getAttribute('w:w')||0))continue;
  cols[0].setAttribute('w:w',String(target));
  for(const tc of Array.from(tbl.getElementsByTagNameNS(W_NS,'tc'))){const tp=kid(tc,'tcPr'),w=tp&&kid(tp,'tcW');if(w)w.setAttribute('w:w',String(target))}}
 return changed}

// Optional wording of the official forms (yellow, not a [LABEL]). The wizard decides each one; without an answer the standard wording is kept.
const CLAUSES=[
 {k:'CONSENT_EFFECT',re:/^with effect from the time of receipt of that consent$/i},
 {k:'RESIGN_EFFECT',re:/^(each )?(with effect from|to take effect at) the conclusion of this meeting$/i},
 {k:'PAY_BANK',re:/^or into (the Company bank account|a bank account designated by the Company)$/i},
 {k:'AT_NOMINAL',re:/^at nominal value$/i},
 {k:'REALLOT',re:/^re-allotted or otherwise disposed of$/i},
 {k:'UNISSUED',re:/^shall not be allotted, sold or otherwise disposed of/i}];
const clauseOf=t=>{const x=String(t||'').replace(/\s+/g,' ').trim();return CLAUSES.find(c=>c.re.test(x))};
// [LABEL IN CAPITALS] (", IF ANY" = optional) -> the field name used by the app, or null when it is not a label
const userClauseKey=t=>'U'+require('crypto').createHash('sha1').update(String(t).replace(/\s+/g,' ').trim().toLowerCase()).digest('hex').slice(0,8).toUpperCase();
const labelKey=lab=>{const t=String(lab||'').replace(/\s+/g,' ').trim(),o=/,\s*IF ANY$/i.test(t),b=t.replace(/,\s*IF ANY$/i,'').trim();return /^[A-Z][A-Z0-9 ]*$/.test(b)?b.replace(/ /g,'_')+(o?'_OPT':''):null};
// Word often splits one highlighted "[LABEL]" into several runs (spell-check, a change of font). Join consecutive highlighted runs when together they make a label.
function joinLabelRuns(doc){
 const rt=r=>Array.from(r.getElementsByTagNameNS(W_NS,'t')).map(t=>t.textContent).join('');
 const hl=r=>{const rp=Array.from(r.childNodes).find(n=>n.nodeType===1&&n.localName==='rPr');return !!rp&&!!Array.from(rp.childNodes).find(n=>n.localName==='highlight')};
 for(const p of Array.from(doc.getElementsByTagNameNS(W_NS,'p'))){
  const kids=Array.from(p.childNodes).filter(n=>n.nodeType===1&&n.localName==='r');
  for(let i=0;i<kids.length;i++){if(!hl(kids[i]))continue;let j=i;while(j+1<kids.length&&hl(kids[j+1])&&kids[j+1].previousSibling===kids[j])j++;
   if(j>i){const txt=kids.slice(i,j+1).map(rt).join('');if(/^\s*\[[^\[\]]+\]\s*$/.test(txt)){const ts=Array.from(kids[i].getElementsByTagNameNS(W_NS,'t'));let t0=ts[0];if(!t0){t0=doc.createElementNS(W_NS,'w:t');kids[i].appendChild(t0)}t0.textContent=txt.trim();t0.setAttributeNS(XML_NS,'xml:space','preserve');for(const x of ts.slice(1))kids[i].removeChild(x);for(let k=i+1;k<=j;k++)p.removeChild(kids[k])}}
   i=j}}}
// What a Word file asks for: its [LABELS] and its optional wording, so a template can be made from it
async function docxScan(buf){
 const JSZip=require('jszip'),{DOMParser}=require('@xmldom/xmldom'),zip=await JSZip.loadAsync(buf),labels=new Map(),clausesFound=[];
 const rt=r=>Array.from(r.getElementsByTagNameNS(W_NS,'t')).map(t=>t.textContent).join('');
 const hl=r=>{const rp=Array.from(r.childNodes).find(n=>n.nodeType===1&&n.localName==='rPr');return !!rp&&!!Array.from(rp.childNodes).find(n=>n.localName==='highlight')};
 for(const f of docxTargets(zip)){const doc=new DOMParser().parseFromString(await zip.file(f).async('string'),'text/xml');joinLabelRuns(doc);
  for(const p of Array.from(doc.getElementsByTagNameNS(W_NS,'p'))){const runs=Array.from(p.childNodes).filter(n=>n.nodeType===1&&n.localName==='r');
   runs.forEach((r,i)=>{if(!hl(r))return;const t=rt(r),m=t.match(/^\[\s*([^\[\]]+?)\s*\]$/),wrapped=0<i&&i<runs.length-1&&rt(runs[i-1])==='['&&rt(runs[i+1])===']',lab=m?m[1].replace(/\s+/g,' '):wrapped?t.trim():null,key=lab?labelKey(lab):null;
    if(key){const e=labels.get(key)||{label:lab,key,optional:/_OPT$/.test(key),count:0};e.count++;labels.set(key,e)}else if(t.trim()&&!clauseOf(t))clausesFound.push(t.replace(/\s+/g,' ').trim())})}}
 return{labels:[...labels.values()],clauses:[...new Set(clausesFound)].map(text=>({key:userClauseKey(text),text}))}}
const ROWKEY=/^(OWNER|PRODUCT|RAW|INVEST)_\d+_/;
async function docxFill(buf,values,{acceptClauses=false,custom=false}={}){
 const JSZip=require('jszip'),{DOMParser,XMLSerializer}=require('@xmldom/xmldom');
 const zip=await JSZip.loadAsync(buf);
 values={...values};
 const fullName=String(values.COMPANY_NAME||[values.COMPANY_NAME_LINE_1,values.COMPANY_NAME_LINE_2].filter(x=>String(x||'').trim()).join(' ')).trim().toUpperCase();
 if(fullName){values.COMPANY_NAME_LINE_1=fullName;values.COMPANY_NAME_LINE_2='';values.__merge_name=1}
 const l2k={};for(const k of Object.keys(values))l2k[labelFromKey(k)]=k;
 const missing=new Set();let filled=0,clauses=0;
 const q=t=>`{${W_NS}}${t}`;
 for(const f of docxTargets(zip)){
  const doc=new DOMParser().parseFromString(await zip.file(f).async('string'),'text/xml');
  if(custom)joinLabelRuns(doc);
  if(values.__merge_name)mergeNameRows(doc,values);
  renamePresent(doc,values);
  restructureSlots(doc,values);
  const del=[],rowSlots=new Map();
  for(const p of Array.from(doc.getElementsByTagNameNS(W_NS,'p'))){
   const runs=Array.from(p.childNodes).filter(n=>n.nodeType===1&&n.namespaceURI===W_NS&&n.localName==='r');
   const rtext=r=>Array.from(r.getElementsByTagNameNS(W_NS,'t')).map(t=>t.textContent).join('');
   const isHl=r=>{const rPr=Array.from(r.childNodes).find(n=>n.nodeType===1&&n.namespaceURI===W_NS&&n.localName==='rPr');return !!rPr&&!!Array.from(rPr.childNodes).find(n=>n.localName==='highlight')};
   const unhl=r=>{const rPr=Array.from(r.childNodes).find(n=>n.nodeType===1&&n.namespaceURI===W_NS&&n.localName==='rPr');if(rPr)Array.from(rPr.childNodes).filter(n=>n.localName==='highlight').forEach(h=>rPr.removeChild(h))};
   const inCell=p!==p.ownerElement&&(()=>{for(let a=p.parentNode;a&&a.nodeType===1;a=a.parentNode)if(a.namespaceURI===W_NS&&a.localName==='tc')return true;return false})();
   for(let i=0;i<runs.length;i++){const r=runs[i];if(!isHl(r))continue;
    const sm=custom?rtext(r).match(/^\[\s*([^\[\]]+?)\s*\]$/):null;// your own Word file: the whole [LABEL] sits in one highlighted run
    const wrapped=!!sm||(0<i&&i<runs.length-1&&rtext(runs[i-1])==='['&&rtext(runs[i+1])===']');
    const lab=sm?sm[1].replace(/\s+/g,' '):rtext(r),key=l2k[lab]||(wrapped&&/, IF ANY$/.test(lab)&&/^[A-Z0-9 ,]+$/.test(lab)?lab.replace(/, IF ANY$/,'').replace(/ /g,'_')+'_OPT':null)||(custom&&wrapped?labelKey(lab):null);
    if(wrapped&&key){
     const val=values[key];
     if((val===undefined||val===null)&&!/_OPT$/.test(key)&&!(ROWKEY.test(key)&&inCell)){missing.add(key);continue}// an optional ("IF ANY") detail nobody has is left blank, not yellow
     const v=val===undefined||val===null?'':String(val);if(val!==undefined&&val!==null)filled++;
     const ts=Array.from(r.getElementsByTagNameNS(W_NS,'t'));
     if(!ts.length){const t=doc.createElementNS(W_NS,'w:t');r.appendChild(t);ts.push(t)}
     ts[0].textContent=v;ts[0].setAttributeNS(XML_NS,'xml:space','preserve');
     for(const extra of ts.slice(1))r.removeChild(extra);
     unhl(r);
     if(!sm){p.removeChild(runs[i-1]);p.removeChild(runs[i+1])}
     if(v===''&&!/_OPT$/.test(key)&&!inCell)del.push(p);
     // table rows made of numbered slots (RAW_1_NAME, INVEST_2_AMOUNT ...): a row whose slots are all blank is taken out of the table
     if(ROWKEY.test(key)&&inCell){let tr=p.parentNode;while(tr&&!(tr.namespaceURI===W_NS&&tr.localName==='tr'))tr=tr.parentNode;if(tr){const o=rowSlots.get(tr)||{n:0,blank:0};o.n++;if(v==='')o.blank++;rowSlots.set(tr,o)}}}
    else if(!wrapped){const cl=clauseOf(rtext(r))||(custom&&rtext(r).trim()?{k:userClauseKey(rtext(r))}:null);
     if(cl){const on=String(values['CLAUSE_'+cl.k]??'yes').toLowerCase()!=='no';
      if(on)unhl(r);else{const pr=runs[i-1],nx=runs[i+1];p.removeChild(r);
       // no stray space before the punctuation that follows
       if(pr&&nx&&/^\s*[,.;:]/.test(rtext(nx))){for(const t of Array.from(pr.getElementsByTagNameNS(W_NS,'t')).reverse()){if(t.textContent){t.textContent=/^\s*[.;:]/.test(rtext(nx))?t.textContent.replace(/[\s,]+$/,''):t.textContent.replace(/\s+$/,'');break}}}}
      }
     else if(acceptClauses)unhl(r);else clauses++}
    else missing.add('?'+rtext(r))}
  }
  for(const p of del)if(p.parentNode)p.parentNode.removeChild(p);
  for(const [tr,o] of rowSlots)if(o.n&&o.blank===o.n&&tr.parentNode)tr.parentNode.removeChild(tr);
  // xmldom keeps the file's own <?xml ...?> line when it writes the document back, so strip it and add exactly one (two make Word refuse to open the file)
  zip.file(f,'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'+new XMLSerializer().serializeToString(doc).replace(/^\s*(<\?xml[^>]*\?>\s*)+/,''))}
 const buffer=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
 // slots nobody fills were taken out of the document, so they are not "missing" either
 const top={};for(const [k,v] of Object.entries(values)){const m=k.match(/^(NEW_DIRECTOR|OTHER_MEMBER|DIRECTOR|MEMBER|ATTENDEE|ALLOTTEE|RESIGNING)_(\d+)_(?!CLASS$|POSSESSIVE$)/);if(m&&String(v??'').trim()!=='')top[m[1]]=Math.max(top[m[1]]||0,+m[2])}
 for(const k of [...missing]){const m=String(k).match(/^(NEW_DIRECTOR|OTHER_MEMBER|DIRECTOR|MEMBER|ATTENDEE|ALLOTTEE|RESIGNING)_(\d+)_/);if(m&&+m[2]>Math.max(top[m[1]]||0,1))missing.delete(k)}
 return{buffer,missing:[...missing],filled,clauses}}

// A PDF copy of a filled Word file (easier to upload to BRELA). Uses LibreOffice when the server has it; returns null when it does not,
// so generating documents never fails because of the PDF. Set PDF_COPY=off to turn it off, SOFFICE_BIN to point at the program.
let pdfUnavailable=false;
async function docxToPdf(buf){
 if(pdfUnavailable||/^(off|0|false)$/i.test(process.env.PDF_COPY||''))return null;
 const fs=require('fs'),os=require('os'),path=require('path'),{execFile}=require('child_process');
 const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'brela-pdf-'));
 try{
  await fs.promises.writeFile(path.join(dir,'in.docx'),buf);
  await new Promise((ok,no)=>execFile(process.env.SOFFICE_BIN||'soffice',['--headless','--norestore','-env:UserInstallation=file://'+dir+'/profile','--convert-to','pdf','--outdir',dir,path.join(dir,'in.docx')],{timeout:60000},e=>e?no(e):ok()));
  const out=await fs.promises.readFile(path.join(dir,'in.pdf'));
  return out.length>5&&out.subarray(0,5).toString('latin1')==='%PDF-'?out:null}
 catch(e){if(e&&e.code==='ENOENT')pdfUnavailable=true;return null}
 finally{fs.promises.rm(dir,{recursive:true,force:true}).catch(()=>{})}}

// Map the app context (client, case data, people) to the UPPER_SNAKE values a package template needs.
const MON={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
const dmy=t=>{const s=String(t||'').trim();let m;if(m=s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/)){const mo=MON[m[2].toLowerCase()];if(mo)return `${String(+m[1]).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${m[3]}`}if(m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/))return `${m[3]}/${m[2]}/${m[1]}`;return s};
// BRELA forms are filled in CAPITALS
const titleName=t=>String(t||'').toLowerCase().replace(/(^|[\s\-'’(])(\p{L})/gu,(m,x,y)=>x+y.toUpperCase()).replace(/ And /g,' and ');
const CAPS=/^(COMPANY_NAME(_LINE_[12])?|COMPANY_TYPE|REGISTERED_OFFICE|PRINCIPAL_ACTIVITIES|SHARE_CLASS|SECRETARY_(NAME|ADDRESS)|SIGNING_DIRECTOR_NAME|CHAIRMAN_NAME|DIRECTOR_\d+_(NAME|ADDRESS|NATIONALITY)|MEMBER_\d+_NAME|NEW_DIRECTOR_\d+_NAME|NATIONALITY)$/;
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const longDate=t=>{const s=String(t||'').trim(),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${+m[3]} ${MONTHS[+m[2]-1]} ${m[1]}`:s};
// a residential address as up to 3 lines (street / area, ward and district, region and country with P.O. Box)
function addrLines(p){
 const a=p&&p.addr&&typeof p.addr==='object'?p.addr:{},has=Object.keys(a).length;
 if(!has){const parts=String((p&&p.address)||'').split(',').map(x=>x.trim()).filter(Boolean);if(parts.length<=3)return[parts[0]||'',parts[1]||'',parts[2]||''];const n=Math.ceil(parts.length/3);return[parts.slice(0,n).join(', '),parts.slice(n,2*n).join(', '),parts.slice(2*n).join(', ')]}
 const j=(...x)=>x.filter(Boolean).join(', '),street=j(a.house&&`House ${a.house}`,a.plot&&`Plot ${a.plot}`,a.block&&`Block ${a.block}`,a.street,a.road,a.unsurveyed,a.landmark);
 return street?[street,j(a.subward,a.ward,a.district),j(a.pobox&&`P.O. Box ${a.pobox}`,a.region,a.country)]:[j(a.subward,a.ward),j(a.district,a.pobox&&`P.O. Box ${a.pobox}`),j(a.region,a.country)]}
function packageValues(ctx,opt={}){
 const v={};for(const [k,x] of Object.entries(ctx.values||{}))if(String(x??'').trim()!=='')v[k.toUpperCase()]=String(x);
 const lists=ctx.lists||{},dirs=lists.directors||[],secs=lists.secretaries||[],mem=lists.shareholders&&lists.shareholders.length?lists.shareholders:dirs;
 const nm=p=>String((p&&(p.full_name||p.name))||'').trim(),set=(k,x)=>{if(x!==undefined&&x!==null&&String(x).trim()!==''&&!v[k])v[k]=String(x).trim()};
 // company details first: where the Company tab holds the same thing under another name, use it
 set('PRINCIPAL_ACTIVITIES',ctx.values&&(ctx.values.principal_activities||ctx.values.business_activity||ctx.values.main_activity));
 set('COMPANY_TYPE',ctx.values&&ctx.values.company_type);set('REGISTERED_OFFICE',ctx.values&&ctx.values.registered_office);set('INCORPORATION_NO',ctx.values&&ctx.values.incorporation_no);
 set('CHAIRMAN_NAME',nm(dirs[0]));set('SIGNING_DIRECTOR_NAME',nm(dirs[0]));set('SECRETARY_NAME',nm(secs[0]));set('SECRETARY_ADDRESS',secs[0]&&secs[0].address);
 dirs.forEach((p,i)=>{const n=i+1;set('ATTENDEE_'+n+'_NAME',nm(p));set(`DIRECTOR_${n}_NAME`,nm(p));set(`DIRECTOR_${n}_NATIONALITY`,p.nationality);set(`DIRECTOR_${n}_ADDRESS`,p.address);set(`DIRECTOR_${n}_DOB`,dmy(p.dob))});
 mem.forEach((p,i)=>{const n=i+1;set('MEMBER_'+n+'_NAME',nm(p));if(p.shares&&/^[\d,]+$/.test(String(p.shares).trim()))set('MEMBER_'+n+'_SHARES',Number(String(p.shares).replace(/,/g,'')).toLocaleString('en-US'))});

 // ---- Form 131 (annual return): anniversary, share totals, member list
 const up=x=>String(x||'').toUpperCase(),fmt=n=>Number(n).toLocaleString('en-US'),numOf=x=>{const n=Number(String(x||'').replace(/[^0-9.]/g,''));return Number.isFinite(n)&&String(x||'').trim()?n:0};
 const iso=String(ctx.values&&ctx.values.date_of_incorporation_iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
 if(iso&&!v.RETURN_DATE){const now=new Date(Date.now()+3*3600e3),ty=now.getUTCFullYear();let d=new Date(Date.UTC(ty,+iso[2]-1,+iso[3]));if(d>now)d=new Date(Date.UTC(ty-1,+iso[2]-1,+iso[3]));
  if(d.getUTCFullYear()>+iso[1])v.RETURN_DATE=`${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`.toUpperCase()}
 // Form 131 is signed on the day the return is made up to
 if(v.RETURN_DATE)set('SIGNING_DATE_OPT',v.RETURN_DATE);
 const nominal=numOf(ctx.values&&(ctx.values.share_value||ctx.values.nominal_value_per_share)),issuedN=numOf(ctx.values&&(ctx.values.shares_issued_total||ctx.values.shares_issued));
 if(issuedN){v.SHARES_ISSUED_TOTAL=fmt(issuedN);if(!/,/.test(String(ctx.values&&ctx.values.share_class||'')))v.SHARES_ISSUED=fmt(issuedN)}
 if(issuedN&&nominal){set('AGGREGATE_NOMINAL_VALUE_TOTAL',fmt(issuedN*nominal));set('AGGREGATE_NOMINAL_VALUE',fmt(issuedN*nominal))}
 if(nominal)set('NOMINAL_VALUE_PER_SHARE_NUMERIC',fmt(nominal));
 set('SHARE_TYPE',v.SHARE_CLASS?'Ordinary':'');set('SHARE_CLASS_IF_APPLICABLE','Not applicable');
 [...(lists.shareholders||[])].filter(p=>nm(p)).sort((a,b)=>nm(a).localeCompare(nm(b))).forEach((p,i)=>{const n=i+1;set(`MEMBER_${n}_NAME_ADDRESS_OPT`,up(nm(p))+(p.address?' - '+up(p.address):''));const sh=numOf(p.shares);if(sh)set(`MEMBER_${n}_SHARES_HELD_OPT`,fmt(sh))});
 // ---- Forms 213a / 213b: the person concerned = the one named in the case data (person_name), else the first director
 const people=lists.people||[],want=up(v.PERSON_NAME||v.SUBJECT_NAME||v.DIRECTOR_NAME||''),subj=(want&&people.find(p=>up(nm(p))===want))||dirs[0]||secs[0];
 if(subj){const sn=splitName(nm(subj)),ad=addrLines(subj);
  set('FIRST_NAMES',up(sn.first||sn.last));set('SURNAME',sn.first?up(sn.last):'');set('DOB',up(longDate(subj.dob)));set('NATIONALITY',up(subj.nationality));
  set('PREVIOUS_NAMES_OPT',up(subj.previous_names));set('OTHER_DIRECTORSHIPS_OPT',subj.other_directorships);
  set('ADDRESS_LINE_1',up(ad[0]));set('ADDRESS_LINE_2',up(ad[1]));set('ADDRESS_LINE_3_OPT',up(ad[2]));
  const isSec=(subj.roles||[]).includes('secretary')&&!(subj.roles||[]).includes('director');set('ROLE_UPPER',isSec?'SECRETARY':'DIRECTOR');set('ROLE_LOWER',isSec?'secretary':'director');
  // business occupation: what is saved for the person, otherwise the office they hold (Director / Secretary)
  set('OCCUPATION',up(subj.occupation)||v.ROLE_UPPER||(isSec?'SECRETARY':'DIRECTOR'))}
 set('SIGNING_DIRECTOR_ROLE','Director');set('SIGNING_DIRECTOR_ROLE_BRACKETED','(Director)');
 // ---- people mentioned by name in the case data (allottees): fill their address and share class from the company's people records
 for(let n=1;n<=10;n++){const nmv=v['ALLOTTEE_'+n+'_NAME'];if(!nmv)continue;const p=people.find(x=>up(nm(x))===up(nmv));if(p){set('ALLOTTEE_'+n+'_ADDRESS',up(p.address));set('ALLOTTEE_'+n+'_CLASS',p.share_class||(ctx.values&&ctx.values.share_class)||'')}}
 secs[0]&&set('SECRETARY_PREVIOUS_NAMES_OPT',up(secs[0].previous_names));
 dirs.forEach((p,i)=>{const n=i+1;set(`DIRECTOR_${n}_OCCUPATION`,up(p.occupation)||'DIRECTOR');set(`DIRECTOR_${n}_PREVIOUS_NAMES_OPT`,up(p.previous_names));set(`DIRECTOR_${n}_OTHER_DIRECTORSHIPS_OPT`,p.other_directorships)});
 // the "Present" list of a members' resolution: the chairman and the secretary have their own lines, so the others follow (a member who is neither must not be lost)
 {const same=(x,y)=>String(x||'').trim().toUpperCase()===String(y||'').trim().toUpperCase(),mk=Object.keys(v).map(k=>k.match(/^MEMBER_(\d+)_NAME$/)).filter(Boolean).sort((x,y)=>x[1]-y[1]).map(m=>v[m[0]]);
  if(mk.length){const others=mk.filter(nm=>!same(nm,v.CHAIRMAN_NAME)&&!same(nm,v.SECRETARY_NAME));for(let k=1;k<=Math.max(5,others.length);k++)v['OTHER_MEMBER_'+k+'_NAME']=others[k-1]||''}}
 if(v.REGISTERED_OFFICE&&!/\.$/.test(v.REGISTERED_OFFICE))v.REGISTERED_OFFICE+='.';
 for(const k of Object.keys(v))if(CAPS.test(k))v[k]=v[k].toUpperCase();
 // names written in the body of a resolution read in one style: registry names arrive in capitals, so "SALMA JUMA MREMA" becomes "Salma Juma Mrema" like the others
 const BODY_NAME=/^((ATTENDEE|ALLOTTEE|RESIGNING)_\d+_NAME|MEMBER_NAME|FORMER_MEMBER_NAME|ADDRESSEE_NAME|[A-Z_]*DIRECTORS_NAMES)$/;
 for(const k of Object.keys(v))if(BODY_NAME.test(k)&&v[k]===v[k].toUpperCase())v[k]=titleName(v[k]);
 // BRELA's own samples write names in Title Case in resolutions and notices, and in capitals on the forms
 if(opt.kind==='resolution'){const RES_NAME=/^(CHAIRMAN_NAME|SECRETARY_NAME|SIGNING_DIRECTOR_NAME|SIGNATORY_NAME|(NEW_DIRECTOR|OTHER_MEMBER|DIRECTOR|MEMBER|ATTENDEE|ALLOTTEE|RESIGNING)_\d+_NAME)$/;
  for(const k of Object.keys(v))if(RES_NAME.test(k)&&v[k]&&v[k]===v[k].toUpperCase())v[k]=titleName(v[k])}
 return v}

// Which saved person is missing which detail (so the message can say "Add Juma's nationality on the Company tab" instead of a bare label).
function personNeeds(missing,ctx){
 const L=ctx.lists||{},dirs=L.directors||[],secs=L.secretaries||[],mem=L.shareholders&&L.shareholders.length?L.shareholders:dirs,people=L.people||[];
 const FIELD={NATIONALITY:'nationality',ADDRESS:'address',DOB:'date of birth',OCCUPATION:'occupation',NAME:'name'},by=new Map(),rest=[];
 const want=String((ctx.values&&(ctx.values.person_name||ctx.values.subject_name))||'').trim().toUpperCase(),subj=(want&&people.find(p=>String(p.full_name||'').trim().toUpperCase()===want))||dirs[0]||secs[0];
 const add=(p,f)=>{const n=String(p.full_name||'').trim();if(!n)return false;if(!by.has(n))by.set(n,{id:p.id||null,name:n,fields:[]});const o=by.get(n);if(!o.fields.includes(f))o.fields.push(f);return true};
 for(const raw of missing){let m,done=false;const k=String(raw).replace(/^\?/,'').replace(/, IF ANY$/,'_OPT').replace(/ /g,'_');
  if((m=k.match(/^DIRECTOR_(\d+)_(NATIONALITY|ADDRESS|DOB|OCCUPATION)$/))&&dirs[m[1]-1])done=add(dirs[m[1]-1],FIELD[m[2]]);
  else if((m=k.match(/^MEMBER_(\d+)_(NAME)$/))&&mem[m[1]-1])done=false;
  else if(k==='SECRETARY_ADDRESS'&&secs[0])done=add(secs[0],'address');
  else if((m=k.match(/^(NATIONALITY|DOB|OCCUPATION)$/))&&subj)done=add(subj,FIELD[m[1]]);
  else if(k==='ADDRESS_LINE_1'&&subj)done=add(subj,'address');
  if(!done)rest.push(raw)}
 return{people:[...by.values()],rest}}

// Convert an extracted .docx text back into a template body: [LABEL] -> {{key}}, using the label->key map of the package.
function docxTextToBody(text,l2k){
 return String(text||'').replace(/\[([A-Z][A-Z0-9 ]*(?:, IF ANY)?)\]/g,(m,l)=>{const k=l2k[l.trim()];return k?`{{${k.toLowerCase()}}}`:m}).replace(/\n{3,}/g,'\n\n').trim()}

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

module.exports={fields,render,gaps,applyGaps,reverse,buildContext,withhold,suggestScore,textToDocx,extractText,personScope,SENSITIVE_KEY,ROLE_LISTS,natName,mergePeople,personNeeds,labelFromKey,docxFill,docxScan,labelKey,docxToPdf,docxTargets,packageValues,docxTextToBody};
