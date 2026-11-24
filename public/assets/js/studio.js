// Doc Studio: sign, stamp and mark up PDFs, and turn photos into PDFs, then save the result straight into the client folder and the case.
// Everything is processed in the browser (pdf.js shows the pages, pdf-lib writes the result); the server only stores the finished file.
// Loaded BEFORE brela.js on studio.html: it only defines functions, they use brela.js helpers (api, esc, toast, ask, modal, S, ME, sz, badge...) when they run.
(()=>{
const g=id=>document.getElementById(id),uid=()=>Math.random().toString(36).slice(2,9),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const fetchBytes=async url=>{const r=await fetch(url,{credentials:'same-origin'});if(!r.ok)throw new Error('Could not open the file');return new Uint8Array(await r.arrayBuffer())};
const blobToDataUrl=b=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(new Error('Could not read the image'));r.readAsDataURL(b)});
const dataUrlToBytes=u=>{const b=atob(u.split(',')[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a};
const saveBlob=(blob,name)=>{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)};
const loadImage=src=>new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error('Could not read the image'));i.src=src});
const todayDMY=()=>{const d=new Date();return String(d.getDate()).padStart(2,'0')+' / '+String(d.getMonth()+1).padStart(2,'0')+' / '+d.getFullYear()};
const baseName=n=>String(n||'document').replace(/\.[^.]+$/,'');
const isPdfMime=m=>/pdf/i.test(m||''),isImgMime=m=>/^image\/(png|jpe?g|webp|gif)$/i.test(m||'');
const hexRgb=h=>{const m=/^#?([0-9a-f]{6})$/i.exec(h||'');const n=m?parseInt(m[1],16):0;return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
const RECENT='brela.studio.recent';
const recentGet=()=>{try{return JSON.parse(localStorage.getItem(RECENT)||'[]')}catch{return[]}};
const recentAdd=r=>{try{const k=r.caseId?'c'+r.caseId:'k'+r.clientId,l=[r,...recentGet().filter(x=>(x.caseId?'c'+x.caseId:'k'+x.clientId)!==k)].slice(0,6);localStorage.setItem(RECENT,JSON.stringify(l))}catch{}};

// ---- shared state (also used by studio-tools.js through window.SD)
const ST={ctx:{caseId:null,clientId:null,case:null,client:null},sigs:[],sigImg:{},view:'home',E:null,I:null,dirty:()=>false};
window.SD={ST,g,uid,clamp,fetchBytes,blobToDataUrl,dataUrlToBytes,saveBlob,loadImage,todayDMY,baseName,isPdfMime,isImgMime,hexRgb,
 setCtx:(...a)=>setCtx(...a),showSaved:(...a)=>showSaved(...a),home:()=>home(),loadSigs:()=>loadSigs(),ctxBar:()=>ctxBar(),docOptions:sel=>docOptions(sel)};

async function loadSigs(){try{ST.sigs=await api('/me/signatures')}catch{ST.sigs=[]}}
async function setCtx({caseId,clientId}){
 const c={caseId:null,clientId:null,case:null,client:null};
 if(caseId){c.case=await api('/cases/'+caseId);c.caseId=+caseId;clientId=c.case.case.client_id}
 if(clientId){c.client=await api('/clients/'+clientId);c.clientId=+clientId}
 ST.ctx=c;
 if(c.caseId||c.clientId)recentAdd({caseId:c.caseId,clientId:c.clientId,label:c.case?`${c.client.client.name} · ${c.case.case.code}`:c.client.client.name})}
const ctxFiles=()=>ST.ctx.client?ST.ctx.client.files:[];
const docName=f=>{const d=ST.ctx.case&&ST.ctx.case.docs.find(x=>x.id===f.case_doc_id);return d?d.name:(f.case_id?'Case file':'Client folder')};
const docOptions=sel=>ST.ctx.case?`<option value="">Client folder only (no checklist item)</option>`+opts(ST.ctx.case.docs,d=>`<option value="${d.id}" ${+sel===d.id?'selected':''}>${esc(d.name)}${d.done?' ✓':''}</option>`):'';
function ctxBar(){
 const c=ST.ctx;if(!c.clientId)return'<div class="text-muted small">No client chosen: you can edit and download, but nothing is saved to a case.</div>';
 const k=c.client.client,cs=c.case&&c.case.case;
 return`<div class="d-flex flex-wrap align-items-center gap-2"><i class="bx bx-user-circle font-size-20 text-primary"></i><b>${esc(k.name)}</b>${cs?`<span class="text-muted">·</span><a href="case-detail.html?id=${cs.id}">${esc(cs.code)}</a><span class="text-muted">${esc(cs.type)}</span>${badge(cs.status)}`:'<span class="text-muted">· client folder</span>'}</div>`}

// ======================================================= HOME
function home(){
 ST.view='home';const root=g('studio'),c=ST.ctx,has=!!c.clientId,files=ctxFiles().filter(f=>PV_OK(f.mime));
 const rec=recentGet().filter(r=>!(c.caseId&&r.caseId===c.caseId));
 root.innerHTML=`<p class="text-muted">Edit, sign and convert documents. What you finish is saved straight into the client folder and the case, ready for BRELA.</p>
 <div class="card"><div class="card-body"><div class="d-flex align-items-center gap-2 mb-3"><span class="sd-step">1</span><h5 class="mb-0">Where are you working?</h5></div>
  ${has?`<div class="d-flex flex-wrap align-items-center justify-content-between gap-2 p-3 border rounded-3 bg-light-subtle">${ctxBar()}<button type="button" class="btn btn-light btn-sm" id="sd-change">Change</button></div>`:
  `<div class="position-relative"><div class="sd-pick d-flex align-items-center gap-2 px-3" style="height:46px"><i class="bx bx-search text-primary font-size-20"></i><input id="sd-q" class="form-control border-0 shadow-none px-0" placeholder="Search a client, case code or BRELA track number" autocomplete="off"></div><div id="sd-res" class="sd-results" style="display:none"></div></div>
  ${rec.length?`<div class="d-flex flex-wrap align-items-center gap-2 mt-3"><small class="text-muted me-1">Recent</small>${opts(rec,r=>`<button type="button" class="btn btn-sm btn-outline-secondary rounded-pill sd-rec" data-c="${r.caseId||''}" data-k="${r.clientId||''}">${esc(r.label)}</button>`)}</div>`:''}`}
 </div></div>
 <div class="d-flex align-items-center gap-2 mb-2 mt-4"><span class="sd-step">2</span><h5 class="mb-0">What do you want to do?</h5></div>
 <div class="row g-3 mb-4">
  <div class="col-md-6 col-xl-3"><div class="card h-100 mb-0"><div class="sd-tile"><div class="sd-tico"><i class="mdi mdi-draw"></i></div><div><h6 class="mb-1">Sign a document</h6><div class="text-muted">Place your signature, stamp, date and text on a PDF.</div></div><div class="flex-grow-1"></div><div class="d-flex gap-2 flex-wrap"><button type="button" class="btn btn-primary" id="sd-t-sign"><i class="bx bx-folder-open me-1"></i>${has?'Choose from the folder':'Open a PDF'}</button>${has?'<button type="button" class="btn btn-light" id="sd-dev"><i class="bx bx-laptop me-1"></i>Device</button>':''}</div></div></div></div>
  <div class="col-md-6 col-xl-3"><div class="card h-100 mb-0"><div class="sd-tile"><div class="sd-tico"><i class="bx bx-images"></i></div><div><h6 class="mb-1">Images to PDF</h6><div class="text-muted">Turn photos of IDs and certificates into one clean, small PDF.</div></div><div class="flex-grow-1"></div><button type="button" class="btn btn-outline-primary" id="sd-t-img">Choose images<i class="bx bx-chevron-right ms-1"></i></button></div></div></div>
  <div class="col-md-6 col-xl-3"><div class="card h-100 mb-0"><div class="sd-tile"><div class="sd-tico"><i class="mdi mdi-format-text"></i></div><div><h6 class="mb-1">Edit text &amp; whiteout</h6><div class="text-muted">Click any text in a PDF and retype it in place, cover details, add notes and highlights.</div></div><div class="flex-grow-1"></div><button type="button" class="btn btn-outline-primary" id="sd-t-edit">Open a PDF<i class="bx bx-chevron-right ms-1"></i></button></div></div></div>
  <div class="col-md-6 col-xl-3"><div class="card h-100 mb-0"><div class="sd-tile disabled"><div class="sd-tico"><i class="bx bx-layer"></i></div><div><h6 class="mb-1">Merge, split &amp; compress</h6><div class="text-muted">Build the filing pack and fit the upload size limit.</div></div><div class="flex-grow-1"></div><span class="badge bg-secondary-subtle text-secondary align-self-start">Next phase</span></div></div></div>
 </div>
 <input type="file" id="sd-devf" accept="application/pdf" hidden>
 <div class="card" id="sd-files"><div class="card-body">${has?`<div class="d-flex align-items-center justify-content-between mb-2"><h5 class="mb-0">Ready to work on</h5><span class="badge bg-light text-body">${files.length} file${files.length===1?'':'s'}</span></div>
  ${files.length?`<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>File</th><th>Checklist item</th><th>Type</th><th class="text-end">Open in Studio</th></tr></thead><tbody>${opts(files,f=>`<tr><td><i class="bx ${isPdfMime(f.mime)?'bx-file':'bx-image'} me-1 text-muted"></i><b>${esc(f.filename)}</b> <small class="text-muted">${sz(f.size)}</small></td><td>${esc(docName(f))}</td><td><span class="badge ${isPdfMime(f.mime)?'bg-info-subtle text-info':'bg-warning-subtle text-warning'}">${isPdfMime(f.mime)?'PDF':'Image'}</span></td><td class="text-end">${isPdfMime(f.mime)?`<button type="button" class="btn btn-primary btn-sm sd-open" data-id="${f.id}">Sign / edit</button>`:`<button type="button" class="btn btn-outline-primary btn-sm sd-toimg" data-id="${f.id}">Convert to PDF</button>`}</td></tr>`)}</tbody></table></div>`:'<p class="text-muted mb-0">This folder has no PDFs or images yet. Upload files on the client or case page, or start from your device.</p>'}`:
  '<p class="text-muted mb-0">Choose a client or case above to see its documents here. They open in one click and the result is saved back automatically.</p>'}</div></div>`;
 // search
 const q=g('sd-q');
 if(q){let sel=-1;const res=g('sd-res'),close=()=>{res.style.display='none';res.innerHTML='';sel=-1};
  const draw=()=>{const v=q.value.trim().toLowerCase();if(v.length<1)return close();
   const cs=S.cases.filter(x=>[x.code,x.client,x.type,x.track_number].some(t=>String(t||'').toLowerCase().includes(v))).slice(0,6),
    ks=S.clients.filter(x=>[x.name,x.phone,x.track_number].some(t=>String(t||'').toLowerCase().includes(v))).slice(0,5);
   res.innerHTML=(cs.length?`<div class="px-3 pt-1 sd-eyebrow">Cases</div>`+opts(cs,x=>`<a href="#" data-c="${x.id}"><i class="bx bx-briefcase-alt text-primary font-size-18"></i><span class="flex-grow-1 text-truncate"><b>${esc(x.client)}</b> <span class="text-muted">· ${esc(x.code)} · ${esc(x.type)}</span></span>${badge(x.status)}</a>`):'')+
    (ks.length?`<div class="px-3 pt-1 sd-eyebrow">Clients (folder only)</div>`+opts(ks,x=>`<a href="#" data-k="${x.id}"><i class="bx bx-user-circle text-primary font-size-18"></i><span class="flex-grow-1 text-truncate">${esc(x.name)}</span></a>`):'')||'<div class="px-3 py-2 text-muted">No client or case matches.</div>';
   res.style.display='block';
   res.querySelectorAll('a[data-c],a[data-k]').forEach(a=>a.onclick=async e=>{e.preventDefault();await pick({caseId:a.dataset.c,clientId:a.dataset.k})})};
  q.oninput=draw;q.onfocus=draw;q.onkeydown=e=>{if(e.key==='Escape')close();if(e.key==='Enter'){e.preventDefault();const a=res.querySelector('a');if(a)a.click()}};
  document.addEventListener('click',function h(e){if(!g('sd-res')){document.removeEventListener('click',h);return}if(!e.target.closest('#sd-q,#sd-res'))close()})}
 const pick=async r=>{try{await setCtx(r);home()}catch(e){toast(e.message,'error')}};
 root.querySelectorAll('.sd-rec').forEach(b=>b.onclick=()=>pick({caseId:b.dataset.c||null,clientId:b.dataset.k||null}));
 const ch=g('sd-change');if(ch)ch.onclick=()=>{ST.ctx={caseId:null,clientId:null,case:null,client:null};home()};
 root.querySelectorAll('.sd-open').forEach(b=>b.onclick=()=>openFile(+b.dataset.id));
 root.querySelectorAll('.sd-toimg').forEach(b=>b.onclick=()=>window.SD.openImages({preselect:+b.dataset.id}));
 const dev=g('sd-devf'),pickDev=()=>dev.click();
 const sg=g('sd-dev');if(sg)sg.onclick=pickDev;
 const goPdf=()=>{if(has&&files.some(f=>isPdfMime(f.mime)))g('sd-files').scrollIntoView({behavior:'smooth',block:'start'});else pickDev()};
 g('sd-t-sign').onclick=goPdf;g('sd-t-edit').onclick=goPdf;
 g('sd-t-img').onclick=()=>window.SD.openImages({});
 dev.onchange=async()=>{const f=dev.files[0];if(!f)return;dev.value='';if(!/pdf/i.test(f.type)&&!/\.pdf$/i.test(f.name))return toast('Choose a PDF file','error');openEditor({bytes:new Uint8Array(await f.arrayBuffer()),name:f.name})}}

async function openFile(id){
 try{const info=await api('/files/'+id+'/info');
  if(info.case_id&&ST.ctx.caseId!==info.case_id)await setCtx({caseId:info.case_id});else if(!info.case_id&&info.client_id&&ST.ctx.clientId!==info.client_id)await setCtx({clientId:info.client_id});
  if(isImgMime(info.mime))return window.SD.openImages({preselect:id});
  if(!isPdfMime(info.mime)){toast('Only PDFs and images can be opened here','warn');return home()}
  g('studio').innerHTML='<div class="text-center text-muted py-5"><i class="bx bx-loader-alt bx-spin font-size-24"></i><div>Opening the document…</div></div>';
  openEditor({bytes:await fetchBytes('/api/files/'+id),name:info.filename,fileId:id,caseDocId:info.case_doc_id,uploadedBy:info.uploaded_by})}
 catch(e){toast(e.message,'error');home()}}

// ======================================================= SIGN / EDIT EDITOR
const styleText=(n,it)=>{n.style.fontWeight=it.bold?'700':'400';n.style.fontStyle=it.italic?'italic':'normal';n.style.textDecoration=[it.underline&&'underline',it.strike&&'line-through'].filter(Boolean).join(' ')||'none'};
const FONTS={helv:['Helvetica','Helvetica, Arial, sans-serif'],times:['Times','"Times New Roman", Times, serif'],cour:['Courier','"Courier New", monospace']};
const INKS=['#1b1f2a','#1d3fbf','#3b2d8f'];
let E=null;
async function openEditor(o){
 if(!window.pdfjsLib||!window.PDFLib)return toast('The PDF tools did not load. Refresh the page.','error');
 pdfjsLib.GlobalWorkerOptions.workerSrc='assets/libs/pdfjs/pdf.worker.min.js';
 let pdf;try{pdf=await pdfjsLib.getDocument({data:o.bytes.slice()}).promise}catch(e){toast(e&&e.name==='PasswordException'?'This PDF is password-protected. Remove the password first.':'This file could not be opened as a PDF.','error');return home()}
 if(pdf.numPages>80){toast('This PDF has '+pdf.numPages+' pages. Doc Studio handles up to 80 pages.','error');return home()}
 try{await PDFLib.PDFDocument.load(o.bytes)}catch{toast('This PDF is protected or damaged, so it cannot be edited here.','error');return home()}
 E={...o,origBytes:o.bytes,pagesChanged:false,pdf,items:[],imgs:{},sel:null,tool:'select',armed:null,undo:[],redo:[],zoom:1,pg:[],saved:false,changed:false,font:'helv',color:'#1b1f2a',size:12,bold:false,italic:false,underline:false,strike:false,mode:'new'};
 ST.view='sign';ST.dirty=()=>E&&E.changed;
 shell();await renderPages();
 if(!ST.sigs.length)toast('Create your signature first (right side), then click the page to place it.','info',6000)}

function shell(){
 const c=ST.ctx,has=!!c.clientId,cs=c.case&&c.case.case,file=E.fileId?ctxFiles().find(f=>f.id===E.fileId):null,canReplace=!!E.fileId&&has&&(CAN('files.manage')||E.uploadedBy===ME.id);
 const docs=c.case?c.case.docs:[],ready=docs.filter(d=>d.done).length;
 g('studio').innerHTML=`<div class="d-flex flex-wrap align-items-center gap-2 mb-3"><div class="flex-grow-1 min-w-0"><div class="small text-muted"><a href="#" id="sd-back">Doc Studio</a>${has?` / ${esc(c.client.client.name)}${cs?' / '+esc(cs.code):''}`:''}</div><div class="d-flex align-items-center gap-2"><h5 class="mb-0 text-truncate">${esc(E.name)}</h5><span class="badge bg-warning-subtle text-warning" id="sd-dirty" style="display:none">Unsaved changes</span></div></div><button type="button" class="btn btn-outline-secondary" id="sd-dl"><i class="bx bx-download me-1"></i>Download copy</button><button type="button" class="btn btn-light text-danger" id="sd-discard">Discard changes</button></div>
 <div class="sd-shell">
  <div class="sd-left"><div class="card mb-0"><div class="card-body">
   <div class="sd-colh"><div class="sd-eyebrow">Working in</div><button type="button" class="sd-col-btn" id="sd-col-l" aria-expanded="true" aria-label="Hide this panel" title="Hide this panel for more room"><i class="bx bx-chevrons-left"></i></button></div><div class="sd-colb">${ctxBar()}
   ${c.case?`<div class="d-flex justify-content-between align-items-center mt-3 mb-1"><div class="sd-eyebrow">Case documents</div><span class="badge bg-light text-body">${ready} of ${docs.length} ready</span></div>${opts(docs,d=>`<div class="mb-1"><div class="d-flex align-items-center gap-2 px-1"><span class="sd-dot ${d.done?'':'todo'}">${d.done?'<i class="bx bx-check"></i>':''}</span><span class="fw-medium small flex-grow-1">${esc(d.name)}</span></div>${opts(d.files.filter(f=>PV_OK(f.mime)),f=>`<div class="sd-doc ${f.id===E.fileId?'on':''} ms-3 sd-sw" data-id="${f.id}" data-pdf="${isPdfMime(f.mime)?1:0}"><i class="bx ${isPdfMime(f.mime)?'bx-file':'bx-image'} text-muted"></i><span class="small flex-grow-1 text-truncate">${esc(f.filename)}</span>${f.id===E.fileId?'<span class="badge bg-primary-subtle text-primary">Editing</span>':`<span class="small text-primary">${isPdfMime(f.mime)?'Open':'To PDF'}</span>`}</div>`)}</div>`)}`:''}
   ${has?`<div class="sd-eyebrow mt-3 mb-1">Other files in the client folder</div>${opts(ctxFiles().filter(f=>PV_OK(f.mime)&&!(c.case&&c.case.docs.some(d=>d.files.some(x=>x.id===f.id)))).slice(0,12),f=>`<div class="sd-doc sd-sw" data-id="${f.id}" data-pdf="${isPdfMime(f.mime)?1:0}"><i class="bx ${isPdfMime(f.mime)?'bx-file':'bx-image'} text-muted"></i><span class="small flex-grow-1 text-truncate">${esc(f.filename)}</span><span class="small text-muted">${sz(f.size)}</span></div>`)||'<div class="small text-muted">None.</div>'}`:''}</div>
  </div></div></div>
  <div class="sd-main"><div class="card mb-0"><div class="sd-bar" id="sd-bar">
    ${[['select','bx-pointer','Select'],['text','mdi mdi-format-text','Text'],['edittext','bx-edit-alt','Edit text'],['sign','mdi mdi-draw','Sign'],['stamp','mdi mdi-stamper','Stamp'],['date','bx-calendar','Date'],['whiteout','bx-square','Whiteout'],['hl','bx-highlight','Highlight'],['image','bx-image','Image']].map(([k,ic,l])=>`<button type="button" class="sd-tool ${k==='select'?'on':''}" data-t="${k}"><i class="${ic.includes(' ')?ic:'bx '+ic}"></i>${l}</button>`).join('')}
    <span class="sd-sep"></span><button type="button" class="sd-tool" id="sd-undo" aria-label="Undo" disabled><i class="bx bx-undo"></i>Undo</button><button type="button" class="sd-tool" id="sd-redo" aria-label="Redo" disabled><i class="bx bx-redo"></i>Redo</button><button type="button" class="sd-tool" id="sd-pages" aria-label="Page tools: rotate, delete, reorder, add pages"><i class="bx bx-layout"></i>Pages</button>
    <span class="flex-grow-1"></span><button type="button" class="sd-tool" id="sd-zo" aria-label="Zoom out" style="min-width:36px"><i class="bx bx-zoom-out"></i></button><span class="small fw-medium text-center" id="sd-zl" style="min-width:42px">100%</span><button type="button" class="sd-tool" id="sd-zi" aria-label="Zoom in" style="min-width:36px"><i class="bx bx-zoom-in"></i></button></div>
   <div class="sd-stage" id="sd-stage"><div class="text-center text-muted py-5"><i class="bx bx-loader-alt bx-spin font-size-24"></i></div></div></div></div>
  <div class="sd-right">
   <div class="card mb-0"><div class="card-body"><div class="d-flex justify-content-between align-items-center mb-2"><div class="sd-eyebrow">My signatures &amp; stamps</div><span class="d-flex align-items-center gap-2"><small class="text-muted sd-only"><i class="bx bx-lock-alt"></i> Only you</small><button type="button" class="sd-col-btn" id="sd-col-s" aria-expanded="true" aria-label="Hide signatures and stamps" title="Hide for more room"><i class="bx bx-chevron-up"></i></button></span></div><div class="sd-colb" id="sd-sigbox"><div id="sd-sigs"></div><div class="d-flex gap-2 mt-2"><button type="button" class="btn btn-outline-secondary flex-fill" id="sd-newsig" style="border-style:dashed"><i class="bx bx-plus me-1"></i>Signature</button><button type="button" class="btn btn-outline-secondary flex-fill" id="sd-newstamp" style="border-style:dashed"><i class="bx bx-plus me-1"></i>Stamp</button></div></div></div></div>
   <div class="card mb-0"><div class="card-body" id="sd-props"></div></div>
   <div class="card mb-0 flex-grow-1"><div class="card-body d-flex flex-column gap-2 h-100"><div class="sd-eyebrow">Save to the case</div>
    ${has?`<div class="small">${esc(c.client.client.name)}${cs?` › ${esc(cs.code)}`:''}</div>
     ${c.case?`<label class="form-label small mb-0">Checklist item</label><select class="form-select form-select-sm" id="sd-doc">${docOptions(E.caseDocId)}</select>`:''}
     <label class="form-label small mb-0">File name</label><input class="form-control form-control-sm" id="sd-name" value="${esc(baseName(E.name))} (signed).pdf">
     <div class="form-check mb-0"><input class="form-check-input" type="radio" name="sd-mode" id="sd-m-new" value="new" checked><label class="form-check-label" for="sd-m-new">Save as a new file<br><small class="text-muted">the original stays untouched</small></label></div>
     ${canReplace?`<div class="form-check mb-0"><input class="form-check-input" type="radio" name="sd-mode" id="sd-m-rep" value="replace"><label class="form-check-label" for="sd-m-rep">Replace the original</label></div>`:''}
     ${c.case?`<div class="form-check mb-0"><input class="form-check-input" type="checkbox" id="sd-done" checked><label class="form-check-label" for="sd-done">Mark this checklist item ready</label></div>`:''}
     <div class="flex-grow-1"></div><button type="button" class="btn btn-primary btn-lg" id="sd-save"><i class="bx bx-check me-1"></i>Apply &amp; save to case</button><small class="text-muted text-center">Recorded in the case history and audit log</small>`:
     `<p class="text-muted small mb-0">This file is from your device, so it is not tied to a client. Use <b>Download copy</b> when you are done, or go back and choose a client first.</p>`}
   </div></div>
  </div></div>`;
 g('sd-back').onclick=async e=>{e.preventDefault();if(await leave())home()};
 g('sd-dl').onclick=()=>run(g('sd-dl'),async()=>{const b=await build();saveBlob(new Blob([b],{type:'application/pdf'}),`${baseName(E.name)} (signed).pdf`);toast('Downloaded','success',2500)});
 g('sd-pages').onclick=pagesDialog;
 g('sd-discard').onclick=async()=>{if(!E.items.length&&!E.pagesChanged)return toast('Nothing to discard','info',2000);if(await ask(E.pagesChanged?'Remove everything you added and undo all page changes (rotate, delete, reorder, new pages)?':'Remove everything you added to this document?',{danger:true,ok:'Yes, discard',title:'Discard changes'})){if(E.pagesChanged){E.bytes=E.origBytes;E.pdf=await pdfjsLib.getDocument({data:E.bytes.slice()}).promise;E.pagesChanged=false;E.undo=[];E.redo=[];E.items=[];E.sel=null;E.changed=false;await renderPages();props();dirty();btns();return}push();E.items=[];E.sel=null;E.changed=false;drawItems();props();dirty()}};
 g('sd-bar').querySelectorAll('[data-t]').forEach(b=>b.onclick=()=>tool(b.dataset.t));
 g('sd-undo').onclick=undo;g('sd-redo').onclick=redo;
 g('sd-zi').onclick=()=>zoom(.15);g('sd-zo').onclick=()=>zoom(-.15);
 g('studio').querySelectorAll('.sd-sw').forEach(d=>d.onclick=async()=>{if(!await leave())return;d.dataset.pdf==='1'?openFile(+d.dataset.id):window.SD.openImages({preselect:+d.dataset.id})});
 // collapsible side panels: more room for the page; the choice is remembered
 {const LS={get:k=>{try{return localStorage.getItem(k)==='1'}catch{return false}},set:(k,v)=>{try{localStorage.setItem(k,v?'1':'0')}catch{}}};
  const left=document.querySelector('.sd-left'),box=g('sd-sigbox');
  const setL=(off,keep)=>{left.classList.toggle('off',off);E.wide=off;const b=g('sd-col-l');b.setAttribute('aria-expanded',String(!off));b.title=off?'Show documents':'Hide this panel for more room';b.setAttribute('aria-label',b.title);b.firstElementChild.className='bx '+(off?'bx-chevrons-right':'bx-chevrons-left');if(!keep){LS.set('sd-l-off',off);renderPages()}};
  const setS=off=>{box.classList.toggle('d-none',off);g('sd-col-s').closest('.card-body').classList.toggle('sd-closed',off);const b=g('sd-col-s');b.setAttribute('aria-expanded',String(!off));b.title=off?'Show signatures and stamps':'Hide for more room';b.setAttribute('aria-label',b.title);b.firstElementChild.className='bx '+(off?'bx-chevron-down':'bx-chevron-up');LS.set('sd-s-off',off)};
  g('sd-col-l').onclick=()=>setL(!left.classList.contains('off'));
  g('sd-col-s').onclick=()=>setS(!box.classList.contains('d-none'));
  if(LS.get('sd-l-off'))setL(true,true);if(LS.get('sd-s-off'))setS(true)}
 g('sd-newsig').onclick=()=>window.SD.signatureDialog({kind:'signature',onSaved:async()=>{await loadSigs();sigList()}});
 g('sd-newstamp').onclick=()=>window.SD.signatureDialog({kind:'stamp',onSaved:async()=>{await loadSigs();sigList()}});
 const sv=g('sd-save');if(sv)sv.onclick=()=>run(sv,saveToCase);
 sigList();props()}

const run=async(btn,fn)=>{const h=btn.innerHTML;btn.disabled=true;btn.innerHTML='<i class="bx bx-loader-alt bx-spin me-1"></i>Working…';try{await fn()}catch(e){toast(e.message||'Something went wrong','error')}finally{btn.disabled=false;btn.innerHTML=h}};
const leave=async()=>!E||!E.changed||await ask('You have unsaved changes in this document. Leave without saving?',{ok:'Leave',title:'Unsaved changes',icon:'bx-error'});
const dirty=()=>{const d=g('sd-dirty');if(d)d.style.display=E&&E.changed?'':'none'};
// Guard every way out while there are unsaved changes. In-app links (sidebar, topbar,
// case links) show the same custom dialog as the Back link; the browser owns the text
// of its own beforeunload prompt, so that stays only for tab close / reload / external.
let leaving=false;
document.addEventListener('click',e=>{
 if(leaving||ST.view!=='sign'||!E||!E.changed||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
 const a=e.target.closest('a[href]');
 if(!a)return;
 const href=a.getAttribute('href');
 if(!href||href.startsWith('#')||a.target==='_blank'||a.hasAttribute('download'))return;
 e.preventDefault();e.stopImmediatePropagation();
 (async()=>{if(await leave()){leaving=true;location.href=a.href}})();
},true);
window.addEventListener('beforeunload',e=>{if(!leaving&&E&&E.changed&&ST.view==='sign'){e.preventDefault();e.returnValue=''}});

// ---- signatures panel
function sigList(){
 const el=g('sd-sigs');if(!el)return;
 el.innerHTML=ST.sigs.length?opts(ST.sigs,s=>`<div class="sd-sig mb-2 ${E.armed&&E.armed.sigId===s.id?'on':''}" data-id="${s.id}" role="button" tabindex="0"><img src="/api/me/signatures/${s.id}/image" alt="${esc(s.name)}"><span class="flex-grow-1 small fw-medium text-truncate">${esc(s.name)}</span>${s.is_default?'<span class="badge bg-primary-subtle text-primary">Default</span>':s.kind==='stamp'?'<span class="badge bg-light text-body">Stamp</span>':''}<button type="button" class="btn btn-icon btn-light text-danger sd-sdel" data-id="${s.id}" aria-label="Delete ${esc(s.name)}" style="width:26px;height:26px"><i class="bx bx-trash" style="font-size:15px"></i></button></div>`):'<p class="text-muted small mb-0">No signatures yet. Draw, type or upload one below, then click the page to place it.</p>';
 el.querySelectorAll('.sd-sig').forEach(d=>{const act=()=>armSig(+d.dataset.id);d.onclick=e=>{if(e.target.closest('.sd-sdel'))return;act()};d.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act()}}});
 el.querySelectorAll('.sd-sdel').forEach(b=>b.onclick=async e=>{e.stopPropagation();if(!await ask('Delete this saved signature? Documents you already signed are not changed.',{danger:true,ok:'Yes, delete',title:'Delete signature'}))return;try{await api('/me/signatures/'+b.dataset.id,{method:'DELETE'});await loadSigs();if(E.armed&&E.armed.sigId===+b.dataset.id)tool('select');sigList()}catch(x){toast(x.message,'error')}})}
