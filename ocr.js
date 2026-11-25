// Reads text out of scanned PDFs and pictures with Tesseract (runs on the server; nothing leaves it).
// Needs the `tesseract` and `pdftoppm` programs; without them every call explains that OCR is not installed.
const {execFile}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path'),util=require('util');
const run=util.promisify(execFile),MAX_PAGES=12;
const fail=(m,s=400)=>{const e=new Error(m);e.status=s;return e};
const have=async b=>{try{await run(b,['--version'],{timeout:5000});return true}catch(e){return e.code!=='ENOENT'&&/./.test(String(e.stderr||e.stdout||''))}};
let langs=null;
const langArg=async()=>{if(langs)return langs;try{const o=(await run('tesseract',['--list-langs'],{timeout:5000})).stdout;langs=['eng','swa'].filter(l=>new RegExp('^'+l+'$','m').test(o)).join('+')||'eng'}catch{langs='eng'}return langs};
const ocrImage=async p=>(await run('tesseract',[p,'stdout','-l',await langArg(),'--psm','3'],{timeout:90000,maxBuffer:20*1024*1024})).stdout;
async function ocr(buf,name='',mime=''){
 if(!await have('tesseract'))throw fail('Text recognition (OCR) is not installed on this server, so scans and pictures cannot be read.');
 const ext=(String(name).split('.').pop()||'').toLowerCase(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'ocr-'));let text='';
 try{
  if(ext==='pdf'||mime==='application/pdf'){
   if(!await have('pdftoppm'))throw fail('PDF scans cannot be read: pdftoppm is not installed on this server.');
   fs.writeFileSync(path.join(dir,'in.pdf'),buf);
   await run('pdftoppm',['-r','150','-l',String(MAX_PAGES),'-png',path.join(dir,'in.pdf'),path.join(dir,'p')],{timeout:120000});
   const pages=fs.readdirSync(dir).filter(f=>/^p-\d+\.png$/.test(f)).sort();
   for(const f of pages)text+=(await ocrImage(path.join(dir,f)))+'\n\n'}
  else if(/^image\//.test(mime)||['png','jpg','jpeg','tif','tiff','bmp','webp'].includes(ext)){
   const p=path.join(dir,'in.'+(ext||'png'));fs.writeFileSync(p,buf);text=await ocrImage(p)}
  else throw fail('This file type cannot be read.')}
 catch(e){if(e.status)throw e;throw fail('The text could not be read from this file.')}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
 text=text.replace(/\r/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 if(text.length<20)throw fail('No readable text was found in this scan.');
 return text.slice(0,60000)}
module.exports={ocr,have};
