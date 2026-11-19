// A tiny, safe formula language for the document wizards (Settings → Document wizards).
// Only function calls, text, numbers and field names: no loops, no assignment, nothing is ever eval()'d.
//   e.g.  comma(mul(shares_number, call_per_share))      date(add_days(meeting_date, 14))      names(remove(directors, resign))
const S=()=>require('./scenarios');
const num=x=>{const n=Number(String(x??'').replace(/[^0-9.\-]/g,''));return Number.isFinite(n)?n:0};
const str=x=>x===undefined||x===null?'':String(x);
const truthy=x=>{const t=str(x).trim().toLowerCase();return t!==''&&t!=='no'&&t!=='false'&&t!=='0'};
const pipe=x=>str(x).split('|').map(s=>s.trim()).filter(Boolean);
const same=(a,b)=>str(a).trim().toUpperCase()===str(b).trim().toUpperCase();
const todayIso=()=>new Date(Date.now()+3*3600e3).toISOString().slice(0,10);

// ---- parser
function tokenize(src){
 const t=[],s=String(src);let i=0;
 while(i<s.length){const c=s[i];
  if(/\s/.test(c)){i++;continue}
  if(c==='('||c===')'||c===','){t.push({k:c});i++;continue}
  if(c==='"'||c==="'"){let j=i+1,v='';while(j<s.length&&s[j]!==c){if(s[j]==='\\'&&j+1<s.length){v+=s[j+1];j+=2}else v+=s[j++]}if(j>=s.length)throw new Error('A text value is missing its closing quote');t.push({k:'str',v});i=j+1;continue}
  const n=s.slice(i).match(/^-?\d+(?:\.\d+)?/);if(n){t.push({k:'num',v:n[0]});i+=n[0].length;continue}
  const id=s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);if(id){t.push({k:'id',v:id[0]});i+=id[0].length;continue}
  throw new Error(`Unexpected "${c}". Use function calls like add(a, b) and put text in quotes.`)}
 return t}
function parse(src){
 const src_=String(src||'').trim();if(!src_)throw new Error('The formula is empty');if(src_.length>600)throw new Error('The formula is too long');
 const t=tokenize(src_);let p=0,nodes=0;
 const expr=d=>{if(d>12)throw new Error('The formula is nested too deeply');if(++nodes>250)throw new Error('The formula is too big');const x=t[p++];if(!x)throw new Error('The formula ends too early');
  if(x.k==='str')return{t:'str',v:x.v};if(x.k==='num')return{t:'num',v:x.v};
  if(x.k==='id'){if(t[p]&&t[p].k==='('){p++;const args=[];if(t[p]&&t[p].k===')')p++;else{for(;;){args.push(expr(d+1));const y=t[p++];if(!y)throw new Error('A bracket is not closed');if(y.k===')')break;if(y.k!==',')throw new Error('Expected a comma or a closing bracket')}}return{t:'call',n:x.v.toLowerCase(),args}}return{t:'id',n:x.v.toLowerCase()}}
  throw new Error(`Unexpected "${x.k}"`)};
 const ast=expr(0);if(p<t.length)throw new Error('There is extra text after the formula');return ast}

