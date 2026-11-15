// Doc Studio, part 2: the signature maker (draw / type / photo) and the Images to PDF tool.
// Loaded after studio.js and before brela.js; uses the helpers studio.js shares through window.SD and brela.js helpers at run time.
(()=>{
const SD=window.SD,{ST,g,uid,clamp,fetchBytes,saveBlob,loadImage,baseName,isImgMime,hexRgb}=SD;
const INKS=['#1b1f2a','#1d3fbf','#3b2d8f'];
const HAND=[['Dancing Script','Dancing Script'],['Caveat','Caveat'],['Homemade Apple','Homemade Apple'],['Sacramento','Sacramento']];

// ======================================================= signature maker
function trim(cv,pad=6){
 const w=cv.width,h=cv.height,d=cv.getContext('2d').getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(d[(y*w+x)*4+3]>10){if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}
 if(x1<0)return null;x0=Math.max(0,x0-pad);y0=Math.max(0,y0-pad);x1=Math.min(w-1,x1+pad);y1=Math.min(h-1,y1+pad);
 const o=document.createElement('canvas'),ow=x1-x0+1,oh=y1-y0+1,k=Math.min(1,900/ow);o.width=Math.round(ow*k);o.height=Math.round(oh*k);
 o.getContext('2d').drawImage(cv,x0,y0,ow,oh,0,0,o.width,o.height);return o}
function photoToCanvas(img,{kind,remove,thr,ink}){
 const k=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight)),cv=document.createElement('canvas');cv.width=Math.round(img.naturalWidth*k);cv.height=Math.round(img.naturalHeight*k);
 const x=cv.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,cv.width,cv.height);
 if(!remove)return cv;
 const im=x.getImageData(0,0,cv.width,cv.height),d=im.data,[ir,ig,ib]=hexRgb(ink).map(v=>Math.round(v*255));
 for(let i=0;i<d.length;i+=4){
  if(kind==='stamp'){d[i+3]=clamp((255-Math.min(d[i],d[i+1],d[i+2]))*2.2,0,255)}
  else{const L=.299*d[i]+.587*d[i+1]+.114*d[i+2],a=clamp((thr-L)/thr*1.8,0,1);d[i]=ir;d[i+1]=ig;d[i+2]=ib;d[i+3]=Math.round(a*255)}}
 x.putImageData(im,0,0);return cv}

