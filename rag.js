// Finding the right passages of a case's documents for a question (retrieval for the case chat).
// A case holds a handful of documents, so ranking words (BM25) over small chunks is fast, needs no vector database
// and works the same with every AI provider.
const STOP=new Set('the and for are but not you all any can had her was one our out has his how its may new now see two who did get him let say she too use with from that this have what when where which will your about into than then them they were been would there their shall under such upon also kila ya wa na za la kwa ni katika hii huu hizi hayo yake yao ambayo kama pia sana au bila lakini sasa'.split(' '));
const stem=w=>w.length>4&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
const tokens=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(w=>w.length>1&&!STOP.has(w)).map(stem);
// split a text into passages of about `size` characters, breaking at paragraph ends
function chunk(text,size=900){
 const out=[];let cur='';
 const push=()=>{if(cur.trim())out.push(cur.trim());cur=''};
 for(const p of String(text||'').split(/\n{2,}/)){
  if(p.length>size){push();for(let i=0;i<p.length;i+=size-150)out.push(p.slice(i,i+size).trim());continue}
  if(cur.length+p.length+2>size)push();cur+=(cur?'\n\n':'')+p}
 push();return out.filter(Boolean)}
// rank chunks [{file,n,text}] against a question: the best `k` first. With no matching words, the opening of each document is used.
function rank(query,chunks,k=8){
 const q=[...new Set(tokens(query))],docs=chunks.map(c=>{const t=tokens(c.text+' '+(c.file||''));const tf={};for(const w of t)tf[w]=(tf[w]||0)+1;return{c,tf,len:t.length||1}});
 const N=docs.length||1,avg=docs.reduce((a,d)=>a+d.len,0)/N||1,df={};
 for(const w of q)df[w]=docs.filter(d=>d.tf[w]).length;
 const scored=docs.map(d=>{let s=0;for(const w of q){const f=d.tf[w]||0;if(!f)continue;const idf=Math.log(1+(N-df[w]+.5)/(df[w]+.5));s+=idf*(f*2.5)/(f+1.5*(0.25+0.75*d.len/avg))}return{c:d.c,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
 if(scored.length)return scored.slice(0,k).map(x=>x.c);
 const seen=new Set();return chunks.filter(c=>!seen.has(c.file)&&seen.add(c.file)).slice(0,k)}
// hide long numbers (ID, TIN, phone, account numbers) from the AI, but keep dates
function mask(text){
 return String(text||'').replace(/\+?\d[\d ()\-]{6,}\d/g,m=>{
  if(m.replace(/\D/g,'').length<8)return m;if(/^\d{4}-\d{2}-\d{2}$/.test(m)||/^\d{1,2}[ -]\d{1,2}[ -]\d{4}$/.test(m))return m;return '[number withheld]'})}
module.exports={chunk,rank,mask,tokens};
