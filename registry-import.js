// Reads the text of a BRELA registry "Company Details" page (copied and pasted) into the app's company fields and people.
// Pure function, no database and no AI: the same page always gives the same result, and nothing leaves the server.
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const NONE=v=>{const t=String(v??'').replace(/\s+/g,' ').trim();return /^(no data|n\/a|na|none|null|--+|-|\.+)$/i.test(t)?'':t};
const title=s=>/[a-z]/.test(s)&&s===s.toLowerCase()?s.replace(/\b([a-z])/g,c=>c.toUpperCase()):s;
const num=s=>{const n=Number(String(s||'').replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:0};
const commas=n=>Math.round(n).toLocaleString('en-US');
const dateOf=s=>{ // "1/22/2015 12:00:00 AM" (M/D/Y), "2015-01-22", "22/01/2015" -> {iso, text}
 const t=String(s||'').trim();let y,m,d,x;
 if(x=t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)){y=+x[1];m=+x[2];d=+x[3]}
 else if(x=t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)){const a=+x[1],b=+x[2];y=+x[3];if(a>12){d=a;m=b}else{m=a;d=b}}
 else return null;
 if(m<1||m>12||d<1||d>31)return null;
 return{iso:`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`,text:`${d} ${MONTHS[m-1]} ${y}`}};

const ADDR_KEYS=['Country','Region','District','Ward','Subward','Street','Road','Block Number','Plot Number','House Number','Phone','Email','P\\.o\\.Box','Post Code','Unsurveyed Area','Area','Land Mark'];
const ADDR_RE=new RegExp(`(?:^|[ \\t])(${ADDR_KEYS.join('|')}):`,'gi');
const PARTS=[['country','country'],['region','region'],['district','district'],['ward','ward'],['subward','subward'],['street','street'],['road','road'],['house','housenumber'],['plot','plotnumber'],['block','blocknumber'],['pobox','pobox'],['postcode','postcode'],['unsurveyed','unsurveyedarea'],['landmark','landmark']];
// one address line from structured parts (house, plot, block, street, road, unsurveyed area, subward, ward, district, region, country)
function composeAddress(p){
 const g=k=>String((p&&p[k])||'').trim();
 return[g('house')&&`House ${g('house')}`,g('plot')&&`Plot ${g('plot')}`,g('block')&&`Block ${g('block')}`,title(g('street')),title(g('road')),title(g('unsurveyed')),title(g('landmark')),title(g('subward')),title(g('ward')),title(g('district')),title(g('region')),title(g('country'))].filter(Boolean).join(', ')}
function parseAddress(line){
 const a={},str=String(line||''),ms=[...str.matchAll(ADDR_RE)];ms.forEach((m,i)=>{const from=m.index+m[0].length,to=i+1<ms.length?ms[i+1].index:str.length;a[m[1].toLowerCase().replace(/[^a-z]/g,'')]=NONE(str.slice(from,to))});
 if(/^tz$/i.test(a.pobox||''))a.pobox='';
 const g=k=>a[k]||'',parts={};for(const [k,src] of PARTS)if(g(src)||(src==='landmark'&&g('area')))parts[k]=g(src)||g('area');
 return{...a,parts,text:composeAddress(parts),box:g('pobox')?`P.O. Box ${g('pobox')}`:'',code:g('postcode')}}

const lines=t=>String(t||'').replace(/\r/g,'').replace(/ /g,' ').split('\n').map(l=>l.replace(/[ \t]+$/,''));
const HEAD=[['company',/^COMPANY INFORMATION\b/i],['regaddr',/^Registered Address\b/i],['activities',/^BUSINESS ACTIVITIES\b/i],['directors',/^DIRECTORS\b/i],['secretary',/^COMPANY SECRETAR(?:Y|IES)\b/i],['capital',/^(?:AUTHORI[SZ]ED|ISSUED)?\s*SHARE CAPITAL\b/i],['shareholders',/^SHAREHOLDERS\b/i],['other',/^(?:BENEFICIAL OWNERS?|CHARGES|MORTGAGES|PREVIOUS NAMES|SHARE ALLOTMENTS?|ANNUAL RETURNS?|DOCUMENTS|FILINGS|AUDITORS?)\b/i]];
function sections(text){
 const L=lines(text),idx=[];
 L.forEach((l,i)=>{const t=l.trim();for(const [k,re] of HEAD)if(re.test(t)){if(k==='capital'&&!/^(?:AUTHORI|ISSUED|SHARE CAPITAL$)/i.test(t))continue;idx.push([k,i]);break}});
 const out={};idx.forEach(([k,i],n)=>{const end=n+1<idx.length?idx[n+1][1]:L.length;out[k]=(out[k]||[]).concat(L.slice(i+1,end))});
 return out}