SD.signatureDialog=({kind='signature',onSaved}={})=>{
 const stamp=kind==='stamp',tabs=stamp?[['up','Upload image','bx-upload'],['cam','Camera','bx-camera'],['draw','Draw','bx-pen']]:[['draw','Draw','bx-pen'],['type','Type','bx-text'],['up','Upload image','bx-upload'],['cam','Camera','bx-camera']];
 let tab=tabs[0][0],ink=INKS[1],thick=4,font=HAND[0][0],photo=null,drew=false;
 const el=modal(stamp?'Add your company stamp':'Create your signature',`<ul class="nav nav-tabs mb-3">${tabs.map(([k,l,ic])=>`<li class="nav-item"><button type="button" class="nav-link ${k===tab?'active':''}" data-tab="${k}"><i class="bx ${ic} me-1"></i>${l}</button></li>`).join('')}</ul>
 <div data-p="draw" ${tab==='draw'?'':'hidden'}><div class="sd-pad"><canvas id="sg-cv"></canvas><div style="position:absolute;left:40px;right:40px;bottom:46px;border-top:1.5px solid #c5cde0;pointer-events:none"></div><div class="small text-muted" style="position:absolute;left:14px;bottom:10px;pointer-events:none">Draw with your mouse, finger or stylus</div><button type="button" class="btn btn-sm btn-light" id="sg-clear" style="position:absolute;right:10px;bottom:8px"><i class="bx bx-undo me-1"></i>Clear</button></div>
  <div class="d-flex flex-wrap align-items-center gap-3 mt-3"><div class="d-flex align-items-center gap-2"><span class="small fw-medium">Ink</span>${INKS.map(c=>`<button type="button" class="sd-ink sg-ink" data-c="${c}" style="background:${c}" aria-label="Ink ${c}"></button>`).join('')}</div><label class="d-flex align-items-center gap-2 ms-auto mb-0"><span class="small fw-medium">Pen thickness</span><input type="range" id="sg-th" min="1" max="8" value="4" style="width:140px"></label></div></div>
 <div data-p="type" hidden><input id="sg-text" class="form-control mb-2" placeholder="Type your name" maxlength="40"><div id="sg-fonts" class="d-flex flex-column gap-2"></div><div class="d-flex align-items-center gap-2 mt-3"><span class="small fw-medium">Ink</span>${INKS.map(c=>`<button type="button" class="sd-ink sg-ink" data-c="${c}" style="background:${c}" aria-label="Ink ${c}"></button>`).join('')}</div></div>
 <div data-p="up" hidden><div class="sd-drop" id="sg-upd"><i class="bx bx-upload font-size-24 text-primary"></i><div class="fw-medium">Choose an image of your ${stamp?'stamp':'signature'}</div><div class="small text-muted">PNG or JPG. Photograph it on plain white paper in good light.</div></div><input type="file" id="sg-upf" accept="image/*" hidden></div>
 <div data-p="cam" hidden><div class="sd-drop" id="sg-camd"><i class="bx bx-camera font-size-24 text-primary"></i><div class="fw-medium">Take a photo</div><div class="small text-muted">Use the back camera on a phone or tablet.</div></div><input type="file" id="sg-camf" accept="image/*" capture="environment" hidden></div>
 <div id="sg-photo" hidden class="mt-3"><div class="border rounded-3 p-2 text-center" style="background:repeating-conic-gradient(#f4f6fb 0 25%,#fff 0 50%) 0 0/12px 12px"><canvas id="sg-pv" style="max-width:100%;max-height:200px"></canvas></div>
  <div class="d-flex flex-wrap align-items-center gap-3 mt-2"><label class="form-check mb-0"><input type="checkbox" class="form-check-input" id="sg-rm" checked><span class="form-check-label">Remove the white background</span></label>${stamp?'':`<label class="d-flex align-items-center gap-2 mb-0"><span class="small">Strength</span><input type="range" id="sg-thr" min="110" max="235" value="190" style="width:120px"></label>`}</div></div>
 <div class="row g-2 mt-3 align-items-end"><div class="col-sm-7"><label class="form-label small mb-1">Name</label><input id="sg-name" class="form-control" value="${stamp?'Company stamp':ST.sigs.some(s=>s.kind==='signature')?'Initials':'Full signature'}" maxlength="60"></div>${stamp?'':`<div class="col-sm-5"><label class="form-check mb-2"><input type="checkbox" class="form-check-input" id="sg-def" ${ST.sigs.some(s=>s.is_default)?'':'checked'}><span class="form-check-label">Make this my default</span></label></div>`}</div>
 <div class="d-flex gap-2 align-items-start rounded-3 p-2 mt-3 small" style="background:#eef1ff;color:#2b3a96"><i class="bx bx-lock-alt mt-1"></i><div>Saved privately to your account. Only you can place it, and every use is written to the audit log. A placed signature is a visual signature, not a cryptographic one.</div></div>`,
 'Save and use',async m=>{
  let cv=null;
  if(tab==='draw'){if(!drew)throw new Error('Draw your '+(stamp?'stamp':'signature')+' first');cv=g('sg-cv')}
  else if(tab==='type'){const t=g('sg-text').value.trim();if(!t)throw new Error('Type your name first');cv=await typed(t)}
  else{if(!photo)throw new Error('Choose or take a photo first');cv=photoToCanvas(photo,opt())}
  const out=trim(cv);if(!out)throw new Error('Nothing to save yet');
  const blob=await new Promise(r=>out.toBlob(r,'image/png'));if(!blob)throw new Error('Could not save the image');
  const fd=new FormData();fd.append('file',blob,'signature.png');fd.append('name',g('sg-name').value.trim());fd.append('kind',kind);const df=g('sg-def');if(df&&df.checked)fd.append('isDefault','1');
  const r=await api('/me/signatures',{body:fd});toast((stamp?'Stamp':'Signature')+' saved','success',2500);if(onSaved)await onSaved(r)});
 el.querySelector('.modal-dialog').classList.add('modal-lg');
 const opt=()=>({kind,remove:g('sg-rm').checked,thr:+(g('sg-thr')||{value:190}).value,ink});
 const paintInk=()=>el.querySelectorAll('.sg-ink').forEach(b=>b.classList.toggle('on',b.dataset.c===ink));paintInk();
 // draw pad
 const cv=g('sg-cv'),ctx=cv.getContext('2d');let drawing=false,last=null;
 const fit=()=>{const r=cv.parentElement.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);if(!r.width||cv.width===Math.round(r.width*dpr))return;const keep=drew?cv.toDataURL():null;cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0)};
 el.addEventListener('shown.bs.modal',fit);setTimeout(fit,200);
 const pt=e=>{const r=cv.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
 cv.onpointerdown=e=>{e.preventDefault();fit();cv.setPointerCapture(e.pointerId);drawing=true;last=pt(e);ctx.strokeStyle=ctx.fillStyle=ink;ctx.lineWidth=thick;ctx.lineCap=ctx.lineJoin='round';ctx.beginPath();ctx.arc(last.x,last.y,thick/2,0,7);ctx.fill();drew=true};
 cv.onpointermove=e=>{if(!drawing)return;const p=pt(e),mid={x:(last.x+p.x)/2,y:(last.y+p.y)/2};ctx.strokeStyle=ink;ctx.lineWidth=thick;ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(mid.x,mid.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p};
 cv.onpointerup=cv.onpointercancel=()=>{drawing=false};
 g('sg-clear').onclick=()=>{ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,cv.width,cv.height);ctx.restore();drew=false};
 g('sg-th').oninput=e=>{thick=+e.target.value};
 // tabs
 const show=k=>{tab=k;el.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===k));el.querySelectorAll('[data-p]').forEach(p=>p.hidden=p.dataset.p!==k);g('sg-photo').hidden=!((k==='up'||k==='cam')&&photo);if(k==='type')fonts();if(k==='draw')setTimeout(fit,50)};
 el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>show(b.dataset.tab));
 el.querySelectorAll('.sg-ink').forEach(b=>b.onclick=()=>{ink=b.dataset.c;paintInk();if(tab==='type')fonts();if(photo)repaint()});
 // type
 let gf=false;
 const fonts=()=>{
  if(!gf){gf=true;const l=document.createElement('link');l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&family=Caveat:wght@600&family=Homemade+Apple&family=Sacramento&display=swap';document.head.appendChild(l)}
  const t=g('sg-text').value.trim()||'Your name';
  g('sg-fonts').innerHTML=HAND.map(([k,f])=>`<button type="button" class="sd-sig sg-f ${f===font?'on':''}" data-f="${f}" style="height:64px"><span style="font-family:'${f}',cursive;font-size:30px;color:${ink};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(t)}</span></button>`).join('');
  g('sg-fonts').querySelectorAll('.sg-f').forEach(b=>b.onclick=()=>{font=b.dataset.f;fonts()})};
 g('sg-text').oninput=fonts;
 const typed=async t=>{try{await document.fonts.load(`64px "${font}"`,t)}catch{}const c=document.createElement('canvas'),x=c.getContext('2d');x.font=`64px "${font}", cursive`;const w=Math.ceil(x.measureText(t).width)+40;c.width=w;c.height=130;x.font=`64px "${font}", cursive`;x.fillStyle=ink;x.textBaseline='middle';x.fillText(t,20,68);return c};
 // photo
 const repaint=()=>{if(!photo)return;const c=photoToCanvas(photo,opt()),pv=g('sg-pv');pv.width=c.width;pv.height=c.height;pv.getContext('2d').drawImage(c,0,0);g('sg-photo').hidden=false};
 const take=async f=>{if(!f)return;try{photo=await loadImage(URL.createObjectURL(f));repaint()}catch{toast('That image could not be read. Try a JPG or PNG.','error')}};
 g('sg-upd').onclick=()=>g('sg-upf').click();g('sg-camd').onclick=()=>g('sg-camf').click();
 g('sg-upf').onchange=e=>take(e.target.files[0]);g('sg-camf').onchange=e=>take(e.target.files[0]);
 g('sg-rm').onchange=repaint;const thr=g('sg-thr');if(thr)thr.oninput=repaint;
 show(tab)};

