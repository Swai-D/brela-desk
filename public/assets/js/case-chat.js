/* Case chat: a side panel on the case page to ask questions about this one case. */
(()=>{
const SUGGEST=['What did BRELA ask us to correct?','Which documents are not ready yet, and why?','Summarise this case in five lines.','Check the documents against the company details and list any mistakes.'];
const md=t=>{
 const lines=esc(String(t||'')).split('\n'),out=[];let list=null;
 const inl=s=>s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\[((?:[CD]\d+)(?:\s*,\s*[CD]\d+)*)\]/g,(m,a)=>`<sup class="cc-cite">${a.replace(/\s/g,'')}</sup>`);
 const close=()=>{if(list){out.push(`</${list}>`);list=null}};
 for(const l of lines){
  const b=l.match(/^\s*[-*•]\s+(.*)/),n=l.match(/^\s*\d+[.)]\s+(.*)/);
  if(b||n){const k=b?'ul':'ol';if(list!==k){close();out.push(`<${k}>`);list=k}out.push(`<li>${inl((b||n)[1])}</li>`)}
  else{close();out.push(l.trim()?`<p>${inl(l)}</p>`:'')}}
 close();return out.join('')};
window.CASE_CHAT=async c=>{
 let el=document.getElementById('ccPanel');
 if(!el){document.body.insertAdjacentHTML('beforeend',`<div class="offcanvas offcanvas-end cc-panel" tabindex="-1" id="ccPanel" aria-labelledby="ccTitle"><div class="offcanvas-header"><div class="min-w-0"><h5 class="offcanvas-title mb-0" id="ccTitle"><i class="bx bx-bot me-1"></i>Ask about this case</h5><div class="text-muted cc-sub"></div></div><span class="d-flex gap-1"><button type="button" class="btn btn-icon btn-light" id="ccClear" title="Clear the conversation" aria-label="Clear the conversation"><i class="bx bx-trash"></i></button><button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></span></div><div class="offcanvas-body cc-body"><div id="ccNote"></div><div id="ccList" aria-live="polite"></div></div><form class="cc-form" id="ccForm"><textarea id="ccIn" class="form-control" rows="2" maxlength="2000" placeholder="Ask about this case, its documents or what BRELA asked…" aria-label="Your question"></textarea><button class="btn btn-primary" id="ccSend" type="submit" title="Send" aria-label="Send"><i class="bx bx-send"></i></button></form><div class="cc-foot text-muted">Answers come only from this case: its details, checklist, history, comments, company details and documents. Check them before you act.</div></div>`);el=document.getElementById('ccPanel')}
 const $e=s=>el.querySelector(s),list=$e('#ccList'),inp=$e('#ccIn'),send=$e('#ccSend');
 $e('.cc-sub').textContent=`${c.code} · ${c.client}`;
 const bub=m=>m.role==='user'?`<div class="cc-m cc-u"><div class="cc-b">${esc(m.body).replace(/\n/g,'<br>')}</div><div class="cc-w">${esc(m.by||'You')} · ${ago(m.created_at)}</div></div>`
  :`<div class="cc-m cc-a"><div class="cc-b">${md(m.body)}</div>${(m.sources||[]).length?`<div class="cc-src">${m.sources.map(s=>s.file_id?`<a href="/api/files/${s.file_id}" target="_blank" rel="noopener" class="cc-chip" title="Open ${esc(s.label)}"><b>${s.id}</b> ${esc(s.label)}</a>`:`<span class="cc-chip"><b>${s.id}</b> ${esc(s.label)}</span>`).join('')}</div>`:''}<div class="cc-w">${ago(m.created_at)}</div></div>`;
 const down=()=>{const b=$e('.cc-body');b.scrollTop=b.scrollHeight};
 const empty=()=>`<div class="cc-empty"><i class="bx bx-conversation"></i><p>Ask anything about <b>${esc(c.code)}</b>. Try:</p>${SUGGEST.map(s=>`<button type="button" class="btn btn-light cc-sug">${esc(s)}</button>`).join('')}</div>`;
 const bindSug=()=>list.querySelectorAll('.cc-sug').forEach(b=>b.onclick=()=>{inp.value=b.textContent;ask_()});
 let busy=false;
 const ask_=async()=>{const t=inp.value.trim();if(!t||busy)return;busy=true;send.disabled=true;inp.value='';
  const e0=list.querySelector('.cc-empty');if(e0)e0.remove();
  list.insertAdjacentHTML('beforeend',bub({role:'user',body:t,by:ME.name,created_at:new Date().toISOString()})+'<div class="cc-m cc-a" id="ccWait"><div class="cc-b cc-typing"><span></span><span></span><span></span> Reading the case…</div></div>');down();
  try{const r=await api(`/cases/${c.id}/chat`,{body:{message:t}});$e('#ccWait').remove();list.insertAdjacentHTML('beforeend',bub(r.messages[1]));
   note(r.unreadable,r.hidden,r.scanned)}
  catch(e){const w=$e('#ccWait');if(w)w.remove();list.insertAdjacentHTML('beforeend',`<div class="cc-m cc-a"><div class="cc-b cc-err"><i class="bx bx-error-circle me-1"></i>${esc(e.message)}</div></div>`);inp.value=t}
  busy=false;send.disabled=false;down();inp.focus()};
 const note=(unread,hidden,scanned)=>{$e('#ccNote').innerHTML=(scanned&&scanned.length?`<div class="cc-priv text-muted"><i class="bx bx-scan me-1"></i>Read by text recognition: ${scanned.map(esc).join(', ')}. Scans can contain misread characters, so check names and numbers in the original.</div>`:'')+(unread&&unread.length?`<div class="tp-note mb-2"><i class="bx bx-info-circle"></i><span>The assistant cannot read ${unread.length} file${unread.length===1?'':'s'} (${unread.map(u=>esc(u.name)+(u.why?' — '+esc(u.why):'')).join('; ')}). Paste the text into a comment if it matters.</span></div>`:'')+(hidden?'<div class="cc-priv text-muted"><i class="bx bx-lock-alt me-1"></i>Privacy is on: ID, TIN and phone numbers are hidden from the AI.</div>':'')};
 $e('#ccForm').onsubmit=e=>{e.preventDefault();ask_()};
 inp.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask_()}};
 $e('#ccClear').style.display=CAN('cases.edit')?'':'none';
 $e('#ccClear').onclick=async()=>{if(!await ask('This removes the conversation about this case for everyone.',{danger:true,ok:'Yes, clear it',title:'Clear the conversation?'}))return;try{await api(`/cases/${c.id}/chat`,{method:'DELETE'});list.innerHTML=empty();bindSug()}catch(e){toast(e.message,'error')}};
 el.dataset.case=c.id;list.innerHTML='<div class="text-muted p-3">Loading…</div>';
 bootstrap.Offcanvas.getOrCreateInstance(el).show();
 try{const d=await api(`/cases/${c.id}/chat`);const ok=d.ai.configured&&d.ai.can_use;
  note(d.unread,d.ai.privacy==='standard',d.scanned);
  list.innerHTML=d.messages.length?d.messages.map(bub).join(''):empty();bindSug();down();
  if(!d.ai.configured){list.insertAdjacentHTML('afterbegin','<div class="alert alert-warning">The AI is not set up yet. A Manager can add an API key in Settings → AI assistant.</div>')}
  else if(!d.ai.can_use){list.insertAdjacentHTML('afterbegin','<div class="alert alert-warning">Your role is not allowed to use the AI.</div>')}
  inp.disabled=send.disabled=!ok;if(ok)setTimeout(()=>inp.focus(),300)}
 catch(e){list.innerHTML=`<div class="alert alert-danger m-3">${esc(e.message)}</div>`}};
})();
