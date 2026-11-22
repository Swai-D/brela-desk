/* Template "views": Text | Page editor (Word-like) | Word / PDF.
   The template text (#te-b) stays the single source of truth; the Page editor converts to and from it. */
(function(){
const X=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const TOK=/(\{\{[^}]*\}\}|\[\[[^\]]*\]\])/g;
const human=k=>k.replace(/_/g,' ');

function chipHtml(tok){
  let m,cls='tp-chip',label;
  if(m=tok.match(/^\{\{#\s*([a-z][a-z0-9_]*)\s*\}\}$/i)){cls+=' tp-chip-loop';label='↻ each '+human(m[1])}
  else if(m=tok.match(/^\{\{\/\s*([a-z][a-z0-9_]*)\s*\}\}$/i)){cls+=' tp-chip-loop';label='end '+human(m[1])}
  else if(m=tok.match(/^\{\{\s*([a-z][a-z0-9_]*)\s*(?:\|[^}]*)?\}\}$/i))label=human(m[1]);
  else if(m=tok.match(/^\[\[\s*([^\]]*?)\s*\]\]$/)){cls='tp-chip tp-chip-gap';label='['+human(m[1])+']'}
  else label=tok;
  return `<span class="${cls}" data-t="${X(tok)}" contenteditable="false">${X(label)}</span>`}

function inline(line){
  const toks=[];let s=line.replace(TOK,t=>{toks.push(t);return '\u0001'+(toks.length-1)+'\u0002'});
  s=X(s).replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*\s][^*]*)\*/g,'<i>$1</i>');
  return s.replace(/\u0001(\d+)\u0002/g,(_,i)=>chipHtml(toks[+i]))}