async function sigImage(sigId,ink){
 const key=sigId+':'+(ink||'');if(E.imgs[key])return key;
 let base=ST.sigImg[sigId];if(!base){const r=await fetch(`/api/me/signatures/${sigId}/image`,{credentials:'same-origin'});if(!r.ok)throw new Error('Could not load the signature');base=ST.sigImg[sigId]=await blobToDataUrl(await r.blob())}
 const im=await loadImage(base);let url=base;
 if(ink){const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);x.globalCompositeOperation='source-in';x.fillStyle=ink;x.fillRect(0,0,c.width,c.height);url=c.toDataURL('image/png')}
 E.imgs[key]={url,w:im.naturalWidth,h:im.naturalHeight};return key}
function armSig(id){const s=ST.sigs.find(x=>x.id===id);if(!s)return;E.armed={sigId:id,kind:s.kind};setTool(s.kind==='stamp'?'stamp':'sign');sigList();toast('Click on the page where it should go','info',2500)}

// ---- tools
function tool(t){
 if(t==='sign'||t==='stamp'){const l=ST.sigs.filter(s=>t==='stamp'?s.kind==='stamp':s.kind==='signature');if(!l.length){toast(t==='stamp'?'Add a stamp first (right side, + Stamp).':'Create a signature first (right side, + Signature).','warn');return}
  if(!E.armed||!l.some(s=>s.id===E.armed.sigId))E.armed={sigId:(l.find(s=>s.is_default)||l[0]).id,kind:t==='stamp'?'stamp':'signature'}}
 if(t==='image'){const f=document.createElement('input');f.type='file';f.accept='image/png,image/jpeg,image/webp';f.onchange=()=>{const file=f.files[0];if(!file)return;window.SD.imageDialog(file,({url,w,h})=>{const k='u'+uid();E.imgs[k]={url,w,h,jpg:/^data:image\/jpeg/.test(url)};E.armed={imgKey:k};setTool('image');toast('Click on the page where it should go','info',2500)})};f.click();return}
 if(t==='edittext'&&E.pg.every(p=>!(p.segs&&p.segs.length)))toast('No editable text was found. This PDF is probably a scan or photo, so use Whiteout and Text instead.','warn',6500);
 if(t==='whiteout')toast('Whiteout covers the content but does not remove it from the file, so do not use it to hide confidential data.','warn',6000);
 setTool(t)}