const COMPANY_LABELS=['Tracking Number','Incorporation Number','Incorporation No','Registration Number','Company Number','Company Name','Company Type','Date Of Incorporation','Originated From','Accounting Date','Accounting Month'];
function pairs(blockLines,labels){
 const flat=blockLines.map(l=>l.trim()).filter(Boolean).join('  ').replace(/\t+/g,'  '),o={};
 const alt=labels.join('|');
 for(const l of labels){const m=flat.match(new RegExp(`(?:^|\\s)${l}:\\s*(.*?)(?=\\s{2,}|\\s(?:${alt}):|$)`,'i'));if(m)o[l]=NONE(m[1])}
 return o}

// value that follows a "Label:" line (empty when the next line is another label or a heading)
function after(L,label,from=0){
 for(let i=from;i<L.length;i++){
  const t=L[i].trim();
  if(t.toLowerCase()===label.toLowerCase()+':'||new RegExp(`^${label}:\\s*\\S`,'i').test(t)){
   const inl=t.slice(label.length+1).trim();if(inl)return NONE(inl);
   const nx=(L[i+1]||'').trim();if(!nx||/:$/.test(nx)||/^(Contact Information|Personal Information|Identification|Address|Class Name)\b/i.test(nx))return '';
   return NONE(nx)}}
 return ''}