// ======================================================= images to PDF
let I=null;const MAXB=15*1024*1024;
SD.openImages=async({preselect,docId}={})=>{
 ST.view='images';
 I={items:[],opts:{size:'a4',margin:'small',clean:'clean',quality:'balanced'},cache:new Map(),inbox:[],est:null,busy:0};
 const c=ST.ctx;let inbox=[];try{inbox=(await api('/inbox')).filter(f=>isImgMime(f.mime))}catch{}I.inbox=inbox;
 shell();
 if(docId){const ds=g('im-doc');if(ds){ds.value=docId;ds.dataset.t=1}}
 if(preselect){const f=SD.ST.ctx.client&&SD.ST.ctx.client.files.find(x=>x.id===preselect)||inbox.find(x=>x.id===preselect);if(f)await addFromFile(f,false)}
 draw()};
const clientImgs=()=>(ST.ctx.client?ST.ctx.client.files:[]).filter(f=>isImgMime(f.mime));
async function addFromFile(f,inbox){
 try{const r=await fetch('/api/files/'+f.id,{credentials:'same-origin'});if(!r.ok)throw new Error();const blob=await r.blob();
  I.items.push({id:uid(),name:f.filename,blob:new Blob([blob],{type:f.mime||blob.type}),url:URL.createObjectURL(blob),srcId:f.id,inbox:!!inbox,docId:f.case_doc_id||null,rot:0})}
 catch{toast('Could not open '+f.filename,'error')}}