function setTool(t){E.tool=t;if(t!=='select')select(null);g('sd-bar').querySelectorAll('[data-t]').forEach(b=>b.classList.toggle('on',b.dataset.t===t));E.pg.forEach(p=>p.layer.classList.toggle('place',t!=='select'));mountSegs();props()}

// ---- pages
async function renderPages(){
 const stage=g('sd-stage');if(!stage)return;stage.innerHTML='';E.pg=[];
 const dispW=clamp(stage.clientWidth-36,300,E.wide?1100:860)*E.zoom,dpr=Math.min(2,window.devicePixelRatio||1);
 for(let i=1;i<=E.pdf.numPages;i++){
  const page=await E.pdf.getPage(i),v1=page.getViewport({scale:1}),sc=dispW/v1.width,vp=page.getViewport({scale:sc});
  const wrap=document.createElement('div');wrap.className='sd-page';wrap.style.width=vp.width+'px';wrap.style.height=vp.height+'px';
  const cv=document.createElement('canvas');cv.width=Math.floor(vp.width*dpr);cv.height=Math.floor(vp.height*dpr);cv.style.width=vp.width+'px';cv.style.height=vp.height+'px';
  const layer=document.createElement('div');layer.className='sd-layer'+(E.tool!=='select'?' place':'');layer.dataset.p=i-1;
  const pn=document.createElement('div');pn.className='sd-pn';pn.textContent='Page '+i+' of '+E.pdf.numPages;
  wrap.append(cv,layer,pn);stage.appendChild(wrap);
  E.pg[i-1]={w:vp.width,h:vp.height,pw:v1.width,ph:v1.height,layer,wrap,cv,segs:[]};
  bindLayer(layer,i-1);
  await page.render({canvasContext:cv.getContext('2d'),viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
  try{E.pg[i-1].segs=buildSegs(await page.getTextContent(),v1,i-1)}catch{}
  if(i===1)drawItems()}
 drawItems()}
function zoom(d){E.zoom=clamp(Math.round((E.zoom+d)*100)/100,.5,2);g('sd-zl').textContent=Math.round(E.zoom*100)+'%';renderPages()}

// ---- edit existing text: find the text lines pdf.js reads from the page
const fontKey=n=>/courier|mono|consol/i.test(n||'')?'cour':/times|serif|georgia|garamond|minion|cambria|palatino|book/i.test(n||'')&&!/sans/i.test(n||'')?'times':'helv';
function buildSegs(tc,v1,pi){
 const runs=[];
 for(const it of tc.items){
  if(!it.str||!it.str.trim())continue;
  const t=pdfjsLib.Util.transform(v1.transform,it.transform),size=Math.hypot(t[2],t[3]);
  if(size<3||Math.abs(t[1])>Math.abs(t[0])*.2)continue;
  const st=tc.styles&&tc.styles[it.fontName]||{};
  runs.push({str:it.str,x:t[4],base:t[5],size,w:it.width*v1.scale,fam:(st.fontFamily||'')+' '+(it.fontName||'')})}
 runs.sort((a,b)=>a.base-b.base||a.x-b.x);
 const lines=[];
 for(const r of runs){
  const l=lines.find(l=>Math.abs(l.base-r.base)<Math.max(l.size,r.size)*.35&&r.x-(l.x+l.w)<Math.max(l.size,r.size)*.6&&r.x-(l.x+l.w)>-Math.max(l.size,r.size)*.5);
  if(l){const gap=r.x-(l.x+l.w);l.str+=(gap>l.size*.18&&!/\s$/.test(l.str)&&!/^\s/.test(r.str)?' ':'')+r.str;l.w=Math.max(l.w,r.x+r.w-l.x);l.size=Math.max(l.size,r.size)}
  else lines.push({...r})}
 return lines.map((l,i)=>({id:'s'+pi+'-'+i,str:l.str.replace(/\s+$/,''),x:l.x,base:l.base,w:l.w,size:l.size,font:fontKey(l.fam),bold:/bold|black|heavy/i.test(l.fam),italic:/italic|oblique/i.test(l.fam)}))}
function sampleBox(p,sg){
 const cv=p.cv,k=cv.width/p.w,x=Math.max(0,Math.floor(sg.x/p.pw*p.w*k)),y=Math.max(0,Math.floor((sg.base-sg.size*.9)/p.ph*p.h*k)),w=Math.max(1,Math.min(cv.width-x,Math.ceil(sg.w/p.pw*p.w*k))),h=Math.max(1,Math.min(cv.height-y,Math.ceil(sg.size*1.15/p.ph*p.h*k)));
 const d=cv.getContext('2d').getImageData(x,y,w,h).data,cnt=new Map();let best=0,bk=0;
 for(let i=0;i<d.length;i+=4){const key=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4),n=(cnt.get(key)||0)+1;cnt.set(key,n);if(n>best){best=n;bk=key}}
 let sr=0,sg2=0,sb=0,sn=0;for(let i=0;i<d.length;i+=4){const key=((d[i]>>4)<<8)|((d[i+1]>>4)<<4)|(d[i+2]>>4);if(key===bk){sr+=d[i];sg2+=d[i+1];sb+=d[i+2];sn++}}
 const bg=[sr/sn,sg2/sn,sb/sn];let far=0,fc=[27,31,42];
 for(let i=0;i<d.length;i+=4){const dist=Math.hypot(d[i]-bg[0],d[i+1]-bg[1],d[i+2]-bg[2]);if(dist>far){far=dist;fc=[d[i],d[i+1],d[i+2]]}}
 const hx=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
 return{bg:hx(bg),ink:far>80?hx(fc):'#1b1f2a'}}
function mountSegs(){
 if(!E)return;E.pg.forEach(p=>p.layer.querySelectorAll('.sd-tx').forEach(n=>n.remove()));
 if(E.tool!=='edittext')return;
 E.pg.forEach((p,pi)=>(p.segs||[]).forEach(sg=>{
  if(E.items.some(i=>i.seg===sg.id))return;
  const n=document.createElement('div');n.className='sd-tx';n.title='Click to edit this text';
  n.style.left=(sg.x-2)/p.pw*p.w+'px';n.style.top=(sg.base-sg.size*.88)/p.ph*p.h+'px';n.style.width=(sg.w+4)/p.pw*p.w+'px';n.style.height=sg.size*1.15/p.ph*p.h+'px';
  n.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();editSeg(pi,sg)});p.layer.appendChild(n)}))}
