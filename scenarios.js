// Case scenarios: "what is happening in this case" -> a few plain questions -> every value the official templates need.
// Pure functions (no database). A scenario lists its fields (for the form), the documents it produces (jobs) and
// derive(): all the wording, dates and amounts worked out from the answers + the company's saved details.
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const ISO=/^(\d{4})-(\d{2})-(\d{2})$/;
const isoOk=s=>ISO.test(String(s||''));
const fmtD=s=>{const m=String(s||'').match(ISO);return m?`${+m[3]} ${MONTHS[+m[2]-1]} ${m[1]}`:''};
const ordinal=n=>n+((n%100>=11&&n%100<=13)?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'));
const ordD=s=>{const m=String(s||'').match(ISO);return m?`${ordinal(+m[3])} ${MONTHS[+m[2]-1]} ${m[1]}`:''};
const addDays=(s,n)=>{const m=String(s||'').match(ISO);if(!m)return '';const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]+n));return d.toISOString().slice(0,10)};
const diffDays=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const num=x=>{const n=Number(String(x??'').replace(/[^0-9.]/g,''));return Number.isFinite(n)?n:0};
const comma=n=>Math.round(n).toLocaleString('en-US');
const ONES=['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'],TENS=['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const below1000=n=>{const h=Math.floor(n/100),r=n%100,out=[];if(h)out.push(ONES[h]+' hundred');if(r){const t=r<20?ONES[r]:TENS[Math.floor(r/10)]+(r%10?'-'+ONES[r%10]:'');out.push((h?'and ':'')+t)}return out.join(' ')};
function words(n){n=Math.round(num(n));if(n===0)return 'zero';const sc=[[1e9,'billion'],[1e6,'million'],[1e3,'thousand'],[1,'']],parts=[];
 for(const [v,name] of sc){const c=Math.floor(n/v);if(c){parts.push({t:below1000(c)+(name?' '+name:''),scale:!!name,hund:c>=100});n-=c*v}}
 if(parts.length<2)return parts[0].t;const last=parts[parts.length-1],glue=last.scale||!last.hund?' and ':', ';
 return parts.slice(0,-1).map(x=>x.t).join(', ')+glue+last.t}
const joinAnd=l=>l.length<2?(l[0]||''):l.slice(0,-1).join(', ')+' and '+l[l.length-1];
const tc=s=>String(s||'').toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu,(m,a,b)=>a+b.toUpperCase());
const up=s=>String(s||'').toUpperCase();
const list=a=>String(a||'').split('|').map(x=>x.trim()).filter(Boolean);
const same=(a,b)=>String(a||'').trim().toUpperCase()===String(b||'').trim().toUpperCase();
const hold=p=>num(p&&p.shares);
const his=p=>/^f/i.test(p&&p.gender||'')?'her':/^m/i.test(p&&p.gender||'')?'his':'his or her';
const heShe=p=>/^f/i.test(p&&p.gender||'')?'She':/^m/i.test(p&&p.gender||'')?'He':'He or she';
function addrParts(p){ // [street/area, ward+district, region+country] for forms; and a "line 1 / country" split for letters
 const a0=p&&p.addr&&typeof p.addr==='object'?p.addr:{},lw=x=>typeof x==='string'&&/[a-z]/.test(x)&&x===x.toLowerCase()?x.replace(/(^|[\s\-'])([a-z])/g,(m,y,z)=>y+z.toUpperCase()):x,a=Object.fromEntries(Object.entries(a0).map(([k,v])=>[k,lw(v)])),j=(...x)=>x.filter(Boolean).join(', ');
 if(!Object.keys(a).length){const t=String((p&&p.address)||'').split(',').map(x=>x.trim()).filter(Boolean);return{country:t.length>1?t[t.length-1]:'',rest:t.length>1?t.slice(0,-1).join(', '):t[0]||''}}
 const street=j(a.house&&`House ${a.house}`,a.plot&&`Plot ${a.plot}`,a.block&&`Block ${a.block}`,a.street,a.road,a.unsurveyed,a.landmark);
 return{country:a.country||'',rest:j(street,a.subward,a.ward,a.district,a.region)}}

// ---- the company's Articles of Association references (asked once, saved on the company)
const ARTICLE_KEYS=[
 ['board_notice_provision','Notice of directors\' meetings','Regulation 88 of Table ‘A’ in the Schedule to the Companies Act, Cap. 212, R.E. 2023 (“the Act”), as applied to the Company by Article 1 of the Company’s Articles of Association'],
 ['board_quorum_word','Directors\' quorum (in words)','two'],
 ['board_quorum_provision','Article fixing the directors\' quorum','Article 7 of the Company’s Articles of Association'],
 ['gm_notice_provision','Shorter notice of a general meeting','Article 4(a) of the Company’s Articles of Association, which varies Regulation 40 of Table ‘A’ as applied by Article 1'],
 ['gm_quorum_word','Members\' quorum (in words)','two'],
 ['gm_quorum_provision','Article fixing the members\' quorum','Article 4(b) of the Company’s Articles of Association'],
 ['directors_number_provision','Number of directors','Article 5 of the Company’s Articles of Association (under which the number of directors shall be not less than one and not more than ten)'],
 ['table_a_provision','Article adopting Table A','Article 1 of the Company’s Articles of Association']];
const ART_FIELDS=keys=>ARTICLE_KEYS.filter(a=>keys.includes(a[0])).map(([key,label,def])=>({key:'art_'+key,label,type:'text',article:true,def,group:'The company\'s Articles of Association'}));

const F=(key,label,type,o={})=>({key,label,type,...o});
const YES=[['yes','Yes']];
const BUILTIN=[
{id:'directors',title:'Change of directors',icon:'bx-user-plus',match:/director/i,desc:'Appoint new directors, accept resignations, or both. Makes the members\' resolution, the directors\' resolution, and a Form 213a / 213b for each person.',
 fields:[
  F('appoint','Directors being appointed','people',{from:'any',max:2,help:'Pick from the people already saved, or add a new person (their details are used on Form 213a). The resolution has room for two.',group:'Who'}),
  F('resign','Directors resigning','people',{from:'directors',max:2,group:'Who'}),
  F('chairman','Chairman of the meetings','person',{from:'directors',ph:'First director who stays, if left empty',group:'Who'}),
  F('consent_effect','The appointment takes effect','choice',{opts:[['receipt','When the new director\'s signed consent is received'],['resolution','From the date of the resolution, no condition']],group:'Wording'}),
  F('resign_effect','The resignations take effect','choice',{opts:[['meeting','At the conclusion of the meeting'],['none','No time stated']],group:'Wording'}),
  F('members_meeting_date','Members\' meeting: date','date',{req:true,group:'Meetings'}),F('members_meeting_time','Time','time',{ph:'10:00',group:'Meetings'}),
  F('resignation_meeting_date','Directors\' meeting accepting the resignations: date','date',{ph:'Same day as the members\' meeting',group:'Meetings'}),F('resignation_meeting_time','Time','time',{ph:'11:00',group:'Meetings'}),
  ...ART_FIELDS(['board_notice_provision','board_quorum_word','board_quorum_provision','gm_notice_provision','gm_quorum_word','gm_quorum_provision','directors_number_provision','table_a_provision'])],
 jobs:(a,c)=>{const o=[],ap=list(a.appoint),rs=list(a.resign);
  if(ap.length)o.push({tid:'T01',name:'Members\' resolution - appointment of directors'});
  if(rs.length)o.push({tid:'T02',name:'Directors\' resolution - resignation of directors'});
  ap.forEach(n=>o.push({tid:'F01',name:'Form 213a - appointment',who:n,over:{person_name:n,role_upper:'DIRECTOR',role_lower:'director'}}));
  rs.forEach(n=>o.push({tid:'F02',name:'Form 213b - termination',who:n,over:{person_name:n,role_upper:'DIRECTOR',role_lower:'director'}}));return o},
 derive(a,c){
  const V={},B=[],people=c.people,dirs=c.directors,ap=list(a.appoint),rs=list(a.resign),pp=n=>people.find(p=>same(p.full_name,n))||{full_name:n};
  const existing=dirs.map(p=>p.full_name).filter(n=>!ap.some(x=>same(x,n))),remaining=[...existing.filter(n=>!rs.some(x=>same(x,n))),...ap];
  const chair=a.chairman&&!rs.some(x=>same(x,a.chairman))?a.chairman:(remaining[0]||existing[0]||'');
  V.chairman_name=chair;V.signing_director_name=chair;V.signing_director_role='Director';
  V.clause_consent_effect=a.consent_effect==='resolution'?'no':'yes';V.clause_resign_effect=a.resign_effect==='none'?'no':'yes';
  const md=a.members_meeting_date,rd=a.resignation_meeting_date||md;
  V.new_directors_names=joinAnd(ap.map(tc));V.resigning_directors_names=joinAnd(rs.map(tc));V.existing_directors_names=joinAnd(existing.map(tc));V.remaining_directors_names=joinAnd(remaining.map(tc));
  V.additional_or_replacement=ap.length===1&&rs.length===1?'a replacement director':'additional directors';
  V.was_or_were=ap.length>1?'were':'was';V.new_directors_noun=ap.length>1?'directors':'a director';V.new_directors_consents=ap.length>1?'their signed written consents':`${his(pp(ap[0]))} signed written consent`;
  V.have_or_has=rs.length>1?'have':'has';V.resigning_noun=rs.length>1?'directors':'a director';
  if(!rs.length)B.push('RESIGNING_DIRECTORS_NAMES'); // nobody resigns: the paragraph about the resignation notice is left out, not left yellow
  ap.slice(0,2).forEach((n,i)=>{V[`new_director_${i+1}_name`]=n;V[`new_director_${i+1}_possessive`]=his(pp(n))});for(let i=ap.length;i<2;i++){V[`new_director_${i+1}_name`]='';B.push(`NEW_DIRECTOR_${i+1}_NAME`)}
  rs.slice(0,2).forEach((n,i)=>{const p=pp(n),roles=[];if((p.roles||[]).includes('secretary'))roles.push('the Company Secretary');if(hold(p))roles.push(`a member of the Company${(p.share_class||hold(p))?` holding ${comma(hold(p))} ${(p.share_class||'ordinary').toLowerCase()} shares`:''}`);
   V[`resigning_${i+1}_name`]=n;V[`resigning_${i+1}_note_opt`]=roles.length?`${heShe(p)} remains ${joinAnd(roles)}.`:''});for(let i=rs.length;i<2;i++){V[`resigning_${i+1}_name`]='';V[`resigning_${i+1}_note_opt`]='';B.push(`RESIGNING_${i+1}_NAME`)}
  // members at the members' meeting: chairman first, secretary second, then the others
  const sec=(c.secretaries[0]||{}).full_name,mem=c.shareholders.slice().sort((x,y)=>(same(y.full_name,chair)-same(x.full_name,chair))||(same(y.full_name,sec)-same(x.full_name,sec)));
  for(let i=0;i<7;i++){const p=mem[i];V[`member_${i+1}_name`]=p?p.full_name:'';V[`member_${i+1}_shares`]=p&&hold(p)?comma(hold(p)):'';if(!p){B.push(`MEMBER_${i+1}_NAME`,`MEMBER_${i+1}_SHARES`)}}
  // directors at the directors' meeting: the chairman first
  const att=[chair,...[...existing,...ap].filter(n=>!same(n,chair))].filter(Boolean);
  for(let i=0;i<Math.max(5,att.length);i++){const n=att[i];V[`attendee_${i+1}_name`]=n||'';V[`attendee_${i+1}_role_opt`]=n?(same(n,chair)?'Chairman of the Board of Directors':'Director'):'';if(!n)B.push(`ATTENDEE_${i+1}_NAME`)}
  V.absent_names='None.';V.absent_members_with_shares='None.';
  V.members_meeting_date=fmtD(md);V.members_meeting_time=a.members_meeting_time||'10:00';V.resignation_meeting_date=fmtD(rd);V.resignation_meeting_time=a.resignation_meeting_time||'11:00';
  V.appointment_filing_deadline=fmtD(addDays(md,14));V.resignation_filing_deadline=fmtD(addDays(rd,14));
  V.appointment_date=up(fmtD(md));V.termination_date=up(fmtD(rd));V.consent_date=ordD(md);V.signing_date=ordD(rd&&ap.length&&!rs.length?md:(rd||md));
  return{V,B}},
 warn(a,c){const w=[],ap=list(a.appoint),rs=list(a.resign);
  if(!ap.length&&!rs.length)w.push('Choose who is being appointed or who is resigning.');
  const left=c.directors.filter(p=>!rs.some(x=>same(x,p.full_name))&&!ap.some(x=>same(x,p.full_name))).length+ap.length;
  if(rs.length&&left<2)w.push(`After these changes the company would have ${left} director${left===1?'':'s'}. A private company needs at least 2 (s.189 of the Companies Act), so appoint before anyone resigns.`);
  if(a.resignation_meeting_date&&a.members_meeting_date&&a.resignation_meeting_date<a.members_meeting_date)w.push('The directors\' meeting accepting the resignations must be on or after the members\' meeting that appoints the new directors.');
  return w},
 people(a,c){return[...list(a.appoint).map(n=>({name:n,need:['dob','nationality','address'],why:'Form 213a'})),...list(a.resign).map(n=>({name:n,need:['dob'],why:'Form 213b'}))]}},

{id:'secretary',title:'Change of company secretary',icon:'bx-id-card',match:/secretar/i,desc:'Appoint a new secretary and/or end the current one: Form 213a and Form 213b.',
 fields:[F('new_secretary','New secretary','person',{from:'any',help:'Pick a saved person or add a new one.',group:'Who'}),F('end_current','End the current secretary\'s appointment','bool',{group:'Who'}),
  F('signing_director','Director who signs the forms','person',{from:'directors',ph:'First director, if left empty',group:'Who'}),F('effective_date','Effective date','date',{req:true,group:'When'})],
 jobs:(a,c)=>{const o=[];if(a.new_secretary)o.push({tid:'F01',name:'Form 213a - appointment of secretary',who:a.new_secretary,over:{person_name:a.new_secretary,role_upper:'SECRETARY',role_lower:'secretary'}});
  const cur=(c.secretaries[0]||{}).full_name;if(a.end_current==='yes'&&cur)o.push({tid:'F02',name:'Form 213b - termination of secretary',who:cur,over:{person_name:cur,role_upper:'SECRETARY',role_lower:'secretary'}});return o},
 derive(a,c){const V={},d=a.effective_date,sd=a.signing_director||(c.directors[0]||{}).full_name||'';V.signing_director_name=sd;V.signing_director_role='Director';
  V.appointment_date=up(fmtD(d));V.termination_date=up(fmtD(d));V.consent_date=ordD(d);V.signing_date=ordD(d);return{V,B:[]}},
 warn(a,c){const w=[];if(!a.new_secretary&&a.end_current!=='yes')w.push('Choose a new secretary, or tick that the current secretary\'s appointment ends.');if(a.end_current==='yes'&&!c.secretaries.length)w.push('The company has no saved secretary to end.');return w},
 people(a){return a.new_secretary?[{name:a.new_secretary,need:['dob','nationality','address'],why:'Form 213a'}]:[]}},

{id:'shares',title:'Call on shares, forfeiture and re-allotment',icon:'bx-pie-chart-alt-2',match:/share|capital/i,desc:'The full unpaid-shares process. Tick the steps you need now; later steps reuse the earlier answers. Makes the resolutions, notices and Forms 57a / 57b.',
 fields:[
  F('member','Member who owes the call','person',{from:'shareholders',req:true,group:'The call'}),F('shares_number','Number of shares','number',{ph:'All the member\'s shares',group:'The call'}),
  F('call_per_share','Call per share','money',{req:true,help:'At most one quarter of the nominal value (Table A reg. 14).',group:'The call'}),
  F('call_date','Date of the directors\' resolution (also the notice date)','date',{req:true,group:'The call'}),F('call_time','Time','time',{ph:'10:00',group:'The call'}),
  F('due_date','Payment due date','date',{ph:'30 days after the call',help:'At least 14 clear days after the notice.',group:'The call'}),
  F('chairman','Chairman of the meetings','person',{from:'directors',ph:'First director, if left empty',group:'The call'}),
  F('do_call','Make the call: resolution and notice of call','bool',{group:'Steps you need now'}),
  F('do_reg29','Reg. 29 notice requiring payment (warns of forfeiture)','bool',{group:'Steps you need now'}),
  F('do_forfeit','Forfeit the shares','bool',{group:'Steps you need now'}),
  F('do_realloc','Re-allot the forfeited shares','bool',{group:'Steps you need now'}),
  F('pay_bank','The call may be paid','choice',{opts:[['bank','At the registered office or into the company bank account'],['office','At the registered office only']],show:{any:['do_call']},group:'The call'}),
  F('reg29_notice_date','Reg. 29 notice date','date',{ph:'Day after the due date',show:{any:['do_reg29','do_forfeit','do_realloc']},group:'Reg. 29 notice'}),
  F('reg29_used','A Reg. 29 notice was or will be served','bool',{show:{any:['do_forfeit','do_realloc']},group:'Reg. 29 notice'}),
  F('forfeit_date','Forfeiture resolution: date','date',{ph:'Day after the last payment deadline',show:{any:['do_forfeit','do_realloc']},group:'Forfeiture'}),F('forfeit_time','Time','time',{ph:'10:00',show:{any:['do_forfeit','do_realloc']},group:'Forfeiture'}),
  F('forfeit_reallot','After forfeiture','choice',{opts:[['reallot','Shares will be re-allotted'],['unissued','Shares go back to unissued capital']],show:{any:['do_forfeit']},group:'Forfeiture'}),
  F('allotment_date','Allotment resolution: date','date',{ph:'Same day as the forfeiture',show:{any:['do_realloc']},group:'Re-allotment'}),F('allotment_time','Time','time',{ph:'11:00',show:{any:['do_realloc']},group:'Re-allotment'}),
  F('payment','Payment for the shares','choice',{opts:[['cash','Cash'],['noncash','Other than cash']],show:{any:['do_realloc']},group:'Re-allotment'}),
  F('price_per_share','Price per share','money',{ph:'Nominal value',show:{any:['do_realloc']},group:'Re-allotment'}),
  F('payment_date','Allottees must pay by','date',{ph:'14 days after the allotment',show:{any:['do_realloc'],pay:'cash'},group:'Re-allotment'}),
  F('consideration','What is given instead of cash','longtext',{ph:'e.g. services rendered to the company',show:{any:['do_realloc'],pay:'noncash'},group:'Re-allotment'}),
  ...[1,2,3,4].flatMap(n=>[F(`allottee_${n}`,`Allottee ${n}`,'person',{from:'any',show:{any:['do_realloc']},group:'Re-allotment',pair:true}),F(`allottee_${n}_shares`,'Shares','number',{show:{any:['do_realloc']},group:'Re-allotment',pairOf:true})]),
  F('reg95','All directors are allottees: relax Regulation 95 first (members\' resolution)','bool',{show:{any:['do_realloc']},group:'Re-allotment'}),
  F('reg95_date','Members\' meeting relaxing Reg. 95: date','date',{ph:'Same day as the allotment',show:{any:['do_realloc'],reg95:'yes'},group:'Re-allotment'}),F('reg95_time','Time','time',{ph:'10:00',show:{any:['do_realloc'],reg95:'yes'},group:'Re-allotment'}),
  ...ART_FIELDS(['board_notice_provision','board_quorum_word','board_quorum_provision','gm_notice_provision','gm_quorum_word','gm_quorum_provision','table_a_provision'])],
 jobs:(a,c)=>{const o=[];const y=k=>a[k]==='yes';
  if(y('do_call')){o.push({tid:'T03',name:'Directors\' resolution - call on shares'},{tid:'T04',name:'Notice of call'})}
  if(y('do_reg29'))o.push({tid:'T05',name:'Notice requiring payment (Reg. 29)'});
  if(y('do_forfeit'))o.push(a.forfeit_reallot==='unissued'?{tid:'T06B',name:'Directors\' resolution - forfeiture (shares unissued)'}:{tid:'T06A',name:'Directors\' resolution - forfeiture (re-allotment to follow)'});
  if(y('do_realloc')){if(y('reg95'))o.push({tid:'T08',name:'Members\' resolution - relaxation of Regulation 95'});
   o.push(a.payment==='noncash'?{tid:'T07A',name:'Directors\' resolution - allotment (other than cash)'}:{tid:'T07B',name:'Directors\' resolution - allotment (cash)'});o.push({tid:'F03',name:'Form 57a - return of allotment'});
   if(a.payment==='noncash')[1,2,3,4].filter(n=>a['allottee_'+n]).forEach(n=>o.push({tid:'F04',name:'Form 57b - contract for shares not paid in cash',who:a['allottee_'+n],over:(()=>{const sh=num(a[`allottee_${n}_shares`]),pr=num(a.price_per_share)||c.nominal;return{allottee_name:a['allottee_'+n],number_of_shares_non_cash:comma(sh),amount_nominal_paid_up_non_cash:`${c.currency} ${comma(sh*c.nominal)}`,amount_paid_up_on_value:`${c.currency} ${comma(sh*pr)}`}})()}))}
  return o},
 derive(a,c){
  const V={},B=[],cur=c.currency,nominal=c.nominal,mem=c.people.find(p=>same(p.full_name,a.member))||{full_name:a.member||''};
  const n=num(a.shares_number)||hold(mem),per=num(a.call_per_share),amount=n*per,chair=a.chairman||(c.directors[0]||{}).full_name||'';
  V.chairman_name=chair;V.signing_director_name=chair;V.signatory_name=chair;V.signatory_title='Chairman of the Board of Directors';V.signing_director_role='Director';
  V.member_name=mem.full_name;V.former_member_name=mem.full_name;
  V.shares_number=comma(n);V.shares_number_words=words(n);V.forfeited_shares_number=comma(n);
  V.call_per_share=per?`${cur} ${comma(per)}`:'';V.call_amount=amount?comma(amount):'';V.call_amount_words=amount?words(amount):'';
  const cd=a.call_date,due=a.due_date||addDays(cd,30);V.call_resolution_date=fmtD(cd);V.notice_of_call_date=fmtD(cd);V.notice_date=fmtD(cd);V.call_resolution_time=a.call_time||'10:00';V.call_due_date=fmtD(due);
  const ad=addrParts(mem);V.addressee_name=tc(mem.full_name);V.addressee_address_line_1=ad.rest?ad.rest+(ad.country?',':''):'';V.addressee_address_line_2=ad.country||'';if(!ad.country)B.push('ADDRESSEE_ADDRESS_LINE_2');
  // Reg. 29
  const used=a.do_reg29==='yes'||a.reg29_used==='yes'||!!a.reg29_notice_date,rn=used?(a.reg29_notice_date||addDays(due,1)):'',re=used?addDays(rn,15):'',last=used?re:due;
  V.reg29_notice_date=used?fmtD(rn):'';V.reg29_expiry_date=used?fmtD(re):'';V.last_payment_deadline=fmtD(last);
  // forfeiture and re-allotment
  const fd=a.forfeit_date||addDays(last,1),al=a.allotment_date||fd;V.forfeiture_date=fmtD(fd);V.forfeiture_time=a.forfeit_time||'10:00';V.allotment_date=fmtD(al);V.allotment_time=a.allotment_time||'11:00';
  const atts=[1,2,3,4].map(i=>({name:a['allottee_'+i],shares:num(a[`allottee_${i}_shares`])})).filter(x=>x.name),price=num(a.price_per_share)||nominal,noncash=a.payment==='noncash';
  V.clause_pay_bank=a.pay_bank==='office'?'no':'yes';V.clause_at_nominal=price===nominal?'yes':'no';
  [1,2,3,4].forEach(i=>{const x=atts[i-1];V[`allottee_${i}_name`]=x?x.name:'';V[`allottee_${i}_shares`]=x?comma(x.shares):'';V[`allottee_${i}_amount`]=x&&!noncash?`${cur} ${comma(x.shares*price)}`:'';if(!x)B.push(`ALLOTTEE_${i}_NAME`)});
  V.payment_date=fmtD(a.payment_date||addDays(al,14));V.consideration_description=a.consideration||'';
  // Form 57a / 57b
  const tot=atts.reduce((s,x)=>s+x.shares,0);V.allotment_date_from=up(fmtD(al));V.number_allotted=comma(tot);V.nominal_value_per_share=`${cur} ${comma(nominal)}`;V.amount_paid_or_due_per_share=`${cur} ${comma(price)}`;
  V.premium_or_discount=price===nominal?'Not applicable':price>nominal?`Premium of ${cur} ${comma(price-nominal)} per share`:`Discount of ${cur} ${comma(nominal-price)} per share`;V.consideration_for_allotment=noncash?'Other than cash.':'Cash.';V.percent_paid_up_opt=noncash?'100':'';
  V.continuation_sheets=atts.length>3?'1':'0';[1,2,3].forEach(i=>{const x=atts[i-1],p=x&&c.people.find(q=>same(q.full_name,x.name));V[`allottee_${i}_class`]=x?((p&&p.share_class)||c.shareClass||'Ordinary'):'';V[`allottee_${i}_address`]=p?up(p.address||''):'';V[`allottee_${i}_consent_date`]=x?ordD(al):''});
  V.signing_date=ordD(al);V.allottee_sign_date=ordD(al);V.officer_sign_date=ordD(al);
  V.nominal_value_per_share_numeric=comma(nominal);V.value_per_share_incl_premium=comma(price);V.item_4_non_cash_consideration=a.consideration||'';
  // Reg. 95 relaxation (members' meeting)
  V.relaxation_meeting_date=fmtD(a.reg95_date||al);V.relaxation_meeting_time=a.reg95_time||'10:00';
  V.allottees_names_and_shares=joinAnd(atts.map(x=>`${tc(x.name)} (${comma(x.shares)} shares)`));
  // people at the meetings: the directors, chairman first
  const att=[chair,...c.directors.map(p=>p.full_name).filter(x=>!same(x,chair))].filter(Boolean);
  for(let i=0;i<Math.max(5,att.length);i++){const x=att[i];V[`attendee_${i+1}_name`]=x||'';V[`attendee_${i+1}_role_opt`]=x?(same(x,chair)?'Chairman of the Board of Directors':'Director'):'';if(!x)B.push(`ATTENDEE_${i+1}_NAME`)}
  const sec=(c.secretaries[0]||{}).full_name,mm=c.shareholders.slice().sort((x,y)=>(same(y.full_name,chair)-same(x.full_name,chair))||(same(y.full_name,sec)-same(x.full_name,sec)));
  for(let i=0;i<7;i++){const p=mm[i];V[`member_${i+1}_name`]=p?p.full_name:'';V[`member_${i+1}_shares`]=p&&hold(p)?comma(hold(p)):'';if(!p)B.push(`MEMBER_${i+1}_NAME`,`MEMBER_${i+1}_SHARES`)}
  V.absent_names='None.';V.absent_members_with_shares='None.';
  return{V,B}},
 warn(a,c){const w=[],mem=c.people.find(p=>same(p.full_name,a.member)),y=k=>a[k]==='yes';
  if(!y('do_call')&&!y('do_reg29')&&!y('do_forfeit')&&!y('do_realloc'))w.push('Tick at least one step.');
  if(!a.member)w.push('Choose the member who owes the call.');
  const n=num(a.shares_number)||hold(mem);if(mem&&hold(mem)&&n>hold(mem))w.push(`${mem.full_name} holds ${comma(hold(mem))} shares, fewer than ${comma(n)}.`);
  if(c.nominal&&num(a.call_per_share)*4>c.nominal)w.push(`A call may not be more than one quarter of the nominal value (${c.currency} ${comma(c.nominal/4)} per share).`);
  if(a.call_date&&a.due_date&&diffDays(a.call_date,a.due_date)<15)w.push('The payment date must be at least 14 clear days after the notice of call (Table A reg. 14).');
  if(a.reg29_notice_date&&a.due_date&&a.reg29_notice_date<=a.due_date)w.push('The Reg. 29 notice must be served after the call\'s payment date has passed.');
  if(y('do_realloc')&&!(a.allottee_1&&num(a.allottee_1_shares)))w.push('Add at least one allottee with a number of shares.');
  if(y('do_realloc')){const t=[1,2,3,4].reduce((s,i)=>s+(a['allottee_'+i]?num(a[`allottee_${i}_shares`]):0),0);if(n&&t>n)w.push(`The allottees receive ${comma(t)} shares but only ${comma(n)} were forfeited.`)}
  if(y('do_realloc')&&a.payment==='noncash'&&!a.consideration)w.push('Say what is given instead of cash (it goes on Form 57b).');
  return w},
 people(a){return[1,2,3,4].filter(i=>a['allottee_'+i]).map(i=>({name:a['allottee_'+i],need:['address'],why:'Form 57a'}))}},

{id:'office',title:'Change of registered office',icon:'bx-map-pin',match:/office|address|registered/i,desc:'Form 114: the company moves its registered office. Needs a directors\' resolution approving the move, which you attach.',
 fields:[F('new_address_1','New registered office: plot, street and ward','text',{req:true,ph:'Plot 24, Shebe Street, Temeke',group:'New office'}),F('new_address_2','P.O. Box (second line)','text',{ph:'P.O. Box 47',group:'New office'}),
  F('new_town','Town or city','text',{req:true,ph:'Dar es Salaam',group:'New office'}),F('new_email','Company e-mail address','text',{req:true,group:'New office'}),F('new_phone','Contact phone','text',{req:true,ph:'0712 000 000',group:'New office'}),
  F('change_date','The change takes effect on','date',{req:true,group:'When'}),F('signing_director','Director who signs the form','person',{from:'directors',ph:'First director, if left empty',group:'When'}),F('signing_date','Date the director signs','date',{ph:'Same as the effective date',group:'When'}),
  F('resolution_ready','A directors\' resolution approving the change is ready to attach','bool',{req:true,group:'Before you generate'})],
 jobs:()=>[{tid:'F07',name:'Form 114 - change of registered office'}],
 derive(a,c){const V={},B=[],sd=a.signing_director||(c.directors[0]||{}).full_name||'';
  V.change_date=up(fmtD(a.change_date));V.new_office_address_line_1=up(a.new_address_1);V.new_office_address_line_2_opt=up(a.new_address_2);V.new_office_town_city=up(a.new_town);V.new_office_email=String(a.new_email||'').trim();V.new_office_contact_phone=String(a.new_phone||'').trim();
  V.signing_director_name=up(sd);V.signing_director_role='Director';V.signing_date=ordD(a.signing_date||a.change_date);return{V,B}},
 warn(a,c){const w=[];if(a.change_date&&a.signing_date&&a.signing_date>a.change_date)w.push('The form is signed after the date the change takes effect. BRELA expects it to be filed within 14 days of the change.');
  if(a.new_email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(a.new_email).trim()))w.push('The e-mail address does not look right.');if(!c.directors.length&&!a.signing_director)w.push('The company has no saved director to sign the form.');return w},
 people(a,c){const sd=a.signing_director||(c.directors[0]||{}).full_name;return sd?[{name:sd,need:[],why:'Form 114'}]:[]}},

{id:'rename',title:'Change of company name',icon:'bx-rename',match:/name/i,desc:'Form 33a: the company changes its name. The new name must already be reserved with BRELA and approved by a resolution, which you attach.',
 fields:[F('new_name','New company name','text',{req:true,help:'Exactly as reserved with BRELA, including LIMITED.',group:'The new name'}),F('name_reserved','The new name is reserved with BRELA','bool',{req:true,group:'The new name'}),
  F('resolution_date','Date of the resolution approving the change','date',{req:true,group:'Resolution'}),F('signing_director','Director who signs the form','person',{from:'directors',ph:'First director, if left empty',group:'Resolution'}),F('signing_date','Date the director signs','date',{ph:'Same as the resolution date',group:'Resolution'})],
 jobs:()=>[{tid:'F09',name:'Form 33a - change of company name'}],
 derive(a,c){const V={},B=[],sd=a.signing_director||(c.directors[0]||{}).full_name||'',old=String((c.values||{}).company_name||'').trim();
  V.old_name=up(old);V.new_name=up(String(a.new_name||'').trim());V.resolution_date=fmtD(a.resolution_date);V.signing_director_name=up(sd);V.signing_date=ordD(a.signing_date||a.resolution_date);return{V,B}},
 warn(a,c){const w=[],old=String((c.values||{}).company_name||'').trim(),nn=String(a.new_name||'').trim();
  if(nn&&same(nn,old))w.push('The new name is the same as the current name.');
  if(nn&&!/\b(limited|ltd|plc)\.?$/i.test(nn))w.push('The new name does not end with LIMITED, LTD or PLC. Check it against the name reserved with BRELA.');
  if(!old)w.push('The company has no saved name, so the old name on the form will be empty.');return w},
 people(a,c){const sd=a.signing_director||(c.directors[0]||{}).full_name;return sd?[{name:sd,need:[],why:'Form 33a'}]:[]}},

{id:'transfer',title:'Transfer of shares',icon:'bx-transfer',match:/transfer/i,desc:'The directors\' resolution acknowledging and registering transfers of shares (up to four). Check the Articles\' transfer rules, the stamped instruments and the TRA clearance first. Afterwards update Form 131 and, where the owners change, the beneficial-owner forms (15b, 15c, 15f).',
 fields:[...[1,2,3,4].flatMap(i=>[F(`transfer_${i}_transferor`,`Transfer ${i}: seller (transferor)`,'person',{from:'shareholders',req:i===1,group:`Transfer ${i}`}),F(`transfer_${i}_transferee`,`Transfer ${i}: buyer (transferee)`,'person',{from:'any',req:i===1,group:`Transfer ${i}`}),F(`transfer_${i}_shares`,`Transfer ${i}: number of shares`,'number',{req:i===1,group:`Transfer ${i}`})]),
  F('transfer_articles','Articles governing the form and registration of transfers','text',{req:true,ph:'articles 22 to 27 of the Company\'s Articles of Association',help:'Take this from the company\'s own Articles.',group:'Meeting and documents'}),
  F('agreements_date','Date of the share transfer agreements','date',{req:true,group:'Meeting and documents'}),F('docs_received_date','Date the company received the agreements, instruments and TRA documents','date',{req:true,group:'Meeting and documents'}),
  F('meeting_date','Directors\' meeting: date','date',{req:true,help:'On or after the date the documents were received.',group:'Meeting and documents'}),F('meeting_time','Time','time',{ph:'09:00',group:'Meeting and documents'}),
  F('chairman','Chairman of the meeting','person',{from:'directors',ph:'First director, if left empty',group:'Meeting and documents'}),
  F('stamped','The transfer instruments are duly stamped and the TRA clearance is in hand','bool',{req:true,group:'Before you generate'}),
  ...ART_FIELDS(['board_notice_provision','board_quorum_word','board_quorum_provision'])],
 jobs:()=>[{tid:'T09',name:'Directors\' resolution - transfer of shares'}],
 derive(a,c){const V={},B=[],chair=a.chairman||(c.directors[0]||{}).full_name||'';
  V.transfer_meeting_date=fmtD(a.meeting_date);V.transfer_meeting_time=a.meeting_time||'09:00';V.transfer_agreements_date=fmtD(a.agreements_date);V.transfer_docs_received_date=fmtD(a.docs_received_date);V.transfer_articles=String(a.transfer_articles||'').trim();
  [1,2,3,4].forEach(i=>{const f=a[`transfer_${i}_transferor`],t=a[`transfer_${i}_transferee`],n=num(a[`transfer_${i}_shares`]),used=f&&t&&n;V[`transfer_${i}_transferor`]=used?tc(f):'';V[`transfer_${i}_transferee`]=used?tc(t):'';V[`transfer_${i}_shares`]=used?comma(n):'';if(!used)B.push(`TRANSFER_${i}_TRANSFEROR`,`TRANSFER_${i}_TRANSFEREE`,`TRANSFER_${i}_SHARES`)});
  V.chairman_name=chair;const att=[chair,...c.directors.map(p=>p.full_name).filter(x=>!same(x,chair))].filter(Boolean);
  for(let i=0;i<Math.max(5,att.length);i++){const x=att[i];V[`attendee_${i+1}_name`]=x||'';V[`attendee_${i+1}_role_opt`]=x?(same(x,chair)?'Chairman of the Board of Directors':'Director'):'';if(!x)B.push(`ATTENDEE_${i+1}_NAME`)}
  V.absent_names='None.';return{V,B}},
 warn(a,c){const w=[],rows=[1,2,3,4].filter(i=>a[`transfer_${i}_transferor`]||a[`transfer_${i}_transferee`]||a[`transfer_${i}_shares`]);
  for(const i of rows){const f=a[`transfer_${i}_transferor`],t=a[`transfer_${i}_transferee`],n=num(a[`transfer_${i}_shares`]);
   if(!(f&&t&&n))w.push(`Transfer ${i} is incomplete: it needs the seller, the buyer and the number of shares, or it is left out.`);
   else{if(same(f,t))w.push(`Transfer ${i}: the seller and the buyer are the same person.`);const h=hold((c.shareholders||[]).find(p=>same(p.full_name,f)));if(h&&n>h)w.push(`Transfer ${i}: ${tc(f)} holds ${comma(h)} shares but is transferring ${comma(n)}.`)}}
  const sold={};for(const i of rows){const f=a[`transfer_${i}_transferor`];if(f)sold[f.toUpperCase()]=(sold[f.toUpperCase()]||0)+num(a[`transfer_${i}_shares`])}
  for(const [k,n] of Object.entries(sold)){const h=hold((c.shareholders||[]).find(p=>same(p.full_name,k)));if(h&&n>h&&rows.filter(i=>same(a[`transfer_${i}_transferor`],k)).length>1)w.push(`${tc(k)} is transferring ${comma(n)} shares in total but holds ${comma(h)}.`)}
  if(a.docs_received_date&&a.meeting_date&&a.meeting_date<a.docs_received_date)w.push('The directors\' meeting is before the date the documents were received.');
  if(a.agreements_date&&a.docs_received_date&&a.docs_received_date<a.agreements_date)w.push('The documents were received before the date of the transfer agreements.');
  if(!rows.length)w.push('Add at least one transfer.');
  return w},
 people(a,c){return[1,2,3,4].map(i=>a[`transfer_${i}_transferee`]).filter(Boolean).map(n=>({name:n,need:['address'],why:'the transfer'}))}},

{id:'annual',title:'Annual return',icon:'bx-calendar-check',match:/annual/i,desc:'Form 131. Everything comes from the company\'s saved details; just check it and sign.',
 fields:[F('return_date','Return made up to','date',{ph:'Latest anniversary of incorporation',group:'Options'}),F('no_charges','There were no charges in the period','bool',{group:'Options'}),F('list_of_changes','A list of changes is enclosed','bool',{group:'Options'}),F('full_members','A full list of members is enclosed','bool',{group:'Options'})],
 jobs:()=>[{tid:'F05',name:'Form 131 - annual return'}],
 derive(a){const V={};if(a.return_date)V.return_date=up(fmtD(a.return_date));V.no_charges_tick_opt=a.no_charges==='yes'?'X':'';V.list_of_changes_tick_opt=a.list_of_changes==='yes'?'X':'';V.full_members_list_tick_opt=a.full_members==='yes'?'X':'';return{V,B:[]}},
 warn:(a,c)=>{const w=[],sh=(c.shareholders||[]).reduce((t,p)=>t+num(p.shares),0),iss=num((c.values||{}).shares_issued_total||(c.values||{}).shares_issued);
  if(sh&&iss&&sh!==iss)w.push(`The members hold ${comma(sh)} shares in total but the company's issued shares are ${comma(iss)}. Correct the shareholders or the company details before signing Form 131.`);
  if(!(c.shareholders||[]).length)w.push('No members are saved for this company, so the member list on Form 131 will be empty.');
  return w},people:(a,c)=>[...(c.directors||[]).map(p=>({name:p.full_name,need:['dob','nationality','address'],why:'Form 131'})),...(c.secretaries||[]).map(p=>({name:p.full_name,need:['address'],why:'Form 131'}))]}];

// what derive() needs to know about the company
function companyView(ctx){
 const v=ctx.values||{},l=ctx.lists||{},money=x=>num(x);
 return{values:v,people:l.people||[],directors:l.directors||[],shareholders:l.shareholders||[],secretaries:l.secretaries||[],currency:v.share_currency||'TZS',nominal:money(v.nominal_value_per_share||v.share_value),shareClass:v.share_class||'Ordinary'}}
const byId=id=>BUILTIN.find(s=>s.id===id);
// ---- a wizard as stored in the database (built-in ones keep their code for the tricky parts; Managers add questions, documents, formulas and checks on top)
const names=l=>(l||[]).map(p=>p.full_name).join('|');
const envOf=(a,cv,V)=>({...(cv.values||{}),...a,...(V||{}),directors:names(cv.directors),shareholders:names(cv.shareholders),secretaries:names(cv.secretaries),people:names(cv.people),currency:cv.currency,nominal:String(cv.nominal||'')});
const matchRe=w=>{const t=String(w||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));return t.length?new RegExp(t.join('|'),'i'):/$^/};
function compose(row){
 const D=require('./wizard-dsl'),b=row.engine?byId(row.engine):null,docs=row.docs||[],rules=row.rules||[],checks=row.checks||[],fields=row.fields||[];
 return{id:row.id,title:row.title,desc:row.description||'',icon:row.icon||'bx-file',match:matchRe(row.match),engine:row.engine||null,fields,
  jobs:(a,c)=>{const o=b?b.jobs(a,c):[];
   for(const d of docs){if(!d.template_id)continue;if(d.if&&!D.truthy(a[d.if]))continue;
    if(d.per){D.pipe(a[d.per]).forEach(n=>o.push({template_id:+d.template_id,name:d.name||'Document',who:n,over:{person_name:n}}))}else o.push({template_id:+d.template_id,name:d.name||'Document'})}
   return o},
  derive:(a,c)=>{const base=b?b.derive(a,c):{V:{},B:[]},V={...base.V},B=[...base.B];
   for(const f of fields)if(f.maps_to&&a[f.key]){const k=String(f.maps_to).toLowerCase(),v=D.formatValue(f.fmt||'raw',f.type==='bool'?'':a[f.key]);if(v!=='')V[k]=v}
   const env=envOf(a,c,V);
   for(const r of rules){const k=String(r.key||'').toLowerCase();if(!k)continue;const v=D.run(r.expr,env,c);env[k]=v;if(v!=='')V[k]=v;else if(r.blank)B.push(k.toUpperCase())}
   return{V,B}},
  warn:(a,c)=>{const w=b?b.warn(a,c):[],env=envOf(a,c,{});for(const k of checks)if(k.msg&&D.truthy(D.run(k.when,env,c)))w.push(k.msg);return w},
  people:(a,c)=>b?b.people(a,c):[]}}
// what the case page needs to draw the form
// the form for the UI (functions removed)
const publicDef=(s,ctx,profile)=>({id:s.id,title:s.title,icon:s.icon,desc:s.desc,fields:s.fields.map(f=>({key:f.key,label:f.label,type:f.type,req:f.req,from:f.from,max:f.max,ph:f.ph,help:f.help,group:f.group||'Questions',show:f.show,opts:f.opts,article:f.article,pair:f.pair,pairOf:f.pairOf,def:f.article?((profile||{})[f.key.slice(4)]||f.def):f.def}))});
const comma_=comma;
module.exports={BUILTIN,byId,compose,companyView,publicDef,words,joinAnd,fmtD,ordD,addDays,tc,ARTICLE_KEYS,list,comma:comma_,matchRe};