function person(L){
 const SKIP=/^(Director #\d*|Shareholder #\d*|Individual( Secretary| Director)?|Corporate( Secretary| Director)?|Direct Ownership|Indirect Ownership|Personal Information|Identification:?|Contact Information|Gender:?|Male|Female)$/i;
 let name='';
 const pi=L.findIndex(l=>/^Personal Information$/i.test(l.trim()));
 const upto=pi>0?pi:L.length;
 for(let i=0;i<upto;i++){const t=L[i].trim();if(t&&!SKIP.test(t)&&!/:\s*$/.test(t)&&!/^(Class Name|Total)/i.test(t)){name=t;break}}
 const full=after(L,'Full Name');if(full)name=full;
 const corporate=L.some(l=>/^\s*(Corporate|Body Corporate|Company)\b/i.test(l))&&pi<0;
 let idType='',idNo='';
 for(const l of L){const m=l.trim().match(/^(NIN|Passport(?: Number| No\.?)?|Driving Licen[sc]e(?: Number)?|Voter(?:'s)? ID|Registration Number|Incorporation Number):\s*(.+)$/i);if(m&&!idNo){idNo=NONE(m[2]);const k=m[1].toLowerCase();idType=k==='nin'?'NIDA':/passport/.test(k)?'Passport':/driving/.test(k)?'Driving licence':/voter/.test(k)?'Voter ID':'Registration number'}}
 const nat=after(L,'Nationality');
 const ai=L.findIndex(l=>/^Address:?$/i.test(l.trim())),addr=parseAddress(ai>=0?L.slice(ai+1).find(l=>/Country:/i.test(l))||'':(L.find(l=>/Country:/i.test(l))||''));
 let shares='',cls='',cval='';
 const ci=L.findIndex(l=>/^Class Name\b/i.test(l.trim()));
 if(ci>=0)for(let j=ci+1;j<L.length;j++){const m=L[j].trim().match(/^(.+?)[\t ]+(\d[\d,]*)[\t ]+([\d.,]+)$/);if(m){cls=m[1].trim();shares=String(num(m[2]));cval=String(num(m[3]));break}}
 return{full_name:name,nationality:/^(tz|tza|tanzania|tanzanian)$/i.test(nat)?'Tanzanian':nat,id_type:idType,id_number:idNo,dob:(dateOf(after(L,'Date of Birth'))||{}).text||after(L,'Date of Birth'),
  address:addr.text,phone:after(L,'Mobile Phone')||addr.phone||'',email:after(L,'Email')||addr.email||'',shares,share_class:cls,share_value:cval,ownership:((L.find(l=>/^(Direct|Indirect) Ownership$/i.test(l.trim()))||'').match(/^\s*(Direct|Indirect)/i)||[,''])[1],addr:addr.parts,gender:after(L,'Gender')||(L.find(l=>/^(Male|Female)$/i.test(l.trim()))||'').trim(),corporate}}

function blocks(L,re){const out=[];let cur=null;for(const l of L){if(re.test(l.trim())){cur=[];out.push(cur)}else if(cur)cur.push(l)}return out}

function parseRegistry(raw){
 const text=String(raw||''),S=sections(text),warnings=[],values={},people=[];
 if(!S.company&&!S.directors&&!S.shareholders)return{ok:false,error:'This does not look like a BRELA Company Details page. Open the company in the BRELA registry, go to Company Details, select the whole page (Ctrl+A), copy (Ctrl+C) and paste it here.'};
 // ---- company information
 const c=pairs(S.company||[],COMPANY_LABELS);
 const set=(k,v)=>{v=NONE(v);if(v)values[k]=v};
 set('company_name',c['Company Name']);
 const nm=values.company_name||'',sp=nm.match(/^(.*?)\s+((?:COMPANY\s+)?(?:LIMITED|LTD\.?|PLC))$/i);
 if(nm){values.company_name_line_1=sp?sp[1]:nm;if(sp)values.company_name_line_2=sp[2]}
 // the incorporation number matters most, so it is looked for under every label BRELA uses and, failing that, anywhere in the pasted page
 const regNo=c['Incorporation Number']||c['Incorporation No']||c['Registration Number']||c['Company Number']||((text.match(/(?:Incorporation|Registration|Company)\s*(?:Number|No\.?)\s*[:\-]?\s*([A-Z0-9][A-Z0-9\/.\-]{3,})/i)||[])[1]);
 set('incorporation_no',regNo);if(!values.incorporation_no)warnings.push('The incorporation number was not found in the pasted page. Type it in under Edit company details.');set('company_type',c['Company Type']);
 const di=dateOf(c['Date Of Incorporation']);if(di){values.date_of_incorporation=di.text;values.date_of_incorporation_iso=di.iso}else if(c['Date Of Incorporation'])warnings.push('The incorporation date could not be read.');
 const ad=num(c['Accounting Date']),am=num(c['Accounting Month']);if(ad&&am>=1&&am<=12)values.financial_year_end=`${ad} ${MONTHS[am-1]}`;
 const tracking=NONE(c['Tracking Number']);
 // ---- registered address
 const ra=parseAddress((S.regaddr||[]).find(l=>/Country:/i.test(l))||'');
 if(ra.text){set('registered_office',ra.text);
  set('company_address_line_1',[ra.plotnumber&&`Plot ${ra.plotnumber}`,ra.blocknumber&&`Block ${ra.blocknumber}`,title(ra.street||''),ra.unsurveyedarea,ra.ward].filter(Boolean).join(', '));
  set('company_address_line_2',[ra.box,ra.region,ra.country].filter(Boolean).join(', '))}
 set('postal_address',[ra.box,ra.region].filter(Boolean).join(', '));set('postal_code',ra.code);set('company_phone',ra.phone);set('company_email',ra.email);
 set('registered_region',ra.region);set('registered_district',ra.district);set('registered_ward',ra.ward);set('registered_street',title(ra.street||''));set('registered_plot',ra.plotnumber);set('registered_block',ra.blocknumber);set('registered_country',ra.country);set('registered_subward',title(ra.subward||''));set('registered_road',title(ra.road||''));set('registered_house',ra.housenumber);set('registered_unsurveyed_area',ra.unsurveyedarea);set('registered_po_box',ra.pobox);
 // ---- business activities
 const acts=[];for(const l of S.activities||[]){const m=l.trim().match(/^(.*?)[\t ]+(\d{4})[\t ]+(Yes|No)$/i);if(m)acts.push({name:m[1].trim(),code:m[2],main:/^yes$/i.test(m[3])})}
 if(acts.length){const main=acts.find(a=>a.main)||acts[0];
  values.business_activity=main.name;values.principal_activities=main.name;values.main_activity_code=main.code;
  if(!acts.some(x=>x.main))warnings.push('No activity is marked as Main in the registry, so the first one listed is used as the main activity.')}
 else if(S.activities)warnings.push('No business activities could be read.');
 // ---- share capital
 const cap=S.capital||[];let issued=0,authorised=0,cur='',val=0;const classes=[];
 for(const l of cap){const m=l.trim().match(/^(.+?)[\t ]+(\d[\d,]*)[\t ]+([\d.,]+)[\t ]+(\d[\d,]*)[\t ]+([A-Za-z]{3})$/);if(m){classes.push({name:m[1].trim(),count:num(m[2]),value:num(m[3]),taken:num(m[4])});cur=m[5].toUpperCase();authorised+=num(m[2]);issued+=num(m[4]);val=val||num(m[3])}}
 const capLine=cap.map(l=>l.trim()).find(l=>/^Share Capital:/i.test(l))||'';
 const totalM=capLine.match(/Total Number of Shares:\s*([\d,]+)/i),capM=capLine.match(/Share Capital:\s*(?:[A-Za-z.]+\s*)?([\d,]+(?:\.\d+)?)/i);
 if(classes.length){
  const cc=cur==='TZS'||!cur?'TZS':cur;
  values.share_currency=cc;values.share_class=classes.map(k=>k.name).join(', ');
  values.number_of_shares=String(totalM?num(totalM[1]):authorised);values.shares_issued_total=String(issued);
  if(classes.length===1)values.shares_issued=String(issued);
  values.share_value=`${cc} ${commas(val)}`;values.nominal_value_per_share=values.share_value;
  const total=capM?num(capM[1]):authorised*val;if(total)values.share_capital=`${cc} ${commas(total)}`}
 else if(S.capital)warnings.push('The share capital table could not be read.');
 // ---- people (directors, secretary, shareholders); one person with several roles becomes one record
 const add=(p,role,order)=>{
  if(!p.full_name)return;
  const key=p.id_number?'id:'+p.id_number:'n:'+p.full_name.toUpperCase();
  let e=people.find(x=>x._key===key||(!p.id_number&&x.full_name.toUpperCase()===p.full_name.toUpperCase()));
  if(!e){e={_key:key,roles:[],order,full_name:p.full_name,nationality:'',id_type:'',id_number:'',dob:'',address:'',phone:'',email:'',shares:'',gender:'',share_class:'',share_value:'',ownership:'',addr:{},corporate:p.corporate};people.push(e)}
  if(!e.roles.includes(role))e.roles.push(role);
  if(!Object.keys(e.addr).length&&p.addr)e.addr=p.addr;
  for(const f of ['nationality','id_type','id_number','dob','address','phone','email','gender'])if(!e[f]&&p[f])e[f]=p[f];
  else if(e[f]&&p[f]&&e[f]!==p[f]&&(f==='email'||f==='phone'))warnings.push(`${e.full_name} has two different ${f==='email'?'email addresses':'phone numbers'} in the registry (${e[f]} and ${p[f]}). The first was kept.`);
  if(role==='shareholder'){if(p.shares)e.shares=p.shares;for(const f of ['share_class','share_value','ownership'])if(p[f])e[f]=p[f]}};
 const dirB=blocks(S.directors||[],/^Director\s*#/i);dirB.forEach(b=>add(person(b),'director',1));
 const dt=(S.directors||[]).join('\n').match(/Total:\s*(\d+)/i)||[];
 const head=(text.match(/^DIRECTORS\b.*$/im)||[''])[0].match(/Total:\s*(\d+)/i);
 if(head&&+head[1]!==dirB.length)warnings.push(`The registry says ${head[1]} directors but ${dirB.length} could be read.`);
 if(S.secretary&&S.secretary.some(l=>l.trim()))add(person(S.secretary),'secretary',2);
 const shB=blocks(S.shareholders||[],/^Shareholder\s*#/i);shB.forEach(b=>add(person(b),'shareholder',3));
 const sh=(text.match(/^SHAREHOLDERS\b.*$/im)||[''])[0].match(/Total:\s*(\d+)/i);
 if(sh&&+sh[1]!==shB.length)warnings.push(`The registry says ${sh[1]} shareholders but ${shB.length} could be read.`);
 const held=people.reduce((s,p)=>s+num(p.shares),0);
 if(issued&&held&&held!==issued)warnings.push(`Shareholders hold ${commas(held)} shares but the registry shows ${commas(issued)} taken.`);
 for(const p of people){if(p.roles.some(r=>r==='director'||r==='secretary')&&!p.nationality)warnings.push(`Nationality is missing for ${p.full_name} in the registry. Add it by hand (forms need it).`);if(p.corporate)warnings.push(`${p.full_name} looks like a company, not a person. Check the details.`)}
 people.sort((a,b)=>a.order-b.order);
 people.forEach(p=>{delete p._key;delete p.corporate});
 if(!Object.keys(values).length&&!people.length)return{ok:false,error:'Nothing could be read from that text. Paste the whole BRELA Company Details page.'};
 return{ok:true,values,people,activities:acts,tracking,warnings:[...new Set(warnings)],counts:{activities:acts.length,directors:dirB.length,shareholders:shB.length}}}

module.exports={parseRegistry,parseAddress,composeAddress,dateOf};