function editSeg(pi,sg){
 const p=E.pg[pi],c=sampleBox(p,sg);push();
 const pad=1.5,rect={id:uid(),t:'rect',p:pi,seg:sg.id,fill:c.bg,x:(sg.x-pad)/p.pw,y:(sg.base-sg.size*.9)/p.ph,w:(sg.w+pad*2)/p.pw,h:sg.size*1.2/p.ph};
 const txt={id:uid(),t:'text',p:pi,x:(sg.x-1)/p.pw,y:(sg.base-sg.size*.98)/p.ph,w:.2,h:.03,text:sg.str,size:Math.round(sg.size*10)/10,color:c.ink,font:sg.font,bold:!!sg.bold,italic:!!sg.italic,orig:sg.str};
 E.items.push(rect,txt);E.changed=true;E.sel=txt.id;drawItems();props();dirty();
 setTimeout(()=>{const t=g('sd-ptext');if(t){t.focus();t.select()}},30)}

// ---- page tools: rotate, delete, reorder and add blank pages
async function pagesDialog(){
 if(!E)return;
 const n0=E.pdf.numPages,thumbs=[],N=E.pdf.numPages;
 const used=new Set(E.items.map(i=>i.p));
 let st=Array.from({length:n0},(_,i)=>({src:i,rot:0,del:false}));
 const el=modal('Pages',`<p class="text-muted small mb-3">Rotate, delete, reorder or add blank pages. Nothing changes until you press <b>Apply</b>. After applying, use <b>Discard changes</b> to go back to the original.</p><div id="pg-grid" class="sd-pgrid"></div>`,'Apply page changes',async()=>{
  const keep=st.filter(x=>!x.del);if(!keep.length)throw new Error('Keep at least one page');
  const lost=E.items.filter(i=>!i.all&&st.some(x=>x.src===i.p&&x.del)).length;
  if(!st.some(x=>x.src===null||x.del||x.rot)&&st.every((x,i)=>x.src===i))throw new Error('No page changes to apply');
  if(lost&&!await ask(`Deleting these pages also removes ${lost} item${lost===1?'':'s'} you placed on them.`,{danger:true,ok:'Yes, apply',title:'Delete pages'}))throw new Error('Cancelled');
  await applyPages(st)},'xl');
 const grid=el.querySelector('#pg-grid');
 const draw=()=>{grid.innerHTML=st.map((x,i)=>{const rot=((x.rot%360)+360)%360,bl=x.src===null,has=!bl&&used.has(x.src)&&E.items.some(it=>!it.all&&it.p===x.src);
  return`<div class="sd-pcard ${x.del?'is-del':''}" data-i="${i}"><div class="sd-pth"><div class="sd-pth-in" style="transform:rotate(${rot}deg)">${bl?'<div class="sd-pblank">Blank page</div>':`<canvas data-src="${x.src}"></canvas>`}</div>${x.del?'<div class="sd-pdel"><i class="bx bx-trash"></i>Will be deleted</div>':''}</div>
   <div class="sd-pnum">${x.del?'—':st.slice(0,i+1).filter(y=>!y.del).length}${bl?' (new)':''}</div>
   <div class="sd-pact"><button type="button" data-a="l" title="${has?'Remove the items on this page first':'Rotate left'}" ${has?'disabled':''}><i class="bx bx-rotate-left"></i></button><button type="button" data-a="r" title="${has?'Remove the items on this page first':'Rotate right'}" ${has?'disabled':''}><i class="bx bx-rotate-right"></i></button><button type="button" data-a="u" title="Move earlier" ${i===0?'disabled':''}><i class="bx bx-left-arrow-alt"></i></button><button type="button" data-a="d" title="Move later" ${i===st.length-1?'disabled':''}><i class="bx bx-right-arrow-alt"></i></button><button type="button" data-a="x" class="text-danger" title="${x.del?'Keep this page':'Delete this page'}"><i class="bx ${x.del?'bx-undo':'bx-trash'}"></i></button></div>
   <button type="button" class="sd-padd" data-a="b" title="Add a blank page after this one"><i class="bx bx-plus"></i>Blank page</button></div>`}).join('');
  grid.querySelectorAll('canvas[data-src]').forEach(cv=>{const t=thumbs[+cv.dataset.src];if(t){cv.width=t.width;cv.height=t.height;cv.getContext('2d').drawImage(t,0,0)}});
  grid.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{const i=+b.closest('.sd-pcard').dataset.i,a=b.dataset.a,x=st[i];
   if(a==='l')x.rot-=90;else if(a==='r')x.rot+=90;else if(a==='x')x.del=!x.del;
   else if(a==='u'&&i>0){[st[i-1],st[i]]=[st[i],st[i-1]]}else if(a==='d'&&i<st.length-1){[st[i+1],st[i]]=[st[i],st[i+1]]}
   else if(a==='b'){if(st.length>=80)return toast('Doc Studio handles up to 80 pages','warn');st.splice(i+1,0,{src:null,rot:0,del:false,ref:x.src===null?st.find(y=>y.src!==null).src:x.src})}
   draw()})};
 draw();
 for(let i=0;i<N;i++){try{const page=await E.pdf.getPage(i+1),v=page.getViewport({scale:1}),sc=130/v.width,vp=page.getViewport({scale:sc}),cv=document.createElement('canvas');cv.width=Math.floor(vp.width);cv.height=Math.floor(vp.height);await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;thumbs[i]=cv;const live=grid.querySelector(`canvas[data-src="${i}"]`);if(live){live.width=cv.width;live.height=cv.height;live.getContext('2d').drawImage(cv,0,0)}}catch{}}
}
async function applyPages(st){
 const {PDFDocument,degrees}=PDFLib,src=await PDFDocument.load(E.bytes),out=await PDFDocument.create(),keep=st.filter(x=>!x.del);
 const srcIdx=[...new Set(keep.filter(x=>x.src!==null).map(x=>x.src))],copied=await out.copyPages(src,srcIdx),by=new Map(srcIdx.map((s,i)=>[s,i]));const used=new Map();
 for(const x of keep){
  let page;
  if(x.src===null){const ref=src.getPage(x.ref||0),sz=ref.getSize(),r=((ref.getRotation().angle%360)+360)%360;page=out.addPage([sz.width,sz.height]);if(r)page.setRotation(degrees(r))}
  else{const idx=by.get(x.src);let p=copied[idx];if(used.has(x.src)){[p]=await out.copyPages(src,[x.src])}used.set(x.src,1);page=out.addPage(p)}
  if(x.rot)page.setRotation(degrees((((page.getRotation().angle+x.rot)%360)+360)%360))}
 const bytes=await out.save(),map=new Map();keep.forEach((x,i)=>{if(x.src!==null&&!map.has(x.src))map.set(x.src,i)});
 E.items=E.items.filter(i=>i.all||map.has(i.p)).map(i=>{const np=map.has(i.p)?map.get(i.p):0;if(i.seg)i.seg=i.seg.replace(/^s\d+-/,'s'+np+'-');i.p=np;return i});
 E.bytes=bytes;E.pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise;E.pagesChanged=true;E.changed=true;E.undo=[];E.redo=[];E.sel=null;
 await renderPages();props();dirty();btns();toast('Page changes applied. The undo history was reset.','success',3500)}

