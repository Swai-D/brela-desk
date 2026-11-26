// Security helpers: response headers, same-origin check, password rules, outbound address checks.
const PROD=process.env.NODE_ENV==='production',TEST=process.env.NODE_ENV==='test';
// Page rules: only this site, plus Google Fonts for the typeface. Inline scripts and styles are still used by the pages, so they stay allowed;
// everything else (framing by other sites, <base>, plugins, forms to other sites, loading from other sites) is shut.
const CSP=["default-src 'self'","script-src 'self' 'unsafe-inline'","style-src 'self' 'unsafe-inline' https://fonts.googleapis.com","font-src 'self' data: https://fonts.gstatic.com","img-src 'self' data: blob:","media-src 'self' blob:","connect-src 'self'","frame-src 'self' blob:","object-src 'self' blob:","worker-src 'self' blob:","base-uri 'self'","form-action 'self'","frame-ancestors 'self'"].join('; ');
const headers=(req,res,next)=>{
 res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'SAMEORIGIN','Referrer-Policy':'same-origin','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Resource-Policy':'same-origin','Permissions-Policy':'geolocation=(), microphone=(), payment=(), usb=()','Content-Security-Policy':CSP});
 if(PROD)res.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
 if(req.path.startsWith('/api/'))res.set('Cache-Control','no-store');
 next()};
// A browser that sends an Origin on a state-changing request must send this site's own: stops another site from using a signed-in person's cookie.
const sameOrigin=(req,res,next)=>{
 if(/^(GET|HEAD|OPTIONS)$/.test(req.method))return next();
 const o=req.get('origin');if(!o)return next();
 let host;try{host=new URL(o).host}catch{return res.status(403).json({error:'Request blocked: unknown origin'})}
 const mine=[req.get('x-forwarded-host'),req.get('host')].filter(Boolean).map(h=>h.split(',')[0].trim());
 if(mine.includes(host))return next();
 res.status(403).json({error:'Request blocked: it came from another site'})};
const COMMON=['password','qwerty','letmein','welcome','admin','12345678','123456789','1234567890','iloveyou','brela','changeme'];
const passwordProblem=(p,email='')=>{
 p=String(p||'');if(p.length<10)return 'Password must be at least 10 characters';if(p.length>200)return 'Password is too long';
 const l=p.toLowerCase();if(COMMON.some(c=>l.includes(c)))return 'Choose a password that is not a common word or number pattern';
 if(email&&l.includes(String(email).split('@')[0].toLowerCase())&&String(email).split('@')[0].length>=4)return 'The password must not contain your email name';
 if(/^(.)\1+$/.test(p)||/^\d+$/.test(p))return 'Use letters and other characters, not only numbers or one repeated character';
 return null};
// where the server may send requests on a Manager's behalf (AI custom endpoint): a public https address, never this server's own network
const privateHost=h=>{h=String(h).toLowerCase().replace(/^\[|\]$/g,'');
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.internal')||h.endsWith('.local')||!h.includes('.')&&!h.includes(':'))return true;
 if(/^(127\.|10\.|0\.|169\.254\.|192\.168\.)/.test(h)||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h))return true;
 if(h==='::1'||h==='::'||/^f[cd]/.test(h)||/^fe80/.test(h)||h.startsWith('::ffff:'))return true;return false};
const endpointProblem=u=>{
 let x;try{x=new URL(u)}catch{return 'The custom endpoint must be a full URL starting with https://'}
 if(TEST)return null;
 if(x.protocol!=='https:')return 'The custom endpoint must start with https://';
 if(x.username||x.password)return 'The custom endpoint must not contain a user name or password';
 if(privateHost(x.hostname))return 'The custom endpoint must be a public address, not one on this server or its network';
 return null};
module.exports={headers,sameOrigin,passwordProblem,endpointProblem,privateHost,CSP};