function addDevice(files){
 let bad=0;for(const f of files){if(!/^image\//.test(f.type)){bad++;continue}I.items.push({id:uid(),name:f.name,blob:f,url:URL.createObjectURL(f),srcId:null,inbox:false,docId:null,rot:0})}
 if(bad)toast(bad+' file(s) skipped: only images can be added here','warn');draw()}
function shell(){
 const c=ST.ctx,has=!!c.clientId,imgs=clientImgs(),docs=c.case?c.case.case&&c.case.docs:[];
 g('studio').innerHTML=`<div class="d-flex flex-wrap align-items-center gap-2 mb-3"><div class="flex-grow-1"><div class="small text-muted"><a href="#" id="im-back">Doc Studio</a>${has?` / ${esc(c.client.client.name)}${c.case?' / '+esc(c.case.case.code):''}`:''}</div><div class="d-flex align-items-center gap-2"><h5 class="mb-0">Images to PDF</h5><span class="badge bg-info-subtle text-info" id="im-count"></span></div></div></div>
 <div class="sd-shell"><div class="sd-left"><div class="card mb-0"><div class="card-body">
  <div class="sd-eyebrow mb-2">Working in</div>${SD.ctxBar()}
  <div class="sd-eyebrow mt-3 mb-2">Add images from</div>
  ${has?`<div class="small fw-semibold mb-1">Client folder</div>${imgs.length?`<div class="sd-src mb-3">${opts(imgs,f=>`<label title="${esc(f.filename)}" data-id="${f.id}"><img loading="lazy" src="/api/files/${f.id}?inline=1" alt="${esc(f.filename)}"><input type="checkbox" class="im-src" data-id="${f.id}"></label>`)}</div>`:'<div class="small text-muted mb-3">No images in this folder.</div>'}`:''}
  ${I.inbox.length?`<div class="small fw-semibold mb-1">WhatsApp Inbox</div><div class="sd-src mb-3">${opts(I.inbox,f=>`<label title="${esc(f.filename)}" data-id="${f.id}"><img loading="lazy" src="/api/files/${f.id}?inline=1" alt="${esc(f.filename)}"><input type="checkbox" class="im-src im-ib" data-id="${f.id}"></label>`)}</div>`:''}
  <div class="sd-drop" id="im-drop"><i class="bx bx-cloud-upload font-size-24 text-primary"></i><div class="fw-medium">Drop photos here</div><div class="small text-muted">or choose from your device or camera</div></div><input type="file" id="im-file" accept="image/*" multiple hidden>
 </div></div></div>
 <div class="sd-main"><div class="card mb-0"><div class="card-body"><div class="d-flex align-items-center gap-2 mb-3 flex-wrap"><h6 class="mb-0">Pages</h6><span class="small text-muted flex-grow-1">Drag to reorder. Each image becomes one page.</span><button type="button" class="btn btn-light btn-sm" id="im-rall"><i class="bx bx-rotate-right me-1"></i>Rotate all</button></div><div id="im-pages" class="sd-pgs"></div>
  <div class="d-flex gap-2 align-items-center rounded-3 p-2 mt-3 small bg-light-subtle"><i class="bx bx-info-circle text-primary"></i><div>Photos are straightened and resized in your browser. Nothing leaves your device until you save to the case.</div></div></div></div></div>
 <div class="sd-right"><div class="card mb-0"><div class="card-body"><div class="sd-eyebrow mb-2">PDF options</div>
  ${[['size','Page size',[['a4','A4'],['letter','Letter'],['fit','Fit image']]],['margin','Margin',[['none','None'],['small','Small'],['large','Large']]],['clean','Scan clean-up',[['orig','Original'],['clean','Clean'],['bw','B &amp; W']]],['quality','Quality',[['small','Small'],['balanced','Balanced'],['high','High']]]].map(([k,l,o])=>`<div class="mb-2"><div class="small fw-medium mb-1">${l}</div><div class="sd-seg" data-o="${k}">${o.map(([v,t])=>`<button type="button" data-v="${v}" class="${I.opts[k]===v?'on':''}">${t}</button>`).join('')}</div></div>`).join('')}
  <div class="border-top pt-2 mt-2"><div class="d-flex justify-content-between"><span class="small fw-medium">Estimated size</span><b id="im-est">…</b></div><div class="progress my-1" style="height:8px"><div class="progress-bar bg-success" id="im-bar" style="width:0%"></div></div><div class="small text-muted">Upload limit is 15 MB per file</div></div></div></div>
  <div class="card mb-0 flex-grow-1"><div class="card-body d-flex flex-column gap-2"><div class="sd-eyebrow">Save to the case</div>
   <label class="form-label small mb-0">File name</label><input id="im-name" class="form-control form-control-sm" value="scan.pdf">
   ${has?`${c.case?`<label class="form-label small mb-0">Checklist item</label><select id="im-doc" class="form-select form-select-sm">${SD.docOptions('')}</select><div class="form-check mb-0"><input class="form-check-input" type="checkbox" id="im-done" checked><label class="form-check-label" for="im-done">Mark this checklist item ready</label></div>`:''}
   <div class="form-check mb-0"><input class="form-check-input" type="checkbox" id="im-keep" checked><label class="form-check-label" for="im-keep">Keep the original images</label></div>
   <div class="flex-grow-1"></div><button type="button" class="btn btn-primary btn-lg" id="im-save"><i class="bx bx-check me-1"></i>Create PDF &amp; save to case</button>`:'<div class="flex-grow-1"></div>'}
   <button type="button" class="btn btn-outline-secondary" id="im-dl"><i class="bx bx-download me-1"></i>Download only</button></div></div></div></div>`;
 g('im-back').onclick=e=>{e.preventDefault();release();SD.home()};
 const f=g('im-file'),d=g('im-drop');d.onclick=()=>f.click();f.onchange=()=>{addDevice([...f.files]);f.value=''};
 ['dragover','dragenter'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.add('over')}));['dragleave','drop'].forEach(ev=>d.addEventListener(ev,e=>{e.preventDefault();d.classList.remove('over')}));
 d.addEventListener('drop',e=>addDevice([...e.dataTransfer.files]));
 g('studio').querySelectorAll('.im-src').forEach(cb=>cb.onchange=async()=>{const id=+cb.dataset.id,isIb=cb.classList.contains('im-ib');cb.parentElement.classList.toggle('on',cb.checked);
  if(cb.checked){const file=(isIb?I.inbox:clientImgs()).find(x=>x.id===id);cb.disabled=true;await addFromFile(file,isIb);cb.disabled=false}
  else{const i=I.items.findIndex(x=>x.srcId===id&&x.inbox===isIb);if(i>-1){URL.revokeObjectURL(I.items[i].url);I.items.splice(i,1)}}
  draw()});
 g('studio').querySelectorAll('[data-o]').forEach(s=>s.querySelectorAll('button').forEach(b=>b.onclick=()=>{I.opts[s.dataset.o]=b.dataset.v;s.querySelectorAll('button').forEach(x=>x.classList.toggle('on',x===b));estimate()}));
 g('im-rall').onclick=()=>{I.items.forEach(i=>i.rot=(i.rot+90)%360);draw()};
 const sv=g('im-save');if(sv)sv.onclick=()=>busy(sv,save);
 g('im-dl').onclick=()=>busy(g('im-dl'),async()=>{const b=await build();saveBlob(new Blob([b],{type:'application/pdf'}),pdfName());toast('Downloaded','success',2500)})}