// ---- items
const snap=()=>JSON.stringify(E.items);
function push(){E.undo.push(snap());if(E.undo.length>60)E.undo.shift();E.redo=[];btns()}
function btns(){const u=g('sd-undo'),r=g('sd-redo');if(u)u.disabled=!E.undo.length;if(r)r.disabled=!E.redo.length}
function undo(){if(!E.undo.length)return;E.redo.push(snap());E.items=JSON.parse(E.undo.pop());E.sel=null;E.changed=true;drawItems();props();btns();dirty()}
function redo(){if(!E.redo.length)return;E.undo.push(snap());E.items=JSON.parse(E.redo.pop());E.sel=null;E.changed=true;drawItems();props();btns();dirty()}
const getIt=id=>E.items.find(i=>i.id===id);
function place(n,it){const p=E.pg[it.p];n.style.left=it.x*p.w+'px';n.style.top=it.y*p.h+'px';if(it.t!=='text'){n.style.width=it.w*p.w+'px';n.style.height=it.h*p.h+'px'}else n.style.fontSize=it.size*p.w/p.pw+'px'}
function drawItems(){
 E.pg.forEach(p=>{p.layer.querySelectorAll('.sd-it').forEach(n=>n.remove());const f=p.wrap.querySelector('.sd-float');if(f)f.remove()});
 E.items.forEach(mount);mountSegs();floatBar()}