function bodyToHtml(body){
  const L=String(body||'').replace(/\r/g,'').split('\n');let h='';
  for(let i=0;i<L.length;i++){const l=L[i];let m;
    if(/^\s*\|/.test(l)){const rows=[];while(i<L.length&&/^\s*\|/.test(L[i])){if(!/^\s*\|[\s:|-]+\|\s*$/.test(L[i]))rows.push(L[i].trim().replace(/^\||\|$/g,'').split('|').map(c=>c.trim()));i++}i--;
      const n=Math.max(1,...rows.map(r=>r.length));
      h+='<table>'+rows.map((r,ri)=>'<tr>'+Array.from({length:n},(_,c)=>`<${ri?'td':'th'}>${inline(r[c]||'')||'<br>'}</${ri?'td':'th'}>`).join('')+'</tr>').join('')+'</table>';continue}
    if(m=l.match(/^(#{1,3})\s+(.*)$/)){h+=`<h${m[1].length}>${inline(m[2])||'<br>'}</h${m[1].length}>`;continue}
    if(m=l.match(/^\s*[-*]\s+(.*)$/)){let li='';while(i<L.length&&(m=L[i].match(/^\s*[-*]\s+(.*)$/))){li+=`<li>${inline(m[1])}</li>`;i++}i--;h+='<ul>'+li+'</ul>';continue}
    if(/^\s*-{3,}\s*$/.test(l)){h+='<div class="tp-pb" contenteditable="false">Page break</div>';continue}
    h+=`<p>${l.trim()?inline(l):'<br>'}</p>`}
  return h}

function inl(node){
  let o='';
  node.childNodes.forEach(n=>{
    if(n.nodeType===3){o+=n.nodeValue.replace(/\u00a0/g,' ').replace(/[\n\r]+/g,' ');return}
    if(n.nodeType!==1)return;
    const tg=n.tagName;
    if(n.dataset&&n.dataset.t!=null){o+=n.dataset.t;return}
    if(tg==='BR'){o+=' ';return}
    const t=inl(n);
    if(!t.trim()){o+=t;return}
    const fw=n.style&&n.style.fontWeight;
    if(tg==='B'||tg==='STRONG'||(fw&&(fw==='bold'||+fw>=600)))o+='**'+t.trim()+'**';
    else if(tg==='I'||tg==='EM'||(n.style&&n.style.fontStyle==='italic'))o+='*'+t.trim()+'*';
    else o+=t})
  return o}

function htmlToBody(root){
  const out=[];
  const line=(n)=>{const t=inl(n);return t.trim()?t.replace(/\s+$/,''):''};
  const block=n=>{
    if(n.nodeType===3){const t=n.nodeValue.replace(/\u00a0/g,' ').replace(/[\n\r]+/g,' ').trim();if(t)out.push(t);return}
    if(n.nodeType!==1)return;
    const tg=n.tagName;
    if(n.classList.contains('tp-pb')||tg==='HR'){out.push('---');return}
    if(/^H[1-3]$/.test(tg)){out.push('#'.repeat(+tg[1])+' '+line(n).replace(/^\*\*(.*)\*\*$/,'$1'));return}
    if(/^H[4-6]$/.test(tg)){out.push('### '+line(n).replace(/^\*\*(.*)\*\*$/,'$1'));return}
    if(tg==='UL'||tg==='OL'){n.querySelectorAll(':scope>li').forEach(li=>out.push('- '+line(li)));return}
    if(tg==='TABLE'){n.querySelectorAll('tr').forEach((tr,ri)=>{const cells=[...tr.children].filter(c=>/^T[DH]$/.test(c.tagName)).map(c=>line(c).replace(/\|/g,'/'));out.push('| '+cells.join(' | ')+' |');if(!ri)out.push('|'+cells.map(()=>'---').join('|')+'|')});return}
    if((tg==='DIV'||tg==='SECTION')&&n.querySelector(':scope>p,:scope>div,:scope>ul,:scope>table,:scope>h1,:scope>h2,:scope>h3')){n.childNodes.forEach(block);return}
    out.push(line(n))};
  root.childNodes.forEach(block);
  return out.join('\n')}

const el2=(h)=>{const d=document.createElement('div');d.innerHTML=h;return d.firstElementChild};

function mount(el,o){
  const b=o.b,can=o.can,t=o.t,id=o.id,changed=o.changed;
  const row=b.previousElementSibling,host=row.parentNode;
  const tabs=el2(`<div class="tp-seg tp-views mb-3" role="tablist" aria-label="View"><button type="button" role="tab" data-v="text" class="on"><i class="bx bx-code-alt me-1"></i>Text</button><button type="button" role="tab" data-v="page"><i class="bx bx-edit me-1"></i>${can?'Page editor':'Page view'}</button><button type="button" role="tab" data-v="word"><i class="bx bxs-file-doc me-1"></i>Word / PDF</button></div>`);
  host.insertBefore(tabs,row);
  const pText=document.createElement('div');pText.id='te-p-text';host.insertBefore(pText,row);pText.appendChild(row);pText.appendChild(b);
  const pPage=el2(`<div id="te-p-page" class="d-none">${can?`<div class="tp-tb" role="toolbar" aria-label="Formatting">
     <button type="button" data-c="bold" title="Bold"><i class="bx bx-bold"></i></button><button type="button" data-c="italic" title="Italic"><i class="bx bx-italic"></i></button><span class="tp-tb-sep"></span>
     <button type="button" data-c="h1" title="Title">Title</button><button type="button" data-c="h2" title="Heading">Heading</button><button type="button" data-c="p" title="Normal text">Text</button><span class="tp-tb-sep"></span>
     <button type="button" data-c="ul" title="Bullet list"><i class="bx bx-list-ul"></i></button><button type="button" data-c="table" title="Insert table"><i class="bx bx-table"></i></button><button type="button" data-c="pb" title="Page break"><i class="bx bx-file-blank"></i></button><span class="tp-tb-sep"></span>
     <button type="button" data-c="undo" title="Undo"><i class="bx bx-undo"></i></button><button type="button" data-c="redo" title="Redo"><i class="bx bx-redo"></i></button></div>`:''}
    <div class="tp-desk"><div class="tp-paper" id="te-paper" ${can?'contenteditable="true"':''} spellcheck="true" aria-label="Template page"></div></div>
    ${t.has_docx?'<div class="alert alert-warning py-2 small mt-2 mb-0"><i class="bx bx-info-circle me-1"></i>This template uses a Word file: its printed layout comes from that file (see Word / PDF). Edits here change the template text the system reads, not that layout.</div>':''}<div class="form-text mt-2">${can?'Edit the page like a Word document. Everything you change here is saved into the template text. Blue tags are fields that fill in automatically; yellow ones are gaps a person completes.':'This is how the template reads as a page.'}</div></div>`);
  host.insertBefore(pPage,pText.nextSibling);
  const pWord=el2(`<div id="te-p-word" class="d-none"><div class="tp-docbar"><div class="tp-doc-note" id="te-wnote"></div><div class="d-flex flex-wrap gap-2">
     <button type="button" class="btn btn-light btn-sm" id="te-dl"><i class="bx bx-download me-1"></i>Download Word</button>
     <button type="button" class="btn btn-light btn-sm" id="te-pr"><i class="bx bx-printer me-1"></i>Print / Save as PDF</button>
     ${can?`<button type="button" class="btn btn-light btn-sm" id="te-ul"><i class="bx bx-upload me-1"></i>Upload edited Word</button><input type="file" id="te-uf" accept=".docx" class="d-none"> <button type="button" class="btn btn-light btn-sm" id="te-wh"><i class="bx bx-history me-1"></i>Earlier Word files</button>`:''}</div></div>
    <div class="tp-desk tp-docv" id="te-docv"><div id="te-dstyle"></div><div id="te-dpages"></div></div></div>`);
  host.insertBefore(pWord,pPage.nextSibling);
  const paper=pPage.querySelector('#te-paper');
  let view='text',lastRange=null,blob=null,blobKey='';
  try{document.execCommand('defaultParagraphSeparator',false,'p')}catch{}

  const sync=()=>{b.value=htmlToBody(paper);changed()};
  paper.addEventListener('input',()=>{if(can)sync()});
  document.addEventListener('selectionchange',()=>{const s=getSelection();if(s.rangeCount&&paper.contains(s.anchorNode))lastRange=s.getRangeAt(0).cloneRange()});
  // keep pasted text plain so Word/web styling cannot leak in
  paper.addEventListener('paste',e=>{if(!can)return;e.preventDefault();const tx=(e.clipboardData||window.clipboardData).getData('text/plain');document.execCommand('insertText',false,tx)});

  const place=(h,block)=>{paper.focus();const s=getSelection();if(lastRange&&!paper.contains(s.anchorNode)){s.removeAllRanges();s.addRange(lastRange)}
    let r=s.rangeCount&&paper.contains(s.anchorNode)?s.getRangeAt(0):null;if(!r){r=document.createRange();r.selectNodeContents(paper);r.collapse(false)}
    const tp=document.createElement('template');tp.innerHTML=h;const fr=tp.content,last=fr.lastChild;
    if(block){let n=r.endContainer;while(n&&n.parentNode!==paper)n=n.parentNode;if(n&&n!==paper)n.after(fr);else paper.appendChild(fr)}else{r.deleteContents();r.insertNode(fr)}
    const nr=document.createRange();nr.setStartAfter(last);nr.collapse(true);s.removeAllRanges();s.addRange(nr);lastRange=nr.cloneRange();sync()};
  const cmd={bold:()=>document.execCommand('bold'),italic:()=>document.execCommand('italic'),h1:()=>document.execCommand('formatBlock',false,'h1'),h2:()=>document.execCommand('formatBlock',false,'h2'),p:()=>document.execCommand('formatBlock',false,'p'),ul:()=>document.execCommand('insertUnorderedList'),undo:()=>document.execCommand('undo'),redo:()=>document.execCommand('redo'),
    table:()=>place('<table><tr><th>Column 1</th><th>Column 2</th></tr><tr><td><br></td><td><br></td></tr></table><p><br></p>',true),
    pb:()=>place('<div class="tp-pb" contenteditable="false">Page break</div><p><br></p>',true)};
  pPage.querySelectorAll('.tp-tb button').forEach(x=>{x.onmousedown=e=>e.preventDefault();x.onclick=()=>{paper.focus();if(lastRange&&!paper.contains(getSelection().anchorNode)){const s=getSelection();s.removeAllRanges();s.addRange(lastRange)}cmd[x.dataset.c]();if(!/^(table|pb)$/.test(x.dataset.c))sync()}});

  const note=pWord.querySelector('#te-wnote');
  const officialMsg='This is the Word file of this template, shown exactly as it prints. Its layout is fixed. To change the wording or layout, download it, edit it in Word and upload it back.';
  const liveMsg='This is the document exactly as Word and PDF will show it, built from your template text. Unknown details appear as yellow gaps.';
  const stale=()=>{blob=null;blobKey=''};

  async function renderWord(force){
    const official=!!t.has_docx,key=official?'o':b.value;
    const pages=pWord.querySelector('#te-dpages'),styles=pWord.querySelector('#te-dstyle');
    note.textContent=official?officialMsg:liveMsg;
    if(!force&&blob&&blobKey===key)return;
    pages.innerHTML='<div class="text-muted p-4"><span class="spinner-border spinner-border-sm me-2"></span>Preparing the document…</div>';
    try{
      const r=official?await fetch(`/api/templates/${id}/docx`,{credentials:'same-origin'}):await fetch('/api/templates/render-docx',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:b.value,title:val(el,'#te-n')||t.name})});
      if(!r.ok){let m='The document could not be prepared';try{m=(await r.json()).error||m}catch{}throw new Error(m)}
      blob=await r.blob();blobKey=key;pages.innerHTML='';styles.innerHTML='';
      if(!window.docx||!window.JSZip)throw new Error('The Word viewer did not load. Refresh the page and try again.');
      await window.docx.renderAsync(blob,pages,styles,{className:'docx',inWrapper:true,breakPages:true,ignoreWidth:false,ignoreHeight:false,experimental:false});
    }catch(e){blob=null;pages.innerHTML=`<div class="text-danger p-4"><i class="bx bx-error-circle me-1"></i>${X(e.message)}</div>`}}

  const val=(m,s)=>{const x=m.querySelector(s);return x?x.value.trim():''};
  const fname=()=>((val(el,'#te-n')||t.name||'template').replace(/[^\w\- ]+/g,'').trim()||'template')+'.docx';
  pWord.querySelector('#te-dl').onclick=async()=>{await renderWord();if(!blob)return;const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=t.has_docx&&t.docx_name?t.docx_name:fname();document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)};
  pWord.querySelector('#te-pr').onclick=async()=>{await renderWord();if(!blob)return;
    const f=document.createElement('iframe');f.className='tp-printframe';f.setAttribute('aria-hidden','true');document.body.appendChild(f);
    const d=f.contentDocument;d.open();d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${X(val(el,'#te-n')||t.name||'Template')}</title>${pWord.querySelector('#te-dstyle').innerHTML}<style>@page{margin:0}html,body{margin:0;background:#fff}.docx-wrapper{background:#fff!important;padding:0!important}.docx-wrapper>section.docx{box-shadow:none!important;margin:0!important}</style></head><body>${pWord.querySelector('#te-dpages').innerHTML}</body></html>`);d.close();
    setTimeout(()=>{try{f.contentWindow.focus();f.contentWindow.print()}catch{}setTimeout(()=>f.remove(),60000)},300)};
  const wh=pWord.querySelector('#te-wh');
  if(wh)wh.onclick=async()=>{try{const hs=await api(`/templates/${id}/docx-history`);
    if(!hs.length){toast('No earlier Word file yet. The old file is kept each time you replace this one.','info');return}
    const m=document.createElement('div');m.innerHTML=`<div class="modal fade" tabindex="-1"><div class="modal-dialog"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Earlier Word files</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body">${hs.map(h=>`<div class="d-flex align-items-center mb-2"><div class="flex-grow-1 min-w-0"><div class="text-truncate">${X(h.docx_name||'Word file')}</div><div class="text-muted small">${new Date(h.created_at).toLocaleString()} · ${X(h.by||'')} · ${h.labels} fields${h.note?' · '+X(h.note):''}</div></div><button type="button" class="btn btn-sm btn-outline-primary ms-2 wh-r" data-id="${h.id}">Restore</button></div>`).join('')}</div></div></div></div>`;
    document.body.appendChild(m.firstChild);const box=document.body.lastChild,bm=new bootstrap.Modal(box);box.addEventListener('hidden.bs.modal',()=>box.remove());bm.show();
    box.querySelectorAll('.wh-r').forEach(b=>b.onclick=async()=>{if(!await ask('The current Word file is kept in this list, so you can switch back.',{ok:'Yes, restore',icon:'bx-history',title:'Use this earlier Word file again?'}))return;
      try{const r=await api(`/templates/${id}/docx-restore/${b.dataset.id}`,{body:{}});bm.hide();toast('Earlier Word file restored','success');if(o.reopen)o.reopen()}catch(e){toast(e.message,'error')}})}catch(e){toast(e.message,'error')}};
  const uf=pWord.querySelector('#te-uf');
  if(uf){pWord.querySelector('#te-ul').onclick=()=>uf.click();
    uf.onchange=async()=>{const file=uf.files[0];uf.value='';if(!file)return;const fd=new FormData();fd.append('file',file);
      try{
        if(t.has_docx){
          // dry run first: show what the new file would change before anything goes live
          const pv=await api(`/templates/${id}/upload-docx?preview=1`,{body:fd}),li=a=>a.length?'<ul class="text-start mb-2 ps-3">'+a.slice(0,12).map(x=>'<li>'+X(x)+'</li>').join('')+(a.length>12?`<li>and ${a.length-12} more</li>`:'')+'</ul>':'';
          const msg=(pv.removed.length?`<div class="text-danger text-start"><b>These fields will no longer be filled (${pv.removed.length}):</b></div>${li(pv.removed)}`:'<div class="text-start text-success mb-2">No field was lost.</div>')+(pv.added.length?`<div class="text-start"><b>New fields with no company data yet (${pv.added.length}):</b></div>${li(pv.added)}`:'')+`<div class="text-start text-muted small">${pv.kept} field${pv.kept===1?'':'s'} stay the same. The file you replace is kept and can be restored from <b>Earlier Word files</b>.</div>`;
          if(!await ask(msg,{ok:pv.removed.length?'Replace anyway':'Yes, replace',icon:'bx-error',danger:!!pv.removed.length,title:'Replace the official form with this Word file?'}))return;
          fd.set('file',file);
          const r=await api(`/templates/${id}/upload-docx`,{body:fd});toast('Word form replaced'+(r.questions_added?`; ${r.questions_added} new wizard question${r.questions_added===1?'':'s'} added`:''),'success');if(o.reopen)o.reopen()}
        else{
          const r=await api('/templates/docx-to-html',{body:fd});const tmp=document.createElement('div');tmp.innerHTML=r.html;const nb=htmlToBody(tmp);
          if(!nb.trim())throw new Error('The Word file has no text');
          if(b.value.trim()&&!await ask('Save afterwards to keep it; Cancel in the editor discards it.',{ok:'Yes, load it',icon:'bx-error',title:'Replace the template text with the content of this Word file?'}))return;
          b.value=nb;changed();stale();paper.innerHTML=bodyToHtml(nb);toast('Word file loaded into the template','success');renderWord(true)}
      }catch(e){toast(e.message,'error')}}}

  function show(v){
    if(v===view)return;
    view=v;tabs.querySelectorAll('button').forEach(x=>{x.classList.toggle('on',x.dataset.v===v);x.setAttribute('aria-selected',x.dataset.v===v)});
    pText.classList.toggle('d-none',v!=='text');pPage.classList.toggle('d-none',v!=='page');pWord.classList.toggle('d-none',v!=='word');
    if(v==='page')paper.innerHTML=bodyToHtml(b.value);
    if(v==='word')renderWord()}
  tabs.querySelectorAll('button').forEach(x=>x.onclick=()=>show(x.dataset.v));
  // inserting a field from the side list while the page editor is open
  el._tpInsert=ins=>{
    if(view!=='page'||!can)return false;
    if(ins.includes('\n'))place(bodyToHtml(ins),true);else place(inline(ins),false);
    return true};
  // body changed behind the scenes (version restore)
  el._tpStale=stale;
  return {show}}

window.TPV={mount,bodyToHtml,htmlToBody};
})();