const release=()=>{if(I)I.items.forEach(i=>URL.revokeObjectURL(i.url));I=null};
const busy=async(btn,fn)=>{const h=btn.innerHTML;btn.disabled=true;btn.innerHTML='<i class="bx bx-loader-alt bx-spin me-1"></i>Working…';try{await fn()}catch(e){toast(e.message||'Something went wrong','error')}finally{btn.disabled=false;btn.innerHTML=h}};
const pdfName=()=>{const n=g('im-name').value.trim()||'scan.pdf';return/\.pdf$/i.test(n)?n:n+'.pdf'};
function draw(){
 const el=g('im-pages');if(!el||!I)return;
 g('im-count').textContent=I.items.length+(I.items.length===1?' image · 1 page':' images · '+I.items.length+' pages');
 el.innerHTML=(I.items.length?opts(I.items,(it,i)=>`<div class="sd-pg" draggable="true" data-id="${it.id}"><div class="sd-sheet"><img src="${it.url}" alt="" style="transform:rotate(${it.rot}deg);${it.rot%180?'max-width:200px;max-height:200px':''}"></div><div class="d-flex align-items-center gap-2"><span class="sd-step" style="width:22px;height:22px;font-size:11px">${i+1}</span><div class="flex-grow-1 min-w-0"><div class="small fw-medium text-truncate">${esc(it.name)}</div><div class="small text-muted">${sz(it.blob.size)}</div></div></div><div class="d-flex gap-1"><button type="button" class="btn btn-icon btn-light" data-a="l" ${i===0?'disabled':''} aria-label="Move earlier" style="width:30px;height:30px"><i class="bx bx-chevron-left"></i></button><button type="button" class="btn btn-icon btn-light" data-a="r" ${i===I.items.length-1?'disabled':''} aria-label="Move later" style="width:30px;height:30px"><i class="bx bx-chevron-right"></i></button><button type="button" class="btn btn-icon btn-light" data-a="rot" aria-label="Rotate" style="width:30px;height:30px"><i class="bx bx-rotate-right"></i></button><span class="flex-grow-1"></span><button type="button" class="btn btn-icon btn-light text-danger" data-a="del" aria-label="Remove" style="width:30px;height:30px"><i class="bx bx-trash"></i></button></div></div>`):'<div class="text-muted py-4 text-center" style="grid-column:1/-1">Pick images from the folder or the Inbox on the left, or drop photos here.</div>');
 el.querySelectorAll('.sd-pg').forEach(card=>{const id=card.dataset.id;
  card.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{const i=I.items.findIndex(x=>x.id===id),it=I.items[i];
   if(b.dataset.a==='l'&&i>0)[I.items[i-1],I.items[i]]=[I.items[i],I.items[i-1]];
   if(b.dataset.a==='r'&&i<I.items.length-1)[I.items[i+1],I.items[i]]=[I.items[i],I.items[i+1]];
   if(b.dataset.a==='rot')it.rot=(it.rot+90)%360;
   if(b.dataset.a==='del'){URL.revokeObjectURL(it.url);I.items.splice(i,1);const cb=g('studio').querySelector(`.im-src[data-id="${it.srcId}"]`);if(cb&&it.srcId){cb.checked=false;cb.parentElement.classList.remove('on')}}
   draw()});
  card.ondragstart=e=>{e.dataTransfer.setData('text/plain',id);e.dataTransfer.effectAllowed='move'};
  card.ondragover=e=>{e.preventDefault();card.classList.add('drop')};card.ondragleave=()=>card.classList.remove('drop');
  card.ondrop=e=>{e.preventDefault();card.classList.remove('drop');const from=e.dataTransfer.getData('text/plain'),a=I.items.findIndex(x=>x.id===from),b=I.items.findIndex(x=>x.id===id);if(a<0||b<0||a===b)return;const [m]=I.items.splice(a,1);I.items.splice(b,0,m);draw()}});
 // sensible default name and checklist item from the first image
 const nm=g('im-name');if(nm&&!nm.dataset.t&&I.items.length){const f=I.items[0];nm.value=(I.items.length===1?baseName(f.name):'scan')+'.pdf';const ds=g('im-doc');if(ds&&!ds.dataset.t){const d=f.docId||(ST.ctx.case.docs.find(x=>!x.done)||{}).id;if(d)ds.value=d}}
 if(nm)nm.oninput=()=>{nm.dataset.t=1};const ds=g('im-doc');if(ds)ds.onchange=()=>{ds.dataset.t=1};
 const sv=g('im-save');if(sv)sv.disabled=!I.items.length;g('im-dl').disabled=!I.items.length;
 estimate()}