function mount(it){
 const p=E.pg[it.p];if(!p)return;const n=document.createElement('div');n.className='sd-it'+(it.t==='text'?' txt':'')+(E.sel===it.id?' sel':'');n.dataset.id=it.id;
 if(it.t==='img'){const im=E.imgs[it.src];if(im){const i=document.createElement('img');i.src=im.url;i.alt='';n.appendChild(i)}}
 else if(it.t==='text'){n.textContent=it.text;n.style.color=it.color;n.style.fontFamily=FONTS[it.font||'helv'][1];styleText(n,it)}
 else if(it.t==='rect')n.style.background=it.fill||'#fff';else if(it.t==='hl')n.style.background='rgba(255,235,59,.45)';
 place(n,it);
 if(it.t!=='text')for(const h of['nw','ne','sw','se']){const d=document.createElement('span');d.className='sd-h '+h;d.dataset.h=h;n.appendChild(d)}
 n.addEventListener('pointerdown',e=>{e.stopPropagation();if(E.tool!=='select')setTool('select');const h=e.target.closest('.sd-h');select(it.id);h?startResize(e,it,n,h.dataset.h):startDrag(e,it,n)});
 if(it.t==='text')n.addEventListener('dblclick',()=>{const t=g('sd-ptext');if(t){t.focus();t.select()}});
 p.layer.appendChild(n)}
function select(id){E.sel=id;E.pg.forEach(p=>p.layer.querySelectorAll('.sd-it').forEach(n=>n.classList.toggle('sel',n.dataset.id===id)));floatBar();props()}
function floatBar(){
 E.pg.forEach(p=>{const f=p.wrap.querySelector('.sd-float');if(f)f.remove()});const it=E.sel&&getIt(E.sel);if(!it)return;
 const p=E.pg[it.p],n=p.layer.querySelector(`[data-id="${it.id}"]`);if(!n)return;
 const f=document.createElement('div');f.className='sd-float';f.innerHTML=`${it.t==='text'?['bold','italic','underline'].map(k=>`<button type="button" data-a="${k}" class="${it[k]?'on':''}" aria-label="${k[0].toUpperCase()+k.slice(1)}"><span class="sd-fl-${k}">${k==='bold'?'B':k==='italic'?'I':'U'}</span></button>`).join(''):''}<button type="button" data-a="dup" aria-label="Duplicate"><i class="bx bx-copy"></i></button><button type="button" data-a="all" class="${it.all?'on':''}" aria-label="Repeat on all pages"><i class="bx bx-layer"></i>All pages</button><button type="button" data-a="del" aria-label="Delete" style="color:#ffb3b3"><i class="bx bx-trash"></i></button>`;
 f.addEventListener('pointerdown',e=>e.stopPropagation());
 f.onclick=e=>{const b=e.target.closest('[data-a]');if(!b)return;act(b.dataset.a)};
 p.wrap.appendChild(f);posFloat(f,it,n)}
function posFloat(f,it,n){const p=E.pg[it.p];let top=n.offsetTop-40;if(top<2)top=n.offsetTop+n.offsetHeight+6;f.style.top=top+'px';f.style.left=clamp(n.offsetLeft,2,Math.max(2,p.w-260))+'px'}
function act(a){
 const it=E.sel&&getIt(E.sel);if(!it)return;
 if(['bold','italic','underline','strike'].includes(a))return fmt(a);
 if(a==='del'){push();E.items=E.items.filter(i=>i.id!==it.id);E.sel=null;E.changed=true;drawItems();props()}
 if(a==='dup'){push();const c={...it,id:uid(),x:clamp(it.x+.03,0,.95),y:clamp(it.y+.03,0,.95)};E.items.push(c);E.sel=c.id;E.changed=true;drawItems();props()}
 if(a==='all'){push();it.all=!it.all;E.changed=true;drawItems();props();if(it.all)toast('It will be placed at the same spot on every page','info',3000)}
 dirty();btns()}
function startDrag(e,it,n){
 e.preventDefault();const p=E.pg[it.p],sx=e.clientX,sy=e.clientY,ox=it.x,oy=it.y;let moved=false;
 const mv=ev=>{const dx=(ev.clientX-sx)/p.w,dy=(ev.clientY-sy)/p.h;if(!moved&&Math.abs(dx*p.w)+Math.abs(dy*p.h)<3)return;if(!moved){moved=true;E.undo.push(JSON.stringify(E.items.map(i=>i.id===it.id?{...i,x:ox,y:oy}:i)));if(E.undo.length>60)E.undo.shift();E.redo=[]}
  const w=n.offsetWidth/p.w,h=n.offsetHeight/p.h;it.x=clamp(ox+dx,-w*.5,1-w*.5);it.y=clamp(oy+dy,-h*.5,1-h*.5);place(n,it);const f=p.wrap.querySelector('.sd-float');if(f)posFloat(f,it,n)};
 const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(moved){E.changed=true;dirty();btns()}};
 window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}
function startResize(e,it,n,h){
 e.preventDefault();const p=E.pg[it.p],sx=e.clientX,sy=e.clientY,o={x:it.x,y:it.y,w:it.w,h:it.h},ratio=it.w*p.w/(it.h*p.h),lock=it.t==='img';let moved=false;
 const mv=ev=>{if(!moved){moved=true;E.undo.push(JSON.stringify(E.items.map(i=>i.id===it.id?{...i,...o}:i)));E.redo=[]}
  let dx=(ev.clientX-sx)/p.w,dy=(ev.clientY-sy)/p.h,x=o.x,y=o.y,w=o.w,hh=o.h;
  if(h.includes('e'))w=o.w+dx;if(h.includes('w')){w=o.w-dx;x=o.x+dx}if(h.includes('s'))hh=o.h+dy;if(h.includes('n')){hh=o.h-dy;y=o.y+dy}
  if(lock){hh=w*p.w/ratio/p.h;if(h.includes('n'))y=o.y+o.h-hh}
  if(w<.02||hh<.01)return;it.x=x;it.y=y;it.w=w;it.h=hh;place(n,it);const f=p.wrap.querySelector('.sd-float');if(f)posFloat(f,it,n)};
 const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);if(moved){E.changed=true;dirty();btns();props()}};
 window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}
function bindLayer(layer,pi){
 layer.addEventListener('pointerdown',async e=>{
  if(e.target!==layer)return;const p=E.pg[pi],r=layer.getBoundingClientRect(),fx=(e.clientX-r.left)/p.w,fy=(e.clientY-r.top)/p.h;
  if(E.tool==='select'){select(null);return}
  if(E.tool==='edittext')return;
  if(E.tool==='whiteout'||E.tool==='hl'){e.preventDefault();return drawRect(e,pi,E.tool==='hl'?'hl':'rect',fx,fy)}
  e.preventDefault();
  try{
   if(E.tool==='text'||E.tool==='date'){const size=E.size,txt=E.tool==='date'?todayDMY():'Type here';addItem({t:'text',p:pi,x:clamp(fx,0,.9),y:clamp(fy-.01,0,.95),w:.2,h:.03,text:txt,size,color:E.color,font:E.font,bold:E.bold,italic:E.italic,underline:E.underline,strike:E.strike});if(E.tool==='text'){setTool('select');setTimeout(()=>{const t=g('sd-ptext');if(t){t.focus();t.select()}},30)}else setTool('select')}
   else if((E.tool==='sign'||E.tool==='stamp')&&E.armed&&E.armed.sigId){const key=await sigImage(E.armed.sigId,E.armed.ink||null),im=E.imgs[key],w=E.tool==='stamp'?.2:.3,h=w*p.w*im.h/im.w/p.h;addItem({t:'img',src:key,sigId:E.armed.sigId,kind:E.tool,ink:E.armed.ink||null,p:pi,x:clamp(fx-w/2,0,1-w),y:clamp(fy-h/2,0,1-h),w,h});setTool('select')}
   else if(E.tool==='image'&&E.armed&&E.armed.imgKey){const im=E.imgs[E.armed.imgKey],w=.3,h=w*p.w*im.h/im.w/p.h;addItem({t:'img',src:E.armed.imgKey,kind:'image',p:pi,x:clamp(fx-w/2,0,1-w),y:clamp(fy-h/2,0,1-h),w,h});setTool('select')}
  }catch(x){toast(x.message,'error')}})}