// ---- functions
const FUNCS={
 // text and logic
 upper:{sig:'upper(text)',d:'CAPITAL LETTERS',f:a=>str(a[0]).toUpperCase()},
 lower:{sig:'lower(text)',d:'small letters',f:a=>str(a[0]).toLowerCase()},
 title:{sig:'title(text)',d:'Title Case (also works on a list of names)',f:a=>pipe(a[0]).map(S().tc).join('|')||S().tc(a[0])},
 concat:{sig:'concat(a, b, ...)',d:'Join texts together',f:a=>a.map(str).join('')},
 first:{sig:'first(a, b, ...)',d:'The first value that is not empty',f:a=>a.map(str).find(x=>x.trim()!=='')||''},
 if:{sig:'if(condition, then, else)',d:'Choose between two values',f:a=>truthy(a[0])?str(a[1]):str(a[2])},
 eq:{sig:'eq(a, b)',d:'yes when a and b are the same',f:a=>same(a[0],a[1])?'yes':''},
 ne:{sig:'ne(a, b)',d:'yes when a and b differ',f:a=>same(a[0],a[1])?'':'yes'},
 not:{sig:'not(x)',d:'yes when x is empty or "no"',f:a=>truthy(a[0])?'':'yes'},
 and:{sig:'and(a, b, ...)',d:'yes when all are filled',f:a=>a.every(truthy)?'yes':''},
 any:{sig:'any(a, b, ...)',d:'yes when at least one is filled',f:a=>a.some(truthy)?'yes':''},
 empty:{sig:'empty(x)',d:'yes when x is empty',f:a=>str(a[0]).trim()===''?'yes':''},
 contains:{sig:'contains(text, part)',d:'yes when text contains part',f:a=>str(a[0]).toLowerCase().includes(str(a[1]).toLowerCase())?'yes':''},
 // numbers
 num:{sig:'num(x)',d:'Read a number (commas and currency ignored)',f:a=>num(a[0])},
 add:{sig:'add(a, b, ...)',d:'Add numbers',f:a=>a.reduce((s,x)=>s+num(x),0)},
 sub:{sig:'sub(a, b)',d:'a minus b',f:a=>num(a[0])-num(a[1])},
 mul:{sig:'mul(a, b, ...)',d:'Multiply numbers',f:a=>a.reduce((s,x)=>s*num(x),1)},
 div:{sig:'div(a, b)',d:'a divided by b',f:a=>num(a[1])?num(a[0])/num(a[1]):0},
 round:{sig:'round(x)',d:'Round to a whole number',f:a=>Math.round(num(a[0]))},
 min:{sig:'min(a, b, ...)',d:'Smallest',f:a=>Math.min(...a.map(num))},
 max:{sig:'max(a, b, ...)',d:'Largest',f:a=>Math.max(...a.map(num))},
 gt:{sig:'gt(a, b)',d:'yes when a is more than b',f:a=>num(a[0])>num(a[1])?'yes':''},
 gte:{sig:'gte(a, b)',d:'yes when a is b or more',f:a=>num(a[0])>=num(a[1])?'yes':''},
 lt:{sig:'lt(a, b)',d:'yes when a is less than b',f:a=>num(a[0])<num(a[1])?'yes':''},
 lte:{sig:'lte(a, b)',d:'yes when a is b or less',f:a=>num(a[0])<=num(a[1])?'yes':''},
 comma:{sig:'comma(number)',d:'12500 → 12,500',f:a=>S().comma?S().comma(num(a[0])):Math.round(num(a[0])).toLocaleString('en-US')},
 words:{sig:'words(number)',d:'12500 → twelve thousand, five hundred',f:a=>S().words(num(a[0]))},
 // dates (dates are typed as YYYY-MM-DD by the date boxes)
 date:{sig:'date(day)',d:'2026-09-29 → 29 September 2026',f:a=>S().fmtD(a[0])},
 ordinal_date:{sig:'ordinal_date(day)',d:'2026-09-29 → 29th September 2026',f:a=>S().ordD(a[0])},
 add_days:{sig:'add_days(day, n)',d:'A day n days later (n can be negative)',f:a=>S().addDays(a[0],num(a[1]))},
 days_between:{sig:'days_between(from, to)',d:'Number of days from one date to another',f:a=>Math.round((Date.parse(str(a[1]))-Date.parse(str(a[0])))/864e5)||0},
 today:{sig:'today()',d:'Today (YYYY-MM-DD)',f:()=>todayIso()},
 // lists of names (names are joined with | inside the app)
 names:{sig:'names(list)',d:'"A, B and C" in Title Case',f:a=>S().joinAnd(pipe(a[0]).map(S().tc))},
 names_caps:{sig:'names_caps(list)',d:'"A, B and C" in CAPITALS',f:a=>S().joinAnd(pipe(a[0]).map(x=>x.toUpperCase()))},
 join_and:{sig:'join_and(list)',d:'"A, B and C" as typed',f:a=>S().joinAnd(pipe(a[0]))},
 count:{sig:'count(list)',d:'How many names',f:a=>pipe(a[0]).length},
 nth:{sig:'nth(list, n)',d:'The n-th name (1 = first)',f:a=>pipe(a[0])[num(a[1])-1]||''},
 remove:{sig:'remove(list, other)',d:'The list without the names in other',f:a=>{const o=pipe(a[1]);return pipe(a[0]).filter(x=>!o.some(y=>same(x,y))).join('|')}},
 append:{sig:'append(list, other)',d:'The two lists together',f:a=>[...pipe(a[0]),...pipe(a[1]).filter(x=>!pipe(a[0]).some(y=>same(x,y)))].join('|')},
 plural:{sig:'plural(list, many, one)',d:'many when the list has 2+ names, otherwise one (e.g. were / was)',f:a=>pipe(a[0]).length>1?str(a[1]):str(a[2])},
 // saved people and company
 person:{sig:'person(name, field)',d:'A saved detail of a person: full_name, address, dob, nationality, occupation, gender, shares, share_class, id_number, phone, email, previous_names, other_directorships',needs:true,f:(a,c)=>{const p=(c.people||[]).find(x=>same(x.full_name,a[0]));return p?str(p[str(a[1]).toLowerCase()]):''}},
 holding:{sig:'holding(name)',d:'Number of shares a person holds',needs:true,f:(a,c)=>{const p=(c.people||[]).find(x=>same(x.full_name,a[0]));return p?num(p.shares):0}},
 possessive:{sig:'possessive(name)',d:'his / her / his or her',needs:true,f:(a,c)=>{const p=(c.people||[]).find(x=>same(x.full_name,a[0]));const g=str(p&&p.gender);return /^f/i.test(g)?'her':/^m/i.test(g)?'his':'his or her'}},
 pronoun:{sig:'pronoun(name)',d:'He / She / He or she',needs:true,f:(a,c)=>{const p=(c.people||[]).find(x=>same(x.full_name,a[0]));const g=str(p&&p.gender);return /^f/i.test(g)?'She':/^m/i.test(g)?'He':'He or she'}},
 address_lines:{sig:'address_lines(name, n)',d:'Line n (1-3) of a person\'s address, split for forms',needs:true,f:(a,c)=>{const p=(c.people||[]).find(x=>same(x.full_name,a[0]));if(!p)return '';const t=str(p.address).split(',').map(x=>x.trim()).filter(Boolean),k=Math.ceil(t.length/3)||1;const n=num(a[1]);return t.slice((n-1)*k,n*k).join(', ')}}};