// ---- image processing
async function bitmap(blob){try{return await createImageBitmap(blob,{imageOrientation:'from-image'})}catch{const u=URL.createObjectURL(blob);try{return await loadImage(u)}finally{setTimeout(()=>URL.revokeObjectURL(u),3000)}}}
function levels(x,w,h,bw){
 const im=x.getImageData(0,0,w,h),d=im.data,hist=new Uint32Array(256);
 for(let i=0;i<d.length;i+=4)hist[(.299*d[i]+.587*d[i+1]+.114*d[i+2])|0]++;
 const tot=w*h;let lo=0,hi=255,s=0;for(let v=0;v<256;v++){s+=hist[v];if(s>=tot*.01){lo=v;break}}s=0;for(let v=255;v>=0;v--){s+=hist[v];if(s>=tot*.01){hi=v;break}}
 if(hi-lo<40){lo=0;hi=255}const k=255/(hi-lo);
 for(let i=0;i<d.length;i+=4){
  if(bw){let v=(.299*d[i]+.587*d[i+1]+.114*d[i+2]-lo)*k;v=clamp((v-128)*1.35+128,0,255);d[i]=d[i+1]=d[i+2]=v}
  else{d[i]=clamp((d[i]-lo)*k,0,255);d[i+1]=clamp((d[i+1]-lo)*k,0,255);d[i+2]=clamp((d[i+2]-lo)*k,0,255)}}
 x.putImageData(im,0,0)}
