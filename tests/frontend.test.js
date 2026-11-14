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
const profileHtml=fs.readFileSync(path.join(pub,'profile.html'),'utf8');
const dashboardHtml=fs.readFileSync(path.join(pub,'index.html'),'utf8');
const topbarJs=fs.readFileSync(path.join(pub,'assets/js/topbar.js'),'utf8');
const dashboardJs=js.slice(js.indexOf('async dashboard()'),js.indexOf('async mywork()'));
ok('the dashboard uses the template welcome heading and keeps its primary action in the title row',/Welcome !/.test(dashboardHtml)&&/page-title-right"><button id="newCaseBtn"/.test(dashboardHtml)&&!/<div class="d-flex justify-content-end mb-3"><button id="newCaseBtn"/.test(dashboardHtml));
ok('the five dashboard metrics use template-style cards with proportional pie charts',/cards=\[\['Open cases'[\s\S]*?'Completed'/.test(dashboardJs)&&/col-6 col-md-4 col-xl/.test(dashboardJs)&&/card-h-100 dashboard-stat-card/.test(dashboardJs)&&/dashboard-stat-label/.test(dashboardJs)&&/dashboard-stat-chart/.test(dashboardJs)&&/of all cases/.test(dashboardJs)&&/Math\.round\(c\[1\]\/total\*100\)/.test(dashboardJs)&&/new ApexCharts\(\$\(`stat-chart-\$\{i\}`\).*type:'pie'/.test(dashboardJs)&&/series:total\?\[c\[1\],total-c\[1\]\]:\[0\]/.test(dashboardJs)&&/dashboard-stat-card\{height:100%;min-height:132px\}/.test(fs.readFileSync(path.join(pub,'assets/css/brela.css'),'utf8')));
ok('the case comment box is a real form (Enter sends, typing is never intercepted)',/id="cmForm"/.test(js)&&/addEventListener\('submit'/.test(js));
ok('the login page is a real form',/<form[^>]*id="login"/.test(fs.readFileSync(path.join(pub,'login.html'),'utf8')));
ok('the profile page includes account, team and recent case cards',/data-page="profile"/.test(profileHtml)&&/async profile\(\)/.test(js)&&/class="profile-user"/.test(js)&&/Role &amp; access/.test(js)&&/Team Members/.test(js)&&/Weekly performance/.test(js)&&/weekly-performance-chart/.test(js)&&/weekly\.rate/.test(js)&&/id="avatarForm"/.test(js)&&/id="profileForm"/.test(js));
ok('the profile loads the template ECharts gauge with a rate-positioned needle',/assets\/libs\/echarts\/echarts\.min\.js/.test(profileHtml)&&fs.existsSync(path.join(pub,'assets/libs/echarts/echarts.min.js'))&&/type:'gauge'/.test(js)&&/pointer:\{show:true/.test(js)&&/data:\[\{value:weekly\.rate/.test(js));
const sidebarPages=fs.readdirSync(pub).filter(f=>f.endsWith('.html')&&!['login.html','auth-lock-screen.html'].includes(f));
ok('the sidebar starts compact and collapses after choosing a section',sidebarPages.every(f=>/data-sidebar-size="sm"/.test(fs.readFileSync(path.join(pub,f),'utf8')))&&/setAttribute\('data-sidebar-size',\s*'sm'\)/.test(topbarJs)&&/sidebar-menu'\)\?\.addEventListener\('click'/.test(topbarJs)&&/classList\.remove\('sidebar-enable'\)/.test(topbarJs)&&!/setTimeout\(\(\)=>\{if\(innerWidth>=1200\)document\.body\.setAttribute\('data-sidebar-size','lg'\)/.test(js));
ok('the profile supports an authenticated password update',/id="passwordForm"/.test(js)&&/currentPassword/.test(js)&&/confirmPassword/.test(js)&&/await api\('\/me\/password'/.test(js));
const lockPage=fs.readFileSync(path.join(pub,'auth-lock-screen.html'),'utf8'),topbar=fs.readFileSync(path.join(pub,'assets/js/topbar.js'),'utf8');
ok('the lock screen uses the template background and reauthenticates the same user',/auth-bg/.test(lockPage)&&/brela\.lock\.user/.test(lockPage)&&/\/api\/login/.test(lockPage)&&/auth-lock-screen\.html/.test(js));
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8'),schema=fs.readFileSync(path.join(__dirname,'..','schema.sql'),'utf8');
ok('weekly completion rate is based on assigned-case history',/CREATE TABLE IF NOT EXISTS case_assignments/.test(schema)&&/INSERT INTO case_assignments\(case_id,user_id\)/.test(server)&&/weeklyPerformance/.test(server)&&/done_event\.text LIKE 'moved % → done'/.test(server));
ok('the lock screen automatically selects the time-based quote and refreshes the matching image',/\/api\/lock-screen\/content/.test(lockPage)&&/imageUrl/.test(lockPage)&&/Africa\/Dar_es_Salaam/.test(lockPage)&&/showCurrentQuote/.test(lockPage)&&/setInterval\(showCurrentQuote,60\*1000\)/.test(lockPage)&&/setInterval\(\(\)=>refresh\(\)/.test(lockPage)&&/visibilitychange/.test(lockPage)&&/Photo by/.test(lockPage)&&!/data-quote-slot=/.test(lockPage)&&!/lock-quote-slot/.test(lockPage)&&/getLockScreenContent\(\)/.test(server)&&/setInterval\(refresh,60\*1000\)/.test(server));
ok('each time slot replaces the single cached image and removes previous-day rows',/lock_screen_content\(day DATE PRIMARY KEY, image_slot/.test(schema)&&/ON CONFLICT\(day\) DO UPDATE SET image_slot=EXCLUDED.image_slot/.test(server)&&/image_data=EXCLUDED.image_data/.test(server)&&server.includes('DELETE FROM lock_screen_content WHERE day<>$1'));
ok('daily image and quote API keys are documented as server-side environment variables',/PIXABAY_API_KEY/.test(fs.readFileSync(path.join(__dirname,'..','.env.example'),'utf8'))&&/API_NINJAS_API_KEY/.test(fs.readFileSync(path.join(__dirname,'..','.env.example'),'utf8')));
ok('the navbar offers manual locking and inactivity is checked client-side',/id="lock-screen"/.test(topbar)&&/15\*60\*1000/.test(js)&&/session\/activity/.test(js)&&/session\/lock/.test(js));
ok('the navbar profile avatar and name follow the template spacing',/header-profile-user[^>]*id="me-av"[\s\S]*?<span class="d-none d-xl-inline-block ms-2 fw-medium" id="me-name"/.test(topbarJs));
const profileJs=js.slice(js.indexOf('async profile()'),js.indexOf('async dashboard()'));
ok('the profile picture uploader is inside personal information and the green case-board link replaces the header uploader',/Personal information[\s\S]*?id="avatarForm"/.test(profileJs)&&/btn btn-success" href="cases-board\.html"[\s\S]*?Back To Case Board/.test(profileJs));
const profileHeader=profileJs.slice(profileJs.indexOf('id="profile-avatar"'),profileJs.indexOf('Personal information'));
ok('the profile header shows the full name and one role line only',/>\$\{esc\(ME\.name\)\}<\/h5>/.test(profileHeader)&&/>\$\{esc\(RN\(ME\.role\)\)\}<\/p>/.test(profileHeader)&&!/LV_N\[role\?\.level\]/.test(profileHeader));
process.exit(fails?(console.log('\n'+fails+' FAILED'),1):(console.log('\nall passed'),0));
