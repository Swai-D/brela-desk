// Guards against input bugs that only show with a real keyboard.
// A key handler written as an expression (e=>e.key==='Enter'&&go()) returns false for every other key,
// and returning false from keydown/keypress cancels the key: the field stops accepting typing.
const fs=require('fs'),path=require('path');
let fails=0;const ok=(n,c,x)=>{if(!c)fails++;console.log(c?'PASS':'FAIL',n,c?'':JSON.stringify(x))};
const pub=path.join(__dirname,'..','public');
const files=['assets/js/brela.js',...fs.readdirSync(pub).filter(f=>f.endsWith('.html'))];
const bad=[];
for(const f of files){const s=fs.readFileSync(path.join(pub,f),'utf8');
 for(const m of s.matchAll(/\bon(keydown|keypress|beforeinput)\s*=\s*(?:\(\s*\w*\s*\)|\w+)\s*=>\s*([^{\s][^;\n]*)/g))
  if(/&&|\|\||\?|==|!/.test(m[2]))bad.push(`${f}: on${m[1]}=...=> ${m[2].slice(0,70)}`);
 for(const m of s.matchAll(/\bon(?:keydown|keypress|beforeinput)="[^"]*return\s+false/g))bad.push(`${f}: inline handler returns false`)}
ok('no key handler can cancel typing (use a <form> submit or a block-bodied handler)',bad.length===0,bad);
const js=fs.readFileSync(path.join(pub,'assets/js/brela.js'),'utf8');
ok('the case comment box is a real form (Enter sends, typing is never intercepted)',/id="cmForm"/.test(js)&&/addEventListener\('submit'/.test(js));
ok('the login page is a real form',/<form[^>]*id="login"/.test(fs.readFileSync(path.join(pub,'login.html'),'utf8')));
process.exit(fails?(console.log('\n'+fails+' FAILED'),1):(console.log('\nall passed'),0));