async function processed(it){
 const o=I.opts,key=[it.rot,o.quality,o.clean].join('|');if(it.out&&it.out.key===key)return it.out;
 const bmp=await bitmap(it.blob),maxD={small:1100,balanced:1650,high:2400}[o.quality],q={small:.6,balanced:.78,high:.9}[o.quality];
 const sw=bmp.width||bmp.naturalWidth,sh=bmp.height||bmp.naturalHeight,rot90=it.rot%180!==0,k=Math.min(1,maxD/Math.max(sw,sh)),dw=Math.round(sw*k),dh=Math.round(sh*k);
 const cv=document.createElement('canvas');cv.width=rot90?dh:dw;cv.height=rot90?dw:dh;const x=cv.getContext('2d',{willReadFrequently:true});
 x.fillStyle='#fff';x.fillRect(0,0,cv.width,cv.height);x.translate(cv.width/2,cv.height/2);x.rotate(it.rot*Math.PI/180);x.drawImage(bmp,-dw/2,-dh/2,dw,dh);x.setTransform(1,0,0,1,0,0);
 if(bmp.close)bmp.close();
 if(o.clean!=='orig')levels(x,cv.width,cv.height,o.clean==='bw');
 const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',q));if(!blob)throw new Error('Could not process '+it.name);
 return it.out={key,bytes:new Uint8Array(await blob.arrayBuffer()),w:cv.width,h:cv.height}}