// ---- evaluate
function evaluate(ast,env,company){
 const go=n=>{
  if(n.t==='str'||n.t==='num')return n.v;
  if(n.t==='id'){const v=Object.prototype.hasOwnProperty.call(env,n.n)?env[n.n]:undefined;return v===undefined||v===null?'':v}
  const f=Object.prototype.hasOwnProperty.call(FUNCS,n.n)?FUNCS[n.n]:null;if(!f)throw new Error(`Unknown function "${n.n}"`);
  return f.f(n.args.map(go),company||{})};
 const r=go(ast);return r===undefined||r===null||Number.isNaN(r)?'':String(r)}
// functions used in a formula that do not exist (for the editor to report)
const unknownFns=ast=>{const bad=new Set();(function w(n){if(n.t==='call'){if(!Object.prototype.hasOwnProperty.call(FUNCS,n.n))bad.add(n.n);n.args.forEach(w)}})(ast);return[...bad]};
function check(src){try{const ast=parse(src),bad=unknownFns(ast);if(bad.length)return`Unknown function: ${bad.join(', ')}. See the list below the formulas.`;return ''}catch(e){return e.message}}
function run(src,env,company){try{return evaluate(parse(src),env,company)}catch{return ''}}
const docs=()=>Object.entries(FUNCS).map(([n,f])=>({name:n,sig:f.sig,desc:f.d}));

// ---- a question that fills a placeholder directly
const FMT=[['raw','As typed'],['date','Date: 29 September 2026'],['ordinal','Date: 29th September 2026'],['date_caps','Date in CAPITALS'],['upper','CAPITALS'],['title','Title Case'],['money','Number with commas: 12,500'],['words','Number in words'],['names','Names: A, B and C']];
function formatValue(fmt,v){
 const x=str(v);if(x==='')return '';
 switch(fmt){case 'date':return S().fmtD(x)||x;case 'ordinal':return S().ordD(x)||x;case 'date_caps':return (S().fmtD(x)||x).toUpperCase();case 'upper':return x.toUpperCase();case 'title':return S().tc(x);
  case 'money':return Math.round(num(x)).toLocaleString('en-US');case 'words':return S().words(num(x));case 'names':return S().joinAnd(pipe(x).map(S().tc));default:return x}}

module.exports={parse,evaluate,run,check,docs,FMT,formatValue,truthy,pipe,FUNCS};