function addItem(it){push();it.id=uid();E.items.push(it);E.changed=true;E.sel=it.id;drawItems();props();dirty()}
function drawRect(e,pi,type,fx,fy){
 const p=E.pg[pi],layer=p.layer,tmp=document.createElement('div');tmp.style.cssText=`position:absolute;left:${fx*p.w}px;top:${fy*p.h}px;width:0;height:0;background:${type==='hl'?'rgba(255,235,59,.45)':'rgba(255,255,255,.9)'};outline:1px dashed #5b73e8`;layer.appendChild(tmp);
 const r=layer.getBoundingClientRect();let cx=fx,cy=fy;
 const mv=ev=>{cx=clamp((ev.clientX-r.left)/p.w,0,1);cy=clamp((ev.clientY-r.top)/p.h,0,1);tmp.style.left=Math.min(fx,cx)*p.w+'px';tmp.style.top=Math.min(fy,cy)*p.h+'px';tmp.style.width=Math.abs(cx-fx)*p.w+'px';tmp.style.height=Math.abs(cy-fy)*p.h+'px'};
 const up=()=>{window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);tmp.remove();let x=Math.min(fx,cx),y=Math.min(fy,cy),w=Math.abs(cx-fx),h=Math.abs(cy-fy);if(w*p.w<6||h*p.h<6){w=.25;h=type==='hl'?.02:.03;x=clamp(fx,0,1-w);y=clamp(fy,0,1-h)}addItem({t:type,p:pi,x,y,w,h});setTool('select')};
 window.addEventListener('pointermove',mv);window.addEventListener('pointerup',up)}

// ---- selected-item panel
function props(){
 const el=g('sd-props');if(!el)return;const it=E.sel&&getIt(E.sel),tl=E.tool;
 if(!it){el.innerHTML=`<div class="sd-eyebrow mb-2">${tl==='text'||tl==='date'?'New text':tl==='edittext'?'Edit existing text':'Selected item'}</div>${tl==='text'||tl==='date'?textControls(null):`<p class="text-muted small mb-0">${tl==='select'?'Click an item on the page to move, resize or edit it. Press Delete to remove it.':tl==='edittext'?'Click any text on the page. It is covered and replaced by a text box you can retype in the box here. The font is matched to the closest standard one (Helvetica, Times or Courier).':tl==='whiteout'||tl==='hl'?'Drag on the page to draw the area.':'Click on the page to place it.'}</p>`}`;bindText(null);return}
 const p=E.pg[it.p];
 el.innerHTML=`<div class="sd-eyebrow mb-2">Selected: ${it.t==='img'?(it.kind==='stamp'?'stamp':it.kind==='sig'||it.kind==='sign'||it.kind==='signature'?'signature':'image'):it.t==='text'?'text':it.t==='rect'?'whiteout':'highlight'}</div>
 ${it.t==='img'?`<label class="form-label small mb-0">Size</label><input type="range" class="form-range" id="sd-psize" min="5" max="90" value="${Math.round(it.w*100)}">${it.sigId&&it.kind!=='stamp'?`<div class="d-flex align-items-center gap-2 mt-1"><span class="small fw-medium flex-grow-1">Ink</span><button type="button" class="sd-ink ${!it.ink?'on':''}" data-ink="" style="background:conic-gradient(#1b1f2a 0 33%,#1d3fbf 0 66%,#3b2d8f 0)" aria-label="Original colour"></button>${INKS.map(c=>`<button type="button" class="sd-ink ${it.ink===c?'on':''}" data-ink="${c}" style="background:${c}" aria-label="Ink ${c}"></button>`).join('')}</div>`:''}`:it.t==='text'?textControls(it):`<p class="small text-muted mb-1">Drag the corners to resize.</p>`}
 <div class="form-check mt-2 mb-0"><input class="form-check-input" type="checkbox" id="sd-pall" ${it.all?'checked':''}><label class="form-check-label" for="sd-pall">Repeat on all pages</label></div>`;
 const sz=g('sd-psize');if(sz)sz.oninput=()=>{if(!sz.dataset.u){sz.dataset.u=1;push()}const w=sz.value/100,ratio=(it.h*p.h)/(it.w*p.w);it.h=w*p.w*ratio/p.h;it.w=w;const n=p.layer.querySelector(`[data-id="${it.id}"]`);if(n){place(n,it);const f=p.wrap.querySelector('.sd-float');if(f)posFloat(f,it,n)}E.changed=true;dirty();btns()};
 if(sz)sz.onchange=()=>{delete sz.dataset.u};
 el.querySelectorAll('[data-ink]').forEach(b=>b.onclick=async()=>{try{push();const ink=b.dataset.ink||null;it.src=await sigImage(it.sigId,ink);it.ink=ink;E.changed=true;drawItems();props();dirty()}catch(x){toast(x.message,'error')}});
 const pa=g('sd-pall');if(pa)pa.onchange=()=>{push();it.all=pa.checked;E.changed=true;floatBar();dirty()};
 bindText(it)}
const textControls=it=>{const v=it||{text:'',size:E.size,color:E.color,font:E.font,bold:E.bold,italic:E.italic,underline:E.underline,strike:E.strike};const fm=(k,ic,l,key)=>`<button type="button" class="sd-fmt ${v[k]?'on':''}" data-fmt="${k}" aria-pressed="${!!v[k]}" aria-label="${l}" title="${l} (${key})">${ic}</button>`;return`<div class="sd-fmts mb-2" role="group" aria-label="Text style">${fm('bold','<b>B</b>','Bold','Ctrl+B')}${fm('italic','<i>I</i>','Italic','Ctrl+I')}${fm('underline','<u>U</u>','Underline','Ctrl+U')}${fm('strike','<s>S</s>','Strikethrough','Ctrl+Shift+X')}<span class="sd-fsep"></span><button type="button" class="sd-fmt" data-sz="-1" aria-label="Smaller" title="Smaller"><i class="bx bx-minus"></i></button><button type="button" class="sd-fmt" data-sz="1" aria-label="Bigger" title="Bigger"><i class="bx bx-plus"></i></button></div>`+`${it?`<label class="form-label small mb-0">Text</label><textarea id="sd-ptext" class="form-control form-control-sm mb-2" rows="2">${esc(v.text)}</textarea>`:''}<div class="d-flex gap-2 mb-2"><div class="flex-grow-1"><label class="form-label small mb-0">Font</label><select id="sd-pfont" class="form-select form-select-sm">${Object.entries(FONTS).map(([k,f])=>`<option value="${k}" ${v.font===k?'selected':''}>${f[0]}</option>`).join('')}</select></div><div style="width:84px"><label class="form-label small mb-0">Size</label><input id="sd-psz" type="number" min="6" max="72" class="form-control form-control-sm" value="${v.size}"></div></div><div class="d-flex align-items-center gap-2"><span class="small fw-medium flex-grow-1">Colour</span>${INKS.concat(['#c62828']).map(c=>`<button type="button" class="sd-ink ${v.color===c?'on':''}" data-col="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>`};
function bindText(it){
 const t=g('sd-ptext'),f=g('sd-pfont'),s=g('sd-psz');
 const apply=(k,v,keep)=>{if(k!=='text')E[k]=v;if(!it)return;if(!keep)push();it[k]=v;E.changed=true;const n=E.pg[it.p].layer.querySelector(`[data-id="${it.id}"]`);if(n){if(k==='text')n.textContent=v;place(n,it);if(k==='color')n.style.color=v;if(k==='font')n.style.fontFamily=FONTS[v][1]}floatBar();dirty();btns()};
 if(t){let first=true;t.oninput=()=>{apply('text',t.value,!first);first=false};t.onblur=()=>{first=true}}
 if(f)f.onchange=()=>apply('font',f.value);if(s)s.onchange=()=>apply('size',clamp(+s.value||12,6,72));
 g('sd-props').querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>{apply('color',b.dataset.col);props()});
 g('sd-props').querySelectorAll('[data-fmt]').forEach(b=>b.onclick=()=>fmt(b.dataset.fmt));
 g('sd-props').querySelectorAll('[data-sz]').forEach(b=>b.onclick=()=>{apply('size',clamp((it?it.size:E.size)+ +b.dataset.sz,6,72));props()})}
// bold / italic / underline / strikethrough: on the selected text, or the style for the next text you add
function fmt(k){const it=E.sel&&getIt(E.sel);
 if(it&&it.t==='text'){push();it[k]=!it[k];E[k]=it[k];E.changed=true;const n=E.pg[it.p].layer.querySelector(`[data-id="${it.id}"]`);if(n){styleText(n,it);place(n,it)}floatBar();dirty();btns();props()}
 else{E[k]=!E[k];props()}}
document.addEventListener('keydown',e=>{
 if(E&&ST.view==='sign'&&(e.ctrlKey||e.metaKey)&&E.sel){const it=getIt(E.sel);if(it&&it.t==='text'){const k=e.key.toLowerCase(),m=k==='b'?'bold':k==='i'?'italic':k==='u'?'underline':e.shiftKey&&k==='x'?'strike':null;
  if(m){e.preventDefault();const inBox=document.activeElement&&document.activeElement.id==='sd-ptext';fmt(m);if(inBox){const t=g('sd-ptext');if(t)t.focus()}return}}}
 if(!E||ST.view!=='sign')return;const tag=(e.target.tagName||'').toLowerCase();if(tag==='input'||tag==='textarea'||tag==='select')return;
 if((e.key==='Delete'||e.key==='Backspace')&&E.sel){e.preventDefault();act('del')}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
 if(e.key==='Escape'){setTool('select');select(null)}});

