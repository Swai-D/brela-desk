const http=require('http');const sent=[];
http.createServer((req,res)=>{let b='';req.on('data',d=>b+=d);req.on('end',()=>{
 const auth=req.headers.authorization;if(auth!=='Bearer tok'){res.writeHead(401);return res.end('{}')}
 if(req.url==='/__sent'){res.writeHead(200);return res.end(JSON.stringify(sent))}
 if(req.method==='POST'&&req.url==='/v23.0/PN1/messages'){sent.push(JSON.parse(b));res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"messages":[{"id":"wamid.x"}]}')}
 if(req.url==='/v23.0/MEDIA1'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({url:'http://localhost:4010/dl/1',mime_type:'application/pdf',file_size:12}))}
 if(req.url==='/v23.0/MEDIA2'){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({url:'http://localhost:4010/dl/2',mime_type:'image/jpeg',file_size:5}))}
 if(req.url.startsWith('/dl/')){res.writeHead(200);return res.end('PDFBYTES-'+req.url.slice(4))}
 res.writeHead(404);res.end('{}')})}).listen(4010);