let estT=0;
function estimate(){
 const e=g('im-est'),bar=g('im-bar');if(!e||!I)return;clearTimeout(estT);const my=++I.busy;
 if(!I.items.length){e.textContent='0 KB';bar.style.width='0%';return}
 e.innerHTML='<i class="bx bx-loader-alt bx-spin"></i>';
 estT=setTimeout(async()=>{try{let t=3000;for(const it of I.items){const p=await processed(it);t+=p.bytes.length+700;if(!I||my!==I.busy)return}
  if(!g('im-est'))return;I.est=t;e.textContent=sz(t);bar.style.width=Math.min(100,t/MAXB*100)+'%';bar.className='progress-bar '+(t>MAXB?'bg-danger':t>MAXB*.7?'bg-warning':'bg-success')}catch(x){if(g('im-est'))e.textContent='?'}},300)}
async function build(){
 if(!I.items.length)throw new Error('Add at least one image');
 const {PDFDocument}=PDFLib,doc=await PDFDocument.create(),o=I.opts,m={none:0,small:18,large:42}[o.margin];
 for(const it of I.items){
  const p=await processed(it),img=await doc.embedJpg(p.bytes);let pw,ph;
  if(o.size==='fit'){pw=p.w*.5+m*2;ph=p.h*.5+m*2}else{[pw,ph]=o.size==='letter'?[612,792]:[595.28,841.89];if(p.w>p.h)[pw,ph]=[ph,pw]}
  const pg=doc.addPage([pw,ph]),s=Math.min((pw-2*m)/p.w,(ph-2*m)/p.h),w=p.w*s,h=p.h*s;pg.drawImage(img,{x:(pw-w)/2,y:(ph-h)/2,width:w,height:h})}
 doc.setTitle(baseName(pdfName()));doc.setProducer('BRELA Desk Doc Studio');return await doc.save()}
async function save(){
 const bytes=await build();if(bytes.length>MAXB)throw new Error('The PDF is '+sz(bytes.length)+', over the 15 MB limit. Choose Quality: Small, or remove a page.');
 const c=ST.ctx,ds=g('im-doc'),doc=ds?ds.value:'',nm=pdfName(),fd=new FormData();fd.append('file',new Blob([bytes],{type:'application/pdf'}),nm);
 const set=(k,v)=>{if(v!==''&&v!=null)fd.append(k,v)};
 set('clientId',c.clientId);set('caseId',doc?'':c.caseId);set('caseDocId',doc);set('filename',nm);set('mode','new');set('action','pdf');set('images',I.items.length);set('markDone',g('im-done')&&g('im-done').checked?'1':'0');
 const r=await api('/studio/save',{body:fd});
 const keep=g('im-keep').checked,del=I.items.filter(i=>i.srcId&&!i.inbox);let removed=0;
 if(!keep)for(const i of del){try{await api('/files/'+i.srcId,{method:'DELETE'});removed++}catch{}}
 if(!keep&&removed<del.length)toast((del.length-removed)+' original(s) could not be deleted (only the uploader, a Senior or a Manager can).','warn',6000);
 const label=ds&&doc?ds.selectedOptions[0].textContent.replace(/ ✓$/,''):'';
 release();await SD.setCtx({caseId:c.caseId,clientId:c.clientId});SD.showSaved({file:r,name:nm,kind:'PDF',doc:label,replaced:false})}
})();