// ---- write the result with pdf-lib
async function build(){
 const {PDFDocument,StandardFonts,rgb,pushGraphicsState,popGraphicsState,concatTransformationMatrix}=PDFLib;
 const doc=await PDFDocument.load(E.bytes),pages=doc.getPages(),fonts={helv:await doc.embedFont(StandardFonts.Helvetica),times:await doc.embedFont(StandardFonts.TimesRoman),cour:await doc.embedFont(StandardFonts.Courier)},emb={};
 const getImg=async k=>{if(emb[k])return emb[k];const im=E.imgs[k];const b=dataUrlToBytes(im.url);return emb[k]=im.url.startsWith('data:image/jpeg')?await doc.embedJpg(b):im.url.startsWith('data:image/png')?await doc.embedPng(b):await(async()=>{const i=await loadImage(im.url),c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;c.getContext('2d').drawImage(i,0,0);return doc.embedPng(dataUrlToBytes(c.toDataURL('image/png')))})()};
 const FN={helv:['Helvetica','HelveticaBold','HelveticaOblique','HelveticaBoldOblique'],times:['TimesRoman','TimesRomanBold','TimesRomanItalic','TimesRomanBoldItalic'],cour:['Courier','CourierBold','CourierOblique','CourierBoldOblique']},fc={};
 const fontFor=async it=>{const k=FN[it.font]?it.font:'helv',i=(it.bold?1:0)+(it.italic?2:0),key=k+i;return fc[key]||(fc[key]=await doc.embedFont(StandardFonts[FN[k][i]]))};
 const safe=(f,s)=>{try{f.widthOfTextAtSize(s,10);return s}catch{return[...s].map(ch=>{try{f.widthOfTextAtSize(ch,10);return ch}catch{return'?'}}).join('')}};
 for(let pi=0;pi<pages.length;pi++){
  const page=pages[pi],list=E.items.filter(i=>i.p===pi||i.all);if(!list.length)continue;
  const cb=page.getCropBox(),rot=((page.getRotation().angle%360)+360)%360,W=cb.width,H=cb.height;let m,Wd,Hd;
  if(rot===90){m=[0,1,-1,0,cb.x+W,cb.y];Wd=H;Hd=W}else if(rot===180){m=[-1,0,0,-1,cb.x+W,cb.y+H];Wd=W;Hd=H}else if(rot===270){m=[0,-1,1,0,cb.x,cb.y+H];Wd=H;Hd=W}else{m=[1,0,0,1,cb.x,cb.y];Wd=W;Hd=H}
  page.pushOperators(pushGraphicsState(),concatTransformationMatrix(...m));
  for(const it of list){
   const x=it.x*Wd,top=it.y*Hd;
   if(it.t==='img'){const img=await getImg(it.src),w=it.w*Wd,h=it.h*Hd;page.drawImage(img,{x,y:Hd-top-h,width:w,height:h})}
   else if(it.t==='rect'){const w=it.w*Wd,h=it.h*Hd;{const [fr,fg,fb]=hexRgb(it.fill||'#ffffff');page.drawRectangle({x,y:Hd-top-h,width:w,height:h,color:rgb(fr,fg,fb)})}}
   else if(it.t==='hl'){const w=it.w*Wd,h=it.h*Hd;page.drawRectangle({x,y:Hd-top-h,width:w,height:h,color:rgb(1,.92,.23),opacity:.45})}
   else if(it.t==='text'){const f=await fontFor(it),[r,gg,b]=hexRgb(it.color),lh=it.size*1.2;String(it.text||'').split('\n').forEach((ln,i)=>{if(!ln)return;const tx=safe(f,ln),by=Hd-top-it.size*.98-i*lh;page.drawText(tx,{x:x+1,y:by,size:it.size,font:f,color:rgb(r,gg,b)});const w=f.widthOfTextAtSize(tx,it.size),th=Math.max(.5,it.size*.06);
    if(it.underline)page.drawLine({start:{x:x+1,y:by-it.size*.12},end:{x:x+1+w,y:by-it.size*.12},thickness:th,color:rgb(r,gg,b)});
    if(it.strike)page.drawLine({start:{x:x+1,y:by+it.size*.3},end:{x:x+1+w,y:by+it.size*.3},thickness:th,color:rgb(r,gg,b)})})}}
  page.pushOperators(popGraphicsState())}
 doc.setProducer('BRELA Desk Doc Studio');
 return await doc.save()}

async function saveToCase(){
 if(!E.items.length&&!E.pagesChanged)throw new Error('Add a signature, stamp, text or page change first.');
 const bytes=await build();if(bytes.length>15*1024*1024)throw new Error('The result is over 15 MB, which the app cannot store.');
 const c=ST.ctx,mode=(document.querySelector('input[name="sd-mode"]:checked')||{}).value||'new',docSel=g('sd-doc'),doc=docSel?docSel.value:'',nm=g('sd-name').value.trim()||baseName(E.name)+' (signed).pdf';
 if(mode==='replace'&&!await ask('The original file will be overwritten with the signed version. This cannot be undone.',{danger:true,ok:'Replace it',title:'Replace the original?'}))return;
 const fd=new FormData();fd.append('file',new Blob([bytes],{type:'application/pdf'}),nm);
 const set=(k,v)=>{if(v!==''&&v!=null)fd.append(k,v)};
 set('clientId',c.clientId);set('caseId',doc?'':c.caseId);set('caseDocId',doc);set('filename',nm);set('mode',mode);if(mode==='replace')set('replaceFileId',E.fileId);
 set('markDone',g('sd-done')&&g('sd-done').checked?'1':'0');set('action','sign');set('source',E.name);set('pages',E.pdf.numPages);
 set('sigIds',[...new Set(E.items.filter(i=>i.sigId).map(i=>i.sigId))].join(','));
 const r=await api('/studio/save',{body:fd});E.changed=false;dirty();
 await setCtx({caseId:c.caseId,clientId:c.clientId});
 showSaved({file:r,name:nm,kind:'Signed',doc:docSel&&doc?docSel.selectedOptions[0].textContent.replace(/ ✓$/,''):'',replaced:mode==='replace'})}

// ---- "saved" dialog: where the file went, what is still missing, what next
function showSaved({file,name,kind,doc,replaced}){
 const c=ST.ctx,cs=c.case,docs=cs?cs.docs:[],ready=docs.filter(d=>d.done).length,missing=docs.find(d=>!d.done);
 const el=modal(`<i class="bx bx-check-circle text-success me-1"></i>Saved to the case`,`<div class="text-center mb-3"><div class="text-muted">${esc(c.client.client.name)}${cs?' · '+esc(cs.case.code):''}${doc?' · '+esc(doc):''}</div></div>
  <div class="d-flex align-items-center gap-3 border rounded-3 p-3 mb-3"><i class="bx bx-file font-size-24 text-primary"></i><div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">${esc(file.filename||name)}</div><div class="small text-muted">${sz(file.size)}${replaced?' · replaced the original':' · original kept'}</div></div><button type="button" class="btn btn-light btn-sm" id="sv-pv">Preview</button></div>
  ${cs?`<div class="d-flex justify-content-between align-items-center mb-1"><div class="sd-eyebrow">Case documents</div><span class="badge bg-light text-body">${ready} of ${docs.length} ready</span></div>${opts(docs,d=>`<div class="d-flex align-items-center gap-2 py-1 border-top"><span class="sd-dot ${d.done?'':'todo'}">${d.done?'<i class="bx bx-check"></i>':''}</span><span class="flex-grow-1 ${d.id===file.caseDocId?'fw-semibold':''}">${esc(d.name)}</span>${d.id===file.caseDocId?'<span class="badge bg-success-subtle text-success">Just now</span>':!d.done?'<span class="badge bg-warning-subtle text-warning">Still missing</span>':''}</div>`)}`:''}
  <div class="small text-muted mt-3"><i class="bx bx-time-five me-1"></i>Written to the case history and audit log.</div>`,'Done',()=>{});
 el.querySelector('.modal-footer .btn-light').textContent='Close';
 const ft=el.querySelector('.modal-footer');ft.classList.add('flex-wrap','gap-2');
 ft.insertAdjacentHTML('afterbegin',`${cs?`<a class="btn btn-outline-secondary" href="case-detail.html?id=${cs.case.id}">Open case</a>`:''}<button type="button" class="btn btn-outline-secondary" id="sv-another">${kind==='PDF'?'Convert more':'Sign another'}</button>${missing?`<button type="button" class="btn btn-primary" id="sv-next"><i class="bx bx-plus me-1"></i>Add ${esc(missing.name)}</button>`:''}`);
 el.querySelector('.ok').style.display='none';
 const close=()=>bootstrap.Modal.getInstance(el).hide();
 el.querySelector('#sv-pv').onclick=()=>previewFile(file.id,[{id:file.id,filename:file.filename||name,mime:'application/pdf'}]);
 el.querySelector('#sv-another').onclick=()=>{close();home()};
 const nx=el.querySelector('#sv-next');if(nx)nx.onclick=()=>{close();location.href='case-detail.html?id='+cs.case.id};
 el.addEventListener('hidden.bs.modal',()=>{if(ST.view!=='home')home()},{once:true})}

// ======================================================= entry point
window.STUDIO_PAGE=async()=>{
 const qs=new URLSearchParams(location.search);await loadSigs();
 try{
  if(qs.get('file')){await openFile(+qs.get('file'));if(qs.get('tool')==='images'&&ST.view==='home')window.SD.openImages({preselect:+qs.get('file')});return}
  if(qs.get('case'))await setCtx({caseId:+qs.get('case')});else if(qs.get('client'))await setCtx({clientId:+qs.get('client')});
  if(qs.get('tool')==='images'&&ST.ctx.clientId)return window.SD.openImages({docId:+qs.get('doc')||null})}
 catch(e){toast(e.message,'error')}
 home()};
})();
