// What a role can do. Each permission is one tick box in Settings → Roles.
// `base` is the lowest starting preset that has it ticked by default (STAFF < SENIOR < MANAGER).
const GROUPS=[
 {id:'cases',title:'Cases and clients',items:[
  {key:'cases.edit',label:'Change a case\'s assignee and due date',base:'SENIOR'},
  {key:'cases.submit',label:'Submit cases to BRELA and record BRELA\'s answer',base:'SENIOR'},
  {key:'cases.retarget',label:'Change a case\'s client or case type',base:'MANAGER'},
  {key:'cases.delete',label:'Delete cases',base:'MANAGER'},
  {key:'clients.rename',label:'Rename clients',base:'SENIOR'},
  {key:'clients.delete',label:'Delete clients',base:'MANAGER'}]},
 {id:'docs',title:'Documents',items:[
  {key:'files.manage',label:'Rename, replace and delete files uploaded by other people',base:'SENIOR'},
  {key:'checklist.edit',label:'Rename or remove checklist items on a case',base:'SENIOR'},
  {key:'docs.selfcheck',label:'Mark a document as checked even if they made it themselves',base:'MANAGER'},
  {key:'comments.delete',label:'Delete other people\'s comments',base:'MANAGER'}]},
 {id:'vault',title:'Client logins (vault)',items:[
  {key:'vault.manage',label:'Open any client\'s vault, and add, edit and delete logins',base:'SENIOR'}]},
 {id:'templates',title:'Templates and AI',items:[
  {key:'templates.edit',label:'Create, edit, approve and teach document templates',base:'SENIOR'},
  {key:'templates.delete',label:'Delete document templates',base:'MANAGER'},
  {key:'wizards.manage',label:'Create, edit and delete document wizards',base:'MANAGER'},
  {key:'ai.use',label:'Use the AI assistant',base:'STAFF'},
  {key:'ai.manage',label:'Set up the AI assistant: provider, model, key, limits and privacy',base:'MANAGER'}]},
 {id:'admin',title:'Settings and reports',items:[
  {key:'team.manage',label:'Add, edit, deactivate and delete team members',base:'MANAGER'},
  {key:'casetypes.manage',label:'Create, edit and delete case types',base:'MANAGER'},
  {key:'roles.manage',label:'Create, edit and delete roles and choose what they can do',base:'MANAGER'},
  {key:'playbook.edit',label:'Edit the Playbook',base:'MANAGER'},
  {key:'whatsapp.manage',label:'Manage WhatsApp settings and send test messages',base:'MANAGER'},
  {key:'reports.view',label:'Open the monthly Reports',base:'MANAGER'},
  {key:'reference.manage',label:'Add, change and remove the reference library (the Companies Act and guides)',base:'MANAGER'},
  {key:'audit.view',label:'See the audit log',base:'MANAGER'}]}];
const ALL=GROUPS.flatMap(g=>g.items.map(i=>i.key));
const RANK={STAFF:0,SENIOR:1,MANAGER:2};
// the permissions a preset starts with
const preset=lv=>GROUPS.flatMap(g=>g.items).filter(i=>RANK[i.base]<=RANK[lv]).map(i=>i.key);
// the highest preset whose permissions are all ticked: only a label and a sort order, never used for access
const levelOf=perms=>{const s=new Set(perms);return s.has('roles.manage')&&preset('MANAGER').every(k=>s.has(k))?'MANAGER':preset('SENIOR').every(k=>s.has(k))?'SENIOR':'STAFF'};
const clean=a=>[...new Set((Array.isArray(a)?a:[]).map(String).filter(k=>ALL.includes(k)))];
module.exports={GROUPS,ALL,preset,levelOf,clean};
