/* ============================================================
   Actionables v3 — clean hierarchy:
   Project → SPOC/Owner → Line Item → Description → ETA → Status
   SPOC = Owner (same concept, no separate Owner entity)
   ============================================================ */
'use strict';
var A=window.Android||null;

/* ---- STATUS CONFIG ---- */
var ST_META=[
  ['In Progress','In Progress','b-ip'],
  ['On Hold',    'On Hold',    'b-ar'],
  ['Dependency', 'Dependency', 'b-asg'],
  ['Completed',  'Completed',  'b-dn']
];
var STATUSES=ST_META.map(function(r){return r[0];});
/* legacy statuses collapse onto the new four */
var STATUS_MAP={
  'Pending':'In Progress','Pending Testing':'In Progress',
  'Awaiting Response':'Dependency','Awaiting Bank':'Dependency',
  'Awaiting Signoff':'Dependency','Awaiting Confirmation':'Dependency',
  'Scheduled':'On Hold','Cancelled':'Completed'
};
/* "AWAITS" now means blocked on a dependency */
var AWAITS=['Dependency'];
function stShort(s){for(var i=0;i<ST_META.length;i++)if(ST_META[i][0]===s)return ST_META[i][1];return s;}
function stCls(s){for(var i=0;i<ST_META.length;i++)if(ST_META[i][0]===s)return ST_META[i][2];return 'b-pn';}

var ETA_KINDS=[['none','No ETA'],['tbd','TBD \u2014 to be confirmed'],['date','Specific date'],['range','Date range']];
var MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

/* ---- APPEARANCE: accent palettes + font presets ---- */
var ACCENTS={
  orange: {c:'#F97316', d:'rgba(249,115,22,.15)', name:'Orange'},
  blue:   {c:'#3B82F6', d:'rgba(59,130,246,.14)',  name:'Blue'},
  violet: {c:'#8B5CF6', d:'rgba(139,92,246,.14)',  name:'Violet'},
  indigo: {c:'#6366F1', d:'rgba(99,102,241,.14)',  name:'Indigo'},
  teal:   {c:'#14B8A6', d:'rgba(20,184,166,.14)',  name:'Teal'},
  emerald:{c:'#10B981', d:'rgba(16,185,129,.14)',  name:'Emerald'},
  amber:  {c:'#F59E0B', d:'rgba(245,158,11,.14)',  name:'Amber'},
  rose:   {c:'#F43F5E', d:'rgba(244,63,94,.14)',   name:'Rose'},
  slate:  {c:'#64748B', d:'rgba(100,116,139,.14)', name:'Graphite'}
};
var FONT_STACK={
  default:  "system-ui, 'Roboto', 'Segoe UI', sans-serif",
  apple:    "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Roboto, sans-serif",
  modern:   "'Segoe UI', 'sans-serif-medium', 'Inter', system-ui, sans-serif",
  pro:      "Georgia, 'Noto Serif', 'Times New Roman', serif",
  condensed:"'sans-serif-condensed', 'Roboto Condensed', 'Arial Narrow', sans-serif",
  mono:     "'Roboto Mono', 'SF Mono', Consolas, monospace"
};
var FONTS=[['default','Default'],['apple','Apple'],['modern','Modern'],['pro','Professional'],['condensed','Condensed'],['mono','Mono']];

/* ---- UTILS ---- */
function $(s,r){return (r||document).querySelector(s);}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function uid(p){return p+Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function pad(n){return (n<10?'0':'')+n;}
function todayISO(){var d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function isoToDate(iso){var p=iso.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
function addDaysISO(iso,n){var p=iso.split('-');var d=new Date(+p[0],+p[1]-1,+p[2]+n);return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
function diffDays(a,b){return Math.round((isoToDate(a)-isoToDate(b))/86400000);}
function fmtD(iso){if(!iso)return '';var p=iso.split('-');return (+p[2])+' '+MON[+p[1]-1];}
function fmtDY(iso){if(!iso)return '';var p=iso.split('-');return (+p[2])+' '+MON[+p[1]-1]+' '+p[0];}
function fmtTs(ts){var d=new Date(ts);return pad(d.getDate())+' '+MON[d.getMonth()]+' '+pad(d.getHours())+':'+pad(d.getMinutes());}
function toast(msg,action){
  var w=$('#toastwrap');
  var html='<div class="toast">'+esc(msg);
  if(action&&action.label)html+='<button class="toast-act">'+esc(action.label)+'</button>';
  html+='</div>';
  w.innerHTML=html;
  var t=w.firstChild;
  if(action&&action.fn){var ab=w.querySelector('.toast-act');if(ab)ab.addEventListener('click',function(){try{action.fn();}catch(e){}t.classList.remove('in');setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},200);});}
  requestAnimationFrame(function(){t.classList.add('in');});
  var dur=action?5200:2300;
  setTimeout(function(){t.classList.remove('in');setTimeout(function(){if(t.parentNode)t.parentNode.removeChild(t);},250);},dur);
}

/* ---- ICONS ---- */
var IC={
  play:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
  pause:'<path d="M8 5.5h3v13H8zM13 5.5h3v13h-3z" fill="currentColor" stroke="none"/>',
  tag:'<path d="M4 12.6V4h8.6L20 11.4 12.6 19z"/><circle cx="15.4" cy="8.6" r="1.3"/>',
  board:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
  items:'<rect x="3.5" y="4" width="6.5" height="6.5" rx="1.7"/><path d="M5.6 7.2l1.3 1.3 2.3-2.6"/><path d="M13.5 7.2h7"/><rect x="3.5" y="13.5" width="6.5" height="6.5" rx="1.7"/><path d="M13.5 16.7h7"/>',
  cal:'<rect x="3.5" y="5" width="17" height="15.5" rx="2.3"/><path d="M3.5 9.5h17M8 3.2v3.6M16 3.2v3.6"/>',
  proj:'<path d="M4.5 20.5V5.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v15"/><path d="M14.5 9.5h4a1 1 0 0 1 1 1v10"/><path d="M3 20.5h18"/>',
  dots:'<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  plus:'<path d="M12 5.5v13M5.5 12h13"/>',
  search:'<circle cx="11" cy="11" r="6.6"/><path d="M20.2 20.2l-3.5-3.5"/>',
  bell:'<path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 4.6 1.9 5.7 1.9 5.7H4.3s1.9-1.1 1.9-5.7"/><path d="M10.6 19.3a1.7 1.7 0 0 0 2.8 0"/>',
  filter:'<path d="M4.5 5.5h15l-5.6 6.6v4.9l-3.8 2v-6.9z"/>',
  dl:'<path d="M12 4v10M7.8 10.2 12 14.4l4.2-4.2M4.8 19.5h14.4"/>',
  back:'<path d="M14.8 5.8 8.6 12l6.2 6.2"/>',
  chevR:'<path d="M9.2 5.8 15.4 12l-6.2 6.2"/>',
  x:'<path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6"/>',
  check:'<path d="M4.8 12.6l4.7 4.7L19.2 7"/>',
  trash:'<path d="M4.8 7h14.4M9.7 7V4.8h4.6V7M6.9 7l.9 12.7h8.4L17.1 7"/>',
  edit:'<path d="M4.8 19.2h3.9L19.1 8.8a2 2 0 0 0-2.9-2.9L5.8 16.3l-1 2.9z"/>',
  alert:'<path d="M12 4 3.2 19.4h17.6L12 4z"/><path d="M12 9.8v4.4M12 16.9h.02"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7.8V12l3 1.9"/>',
  person:'<circle cx="12" cy="8.2" r="3.4"/><path d="M5.5 19.5c.9-3.4 3.4-5.1 6.5-5.1s5.6 1.7 6.5 5.1"/>',
  people:'<circle cx="9" cy="8.6" r="3.1"/><path d="M3.4 19.3c.8-3 3-4.6 5.6-4.6s4.8 1.6 5.6 4.6"/><path d="M15.2 5.9a3.1 3.1 0 0 1 0 5.4M17.3 14.9c1.9.5 3 1.9 3.4 4.4"/>',
  doc:'<path d="M6.5 3.8h7.2l4 4v12.4h-11.2z"/><path d="M13.5 3.8V8h4.2M9.2 12.6h5.6M9.2 16h5.6"/>',
  sliders:'<path d="M4.5 7.5h8.7M16.6 7.5h2.9M14.6 5.4v4.2M4.5 16.5h2.9M10.9 16.5h8.6M8.9 14.4v4.2"/>',
  ext:'<path d="M13.8 5.2h5v5M18.8 5.2l-8 8M18.5 13.8v4.9a.8.8 0 0 1-.8.8H5.8a.8.8 0 0 1-.8-.8V6.8a.8.8 0 0 1 .8-.8h4.9"/>',
  sun:'<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/>',
  moon:'<path d="M21 12.8a9 9 0 1 1-9.8-9.8A7 7 0 0 0 21 12.8z"/>',
  cloud:'<path d="M7 18h9.5a3.5 3.5 0 0 0 .3-6.98A5 5 0 0 0 7.2 9.5 3.75 3.75 0 0 0 7 18z"/>',
  star:'<path d="M12 3.6l2.55 5.17 5.7.83-4.13 4.02.98 5.68L12 16.6l-5.08 2.7.98-5.68L3.75 9.6l5.7-.83z"/>',
  refresh:'<path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/>'
};
function I(name,cls){return '<svg class="'+(cls||'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+IC[name]+'</svg>';}

/* ---- STATE ---- */
var S=null;
var view={name:'list',params:{}};
var history_=[];
var sheetStack=[];
var filters=defaultFilters();
var peopleView={sort:'open',filt:'all'};
var tagDropOpen=false;
var calState=null;
var exportSel={projId:''};

function defaultFilters(){
  return{q:'',quick:'all',sort:'smart',project:[],spoc:[],status:[],from:'',to:'',fOd:false,fFu:false,fTk:false,tags:[],group:'none'};
}

function loadState(){
  var raw='';
  try{if(A&&A.loadData)raw=A.loadData()||'';}catch(e){raw='';}
  if(!raw){try{raw=localStorage.getItem('act_data')||'';}catch(e){raw='';}}
  if(raw){
    try{var p=JSON.parse(raw);if(p&&p.actionables){if(p.actionables.length===0){var _rv=newestNonEmptyVersion();if(_rv){S=_rv;ensureDefaults();snapshot('Recovered from restore point');saveState();return;}}S=p;ensureDefaults();snapshot('Opened');return;}}catch(e){}
  }
  S=window.buildSeed(Date.now());
  ensureDefaults();
  snapshot('First run');
  saveState();
}

function ensureDefaults(){
  /* v2 → v3 migration: owners become projects */
  if(S.owners&&!S.version){
    S.projects=S.owners.map(function(o){return{id:o.id,name:o.name,code:o.code||o.name.split(' ')[0]};});
    (S.people||[]).forEach(function(u){u.projectId=u.ownerId||u.projectId;delete u.ownerId;});
    S.actionables.forEach(function(a){a.projectId=a.ownerId||a.projectId;delete a.ownerId;});
    delete S.owners;S.version=3;
  }
  S.version=S.version||3;
  S.settings=S.settings||{};
  var d={userName:'Yash',notifEnabled:true,notifHour:9,notifMinute:0,notifSeenDate:'',theme:'dark',accent:'orange',font:'default'};
  for(var k in d)if(S.settings[k]===undefined)S.settings[k]=d[k];
  S.people=S.people||[];S.projects=S.projects||[];
  /* SPOCs are global now — drop any legacy project binding */
  S.people.forEach(function(u){if(u.projectId!==undefined)delete u.projectId;});
  /* built-in Personal project for quick self tasks */
  if(!S.projects.some(function(p){return p.id==='__personal';}))
    S.projects.push({id:'__personal',name:'Personal',code:'ME'});
  S.actionables.forEach(function(a){
    a.comments=a.comments||[];a.activity=a.activity||[];a.spocIds=a.spocIds||[];
    if(!a.rem)a.rem={on:false,date:'',time:'',note:'',done:false};
    if(a.etaKind===undefined)a.etaKind=a.eta?'date':'none';
    if(a.etaEnd===undefined)a.etaEnd='';
    if(a.ticketUrl===undefined)a.ticketUrl='';
    if(a.important===undefined)a.important=false;
    if(!Array.isArray(a.tags))a.tags=[];
    if(STATUS_MAP[a.status]){a.status=STATUS_MAP[a.status];if(a.status==='Completed'&&!a.completedAt)a.completedAt=a.updatedAt||Date.now();}
  });
}

function saveState(){
  var json=JSON.stringify(S);
  try{localStorage.setItem('act_data',json);}catch(e){}
  try{if(A&&A.saveData)A.saveData(json);}catch(e){}
  try{if(window.Cloud&&window.Cloud.push)window.Cloud.push();}catch(e){}
}

function applyTheme(){
  if(!document.documentElement)return;
  var s=(S&&S.settings)?S.settings:{};
  var root=document.documentElement;
  root.className=(s.theme||'dark')==='light'?'light-theme':'';
  var acc=ACCENTS[s.accent||'orange']||ACCENTS.orange;
  root.style.setProperty('--acc',acc.c);
  root.style.setProperty('--acc-dim',acc.d);
  root.style.setProperty('--font',FONT_STACK[s.font||'default']||FONT_STACK.default);
  try{
    if(A&&A.setStatusBar){
      var _lt=(s.theme||'dark')==='light';
      var _bg=(getComputedStyle(root).getPropertyValue('--bg')||'').trim()||(_lt?'#F0F4F8':'#07090D');
      A.setStatusBar(_bg,_lt);
    }
  }catch(e){}
}

/* ---- LOOKUPS ---- */
function projById(id){for(var i=0;i<S.projects.length;i++)if(S.projects[i].id===id)return S.projects[i];return null;}
function projName(id){var p=projById(id);return p?p.name:'\u2014';}
function projCode(id){var p=projById(id);return p?(p.code||p.name):'\u2014';}
function personById(id){for(var i=0;i<S.people.length;i++)if(S.people[i].id===id)return S.people[i];return null;}
function personName(id){var u=personById(id);return u?u.name:'?';}
function peopleSorted(){return S.people.slice().sort(function(a,b){return a.name.toLowerCase()<b.name.toLowerCase()?-1:1;});}
function personProjectCodes(pid){
  var seen={},codes=[];
  S.actionables.forEach(function(a){if(a.spocIds.indexOf(pid)>=0){var c=projCode(a.projectId);if(!seen[c]){seen[c]=1;codes.push(c);}}});
  return codes;
}
function actById(id){for(var i=0;i<S.actionables.length;i++)if(S.actionables[i].id===id)return S.actionables[i];return null;}
function mainActs(){return S.actionables.filter(function(a){return a.projectId!=='__personal';});}
function isOpen(a){return a.status!=='Completed';}
function spocLabel(a){if(!a.spocIds.length)return 'To be assigned';return a.spocIds.map(function(id){return personName(id);}).join(' & ');}
function spocKey(a){return a.spocIds.length?a.spocIds.slice().sort().join('+'):'__tbc';}
function myIds(){var ids={};S.people.forEach(function(u){if(u.name===S.settings.userName)ids[u.id]=1;});return ids;}
function isMine(a,ids){for(var i=0;i<a.spocIds.length;i++)if(ids[a.spocIds[i]])return true;return false;}

/* ---- ETA HELPERS ---- */
function endEta(a){if(a.etaKind==='range')return a.etaEnd||a.eta||'';if(a.etaKind==='date')return a.eta||'';return '';}
function isOver(a,t){if(!isOpen(a))return false;var e=endEta(a);return !!e&&e<t;}
function coversDay(a,d){if(a.etaKind==='date')return a.eta===d;if(a.etaKind==='range')return a.eta&&a.etaEnd?(a.eta<=d&&d<=a.etaEnd):(a.eta===d||a.etaEnd===d);return false;}
function fmtEta(a){if(a.etaKind==='tbd')return 'TBD';if(a.etaKind==='none'||!a.eta)return 'No ETA';if(a.etaKind==='range')return fmtD(a.eta)+'\u2013'+fmtDY(a.etaEnd||a.eta);return fmtDY(a.eta);}
function plainEta(a){if(a.etaKind==='tbd')return 'TBD';if(a.etaKind==='none'||!a.eta)return '';if(a.etaKind==='range')return a.eta+' to '+(a.etaEnd||a.eta);return a.eta;}
function relEta(a){
  if(a.status==='Completed')return{t:'Done',cls:'dc-done'};
  if(a.etaKind==='tbd')return{t:'TBD',cls:'dc-tbd'};
  if(a.etaKind==='none'||!a.eta)return{t:'No ETA',cls:'dc-none'};
  var end=endEta(a),t=todayISO(),k=diffDays(end,t);
  var cls=k<0?'dc-od':k===0?'dc-today':k<=3?'dc-soon':'dc-fut';
  if(a.etaKind==='range'){if(k<0)return{t:'OD '+(-k)+'d',cls:'dc-od'};if(k===0)return{t:'Ends today',cls:'dc-today'};return{t:fmtD(a.eta)+'\u2013'+fmtD(end),cls:cls};}
  if(k<0)return{t:'OD '+(-k)+'d',cls:'dc-od'};
  if(k===0)return{t:'Today',cls:'dc-today'};
  if(k===1)return{t:'Tmrw',cls:'dc-soon'};
  if(k<=7)return{t:fmtD(end)+' \u00b7 '+k+'d',cls:cls};
  return{t:fmtD(end),cls:cls};
}
function remDue(a,t){return isOpen(a)&&a.rem&&a.rem.on&&!a.rem.done&&a.rem.date&&a.rem.date<=t;}

/* ---- METRICS ---- */
function metrics(){
  var t=todayISO(),mine=myIds();
  var m={open:[],overdue:[],today:[],week:[],tomorrow:[],mine:[],
    awaitAll:[],ip:[],sc:[],done30:[],remDueL:[],remToday:[]};
  var cutoff=Date.now()-30*86400000;
  mainActs().forEach(function(a){
    if(a.status==='Completed'){if(a.completedAt&&a.completedAt>=cutoff)m.done30.push(a);return;}
    m.open.push(a);
    var end=endEta(a);
    if(end){var k=diffDays(end,t);
      if(k<0)m.overdue.push(a);
      else if(k===0)m.today.push(a);
      if(k>=0&&k<=7)m.week.push(a);
      if(k===1)m.tomorrow.push(a);
    }else if(a.etaKind==='range'&&coversDay(a,t))m.today.push(a);
    if(a.status==='Dependency')m.awaitAll.push(a);
    else if(a.status==='In Progress')m.ip.push(a);
    else if(a.status==='On Hold')m.sc.push(a);
    if(isMine(a,mine))m.mine.push(a);
    if(remDue(a,t))m.remDueL.push(a);
    if(a.rem&&a.rem.on&&!a.rem.done&&a.rem.date===t)m.remToday.push(a);
  });
  return m;
}
function projStats(pid){
  var t=todayISO(),st={open:0,od:0,wait:0,week:0,fu:0,done30:0};
  var cutoff=Date.now()-30*86400000;
  S.actionables.forEach(function(a){
    if(a.projectId!==pid)return;
    if(isOpen(a)){st.open++;if(isOver(a,t))st.od++;if(AWAITS.indexOf(a.status)>=0)st.wait++;
      var end=endEta(a);if(end){var k=diffDays(end,t);if(k>=0&&k<=7)st.week++;}
      if(remDue(a,t))st.fu++;
    }else if(a.status==='Completed'&&a.completedAt>=cutoff)st.done30++;
  });
  return st;
}
function personStats(pid){
  var t=todayISO(),st={open:0,od:0,fu:0,week:0};
  mainActs().forEach(function(a){
    if(!isOpen(a))return;
    var hit=pid==='__tbc'?a.spocIds.length===0:a.spocIds.indexOf(pid)>=0;
    if(!hit)return;
    st.open++;if(isOver(a,t))st.od++;if(remDue(a,t))st.fu++;
    var end=endEta(a);if(end){var k=diffDays(end,t);if(k>=0&&k<=7)st.week++;}
  });
  return st;
}

/* ---- SORTING & FILTERING ---- */
function smartCmp(a,b,t){
  if(!!a.important!==!!b.important)return a.important?-1:1;
  var ea=endEta(a),eb=endEta(b);
  var oa=ea&&ea<t?0:1,ob=eb&&eb<t?0:1;
  if(oa!==ob)return oa-ob;
  var ka=ea?diffDays(ea,t):(a.etaKind==='tbd'?9000:9500);
  var kb=eb?diffDays(eb,t):(b.etaKind==='tbd'?9000:9500);
  if(ka!==kb)return ka-kb;
  var ra=a.rem&&a.rem.on&&!a.rem.done&&a.rem.date?a.rem.date:'9999';
  var rb=b.rem&&b.rem.on&&!b.rem.done&&b.rem.date?b.rem.date:'9999';
  if(ra!==rb)return ra<rb?-1:1;
  return(b.updatedAt||0)-(a.updatedAt||0);
}
function sortActs(list,mode){
  var t=todayISO(),arr=list.slice();mode=mode||filters.sort||'smart';
  if(mode==='eta'){arr.sort(function(a,b){var ea=endEta(a)||(a.etaKind==='tbd'?'9998':'9999'),eb=endEta(b)||(b.etaKind==='tbd'?'9998':'9999');if(ea!==eb)return ea<eb?-1:1;return smartCmp(a,b,t);});}
  else if(mode==='ticket'){arr.sort(function(a,b){var ta=a.ticket||'\uffff',tb=b.ticket||'\uffff';if(ta!==tb)return ta<tb?-1:1;return smartCmp(a,b,t);});}
  else if(mode==='project'){arr.sort(function(a,b){var na=projName(a.projectId),nb=projName(b.projectId);if(na!==nb)return na<nb?-1:1;return smartCmp(a,b,t);});}
  else if(mode==='updated'){arr.sort(function(a,b){return(b.updatedAt||0)-(a.updatedAt||0);});}
  else{arr.sort(function(a,b){return smartCmp(a,b,t);});}
  return arr;
}
function quickPass(a,q,t,mine){
  switch(q){
    case 'everything':return true;
    case 'all':return isOpen(a);
    case 'mine':return isOpen(a)&&isMine(a,mine);
    case 'today':return isOpen(a)&&(coversDay(a,t)||endEta(a)===t);
    case 'week':{if(!isOpen(a))return false;var e=endEta(a);if(!e)return false;var k=diffDays(e,t);return k>=0&&k<=7;}
    case 'overdue':return isOver(a,t);
    case 'followup':return remDue(a,t);
    case 'important':return isOpen(a)&&!!a.important;
    case 'awaiting':case 'dep':return isOpen(a)&&a.status==='Dependency';
    case 'inprog':return a.status==='In Progress';
    case 'onhold':return a.status==='On Hold';
    case 'completed':return a.status==='Completed';
    default:return true;
  }
}
function filteredActs(){
  var t=todayISO(),mine=myIds(),q=filters.q.trim().toLowerCase();
  var list=mainActs().filter(function(a){
    if(!quickPass(a,filters.quick,t,mine))return false;
    if(filters.project.length&&filters.project.indexOf(a.projectId)<0)return false;
    if(filters.spoc.length){var hit=false;for(var i=0;i<filters.spoc.length;i++){var sid=filters.spoc[i];if(sid==='__tbc'?a.spocIds.length===0:a.spocIds.indexOf(sid)>=0){hit=true;break;}}if(!hit)return false;}
    if(filters.status.length&&filters.status.indexOf(a.status)<0)return false;
    if(filters.tags&&filters.tags.length){var _at=(a.tags||[]).map(function(x){return x.toLowerCase();}),_hit=false;for(var _fi=0;_fi<filters.tags.length;_fi++){if(_at.indexOf(filters.tags[_fi].toLowerCase())>=0){_hit=true;break;}}if(!_hit)return false;}
    if(filters.fOd&&!isOver(a,t))return false;
    if(filters.fFu&&!remDue(a,t))return false;
    if(filters.fTk&&!a.ticket)return false;
    if(filters.from||filters.to){var e=endEta(a);if(!e)return false;if(filters.from&&e<filters.from)return false;if(filters.to&&e>filters.to)return false;}
    if(q){var hay=(a.ticket+' '+a.lineItem+' '+a.task+' '+a.notes+' '+projName(a.projectId)+' '+spocLabel(a)+' '+a.status).toLowerCase();if(hay.indexOf(q)<0)return false;}
    return true;
  });
  if(filters.quick==='completed')return list.sort(function(a,b){return(b.completedAt||0)-(a.completedAt||0);});
  if(filters.quick==='everything'){var t2=todayISO();return list.sort(function(a,b){var ca=isOpen(a)?0:1,cb=isOpen(b)?0:1;if(ca!==cb)return ca-cb;if(ca===1)return(b.completedAt||b.updatedAt||0)-(a.completedAt||a.updatedAt||0);return smartCmp(a,b,t2);});}
  return sortActs(list);
}
function advCount(){
  return filters.project.length+filters.spoc.length+filters.status.length+
    (filters.from?1:0)+(filters.to?1:0)+(filters.fOd?1:0)+(filters.fFu?1:0)+(filters.fTk?1:0)+((filters.tags&&filters.tags.length)?1:0)+(filters.sort!=='smart'?1:0);
}

/* ---- MUTATIONS ---- */
function logAct(a,event,from,to){a.activity.push({ts:Date.now(),user:S.settings.userName||'You',event:event,from:from||'',to:to||''});}
var FIELD_LABEL={status:'Status',projectId:'Project',ticket:'Ticket ID',ticketUrl:'Ticket link',lineItem:'Line item',task:'Description',notes:'Remarks'};
function fieldVal(f,v){if(f==='projectId')return projName(v);return v||'None';}
function updateAct(id,patch){
  var a=actById(id);if(!a)return false;
  var changed=false;
  ['projectId','ticket','ticketUrl','lineItem','task','status','notes'].forEach(function(f){
    if(patch[f]===undefined||patch[f]===a[f])return;
    var lbl=FIELD_LABEL[f];
    if(f==='task'||f==='notes'||f==='lineItem'||f==='ticketUrl')logAct(a,lbl+' updated');
    else logAct(a,lbl+' changed',fieldVal(f,a[f]),fieldVal(f,patch[f]));
    a[f]=patch[f];changed=true;
    if(f==='status'){if(patch[f]==='Completed')a.completedAt=Date.now();else if(a.completedAt)a.completedAt=null;}
  });
  if(patch.important!==undefined&&!!patch.important!==!!a.important){a.important=!!patch.important;logAct(a,patch.important?'Marked important':'Unmarked important');changed=true;}
  if(patch.tags!==undefined){var okt=(a.tags||[]).slice().sort().join('\u0001'),nkt=patch.tags.slice().sort().join('\u0001');if(okt!==nkt){a.tags=patch.tags.slice();logAct(a,'Tags updated','',patch.tags.join(', '));changed=true;}}
  if(patch.spocIds!==undefined){
    var oldK=a.spocIds.slice().sort().join(','),newK=patch.spocIds.slice().sort().join(',');
    if(oldK!==newK){logAct(a,'Owner/SPOC changed',spocLabel(a),patch.spocIds.length?patch.spocIds.map(function(i2){return personName(i2);}).join(' & '):'To be assigned');a.spocIds=patch.spocIds.slice();changed=true;}
  }
  var ek=patch.etaKind!==undefined?patch.etaKind:a.etaKind,ev=patch.eta!==undefined?patch.eta:a.eta,ee=patch.etaEnd!==undefined?patch.etaEnd:a.etaEnd;
  if(ek!=='range')ee='';if(ek==='none'||ek==='tbd'){ev='';ee='';}
  if(ek!==a.etaKind||ev!==a.eta||ee!==a.etaEnd){var before=fmtEta(a);a.etaKind=ek;a.eta=ev;a.etaEnd=ee;logAct(a,'ETA changed',before,fmtEta(a));changed=true;}
  if(changed){a.updatedAt=Date.now();saveState();}
  return changed;
}
function remPatch(id,patch,ev){
  var a=actById(id);if(!a)return;
  if(!a.rem)a.rem={on:false,date:'',time:'',note:'',done:false};
  for(var k in patch)a.rem[k]=patch[k];
  if(ev)logAct(a,ev.e,ev.f||'',ev.t||'');
  a.updatedAt=Date.now();saveState();
}
function addComment(id,text){
  var a=actById(id);if(!a)return;
  a.comments.push({ts:Date.now(),user:S.settings.userName||'You',text:text});
  logAct(a,'Comment added');a.updatedAt=Date.now();saveState();
}

/* ---- HTML HELPERS ---- */
function fuChip(a,t){if(!(a.rem&&a.rem.on&&!a.rem.done))return '';var due=remDue(a,t);return '<span class="fu'+(due?' due':'')+'">'+I('bell')+(a.rem.date?fmtD(a.rem.date):'FU')+'</span>';}
function ttlHtml(a){return a.ticket?'<span class="tk">'+esc(a.ticket)+'</span> \u2014 '+esc(a.lineItem):esc(a.lineItem);}

/* actRow: shows in list view — includes truncated description */
function actRow(a,opts){
  opts=opts||{};var t=todayISO();
  var st=etaState(a),od=(st==='over'||st==='severe'),severe=(st==='severe'),done=a.status==='Completed';
  var desc=a.task?(a.task.length>110?a.task.slice(0,110)+'\u2026':a.task):'';
  return '<button class="arow trow'+(od?' od':'')+(severe?' severe':'')+(done?' done':'')+(a.important?' imp':'')+(a.projectId==='__personal'?' personal':'')+'" data-act="open" data-id="'+a.id+'">'+
    '<div class="row-main">'+
      '<div class="row-title">'+ttlHtml(a)+'</div>'+
      (desc?'<div class="row-desc">'+esc(desc)+'</div>':'')+
      '<div class="row-meta"><span class="badge '+stCls(a.status)+'">'+esc(stShort(a.status))+'</span>'+
        '<span class="who'+(a.spocIds.length?'':' un')+'">'+esc(spocLabel(a))+'</span>'+
        fuChip(a,t)+tagsHtml(a)+'</div>'+
    '</div>'+
    '<div class="row-side">'+etaView(a)+(a.important?'<div class="row-prio">'+I('star')+'Important</div>':'')+'</div>'+
  '</button>';
}

/* boardRow: shows in project board — includes truncated description */
function boardRow(a){
  var t=todayISO();
  var st=etaState(a),od=(st==='over'||st==='severe'),severe=(st==='severe'),done=a.status==='Completed';
  var desc=a.task?(a.task.length>90?a.task.slice(0,90)+'\u2026':a.task):'';
  return '<button class="orow trow'+(od?' od':'')+(severe?' severe':'')+(done?' done':'')+(a.important?' imp':'')+(a.projectId==='__personal'?' personal':'')+'" data-act="open" data-id="'+a.id+'">'+
    '<div class="row-main">'+
      '<div class="row-title">'+ttlHtml(a)+'</div>'+
      (desc?'<div class="row-desc">'+esc(desc)+'</div>':'')+
      '<div class="row-meta"><span class="badge '+stCls(a.status)+'">'+esc(stShort(a.status))+'</span>'+fuChip(a,t)+tagsHtml(a)+'</div>'+
    '</div>'+
    '<div class="row-side">'+etaView(a)+(a.important?'<div class="row-prio">'+I('star')+'Important</div>':'')+'</div>'+
  '</button>';
}

function emptyBox(t1,t2){return '<div class="empty"><div class="t1">'+esc(t1)+'</div><div class="t2">'+esc(t2)+'</div></div>';}
function topbar(title,sub,leftBack,rightHtml){
  return '<header class="topbar">'+
    (leftBack?'<button class="iconbtn" data-act="back">'+I('back')+'</button>':'')+
    '<div class="tt"><h1>'+esc(title)+'</h1>'+(sub?'<div class="sub">'+sub+'</div>':'')+' </div>'+
    (rightHtml||'')+'</header>';
}
function grouped(list){
  var keys=[],map={};
  list.forEach(function(a){var k=spocKey(a);if(!map[k]){map[k]={key:k,label:spocLabel(a),items:[]};keys.push(k);}map[k].items.push(a);});
  var groups=keys.map(function(k){return map[k];});
  groups.sort(function(x,y){var tx=x.key==='__tbc'?1:0,ty=y.key==='__tbc'?1:0;if(tx!==ty)return tx-ty;if(x.items.length!==y.items.length)return y.items.length-x.items.length;return x.label<y.label?-1:1;});
  return groups;
}

/* ---- RENDER ROOT ---- */
function render(){
  var app=$('#app');
  var html='';
  switch(view.name){
    case 'home':html=vHome();break;
    case 'list':html=vList();break;
    case 'calendar':html=vCalendar();break;
    case 'projects':html=vProjects();break;
    case 'projectDetail':html=vProjectDetail(view.params.id);break;
    case 'people':html=vPeople();break;
    case 'personDetail':html=vPersonDetail(view.params.id);break;
    case 'reports':html=vReports();break;
    case 'notifications':html=vNotifications();break;
    case 'settings':html=vSettings();break;
  }
  var fabViews=['home','list','calendar','projects','projectDetail','people','personDetail'];
  app.innerHTML='<div class="screen">'+html+'</div>'+tabbar()+
    (fabViews.indexOf(view.name)>=0?'<button class="fab" data-act="add">'+I('plus')+'Add</button>':'');
  bindViewInputs();
}
function nav(name,params,noHist){
  if(!noHist&&(view.name!==name||JSON.stringify(view.params)!==JSON.stringify(params||{}))){history_.push({name:view.name,params:view.params});if(history_.length>30)history_.shift();}
  view={name:name,params:params||{}};render();
  window.scrollTo(0,0);try{var appEl=$('#app');if(appEl)appEl.scrollTop=0;}catch(e){}
}
function tabbar(){
  var m=metrics(),badge=notifBadgeOn(m);
  var moreViews=['projects','projectDetail','reports','notifications','settings'];
  var onList=moreViews.indexOf(view.name)<0;
  function tab(k,ic,lbl){var on=k==='more'?!onList:onList;return '<button class="tab'+(on?' on':'')+'" data-act="tab" data-tab="'+k+'">'+I(ic)+'<span>'+lbl+'</span>'+(k==='more'&&badge?'<span class="dot"></span>':'')+'</button>';}
  return '<nav class="tabbar tabbar-2">'+
    '<div class="railbrand"><span class="rb-ic">'+I('check')+'</span><span class="rb-tx"><b>Actionables</b><i>Stay on top of what matters</i></span></div>'+
    tab('list','items','Actionables')+tab('more','dots','More')+
    '<div class="railtip">'+railTipHtml()+'</div>'+
  '</nav>';
}
function notifBadgeOn(m){var n=m.overdue.length+m.today.length+m.remDueL.length;return n>0&&S.settings.notifSeenDate!==todayISO();}

/* ====== VIEWS ====== */

/* ---- HOME (board) ---- */
function vHome(){
  var m=metrics(),t=todayISO(),d=new Date();
  var dateLine=DOW[(d.getDay()+6)%7]+', '+fmtDY(t);
  var pills=['<button class="sumpill" data-act="kpi" data-q="all">'+m.open.length+' open</button>'];
  var impN=m.open.filter(function(a){return a.important;}).length;
  if(impN)             pills.push('<button class="sumpill sp-imp"   data-act="kpi" data-q="important">'+impN+' important</button>');
  if(m.mine.length)    pills.push('<button class="sumpill sp-mine"  data-act="kpi" data-q="mine">'+m.mine.length+' mine</button>');
  if(m.overdue.length) pills.push('<button class="sumpill sp-od"    data-act="kpi" data-q="overdue">'+m.overdue.length+' overdue</button>');
  if(m.today.length)   pills.push('<button class="sumpill sp-today" data-act="kpi" data-q="today">'+m.today.length+' due today</button>');
  if(m.week.length)    pills.push('<button class="sumpill sp-week"  data-act="kpi" data-q="week">'+m.week.length+' due this week</button>');
  if(m.awaitAll.length)pills.push('<button class="sumpill sp-wait"  data-act="kpi" data-q="awaiting">'+m.awaitAll.length+' dependency</button>');
  if(m.remDueL.length) pills.push('<button class="sumpill sp-fu"    data-act="kpi" data-q="followup">'+m.remDueL.length+' follow-ups due</button>');
  var isDark=(S.settings.theme||'dark')==='dark';
  var themeBtn='<button class="iconbtn" data-act="theme-toggle" title="Switch to '+(isDark?'light':'dark')+' theme">'+I(isDark?'sun':'moon')+'</button>';
  var bell='<button class="iconbtn" data-act="go-notif">'+I('bell')+(notifBadgeOn(m)?'<span class="dot"></span>':'')+' </button>';
  var search='<button class="iconbtn" data-act="go-search">'+I('search')+'</button>';
  var h=topbar('Actionables',esc(dateLine),false,cloudSyncBtnHtml()+cloudBadgeHtml()+themeBtn+search+bell);
  h+='<div class="sumstrip">'+pills.join('')+'</div>';
  h+='<div class="selfrow">'+
    '<button class="quickadd" data-act="quick-new">'+I('plus')+'Quick task for myself</button>'+
    '<button class="quickadd viewself" data-act="view-personal">'+I('person')+'View your tasks</button>'+
    '</div>';
  if(m.remDueL.length){
    var fus=sortActs(m.remDueL,'smart');
    h+='<div class="eyebrow">Follow-ups due<button class="lnk" data-act="kpi" data-q="followup">All '+fus.length+'</button></div>';
    h+='<div class="list">'+fus.slice(0,5).map(function(a){
      return '<button class="notif n-fu" data-act="open" data-id="'+a.id+'">'+
        '<span class="ic">'+I('bell')+'</span><span class="w">'+
        '<div class="h">'+ttlHtml(a)+'</div>'+
        '<div class="b">'+esc(a.rem.note||'Follow up')+'</div>'+
        '<div class="b" style="color:var(--tx3)">'+esc(spocLabel(a))+' \u00b7 '+esc(projCode(a.projectId))+'</div>'+
        '</span>'+etaView(a)+'</button>';
    }).join('')+'</div>';
  }
  h+='<div class="eyebrow">Project &amp; Owner/SPOC<span style="font-size:.7rem;color:var(--tx3);font-weight:500;letter-spacing:0;text-transform:none">'+m.open.length+' open</span></div>';
  h+='<div class="board-grid">';
  S.projects.forEach(function(o){
    if(o.id==='__personal')return;
    var items=sortActs(m.open.filter(function(a){return a.projectId===o.id;}),'smart');
    if(!items.length)return;
    h+='<div class="proj-block'+(o.id==='__personal'?' personal':'')+'"><button class="ownhead" data-act="proj-filter" data-id="'+o.id+'">'+
      '<h3>'+esc(o.name)+'</h3><span class="cnt">'+items.length+' open</span>'+
      '<span class="sp"></span>'+I('filter')+'</button>';
    grouped(items).forEach(function(g){
      h+='<div class="grp'+(g.key==='__tbc'?' tbc':'')+'">'+I('person')+
        esc(g.key==='__tbc'?'Owner/SPOC to be assigned':g.label)+
        '<span class="n">\u00b7 '+g.items.length+'</span></div>';
      h+='<div class="brows">'+g.items.map(boardRow).join('')+'</div>';
    });
    h+='</div>';
  });
  h+='</div>';
  if(!m.open.length)h+=emptyBox('No open actionables','Add your first actionable with the + button below.');
  return h;
}

/* ---- ACTIONABLES LIST ---- */
var QUICKS=[
  ['all','All open'],['important','Important'],['mine','Mine'],['followup','Follow-up due'],
  ['overdue','Overdue'],['today','Due today'],['week','This week'],
  ['inprog','In progress'],['onhold','On hold'],['dep','Dependency'],['completed','Completed'],['everything','Everything']
];
function vList(){
  var list=filteredActs(),t=todayISO(),mine=myIds();
  var h=topbar('Actionables',list.length+' shown',false,
    cloudSyncBtnHtml()+cloudBadgeHtml()+
    '<button class="iconbtn" data-act="go-calendar" title="Calendar">'+I('cal')+'</button>'+
    '<button class="iconbtn" data-act="go-people" title="Owners / SPOCs">'+I('people')+'</button>'+
    '<button class="iconbtn" data-act="go-notif" title="Notifications">'+I('bell')+(notifBadgeOn(metrics())?'<span class="dot"></span>':'')+'</button>'+
    '<button class="iconbtn" data-act="export-list-excel" title="Export Excel">'+I('dl')+'</button>');
  h+='<div class="searchrow"><input id="srch" type="search" placeholder="Search project, line item, owner\u2026" value="'+esc(filters.q)+'">'+
    '<button class="sqbtn" data-act="open-filters">'+I('filter')+(advCount()?'<span class="cnt">'+advCount()+'</span>':'')+' </button></div>';
  var _cp=filters.project.length===1?filters.project[0]:'__all';
  var _cs=filters.spoc.length===1?filters.spoc[0]:'__all';
  var _projs=S.projects.filter(function(o){return o.id!=='__personal';});
  var _seen={},_sids=[];mainActs().forEach(function(a){if(_cp!=='__all'&&a.projectId!==_cp)return;(a.spocIds||[]).forEach(function(id){if(!_seen[id]){_seen[id]=1;_sids.push(id);}});});
  _sids.sort(function(x,y){return personName(x).toLowerCase()<personName(y).toLowerCase()?-1:1;});
  if(_cs!=='__all'&&_cs!=='__tbc'&&_sids.indexOf(_cs)<0)_cs='__all';
  h+='<div class="viewsel">'+
     '<div class="vs-field"><span class="vs-l">Project</span><div class="vs-sel"><select data-chg="lst-proj"><option value="__all"'+(_cp==='__all'?' selected':'')+'>All projects</option>'+_projs.map(function(o){return '<option value="'+o.id+'"'+(_cp===o.id?' selected':'')+'>'+esc(o.name)+'</option>';}).join('')+'</select>'+I('chevR')+'</div></div>'+
     '<div class="vs-field"><span class="vs-l">SPOC / Owner</span><div class="vs-sel"><select data-chg="lst-spoc"><option value="__all"'+(_cs==='__all'?' selected':'')+'>All SPOCs</option>'+_sids.map(function(id){return '<option value="'+id+'"'+(_cs===id?' selected':'')+'>'+esc(personName(id))+'</option>';}).join('')+'<option value="__none"'+(_cs==='__tbc'?' selected':'')+'>Unassigned</option></select>'+I('chevR')+'</div></div>'+
     '</div>';
  h+='<div class="chips">'+QUICKS.map(function(q){
    var n=mainActs().filter(function(a){return quickPass(a,q[0],t,mine);}).length;
    return '<button class="chip'+(filters.quick===q[0]?' on':'')+(q[0]==='overdue'?' warn':'')+
      '" data-act="quick" data-q="'+q[0]+'">'+q[1]+'<span class="n">'+n+'</span></button>';
  }).join('')+'</div>';
  var _tags=(function(){var seen={},o=[];mainActs().forEach(function(a){(a.tags||[]).forEach(function(t){var k=t.toLowerCase();if(!seen[k]){seen[k]=1;o.push(t);}});});return o.sort();})();
  if(_tags.length){
    var _sel=filters.tags||[];
    var _lbl=_sel.length?(_sel.length===1?('#'+_sel[0]):(_sel.length+' tags selected')):'All tags';
    h+='<div class="tagrow"><span class="gl">Tags</span><div class="tagdrop">'+
      '<button class="tagdrop-btn'+(_sel.length?' has':'')+(tagDropOpen?' open':'')+'" data-act="tagdrop-toggle">'+I('tag')+'<span class="td-l">'+esc(_lbl)+'</span>'+(_sel.length?'<span class="td-n">'+_sel.length+'</span>':'')+I('chevR')+'</button>'+
      (tagDropOpen?('<div class="tagdrop-scrim" data-act="tagdrop-toggle"></div><div class="tagdrop-panel">'+_tags.map(function(tg){var on=_sel.some(function(x){return x.toLowerCase()===tg.toLowerCase();});return '<button class="tagopt'+(on?' on':'')+'" data-act="tag-toggle" data-tag="'+esc(tg)+'"><span class="chk">'+(on?I('check'):'')+'</span>#'+esc(tg)+'</button>';}).join('')+(_sel.length?'<button class="tagopt clr" data-act="tags-clear">Clear selection</button>':'')+'</div>'):'')+
      '</div></div>';
  }
  var body;
  if(!list.length){body=emptyBox('No actionables found',filters.q||advCount()?'Try different search or filters.':'Add your first actionable.');}
  else {
    var byP2={},ord2=[];list.forEach(function(a){if(!byP2[a.projectId]){byP2[a.projectId]=[];ord2.push(a.projectId);}byP2[a.projectId].push(a);});
    ord2.sort(function(x,y){return projName(x).toLowerCase()<projName(y).toLowerCase()?-1:1;});
    body=ord2.map(function(pid){var its=byP2[pid];var inner=grouped(its).map(function(g){return '<div class="grp grp-sub">'+I('person')+'<span class="gt">'+esc(g.label)+'</span><span class="n">'+g.items.length+'</span></div><div class="list">'+g.items.map(function(a){return actRow(a);}).join('')+'</div>';}).join('');return '<div class="grp grp-proj">'+I('proj')+'<span class="gt">'+esc(projName(pid))+'</span><span class="n">'+its.length+'</span></div>'+inner;}).join('');
  }
  h+=body;
  return h;
}

/* ---- CALENDAR ---- */
function isoOf(y,m,d){var dt=new Date(y,m,d);return dt.getFullYear()+'-'+pad(dt.getMonth()+1)+'-'+pad(dt.getDate());}
function vCalendar(){
  if(!calState){var n=new Date();calState={y:n.getFullYear(),m:n.getMonth()};}
  var y=calState.y,mth=calState.m,t=todayISO();
  var first=new Date(y,mth,1),startIdx=(first.getDay()+6)%7,daysIn=new Date(y,mth+1,0).getDate();
  var daysPrev=new Date(y,mth,0).getDate();
  var byDay={};
  mainActs().forEach(function(a){
    if(a.etaKind==='date'&&a.eta)(byDay[a.eta]=byDay[a.eta]||[]).push(a);
    else if(a.etaKind==='range'){if(a.eta)(byDay[a.eta]=byDay[a.eta]||[]).push(a);if(a.etaEnd&&a.etaEnd!==a.eta)(byDay[a.etaEnd]=byDay[a.etaEnd]||[]).push(a);}
  });
  var cells='',total=Math.ceil((startIdx+daysIn)/7)*7;
  for(var i=0;i<total;i++){
    var dnum,iso,dim=false;
    if(i<startIdx){dnum=daysPrev-startIdx+1+i;iso=isoOf(y,mth-1,dnum);dim=true;}
    else if(i>=startIdx+daysIn){dnum=i-startIdx-daysIn+1;iso=isoOf(y,mth+1,dnum);dim=true;}
    else{dnum=i-startIdx+1;iso=isoOf(y,mth,dnum);}
    var items=byDay[iso]||[],openItems=items.filter(isOpen);
    var dots='';
    if(items.length){var col=!openItems.length?'var(--grn)':iso<=t?'var(--red)':diffDays(iso,t)<=3?'var(--amb)':'var(--acc)';var nd=Math.min(3,items.length);dots='<span class="dots">';for(var d2=0;d2<nd;d2++)dots+='<i style="background:'+col+'"></i>';dots+='</span>';}
    cells+='<button class="cell'+(dim?' dim':'')+(iso===t?' today':'')+'" data-act="day" data-d="'+iso+'"><span class="d">'+dnum+'</span>'+dots+(items.length>3?'<span class="cnt">'+items.length+'</span>':'')+' </button>';
  }
  var h=topbar('Calendar','Actionables by ETA',true,'<button class="caltoday" data-act="cal-today">Today</button>');
  h+='<div class="calhead"><button class="calnav" data-act="cal-prev">'+I('back')+'</button><div class="m" style="text-align:center">'+MON[mth]+' '+y+'</div><button class="calnav" data-act="cal-next">'+I('chevR')+'</button></div>';
  h+='<div class="dow">'+DOW.map(function(dd){return '<span>'+dd[0]+dd[1]+'</span>';}).join('')+'</div>';
  h+='<div class="calgrid">'+cells+'</div>';
  var monthKey=y+'-'+pad(mth+1);
  var inMonth=sortActs(mainActs().filter(function(a){return(a.eta&&a.eta.indexOf(monthKey)===0)||(a.etaEnd&&a.etaEnd.indexOf(monthKey)===0);}),'eta');
  h+='<div class="eyebrow">Scheduled in '+MON[mth]+'</div>';
  h+=inMonth.length?'<div class="list">'+inMonth.map(function(a){return actRow(a);}).join('')+'</div>':emptyBox('Nothing scheduled','No ETAs in '+MON[mth]+' '+y+'.');
  return h;
}

/* ---- PROJECTS ---- */
function stStat(v,l,k){return '<div class="stat" style="--k:'+k+'"><div class="v">'+v+'</div><div class="l">'+l+'</div></div>';}
function vProjects(){
  var _projs=S.projects.filter(function(o){return o.id!=='__personal';});
  var h=topbar('Projects',_projs.length+' projects',false,
    '<button class="iconbtn" data-act="add-project">'+I('plus')+'</button>');
  h+='<div style="height:12px"></div><div class="list">'+_projs.map(function(o){
    var st=projStats(o.id);
    return '<button class="arow" data-act="proj-nav" data-id="'+o.id+'">'+
      '<div class="r1"><span class="ttl">'+esc(o.name)+'</span><span class="own">'+esc(o.code||'')+'</span><span class="sp"></span>'+I('chevR')+'</div>'+
      '<div class="r2" style="margin-top:7px">'+
      '<span class="datechip dc-fut">'+st.open+' open</span>'+
      (st.od?'<span class="datechip dc-od">'+st.od+' overdue</span>':'')+
      (st.wait?'<span class="datechip dc-soon">'+st.wait+' awaiting</span>':'')+
      (st.fu?'<span class="fu due">'+I('bell')+st.fu+'</span>':'')+
      '</div></button>';
  }).join('')+'</div>';
  h+='<div class="note">Tap a project to see Owner/SPOC breakdown. Tap + to add a project.</div>';
  return h;
}
function vProjectDetail(pid){
  var o=projById(pid);if(!o)return topbar('Project','',true,'');
  var t=todayISO(),st=projStats(pid),seg=view.params.seg||'open';
  var pool=S.actionables.filter(function(a){return a.projectId===pid;});
  if(view.params.tag){var _ptl=view.params.tag.toLowerCase();pool=pool.filter(function(a){return (a.tags||[]).some(function(t){return t.toLowerCase()===_ptl;});});}
  var list;
  if(seg==='open')list=pool.filter(isOpen);
  else if(seg==='awaiting')list=pool.filter(function(a){return isOpen(a)&&AWAITS.indexOf(a.status)>=0;});
  else if(seg==='overdue')list=pool.filter(function(a){return isOver(a,t);});
  else list=pool.filter(function(a){return a.status==='Completed';});
  list=seg==='done'?list.sort(function(x,y){return(y.completedAt||0)-(x.completedAt||0);}):sortActs(list,'smart');
  var h=topbar(o.name,o.code+' \u00b7 project view',true,
    '<button class="iconbtn" data-act="edit-proj" data-id="'+pid+'">'+I('edit')+'</button>');
  h+='<div class="stats">'+stStat(st.open,'Open','var(--acc)')+stStat(st.od,'Overdue','var(--red)')+stStat(st.wait,'Dependency','var(--amb)')+stStat(st.week,'Due this wk','var(--amb)')+stStat(st.fu,'Follow-ups','var(--pur)')+stStat(st.done30,'Done \u00b7 30d','var(--grn)')+'</div>';
  var segs=[['open','Open'],['awaiting','Dependency'],['overdue','Overdue'],['done','Completed']];
  h+='<div class="chips" style="padding-top:16px">'+segs.map(function(s2){
    return '<button class="chip'+(seg===s2[0]?' on':'')+'" data-act="proj-seg" data-id="'+pid+'" data-seg="'+s2[0]+'">'+s2[1]+'</button>';
  }).join('')+'</div>';
  var _ptags=(function(){var seen={},o=[];S.actionables.forEach(function(a){if(a.projectId!==pid)return;(a.tags||[]).forEach(function(t){var k=t.toLowerCase();if(!seen[k]){seen[k]=1;o.push(t);}});});return o.sort();})();
  if(_ptags.length)h+='<div class="chips tagchips">'+_ptags.map(function(tg){var on=view.params.tag&&view.params.tag.toLowerCase()===tg.toLowerCase();return '<button class="chip tagf'+(on?' on':'')+'" data-act="proj-tag" data-id="'+pid+'" data-tag="'+esc(tg)+'">#'+esc(tg)+'</button>';}).join('')+'</div>';
  if(!list.length){h+=emptyBox('Nothing here','No actionables in this view.');}
  else if(seg==='open'){
    h+='<div class="own" style="margin-top:0">';
    grouped(list).forEach(function(g){
      h+='<div class="grp'+(g.key==='__tbc'?' tbc':'')+'">'+I('person')+esc(g.key==='__tbc'?'Owner/SPOC to be assigned':g.label)+'<span class="n">\u00b7 '+g.items.length+'</span></div>';
      h+='<div class="brows">'+g.items.map(boardRow).join('')+'</div>';
    });
    h+='</div>';
  }else{h+='<div class="list">'+list.map(function(a){return actRow(a);}).join('')+'</div>';}
  return h;
}

/* ---- PEOPLE / SPOCs ---- */
function vPeople(){
  var pv=peopleView;
  var ppl=peopleSorted().slice();
  var freq={};ppl.forEach(function(u){var k=u.name.toLowerCase();freq[k]=(freq[k]||0)+1;});
  var rows=ppl.map(function(u){
    var st=personStats(u.id),sub='';
    if(freq[u.name.toLowerCase()]>1){var codes=personProjectCodes(u.id);sub=codes.length?codes[0]:('#'+String(u.id).slice(-4));}
    return {id:u.id,name:u.name,sub:sub,st:st,tbc:false};
  });
  var tb=personStats('__tbc');
  if(tb.open||tb.od||tb.fu)rows.push({id:'__tbc',name:'To be assigned',sub:'',st:tb,tbc:true});
  rows=rows.filter(function(r){
    if(pv.filt==='open')return r.st.open>0;
    if(pv.filt==='overdue')return r.st.od>0;
    if(pv.filt==='followup')return r.st.fu>0;
    return true;
  });
  var key={open:'open',overdue:'od',followup:'fu'}[pv.sort];
  if(pv.sort==='az')rows.sort(function(a,b){return a.name.toLowerCase()<b.name.toLowerCase()?-1:1;});
  else rows.sort(function(a,b){return (b.st[key]-a.st[key])||(b.st.open-a.st.open)||(a.name.toLowerCase()<b.name.toLowerCase()?-1:1);});
  var filts=[['all','All'],['open','Open'],['overdue','Overdue'],['followup','Follow-up']];
  var sorts=[['open','Highest Open'],['overdue','Highest Overdue'],['followup','Highest Follow-up'],['az','A\u2013Z']];
  var h=topbar('Owners / SPOCs',ppl.length+' people',true,'<button class="iconbtn" data-act="add-person">'+I('plus')+'</button>');
  h+='<div class="chips" style="margin-top:6px">'+filts.map(function(x){return '<button class="chip'+(pv.filt===x[0]?' on':'')+'" data-act="pfilt" data-k="'+x[0]+'">'+x[1]+'</button>';}).join('')+'</div>';
  h+='<div class="sortrow"><span>Sort by</span><select data-chg="psort">'+sorts.map(function(x){return '<option value="'+x[0]+'"'+(pv.sort===x[0]?' selected':'')+'>'+x[1]+'</option>';}).join('')+'</select></div>';
  h+=rows.length?('<div class="list plist">'+rows.map(function(r){
    return '<button class="prow'+(r.tbc?' tbc':'')+'" data-act="person" data-id="'+r.id+'">'+
      '<span class="p-ic">'+I('person')+'</span>'+
      '<span class="p-name">'+esc(r.name)+(r.sub?'<span class="p-sub">'+esc(r.sub)+'</span>':'')+'</span>'+
      '<span class="p-stats">'+
        '<span class="p-stat p-open"><b>'+r.st.open+'</b><i>Open</i></span>'+
        '<span class="p-stat'+(r.st.od?' hot':' z')+'"><b>'+r.st.od+'</b><i>Overdue</i></span>'+
        '<span class="p-stat'+(r.st.fu?' warm':' z')+'"><b>'+r.st.fu+'</b><i>Follow-up</i></span>'+
      '</span></button>';
  }).join('')+'</div>'):emptyBox('No matches','No owners match this filter.');
  h+='<div class="note">Owner / SPOC = the person responsible for a line item. Counts exclude personal tasks.</div>';
  return h;
}

function vPersonDetail(pid){
  var isTbc=pid==='__tbc';
  var u=isTbc?{name:'To be assigned'}:personById(pid);
  if(!u)return topbar('Owner/SPOC','',true,'');
  var st=personStats(pid);
  var list=sortActs(mainActs().filter(function(a){if(!isOpen(a))return false;return isTbc?a.spocIds.length===0:a.spocIds.indexOf(pid)>=0;}),'smart');
  var codes=isTbc?[]:personProjectCodes(pid);
  var sub=isTbc?'Unassigned items':(codes.length?'Owner/SPOC \u00b7 '+codes.join(', '):'Owner/SPOC \u00b7 no active projects');
  var h=topbar(u.name,sub,true,'');
  h+='<div class="stats">'+stStat(st.open,'Open','var(--acc)')+stStat(st.od,'Overdue','var(--red)')+stStat(st.fu,'Follow-ups','var(--pur)')+'</div><div style="height:14px"></div>';
  h+=list.length?'<div class="list">'+list.map(function(a){return actRow(a);}).join('')+'</div>':emptyBox('All caught up','No open actionables here.');
  return h;
}

/* ---- REPORTS ---- */
function reportData(projId,inclPersonal){
  var t=todayISO();
  var base=inclPersonal?S.actionables:mainActs();
  var pool=projId?base.filter(function(a){return a.projectId===projId;}):base.slice();
  var open=pool.filter(isOpen);
  return{
    open:open,
    overdue:sortActs(open.filter(function(a){return isOver(a,t);}),'smart'),
    awaiting:sortActs(open.filter(function(a){return AWAITS.indexOf(a.status)>=0;}),'smart'),
    week:sortActs(open.filter(function(a){var e=endEta(a);return e&&diffDays(e,t)>=0&&diffDays(e,t)<=7;}),'eta'),
    upcoming:sortActs(open.filter(function(a){var e=endEta(a);return e&&diffDays(e,t)>=0&&diffDays(e,t)<=14;}),'eta'),
    fu:sortActs(open.filter(function(a){return remDue(a,t);}),'smart'),
    doneWeek:pool.filter(function(a){return a.status==='Completed'&&a.completedAt&&a.completedAt>=Date.now()-7*86400000;})
  };
}
function rn(v,l,col){return '<div class="rn"><div class="v"'+(col?' style="color:'+col+'"':'')+'>'+v+'</div><div class="l">'+l+'</div></div>';}
function vReports(){
  var d=reportData(null);
  var h=topbar('Reports','Status & export',false,'');
  h+='<div class="eyebrow" style="margin-top:12px">Summary \u00b7 '+esc(fmtDY(todayISO()))+'</div>';
  h+='<div class="pane"><div class="repnum">'+rn(d.open.length,'Open')+rn(d.overdue.length,'Overdue',d.overdue.length?'var(--red)':'')+''+rn(d.awaiting.length,'Dependency',d.awaiting.length?'var(--amb)':'')+''+rn(d.fu.length,'Follow-ups',d.fu.length?'var(--pur)':'')+'</div>'+
    '<div style="font-size:.78rem;color:var(--tx2)">Due in 7 days: <b class="num">'+d.week.length+'</b> \u00b7 Completed this week: <b class="num">'+d.doneWeek.length+'</b></div></div>';
  h+='<div class="eyebrow">Export report</div>';
  h+='<div class="sect"><div class="note" style="padding:0 0 10px">Select a project, then download as PDF or Excel. Selecting a specific project downloads only that project\'s data.</div>'+
    '<div class="meta"><div class="fld wide"><label>Project scope</label>'+
    '<select data-chg="rep-proj"><option value="">All Projects</option>'+
    S.projects.map(function(o){return '<option value="'+o.id+'">'+esc(o.name)+'</option>';}).join('')+
    '</select></div></div>'+
    '<div class="btnrow"><button class="btn pri" data-act="do-export-pdf">'+I('dl')+'Export PDF</button>'+
    '<button class="btn ghost" data-act="do-export-xlsx">'+I('dl')+'Export Excel</button></div></div>';
  function section(title,list,emptyMsg){
    h+='<div class="eyebrow">'+title+' \u00b7 '+list.length+'</div>';
    h+=list.length?'<div class="list">'+list.slice(0,8).map(function(a){return actRow(a);}).join('')+'</div>':emptyBox(emptyMsg,'');
  }
  section('Overdue / Breached',d.overdue,'Nothing overdue.');
  section('Blocked \u00b7 dependency',d.awaiting,'Nothing blocked on a dependency.');
  section('Follow-ups due',d.fu,'No follow-ups due.');
  section('Upcoming ETAs \u00b7 14 days',d.upcoming,'Nothing scheduled soon.');
  return h;
}

/* ---- NOTIFICATIONS ---- */
function vNotifications(){
  var m=metrics(),t=todayISO();
  var total=m.overdue.length+m.today.length+m.remDueL.length;
  var h=topbar('Notifications',total?total+' need attention':'All clear',true,total?'<button class="iconbtn" data-act="notif-read" title="Mark read">'+I('check')+'</button>':'');
  h+='<div style="height:12px"></div>';
  var any=false;
  function block(title,cls,icon,items,subFn){
    if(!items.length)return;any=true;
    h+='<div class="eyebrow">'+title+' \u00b7 '+items.length+'</div><div class="list">'+
      items.map(function(a){return '<button class="notif '+cls+'" data-act="open" data-id="'+a.id+'">'+
        '<span class="ic">'+I(icon)+'</span><span class="w">'+
        '<div class="h">'+ttlHtml(a)+'</div>'+
        '<div class="b">'+esc(subFn(a))+'</div>'+
        '<div class="b" style="color:var(--tx3)">'+esc(spocLabel(a))+' \u00b7 '+esc(projCode(a.projectId))+'</div>'+
        '</span>'+etaView(a)+'</button>';}).join('')+'</div>';
  }
  block('Overdue / Breached','n-od','alert',sortActs(m.overdue,'smart'),function(a){return 'Was due '+fmtD(endEta(a));});
  block('Due today','n-due','clock',m.today,function(a){return a.task;});
  block('Follow-ups due','n-fu','bell',sortActs(m.remDueL,'smart'),function(a){return a.rem.note||'Follow up';});
  block('Due tomorrow','n-due','clock',m.tomorrow,function(a){return a.task;});
  if(!any)h+=emptyBox('All caught up','No overdue items, due dates or follow-ups today.');
  h+='<div class="note">Daily brief fires at '+pad(S.settings.notifHour)+':'+pad(S.settings.notifMinute)+'. Change in Settings.</div>';
  return h;
}

/* ---- SETTINGS ---- */
function vSettings(){
  var s=S.settings;
  var names=[];S.people.forEach(function(u){if(names.indexOf(u.name)<0)names.push(u.name);});
  if(names.indexOf(s.userName)<0)names.unshift(s.userName);
  var isDark=(s.theme||'dark')==='dark';
  var h=topbar('Settings','Actionables v'+(A&&A.version?A.version():'2.0')+' \u00b7 offline',true,'');
  h+='<div style="height:12px"></div>';
  h+='<div class="eyebrow">Appearance</div><div class="pane">'+
    '<div class="togglerow">'+
    '<span class="t">'+(isDark?'Dark AMOLED theme':'Light theme')+'</span>'+
    '<button class="btn ghost mini" data-act="theme-toggle" style="gap:6px">'+
    I(isDark?'sun':'moon')+(isDark?'Switch to Light':'Switch to Dark')+
    '</button></div>'+
    '<div class="fld" style="margin-top:16px"><label>Accent colour</label>'+
    '<div class="swatches">'+Object.keys(ACCENTS).map(function(k){var a=ACCENTS[k];var on=(s.accent||'orange')===k;return '<button class="swatch'+(on?' on':'')+'" data-act="set-accent" data-k="'+k+'" style="--sw:'+a.c+'" title="'+a.name+'">'+(on?I('check'):'')+'</button>';}).join('')+'</div></div>'+
    '<div class="fld" style="margin-top:16px"><label>Font style</label>'+
    '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:4px">'+FONTS.map(function(fo){var on=(s.font||'default')===fo[0];return '<button class="chip'+(on?' on':'')+'" data-act="set-font" data-k="'+fo[0]+'" style="font-family:'+FONT_STACK[fo[0]]+'">'+fo[1]+'</button>';}).join('')+'</div></div>'+
    '</div>';
  h+='<div class="eyebrow">You</div><div class="pane">'+
    '<div class="fld"><label>Your name \u00b7 drives \u201cMine\u201d filter</label>'+
    '<select data-chg="set-name">'+names.map(function(n){return '<option'+(s.userName===n?' selected':'')+'>'+esc(n)+'</option>';}).join('')+'</select></div></div>';
  h+='<div class="eyebrow">Daily brief</div><div class="pane">'+
    '<div class="togglerow"><span class="t">Notify about overdue, due &amp; follow-ups</span>'+
    '<button class="switch'+(s.notifEnabled?' on':'')+'" data-act="toggle-notif"><i></i></button></div>'+
    '<div class="fld" style="margin-top:10px"><label>Brief time</label>'+
    '<input type="time" data-chg="set-time" value="'+pad(s.notifHour)+':'+pad(s.notifMinute)+'"'+(s.notifEnabled?'':' disabled')+'></div></div>';
  h+='<div class="eyebrow">Data</div><div class="pane">'+
    '<button class="rowline" data-act="backup">'+I('dl')+'<span class="t">Back up data<br><span class="s">Export all data to JSON file (Downloads)</span></span>'+I('chevR')+'</button>'+
    '<button class="rowline" data-act="import">'+I('edit')+'<span class="t">Import backup<br><span class="s">Restore from a JSON backup file</span></span>'+I('chevR')+'</button>'+
    '<button class="rowline" data-act="tmpl-download">'+I('dl')+'<span class="t">Download data template (Excel)<br><span class="s">Export all data to an editable .xlsx</span></span>'+I('chevR')+'</button>'+
    '<button class="rowline" data-act="tmpl-import">'+I('doc')+'<span class="t">Update from template<br><span class="s">Load an edited .xlsx to update &amp; add items</span></span>'+I('chevR')+'</button>'+
    '<button class="rowline" data-act="tag-manage">'+I('filter')+'<span class="t">Manage tags<br><span class="s">Rename or delete tags across all tasks</span></span>'+I('chevR')+'</button>'+
    '<button class="rowline" data-act="versions-open">'+I('clock')+'<span class="t">Version history<br><span class="s">Roll back to a recent saved state</span></span>'+I('chevR')+'</button>'+
    '<button class="rowline" data-act="reseed">'+I('doc')+'<span class="t">Reset to original data<br><span class="s">Replace all data with the BCP / ICICI / SCB demo set</span></span>'+I('chevR')+'</button>'+
    '</div>';
  /* Sync (Firebase) */
  var cloudOn=!!(window.Cloud&&window.Cloud.configured&&window.Cloud.configured());
  var cst=(window.Cloud&&window.Cloud.status)?window.Cloud.status():{configured:false};
  h+='<div class="eyebrow">Sync</div><div class="pane">';
  if(cloudOn){
    h+='<div class="togglerow"><span class="t">'+I('cloud')+' Cloud sync \u00b7 <b style="color:var(--acc)">'+esc(cst.label||'')+'</b></span>'+
      (cst.signedIn?'<button class="btn ghost mini" data-act="cloud-signout">Sign out</button>':'')+'</div>'+
      (cst.email?'<div class="note" style="padding:8px 0 0">Signed in as '+esc(cst.email)+'. Changes sync across every device signed in with this account.</div>'
        :'<div class="note" style="padding:8px 0 0">Sign in on the cloud screen to start syncing.</div>');
  }else{
    h+='<div class="togglerow"><span class="t">'+I('cloud')+' Cloud sync \u00b7 <b>off</b></span></div>'+
      '<div class="note" style="padding:8px 0 0">Data is stored on this device only. To sync across browsers and devices, add your Firebase config in <b>firebase-config.js</b> and reload — see the hosting README.</div>';
  }
  h+='</div>';
  h+='<div class="note">Actionables \u00b7 '+(cloudOn?'offline-first with cloud sync':'fully offline \u00b7 data stays on this device')+'.</div>';
  return h;
}

/* ====== SHEETS / OVERLAYS ====== */
function openSheet(html,opts){
  opts=opts||{};
  var wrap=$('#sheets');
  var scrim=document.createElement('div');scrim.className='scrim';
  var sh=document.createElement('div');sh.className='sheet'+(opts.full?' full':'');
  sh.innerHTML=(opts.full?'':'<div class="grab"></div>')+html;
  wrap.appendChild(scrim);wrap.appendChild(sh);
  requestAnimationFrame(function(){scrim.classList.add('in');sh.classList.add('in');});
  var rec={scrim:scrim,sheet:sh,tag:opts.tag||'',data:opts.data||null};
  scrim.addEventListener('click',function(){closeSheet(rec);});
  sheetStack.push(rec);return rec;
}
function closeSheet(rec){
  var idx=sheetStack.indexOf(rec===undefined?sheetStack[sheetStack.length-1]:rec);
  if(idx<0)return;rec=sheetStack[idx];sheetStack.splice(idx,1);
  rec.scrim.classList.remove('in');rec.sheet.classList.remove('in');
  setTimeout(function(){if(rec.scrim.parentNode)rec.scrim.parentNode.removeChild(rec.scrim);if(rec.sheet.parentNode)rec.sheet.parentNode.removeChild(rec.sheet);},220);
}
function closeTop(){if(sheetStack.length)closeSheet(sheetStack[sheetStack.length-1]);}
function sheetFor(tag){for(var i=sheetStack.length-1;i>=0;i--)if(sheetStack[i].tag===tag)return sheetStack[i];return null;}
function confirmSheet(title,msg,okLabel,danger,cb){
  var rec=openSheet('<div class="shead"><h2>'+esc(title)+'</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody"><p style="color:var(--tx2);font-size:.86rem">'+esc(msg)+'</p>'+
    '<div class="btnrow"><button class="btn ghost" data-act="close-sheet">Cancel</button>'+
    '<button class="btn '+(danger?'danger':'pri')+'" data-act="confirm-ok">'+esc(okLabel)+'</button></div></div>',{tag:'confirm'});
  rec.onOk=cb;
}
function inputSheet(title,placeholder,cb){
  var rec=openSheet('<div class="shead"><h2>'+esc(title)+'</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody"><input id="inpS" placeholder="'+esc(placeholder)+'" autocomplete="off">'+
    '<div class="btnrow"><button class="btn ghost" data-act="close-sheet">Cancel</button>'+
    '<button class="btn pri" data-act="input-ok">Save</button></div></div>',{tag:'input'});
  rec.onOk=cb;setTimeout(function(){var i=$('#inpS',rec.sheet);if(i)i.focus();},260);
}
function personSheet(cb){
  var rec=openSheet('<div class="shead"><h2>New Owner/SPOC</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody"><div class="fld"><label>Name</label><input id="npName" placeholder="Person\u2019s name" autocomplete="off"></div>'+
    '<div class="note" style="padding:10px 0 0">SPOCs are global \u2014 the same person can be assigned across any project.</div>'+
    '<div class="btnrow"><button class="btn ghost" data-act="close-sheet">Cancel</button>'+
    '<button class="btn pri" data-act="person-ok">Add Owner/SPOC</button></div></div>',{tag:'newperson'});
  rec.onOk=cb;setTimeout(function(){var i=$('#npName',rec.sheet);if(i)i.focus();},260);
}

/* ---- DETAIL SHEET ---- */
function openDetail(id){
  var rec=openSheet('<div class="shead"><h2></h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div><div class="sbody"></div>',
    {full:true,tag:'detail',data:{id:id}});
  renderDetail(rec);
}
function renderDetail(rec){
  var a=actById(rec.data.id);if(!a){closeSheet(rec);return;}
  var t=todayISO(),od=isOver(a,t);
  $('.shead h2',rec.sheet).innerHTML=ttlHtml(a);
  var b='';
  b+='<button class="impbtn'+(a.important?' on':'')+'" data-act="d-important">'+I('star')+(a.important?'Marked important':'Mark important')+'</button>';
  b+='<div class="nextact'+(od?' od':'')+(etaState(a)==='severe'?' severe':'')+'">'+
    '<div class="na-head"><span class="na-l">'+(od?'OVERDUE':'DESCRIPTION / TASK')+'</span>'+etaView(a)+'</div>'+
    '<div class="t">'+esc(a.task)+'</div>'+
    (a.ticketUrl?'<a class="linkchip" href="'+esc(a.ticketUrl)+'">'+I('ext')+'Open ticket</a>':'')+
    '</div>';
  b+='<div class="eyebrow" style="padding:2px 0 8px">Details</div><div class="meta">'+
    '<div class="fld"><label>Project</label><div class="kv">'+esc(projName(a.projectId))+'</div></div>'+
    '<div class="fld"><label>Ticket / Ref ID</label><div class="kv num">'+esc(a.ticket||'N/A')+'</div></div>'+
    '<div class="fld wide"><label>Line item</label><div class="kv">'+esc(a.lineItem)+'</div></div>'+
    '</div>';
  b+='<div class="eyebrow" style="padding:16px 0 8px">Owner / SPOC</div>'+
    '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:2px">'+
    peopleSorted().map(function(u){
      var on=a.spocIds.indexOf(u.id)>=0;
      return '<button class="chip'+(on?' on':'')+'" data-act="d-spoc" data-id="'+u.id+'">'+esc(u.name)+'</button>';
    }).join('')+
    '<button class="chip" data-act="d-spoc-new">+ New</button>'+
    (a.spocIds.length?'':'<span class="chip" style="border-style:dashed;color:var(--tx3)">To be assigned</span>')+
    '</div>';
  b+='<div class="eyebrow" style="padding:16px 0 8px">Tags</div>'+tagEditHtml(a.tags,'d-tag-del','d-tag-add','d-tag-addbuf','dTagIn');
  b+='<div class="eyebrow" style="padding:16px 0 8px">Timeline</div><div class="meta">'+
    '<div class="fld"><label>Status</label><select data-chg="d-status">'+
    STATUSES.map(function(s){return '<option'+(s===a.status?' selected':'')+'>'+s+'</option>';}).join('')+
    '</select></div>'+
    '<div class="fld"><label>ETA type</label><select data-chg="d-etakind">'+
    ETA_KINDS.map(function(k){return '<option value="'+k[0]+'"'+(a.etaKind===k[0]?' selected':'')+'>'+k[1]+'</option>';}).join('')+
    '</select></div>'+
    (a.etaKind==='date'?'<div class="fld wide"><label>ETA date</label><input type="date" data-chg="d-eta" value="'+esc(a.eta)+'"></div>':'')+
    (a.etaKind==='range'?'<div class="fld"><label>From</label><input type="date" data-chg="d-eta" value="'+esc(a.eta)+'"></div><div class="fld"><label>To</label><input type="date" data-chg="d-etaend" value="'+esc(a.etaEnd)+'"></div>':'')+
    '</div>';
  var r=a.rem||{on:false};
  if(r.on){
    var due=remDue(a,t);
    b+='<div class="remcard'+(due?' due':'')+(r.done?' done':'')+'">'+
      '<div class="rh">'+I('bell')+(r.done?'Follow-up completed':due?'Follow-up due':'Follow-up reminder')+'</div>';
    if(r.done){
      b+='<div style="font-size:.8rem;color:var(--tx2);margin-top:8px">'+esc(r.note||'Follow-up')+'</div>'+
        '<div class="btnrow" style="margin-top:10px"><button class="btn ghost mini" data-act="rem-react">Reactivate</button><button class="btn ghost mini" data-act="rem-remove">Remove</button></div>';
    }else{
      b+='<div class="remgrid"><div class="fld"><label>Date</label><input type="date" data-chg="rem-date" value="'+esc(r.date)+'"></div>'+
        '<div class="fld"><label>Time</label><input type="time" data-chg="rem-time" value="'+esc(r.time)+'"></div>'+
        '<div class="fld wide"><label>Follow-up note</label><input data-chg="rem-note" value="'+esc(r.note)+'" placeholder="What to chase\u2026"></div></div>'+
        '<div class="btnrow" style="margin-top:10px"><button class="btn ok mini" data-act="rem-done">'+I('check')+'Done</button>'+
        '<button class="btn ghost mini" data-act="rem-snooze" data-n="1">+1d</button><button class="btn ghost mini" data-act="rem-snooze" data-n="3">+3d</button>'+
        '<button class="btn ghost mini" data-act="rem-snooze" data-n="7">+1w</button><button class="btn ghost mini" data-act="rem-remove">'+I('x')+'</button></div>';
    }
    b+='</div>';
  }else{b+='<div class="btnrow"><button class="btn ghost" data-act="rem-add">'+I('bell')+'Add follow-up reminder</button></div>';}
  if(a.notes)b+='<div class="fld wide" style="margin-top:14px"><label>Remarks</label><div class="kv" style="align-items:flex-start;white-space:pre-wrap;font-size:.8rem;line-height:1.5">'+esc(a.notes)+'</div></div>';
  b+='<div class="btnrow">'+(a.status==='Completed'?'<button class="btn ghost" data-act="d-reopen">Reopen</button>':'<button class="btn ok" data-act="d-complete">'+I('check')+'Mark completed</button>')+
    '<button class="btn ghost" data-act="d-edit">'+I('edit')+'Edit</button></div>';
  b+='<div class="eyebrow" style="margin:20px 0 8px;padding:0">Comments \u00b7 '+a.comments.length+'</div>';
  b+='<div class="cmtrow"><input id="cmtIn" placeholder="Add a comment\u2026"><button class="btn pri" style="flex:none;width:74px;height:42px" data-act="d-comment">Add</button></div>';
  b+=a.comments.slice().reverse().map(function(c){return '<div class="cmt"><div class="h"><b>'+esc(c.user)+'</b><span class="num">'+fmtTs(c.ts)+'</span></div><div class="b">'+esc(c.text)+'</div></div>';}).join('');
  b+='<div class="eyebrow" style="margin:18px 0 4px;padding:0">Activity</div><div class="timeline">';
  b+=a.activity.slice().reverse().map(function(ev){
    var chg=ev.from||ev.to?'<div class="chg">'+(ev.from?'<span class="fr">'+esc(ev.from)+'</span>':'')+esc(ev.to)+'</div>':'';
    return '<div class="tl"><span class="dot2"></span><div class="w"><div class="e"><b>'+esc(ev.event)+'</b> \u00b7 '+esc(ev.user)+'</div>'+chg+'<div class="ts">'+fmtTs(ev.ts)+'</div></div></div>';
  }).join('')+'</div>';
  b+='<div class="btnrow" style="margin-top:18px"><button class="btn danger" data-act="d-delete">'+I('trash')+'Delete</button></div>';
  b+='<div class="note" style="margin:12px 0 0;padding:0">Created '+fmtTs(a.createdAt)+(a.completedAt?' \u00b7 completed '+fmtTs(a.completedAt):'')+' </div>';
  $('.sbody',rec.sheet).innerHTML=b;
}

/* ---- ADD / EDIT FORM ---- */
function openForm(id,prefill){
  var a=id?actById(id):null,f;
  var quick=!!(prefill&&prefill.quick);
  if(a){
    f={projectId:a.projectId,ticket:a.ticket,ticketUrl:a.ticketUrl,lineItem:a.lineItem,task:a.task,
      spocIds:a.spocIds.slice(),etaKind:a.etaKind,eta:a.eta,etaEnd:a.etaEnd,
      remOn:a.rem&&a.rem.on,remDate:a.rem?a.rem.date:'',remTime:a.rem?a.rem.time:'',remNote:a.rem?a.rem.note:'',
      status:a.status,notes:a.notes,important:!!a.important,tags:(a.tags||[]).slice(),quick:false};
  }else{
    var proj=quick?'__personal':((prefill&&prefill.projectId)||(S.projects[0]?S.projects[0].id:''));
    f={projectId:proj,ticket:'',ticketUrl:'',lineItem:'',task:'',spocIds:(prefill&&prefill.spocIds)?prefill.spocIds.slice():[],
      etaKind:prefill&&prefill.eta?'date':'none',eta:(prefill&&prefill.eta)||'',etaEnd:'',
      remOn:false,remDate:'',remTime:'',remNote:'',status:'In Progress',notes:'',
      important:!!(prefill&&prefill.important),tags:[],quick:quick};
  }
  var title=id?'Edit actionable':(quick?'Quick task':'Add actionable');
  var rec=openSheet('<div class="shead"><h2>'+title+'</h2>'+
    '<button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody"></div>'+
    '<div class="sfoot"><button class="btn ghost" data-act="close-sheet">Cancel</button>'+
    '<button class="btn pri" data-act="form-save">Save</button></div>',
    {full:!quick,tag:'form',data:{id:id||'',f:f}});
  renderForm(rec);
}
function renderForm(rec){
  var f=rec.data.f;
  f.spocIds=f.spocIds.filter(function(id){return !!personById(id);});
  var impToggle='<div class="togglerow"><span class="t" style="display:flex;align-items:center;gap:7px">'+I('star')+'Mark as important</span><button class="switch'+(f.important?' on':'')+'" data-act="f-important"><i></i></button></div>';
  if(f.quick){
    var bq='<div class="meta">'+
      '<div class="fld wide"><label>Task <span class="req">*</span></label><input data-chg="f-line" placeholder="e.g. Prepare weekly status deck" value="'+esc(f.lineItem)+'"></div>'+
      '<div class="fld wide"><label>Status</label>'+statusPickHtml(f,false)+'</div>'+
      '<div class="fld wide"><label>ETA</label>'+etaPickHtml(f)+'</div>'+
      '<div class="fld wide"><label>Priority</label>'+impToggle+'</div>'+
      '<div class="fld wide"><label>Tags</label>'+tagEditHtml(f.tags,'f-tag-del','f-tag-add','f-tag-addbuf','fTagIn')+'</div>'+
      '<div class="fld wide"><label>Notes \u00b7 optional</label><textarea data-chg="f-task" placeholder="Any details\u2026">'+esc(f.task)+'</textarea></div>'+
      '</div>'+
      '<div class="note">Personal task \u00b7 no owner. Filed under the <b>Personal</b> project.</div>';
    $('.sbody',rec.sheet).innerHTML=bq;updateSaveBtn(rec,f);wireOwnerSearch(rec);return;
  }
  var b=
    '<div class="sech first">Basic details</div><div class="meta">'+
      '<div class="fld wide"><label>1 \u00b7 Line item <span class="req">*</span></label><input data-chg="f-line" placeholder="e.g. ORP-3902 Downtime requirement" value="'+esc(f.lineItem)+'"></div>'+
      '<div class="fld wide"><label>2 \u00b7 Description \u00b7 latest update <span class="req">*</span></label><textarea data-chg="f-task" placeholder="e.g. Bank to confirm downtime of 3\u20135 days.">'+esc(f.task)+'</textarea></div>'+
      '<div class="fld wide"><label>3 \u00b7 Project <span class="req">*</span></label><select data-chg="f-proj">'+
        S.projects.map(function(o){return '<option value="'+o.id+'"'+(f.projectId===o.id?' selected':'')+'>'+esc(o.name)+'</option>';}).join('')+'<option value="__new">+ New project\u2026</option></select></div>'+
      '<div class="fld"><label>4 \u00b7 Ticket / Ref ID</label><input data-chg="f-ticket" placeholder="e.g. ORP-3902" value="'+esc(f.ticket)+'" autocapitalize="characters"></div>'+
      '<div class="fld"><label>Ticket link \u00b7 optional</label><input data-chg="f-url" inputmode="url" placeholder="https://\u2026" value="'+esc(f.ticketUrl)+'"></div>'+
    '</div>'+
    '<div class="sech">Assignment</div><div class="meta">'+
      '<div class="fld wide"><label>5 \u00b7 Owner / SPOC</label>'+ownerSelHtml(f)+'</div>'+
      '<div class="fld wide"><label>6 \u00b7 Priority</label>'+impToggle+'</div>'+
      '<div class="fld wide"><label>7 \u00b7 Tags</label>'+tagEditHtml(f.tags,'f-tag-del','f-tag-add','f-tag-addbuf','fTagIn')+'</div>'+
    '</div>'+
    '<div class="sech">Schedule</div><div class="meta">'+
      '<div class="fld wide"><label>8 \u00b7 Status <span class="req">*</span></label>'+statusPickHtml(f,!!rec.data.id)+'</div>'+
      '<div class="fld wide"><label>9 \u00b7 ETA</label>'+etaPickHtml(f)+'</div>'+
      '<div class="fld wide"><label>10 \u00b7 Follow-up reminder</label><select data-chg="f-remon"><option value=""'+(f.remOn?'':' selected')+'>No reminder</option><option value="1"'+(f.remOn?' selected':'')+'>Set follow-up reminder</option></select></div>'+
      (f.remOn?'<div class="fld"><label>Date</label><input type="date" data-chg="f-remdate" value="'+esc(f.remDate)+'"></div><div class="fld"><label>Time \u00b7 optional</label><input type="time" data-chg="f-remtime" value="'+esc(f.remTime)+'"></div><div class="fld wide"><label>Note</label><input data-chg="f-remnote" placeholder="What to chase\u2026" value="'+esc(f.remNote)+'"></div>':'')+
      '<div class="fld wide"><label>11 \u00b7 Remarks</label><textarea data-chg="f-notes" placeholder="Background, context, remarks\u2026">'+esc(f.notes)+'</textarea></div>'+
    '</div>';
  $('.sbody',rec.sheet).innerHTML=b;updateSaveBtn(rec,f);wireOwnerSearch(rec);
}

function saveForm(rec){
  var f=rec.data.f;
  var _goPersonal=false;
  f.tags=f.tags||[];var _ti=$('#fTagIn',rec.sheet);if(_ti&&_ti.value){parseTagList(_ti.value).forEach(function(t){addTagTo(f.tags,t);});_ti.value='';}
  if(!f.projectId){toast('Pick a project');return;}
  if(!f.lineItem||!f.lineItem.trim()){toast(f.quick?'Add a task':'Add a line item');return;}
  if(!f.quick&&(!f.task||!f.task.trim())){toast('Add a description');return;}
  f.lineItem=cap(f.lineItem.trim(),200);f.task=cap((f.task||'').trim(),4000);f.notes=cap(f.notes||'',4000);f.ticket=cap(f.ticket||'',80);
  if(f.etaKind==='date'&&!f.eta)f.etaKind='tbd';
  if(f.etaKind==='range'&&!f.eta&&!f.etaEnd)f.etaKind='tbd';
  if(f.etaKind==='range'&&f.eta&&f.etaEnd&&f.etaEnd<f.eta){var tmp=f.eta;f.eta=f.etaEnd;f.etaEnd=tmp;}
  if(rec.data.id){
    var a0=actById(rec.data.id);
    updateAct(rec.data.id,{projectId:f.projectId,ticket:f.ticket.trim(),ticketUrl:f.ticketUrl.trim(),lineItem:f.lineItem,task:f.task,spocIds:f.spocIds,etaKind:f.etaKind,eta:f.eta,etaEnd:f.etaEnd,status:f.status,notes:f.notes,important:f.important,tags:f.tags});
    if(a0){
      var was=a0.rem&&a0.rem.on;
      if(f.remOn&&!was)remPatch(rec.data.id,{on:true,date:f.remDate,time:f.remTime,note:f.remNote,done:false},{e:'Reminder set',t:f.remDate?fmtDY(f.remDate):''});
      else if(!f.remOn&&was)remPatch(rec.data.id,{on:false,done:false},{e:'Reminder removed'});
      else if(f.remOn&&was&&(a0.rem.date!==f.remDate||a0.rem.time!==f.remTime||a0.rem.note!==f.remNote))remPatch(rec.data.id,{date:f.remDate,time:f.remTime,note:f.remNote},{e:'Reminder updated',t:f.remDate?fmtDY(f.remDate):''});
    }
    toast('Saved');
  }else{
    var now=Date.now();
    var a={id:uid('a'),projectId:f.projectId,ticket:f.ticket.trim(),ticketUrl:f.ticketUrl.trim(),
      lineItem:f.lineItem,task:f.task,spocIds:f.spocIds.slice(),etaKind:f.etaKind,eta:f.eta,etaEnd:f.etaEnd,
      status:f.status,important:!!f.important,tags:(f.tags||[]).slice(),rem:{on:!!f.remOn,date:f.remDate,time:f.remTime,note:f.remNote,done:false},
      notes:f.notes,comments:[],activity:[],createdAt:now,updatedAt:now,completedAt:null};
    logAct(a,'Created');
    if(a.spocIds.length)logAct(a,'Owner/SPOC assigned','',spocLabel(a));
    if(a.rem.on)logAct(a,'Reminder set','',a.rem.date?fmtDY(a.rem.date):'');
    S.actionables.unshift(a);saveState();toast(f.projectId==='__personal'?'Added to your tasks':'Actionable created');_goPersonal=(f.projectId==='__personal');
  }
  closeSheet(rec);var det=sheetFor('detail');if(det)renderDetail(det);render();
  if(_goPersonal)nav('projectDetail',{id:'__personal',seg:'open'});
}

/* ---- FILTERS ---- */
function openFilters(){
  var rec=openSheet('<div class="shead"><h2>Filter &amp; sort</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody"></div>'+
    '<div class="sfoot"><button class="btn ghost" data-act="filters-clear">Clear all</button><button class="btn pri" data-act="close-sheet">Done</button></div>',
    {tag:'filters'});
  renderFilters(rec);
}
function chipGroup(label,items,sel,kind){
  return '<div class="fld wide" style="margin-bottom:14px"><label>'+label+'</label>'+
    '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:2px">'+
    items.map(function(it){var on=sel.indexOf(it[0])>=0;
      return '<button class="chip'+(on?' on':'')+'" data-act="flt-toggle" data-kind="'+kind+'" data-v="'+esc(it[0])+'">'+esc(it[1])+'</button>';
    }).join('')+'</div></div>';
}
function renderFilters(rec){
  var b='<div class="fld wide" style="margin-bottom:14px"><label>Sort by</label><select data-chg="flt-sort">'+
    [['smart','Smart \u00b7 overdue \u2192 ETA \u2192 follow-up'],['eta','ETA'],['ticket','Ticket / Ref ID'],['project','Project'],['updated','Recently updated']]
      .map(function(s){return '<option value="'+s[0]+'"'+(filters.sort===s[0]?' selected':'')+'>'+s[1]+'</option>';}).join('')+
    '</select></div>'+
    chipGroup('Project',S.projects.map(function(o){return[o.id,o.name];}),filters.project,'project')+
    chipGroup('Owner / SPOC',peopleSorted().map(function(u){return[u.id,u.name];}).concat([['__tbc','To be assigned']]),filters.spoc,'spoc')+
    chipGroup('Status',STATUSES.map(function(s){return[s,s];}),filters.status,'status')+
    '<div class="fld wide" style="margin-bottom:14px"><label>Flags</label>'+
    '<div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:2px">'+
    '<button class="chip'+(filters.fOd?' on':'')+'" data-act="flt-flag" data-f="fOd">Overdue only</button>'+
    '<button class="chip'+(filters.fFu?' on':'')+'" data-act="flt-flag" data-f="fFu">Follow-up due</button>'+
    '<button class="chip'+(filters.fTk?' on':'')+'" data-act="flt-flag" data-f="fTk">Has ticket ID</button>'+
    '</div></div>'+
    '<div class="meta"><div class="fld"><label>ETA from</label><input type="date" data-chg="flt-from" value="'+esc(filters.from)+'"></div>'+
    '<div class="fld"><label>ETA to</label><input type="date" data-chg="flt-to" value="'+esc(filters.to)+'"></div></div>';
  $('.sbody',rec.sheet).innerHTML=b;
}

/* ---- DAY SHEET ---- */
function openDay(iso){
  var items=sortActs(mainActs().filter(function(a){return coversDay(a,iso);}), 'smart');
  var fus=mainActs().filter(function(a){return isOpen(a)&&a.rem&&a.rem.on&&!a.rem.done&&a.rem.date===iso;});
  openSheet('<div class="shead"><h2>'+esc(fmtDY(iso))+' \u00b7 '+items.length+' due</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody">'+
    (items.length?items.map(function(a){return actRow(a);}).join('<div style="height:8px"></div>'):emptyBox('Nothing due','No actionables have this ETA.'))+
    (fus.length?'<div class="eyebrow" style="padding:16px 0 8px">Follow-ups \u00b7 '+fus.length+'</div>'+fus.map(function(a){return actRow(a);}).join('<div style="height:8px"></div>'):'')+
    '<div class="btnrow"><button class="btn ghost" data-act="add-for-day" data-d="'+iso+'">'+I('plus')+'Add for this date</button></div>'+
    '</div>',{tag:'day'});
}

/* ---- MORE MENU ---- */
function openMore(){
  var m=metrics(),badge=notifBadgeOn(m);
  openSheet('<div class="shead"><h2>More</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody" style="padding-top:6px">'+
    moreRow('projects','proj','Projects','Browse & manage projects, add new')+
    moreRow('reports','doc','Reports & exports','PDF / Excel with project selection')+
    moreRow('notifications','bell','Notifications',badge?'Actionables need attention today':'All clear')+
    moreRow('settings','sliders','Settings','Theme, name, daily brief, backup')+
    '</div>',{tag:'more'});
}
function moreRow(v,ic,t,s){return '<button class="rowline" data-act="go" data-v="'+v+'">'+I(ic)+'<span class="t">'+t+'<br><span class="s">'+esc(s)+'</span></span>'+I('chevR')+'</button>';}

/* ---- IMPORT ---- */
function openImport(){
  openSheet('<div class="shead"><h2>Import Backup</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody">'+
    '<p style="color:var(--tx2);font-size:.83rem;margin-bottom:12px">Choose a JSON backup file or paste its contents below. This replaces all current data.</p>'+
    '<div class="btnrow" style="margin-bottom:12px">'+
    '<button class="btn ghost" data-act="import-file">'+I('doc')+'Choose JSON file</button></div>'+
    '<input id="impFileInput" type="file" accept=".json,application/json" style="display:none">'+
    '<textarea id="impTxt" style="min-height:120px;font-family:var(--mono);font-size:.72rem" placeholder="Paste backup JSON here\u2026"></textarea>'+
    '<div class="btnrow"><button class="btn ghost" data-act="close-sheet">Cancel</button>'+
    '<button class="btn pri" data-act="import-ok">Restore</button></div></div>',{tag:'import'});
}

/* ---- EXPORTS ---- */
function xlsxReady(){return typeof XLSX!=='undefined';}
function pdfReady(){return window.jspdf&&window.jspdf.jsPDF;}
function stamp(){var d=new Date();return d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate());}
function deliverFile(b64,name,mime){
  if(A&&A.saveFile){var r=A.saveFile(b64,name,mime);if(r&&r.indexOf('ERR')===0)toast('Export failed \u2014 '+r.slice(4));else toast('Saved \u2192 '+r);return;}
  try{var bin=atob(b64),arr=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);var blob=new Blob([arr],{type:mime});var u=URL.createObjectURL(blob);var aEl=document.createElement('a');aEl.href=u;aEl.download=name;aEl.click();setTimeout(function(){URL.revokeObjectURL(u);},4000);}catch(e){toast('Export not available in this environment');}
}

/* Excel: Project | Line Item | Description | Owner | ETA | Status | Remarks */
function exportExcel(projId,projLabel){
  if(!xlsxReady()){toast('Export engine loading \u2014 try again');return;}
  var list=projId?S.actionables.filter(function(a){return a.projectId===projId&&isOpen(a);}):S.actionables.filter(isOpen);
  list=sortActs(list,'project');
  var head=['Project','Line Item','Description','Owner / SPOC','ETA','Status','Remarks'];
  var rows=list.map(function(a){return[projName(a.projectId),a.lineItem,a.task,spocLabel(a),plainEta(a)||(a.etaKind==='tbd'?'TBD':''),a.status,a.notes||''];});
  var ws=XLSX.utils.aoa_to_sheet([head].concat(rows));
  ws['!cols']=[{wch:14},{wch:32},{wch:48},{wch:18},{wch:16},{wch:20},{wch:40}];
  /* Bold header row */
  for(var c=0;c<head.length;c++){var addr=XLSX.utils.encode_cell({r:0,c:c});if(ws[addr])ws[addr].s={font:{bold:true}};}
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,projLabel||'All Projects');
  var b64=XLSX.write(wb,{bookType:'xlsx',type:'base64'});
  deliverFile(b64,(projLabel||'All_Projects').replace(/\s+/g,'_')+'_Report_'+stamp()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* PDF: Project | Line Item | Description | Owner | ETA | Status  (no Remarks) */
function exportPdf(projId,projLabel){
  if(!pdfReady()){toast('Export engine loading \u2014 try again');return;}
  var d=reportData(projId||null,true);
  var t=todayISO();
  var label=projLabel||'All Projects';
  var jsPDF=window.jspdf.jsPDF,doc=new jsPDF({unit:'pt',format:'a4'});
  var W=doc.internal.pageSize.getWidth(),M=40,y=48;
  doc.setFont('helvetica','bold');doc.setFontSize(16);doc.setTextColor(20,26,36);
  doc.text(label.toUpperCase()+' \u2014 PROJECT STATUS REPORT',M,y);y+=18;
  doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(100,115,130);
  doc.text('Generated: '+fmtDY(t)+' \u00b7 '+d.open.length+' open items',M,y);y+=18;
  doc.setDrawColor(220,226,234);doc.setLineWidth(.8);doc.line(M,y,W-M,y);y+=20;
  /* Summary */
  doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.setTextColor(20,26,36);doc.text('SUMMARY',M,y);y+=14;
  doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor(45,55,70);
  var srows=[['Open items',d.open.length],['Overdue / Breached',d.overdue.length],['Dependency',d.awaiting.length],['Follow-ups due',d.fu.length],['Due this week',d.week.length],['Completed this week',d.doneWeek.length]];
  srows.forEach(function(r){doc.text(r[0]+': '+r[1],M,y);y+=14;});
  y+=8;
  /* Main table: Project | Line Item | Description | Owner | ETA | Status */
  function section(title,list,emptyMsg){
    if(y>720){doc.addPage();y=48;}
    doc.setFont('helvetica','bold');doc.setFontSize(10.5);doc.setTextColor(20,26,36);doc.text(title.toUpperCase(),M,y);y+=8;
    if(!list.length){doc.setFont('helvetica','italic');doc.setFontSize(9);doc.setTextColor(130,140,152);y+=12;doc.text(emptyMsg,M,y);y+=20;return;}
    doc.autoTable({
      startY:y+4,
      head:[['Project','Line Item','Description','Owner','ETA','Status']],
      body:list.map(function(a){return[projCode(a.projectId),a.lineItem,a.task||'',spocLabel(a),fmtEta(a),a.status];}),
      margin:{left:M,right:M},
      styles:{fontSize:7.5,cellPadding:3.5,textColor:[45,55,70],lineColor:[225,232,240],lineWidth:.5,valign:'top'},
      headStyles:{fillColor:[17,24,38],textColor:255,fontStyle:'bold',fontSize:8},
      alternateRowStyles:{fillColor:[247,249,252]},
      columnStyles:{0:{cellWidth:44},1:{cellWidth:72},2:{cellWidth:148},3:{cellWidth:60},4:{cellWidth:44},5:{cellWidth:62}}
    });
    y=doc.lastAutoTable.finalY+20;
  }
  section('All Open Items ('+label+')',d.open,'No open items.');
  section('Overdue / Breached',d.overdue,'Nothing overdue.');
  section('Blocked \u00b7 dependency',d.awaiting,'Nothing blocked on a dependency.');
  /* Footer */
  var pages=doc.internal.getNumberOfPages();
  for(var p=1;p<=pages;p++){doc.setPage(p);doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(150,158,170);doc.text(label+' \u00b7 Project Status Report \u00b7 '+fmtDY(t),M,818);doc.text('Page '+p+' / '+pages,W-M,818,{align:'right'});}
  var b64=doc.output('datauristring').split(',')[1];
  deliverFile(b64,label.replace(/\s+/g,'_')+'_Status_Report_'+stamp()+'.pdf','application/pdf');
}

/* ---- NOTIFICATIONS BRIDGE ---- */
function syncSchedule(){try{if(A&&A.scheduleDaily)A.scheduleDaily(S.settings.notifHour,S.settings.notifMinute,!!S.settings.notifEnabled);}catch(e){}}

/* ============================================================
   EVENTS
   ============================================================ */
document.addEventListener('click',function(e){
  var el=e.target.closest?e.target.closest('[data-act]'):null;
  if(!el)return;if(el.tagName==='A')return;
  var act=el.getAttribute('data-act'),id=el.getAttribute('data-id');
  switch(act){
    /* Navigation */
    case 'tab':{var tb=el.getAttribute('data-tab');if(tb==='more'){openMore();break;}if(tb==='list')history_=[];nav(tb,{});break;}
    case 'go':closeTop();nav(el.getAttribute('data-v'),{});break;
    case 'back':goBack();break;
    case 'kpi':{filters=defaultFilters();filters.quick=el.getAttribute('data-q');nav('list',{});break;}
    case 'quick':filters.quick=el.getAttribute('data-q');render();break;
    case 'view-personal':filters=defaultFilters();nav('projectDetail',{id:'__personal',seg:'open'});break;
    case 'f-tag-del':{var fr1=sheetFor('form');if(fr1){var td=(el.getAttribute('data-tag')||'').toLowerCase();fr1.data.f.tags=(fr1.data.f.tags||[]).filter(function(x){return x.toLowerCase()!==td;});renderForm(fr1);}break;}
    case 'f-tag-add':{var fr2=sheetFor('form');if(fr2){fr2.data.f.tags=fr2.data.f.tags||[];addTagTo(fr2.data.f.tags,el.getAttribute('data-tag'));renderForm(fr2);}break;}
    case 'f-tag-addbuf':{var fr3=sheetFor('form');if(fr3){fr3.data.f.tags=fr3.data.f.tags||[];var fi=$('#fTagIn',fr3.sheet);if(fi&&fi.value){parseTagList(fi.value).forEach(function(t){addTagTo(fr3.data.f.tags,t);});fi.value='';}renderForm(fr3);}break;}
    case 'd-tag-del':{var dr1=sheetFor('detail');if(dr1){var a1=actById(dr1.data.id);if(a1){var dd=(el.getAttribute('data-tag')||'').toLowerCase();updateAct(dr1.data.id,{tags:(a1.tags||[]).filter(function(x){return x.toLowerCase()!==dd;})});renderDetail(dr1);render();}}break;}
    case 'd-tag-add':{var dr2=sheetFor('detail');if(dr2){var a2=actById(dr2.data.id);if(a2){var nt2=(a2.tags||[]).slice();addTagTo(nt2,el.getAttribute('data-tag'));updateAct(dr2.data.id,{tags:nt2});renderDetail(dr2);render();}}break;}
    case 'tag-manage':openTagManager();break;
    case 'versions-open':openVersions();break;
    case 'version-snap':{snapshot('Manual restore point');var _vr=sheetFor('versions');if(_vr)renderVersions(_vr);toast('Restore point saved');break;}
    case 'version-restore':{var _vi=parseInt(el.getAttribute('data-i'),10);var _va=loadVersions(),_vv=_va[_vi];if(_vv)confirmSheet('Restore this version?',esc(_vv.reason)+' \u2014 '+relTime(_vv.ts)+' \u00b7 '+_vv.count+' task'+(_vv.count===1?'':'s')+'. This replaces current data and syncs to your other device.','Restore',false,function(){restoreVersion(_vi);});break;}
    case 'tag-rename':{var tm=sheetFor('tagmgr');if(tm){var orig=el.getAttribute('data-tag'),inps=tm.sheet.querySelectorAll('input[data-tagorig]'),inp=null;for(var _i=0;_i<inps.length;_i++)if(inps[_i].getAttribute('data-tagorig')===orig){inp=inps[_i];break;}var nv=inp?inp.value:'';if(nv&&nv.trim()&&renameTag(orig,nv)){renderTagManager(tm);render();toast('Tag renamed');}else toast('Enter a new tag name');}break;}
    case 'tag-delete':{var tm2=sheetFor('tagmgr');if(tm2){var tgd=el.getAttribute('data-tag');confirmSheet('Delete tag?','Remove \u201c'+tgd+'\u201d from all tasks.','Delete',true,function(){deleteTag(tgd);renderTagManager(tm2);render();toast('Tag deleted');});}break;}
    case 'd-tag-addbuf':{var dr3=sheetFor('detail');if(dr3){var a3=actById(dr3.data.id);if(a3){var nt3=(a3.tags||[]).slice(),di=$('#dTagIn',dr3.sheet);if(di&&di.value){parseTagList(di.value).forEach(function(t){addTagTo(nt3,t);});di.value='';}updateAct(dr3.data.id,{tags:nt3});renderDetail(dr3);render();}}break;}
    case 'go-search':filters=defaultFilters();nav('list',{});setTimeout(function(){var i=$('#srch');if(i)i.focus();},60);break;
    case 'go-notif':nav('notifications',{});break;
    case 'go-calendar':nav('calendar',{});break;
    case 'go-people':nav('people',{});break;
    case 'tagdrop-toggle':tagDropOpen=!tagDropOpen;render();break;
    case 'tag-toggle':{var _tt=el.getAttribute('data-tag')||'';var _ti2=-1;for(var _k=0;_k<filters.tags.length;_k++)if(filters.tags[_k].toLowerCase()===_tt.toLowerCase()){_ti2=_k;break;}if(_ti2>=0)filters.tags.splice(_ti2,1);else filters.tags.push(_tt);render();break;}
    case 'tags-clear':filters.tags=[];render();break;
    case 'notif-read':S.settings.notifSeenDate=todayISO();saveState();render();toast('Marked as read');break;
    /* Theme toggle */
    case 'theme-toggle':{
      S.settings.theme=(S.settings.theme||'dark')==='dark'?'light':'dark';
      saveState();applyTheme();render();
      toast('Switched to '+(S.settings.theme==='light'?'light':'dark AMOLED')+' theme');
      break;
    }
    case 'set-accent':{S.settings.accent=el.getAttribute('data-k');saveState();applyTheme();render();break;}
    case 'set-font':{S.settings.font=el.getAttribute('data-k');saveState();applyTheme();render();toast('Font: '+el.textContent);break;}
    case 'cloud-sync':{
      if(!(window.Cloud&&window.Cloud.syncNow)){toast('Sync isn\u2019t set up on this device');break;}
      el.classList.add('spin');
      window.Cloud.syncNow().then(function(r){
        el.classList.remove('spin');
        if(window.__cloudStatusChanged)window.__cloudStatusChanged();
        var el2=document.querySelector('.syncbadge');if(el2&&window.Cloud.status){var st=window.Cloud.status();el2.className='syncbadge '+syncCls(st.label);el2.title=st.label||'';}
        toast(r==='ok'?'Synced':(r==='signin'?'Sign in to sync (Settings \u2192 Sync)':'Can\u2019t reach the sync server \u2014 will sync when back online'));
      }).catch(function(){el.classList.remove('spin');});
      break;
    }
    case 'cloud-signout':{if(window.Cloud&&window.Cloud.signOut){confirmSheet('Sign out of sync?','This device will stop syncing until you sign in again. Your data stays saved locally.','Sign out',false,function(){window.Cloud.signOut();render();toast('Signed out of sync');});}break;}
    /* Actionables */
    case 'open':openDetail(id);break;
    case 'add':openForm(null,view.name==='projectDetail'?{projectId:view.params.id}:null);break;
    case 'quick-new':openForm(null,{quick:true});break;
    case 'f-important':{var fri=sheetFor('form');if(fri){fri.data.f.important=!fri.data.f.important;renderForm(fri);}break;}
    case 'f-eta-quick':{var frq=sheetFor('form');if(frq){var fk=el.getAttribute('data-k'),ff=frq.data.f,tt=todayISO();if(fk==='today'){ff.etaKind='date';ff.eta=tt;ff.etaEnd='';}else if(fk==='tomorrow'){ff.etaKind='date';ff.eta=addDaysISO(tt,1);ff.etaEnd='';}else if(fk==='week'){ff.etaKind='date';ff.eta=endOfWeekISO(tt);ff.etaEnd='';}else if(fk==='custom'){ff.etaKind='date';ff.etaEnd='';}else{ff.etaKind='none';ff.eta='';ff.etaEnd='';}renderForm(frq);}break;}
    case 'f-status-set':{var frs=sheetFor('form');if(frs){frs.data.f.status=el.getAttribute('data-k');renderForm(frs);}break;}
    case 'pfilt':peopleView.filt=el.getAttribute('data-k');render();break;
    case 'd-important':{var dri=sheetFor('detail');if(dri){var ai=actById(dri.data.id);if(ai){updateAct(dri.data.id,{important:!ai.important});renderDetail(dri);render();}}break;}
    case 'add-for-day':{var dIso=el.getAttribute('data-d');closeTop();openForm(null,{eta:dIso});break;}
    case 'open-filters':openFilters();break;
    case 'filters-clear':{var qk=filters.quick;filters=defaultFilters();filters.quick=qk;var fr=sheetFor('filters');if(fr)renderFilters(fr);render();break;}
    case 'flt-toggle':{var kind=el.getAttribute('data-kind'),v=el.getAttribute('data-v');var arr=filters[kind];var ix=arr.indexOf(v);if(ix>=0)arr.splice(ix,1);else arr.push(v);var fr2=sheetFor('filters');if(fr2)renderFilters(fr2);render();break;}
    case 'flt-flag':{var fk=el.getAttribute('data-f');filters[fk]=!filters[fk];var fr3=sheetFor('filters');if(fr3)renderFilters(fr3);render();break;}
    /* Projects */
    case 'proj-filter':{filters=defaultFilters();filters.project=[id];nav('list',{});break;}
    case 'proj-nav':nav('projectDetail',{id:id,seg:'open'});break;
    case 'proj-seg':nav('projectDetail',{id:id,seg:el.getAttribute('data-seg'),tag:view.params.tag||''},true);break;
    case 'proj-tag':{var _pt=el.getAttribute('data-tag')||'';nav('projectDetail',{id:id,seg:view.params.seg||'open',tag:(view.params.tag&&view.params.tag.toLowerCase()===_pt.toLowerCase())?'':_pt},true);break;}
    case 'add-project':inputSheet('New project','e.g. HDFC Bank / Internal Team',function(name){S.projects.push({id:uid('p'),name:name,code:name.split(/\s+/)[0].toUpperCase().slice(0,6)});saveState();render();toast('Project added \u2014 now add owners/SPOCs');});break;
    case 'edit-proj':{var pp=projById(id);if(pp)inputSheet('Rename "'+pp.name+'"','New name',function(name){pp.name=name.trim()||pp.name;pp.code=pp.name.split(/\s+/)[0].toUpperCase().slice(0,6);saveState();render();toast('Project renamed');});break;}
    /* People */
    case 'person':nav('personDetail',{id:id});break;
    case 'add-person':personSheet(function(){render();});break;
    case 'person-ok':{var pr=sheetFor('newperson');if(pr){var nm=($('#npName',pr.sheet)||{}).value||'';nm=nm.trim();if(!nm){toast('Enter a name');break;}var u={id:uid('u'),name:nm};S.people.push(u);saveState();var cb0=pr.onOk;closeSheet(pr);if(cb0)cb0(u);else render();toast('Owner/SPOC added');}break;}
    /* Calendar */
    case 'day':openDay(el.getAttribute('data-d'));break;
    case 'cal-prev':calState.m--;if(calState.m<0){calState.m=11;calState.y--;}render();break;
    case 'cal-next':calState.m++;if(calState.m>11){calState.m=0;calState.y++;}render();break;
    case 'cal-today':{var n2=new Date();calState={y:n2.getFullYear(),m:n2.getMonth()};render();break;}
    /* Sheets */
    case 'close-sheet':closeTop();break;
    case 'confirm-ok':{var cs=sheetFor('confirm');if(cs){var cb=cs.onOk;closeSheet(cs);if(cb)cb();}break;}
    case 'input-ok':{var isRec=sheetFor('input');if(isRec){var val=($('#inpS',isRec.sheet)||{}).value||'';val=val.trim();if(!val){toast('Enter a value');break;}var cb2=isRec.onOk;closeSheet(isRec);if(cb2)cb2(val);}break;}
    /* Detail sheet */
    case 'd-spoc':{var dr0=sheetFor('detail');if(dr0){var a0=actById(dr0.data.id);if(a0){var arr0=a0.spocIds.slice();var ix0=arr0.indexOf(id);if(ix0>=0)arr0.splice(ix0,1);else arr0.push(id);updateAct(dr0.data.id,{spocIds:arr0});renderDetail(dr0);render();}}break;}
    case 'd-spoc-new':{var drn=sheetFor('detail');if(drn){var an=actById(drn.data.id);if(an)personSheet(function(u){updateAct(drn.data.id,{spocIds:an.spocIds.concat([u.id])});renderDetail(drn);render();});}break;}
    case 'd-complete':{var dr=sheetFor('detail');if(dr){updateAct(dr.data.id,{status:'Completed'});var a2=actById(dr.data.id);if(a2){logAct(a2,'Completed');saveState();}renderDetail(dr);render();toast('Completed');}break;}
    case 'd-reopen':{var dr2=sheetFor('detail');if(dr2){updateAct(dr2.data.id,{status:'In Progress'});var a3=actById(dr2.data.id);if(a3){logAct(a3,'Reopened');saveState();}renderDetail(dr2);render();toast('Reopened');}break;}
    case 'd-edit':{var dr3=sheetFor('detail');if(dr3)openForm(dr3.data.id);break;}
    case 'd-delete':{var dr4=sheetFor('detail');if(dr4){var aa=actById(dr4.data.id);if(aa){var _ix=S.actionables.indexOf(aa),_rm=aa;S.actionables.splice(_ix,1);saveState();closeSheet(dr4);render();toast('Deleted',{label:'Undo',fn:function(){S.actionables.splice(Math.min(_ix,S.actionables.length),0,_rm);saveState();render();toast('Restored');}});}}break;}
    case 'd-comment':{var dr5=sheetFor('detail');if(dr5){var inp=$('#cmtIn',dr5.sheet);var txt=(inp&&inp.value||'').trim();if(!txt)break;addComment(dr5.data.id,txt);renderDetail(dr5);render();}break;}
    /* Reminders */
    case 'rem-add':{var rr=sheetFor('detail');if(rr){remPatch(rr.data.id,{on:true,done:false,date:todayISO(),time:'',note:''},{e:'Reminder set',t:fmtDY(todayISO())});renderDetail(rr);render();}break;}
    case 'rem-done':{var rd=sheetFor('detail');if(rd){remPatch(rd.data.id,{done:true},{e:'Follow-up done'});renderDetail(rd);render();toast('Follow-up done');}break;}
    case 'rem-react':{var rc=sheetFor('detail');if(rc){remPatch(rc.data.id,{done:false},{e:'Follow-up reactivated'});renderDetail(rc);render();}break;}
    case 'rem-snooze':{var rs=sheetFor('detail');if(rs){var n3=parseInt(el.getAttribute('data-n'),10)||1;var a4=actById(rs.data.id);var base=a4&&a4.rem&&a4.rem.date&&a4.rem.date>todayISO()?a4.rem.date:todayISO();var nd=addDaysISO(base,n3);remPatch(rs.data.id,{date:nd,done:false},{e:'Follow-up snoozed',t:fmtDY(nd)});renderDetail(rs);render();toast('Snoozed to '+fmtDY(nd));}break;}
    case 'rem-remove':{var rm=sheetFor('detail');if(rm){remPatch(rm.data.id,{on:false,done:false},{e:'Reminder removed'});renderDetail(rm);render();}break;}
    /* Form */
    case 'f-spoc':{var fr4=sheetFor('form');if(fr4){var farr=fr4.data.f.spocIds;var fix=farr.indexOf(id);if(fix>=0)farr.splice(fix,1);else farr.push(id);renderForm(fr4);}break;}
    case 'f-spoc-new':{var fr5=sheetFor('form');if(fr5)personSheet(function(u){fr5.data.f.spocIds.push(u.id);renderForm(fr5);});break;}
    case 'form-save':{var fr6=sheetFor('form');if(fr6)saveForm(fr6);break;}
    /* Exports — all go through project selection in Reports view */
    case 'do-export-xlsx':{
      var rsel=$('#rep-proj-sel');
      var pid=rsel?rsel.value:'';
      var lbl=pid?projName(pid):'All Projects';
      exportExcel(pid||null,lbl);break;
    }
    case 'do-export-pdf':{
      var rsel2=$('#rep-proj-sel');
      var pid2=rsel2?rsel2.value:'';
      var lbl2=pid2?projName(pid2):'All Projects';
      exportPdf(pid2||null,lbl2);break;
    }
    case 'export-list-excel':exportExcel(null,'All_Projects');break;
    /* Settings */
    case 'toggle-notif':S.settings.notifEnabled=!S.settings.notifEnabled;saveState();syncSchedule();render();toast(S.settings.notifEnabled?'Daily brief on':'Daily brief off');break;
    case 'backup':{try{var json=JSON.stringify(S,null,1);var b64=btoa(unescape(encodeURIComponent(json)));deliverFile(b64,'Actionables_Backup_'+stamp()+'.json','application/json');}catch(e2){toast('Backup failed');}break;}
    case 'import':openImport();break;
    case 'import-file':{
      /* Trigger native file picker */
      var ir0=sheetFor('import');
      if(!ir0)break;
      var inp0=$('#impFileInput',ir0.sheet);
      if(inp0){
        inp0.onchange=function(){
          var file=inp0.files&&inp0.files[0];
          if(!file)return;
          var fr=new FileReader();
          fr.onload=function(ev){
            var txt=$('#impTxt',ir0.sheet);
            if(txt)txt.value=ev.target.result;
            toast('File loaded \u2014 tap Restore to import');
          };
          fr.readAsText(file);
        };
        inp0.click();
      }
      break;
    }
    case 'import-ok':{
      var ir=sheetFor('import');
      if(ir){
        var raw=($('#impTxt',ir.sheet)||{}).value||'';
        try{
          var pp=JSON.parse(raw);
          if(!pp||!pp.actionables)throw new Error('bad');
          confirmSheet('Replace all data?','Current data will be overwritten with the backup.','Restore backup',true,function(){
            snapshot('Before restore');S=pp;ensureDefaults();saveState();applyTheme();closeSheet(ir);filters=defaultFilters();render();syncSchedule();toast('Backup restored successfully');
          });
        }catch(e3){toast('Not a valid backup JSON');}
      }
      break;
    }
    case 'tmpl-download':exportTemplate();break;
    case 'tmpl-import':openTemplateImport();break;
    case 'tmpl-file':{
      var trec=sheetFor('tmplimport');if(!trec)break;
      var tinp=$('#tmplFileInput',trec.sheet);if(!tinp)break;
      tinp.onchange=function(){
        var file=tinp.files&&tinp.files[0];if(!file)return;
        if(!xlsxReady()){toast('Import engine loading \u2014 try again');return;}
        var fr=new FileReader();
        fr.onload=function(ev){
          var wb;try{wb=XLSX.read(new Uint8Array(ev.target.result),{type:'array'});}catch(e){toast('Could not read the Excel file');return;}
          var orig=S,clone;try{clone=JSON.parse(JSON.stringify(S));}catch(e){toast('Import failed');return;}
          S=clone;var c;
          try{c=runTemplateImport(wb);}
          catch(e){S=orig;toast(e&&e.message==='NO_SHEET'?'No \u201cActionables\u201d sheet found':'Could not process the template');return;}
          S=orig;
          var extra=(c.projNew||c.spocNew)?' \u00b7 '+c.projNew+' new project(s), '+c.spocNew+' new SPOC(s)':'';
          var st=$('#tmplStatus',trec.sheet);if(st)st.textContent='Preview \u2014 '+c.updated+' update \u00b7 '+c.added+' add \u00b7 '+c.deleted+' delete'+extra+'.';
          confirmSheet('Apply template update?',
            c.updated+' updated \u00b7 '+c.added+' added \u00b7 '+c.deleted+' deleted'+extra+'. Items not in the file are left unchanged.',
            'Apply update',c.deleted>0,function(){
              snapshot('Before template import');S=clone;ensureDefaults();saveState();applyTheme();closeSheet(trec);filters=defaultFilters();render();syncSchedule();toast('Data updated from template');
            });
        };
        fr.readAsArrayBuffer(file);
      };
      tinp.click();
      break;
    }
    case 'reseed':confirmSheet('Reset to demo data?','All current data will be replaced with the BCP / ICICI / SCB demo set.','Reset',true,function(){snapshot('Before reset');S=window.buildSeed(Date.now());saveState();applyTheme();filters=defaultFilters();render();syncSchedule();toast('Demo data restored');});break;
  }
});

document.addEventListener('change',function(e){
  var el=e.target,chg=el.getAttribute&&el.getAttribute('data-chg');
  if(!chg)return;var v=el.value;
  if(chg.indexOf('d-')===0||chg.indexOf('rem-')===0){
    var dr=sheetFor('detail');if(!dr)return;var aid=dr.data.id;
    if(chg==='d-status')updateAct(aid,{status:v});
    else if(chg==='d-etakind')updateAct(aid,{etaKind:v});
    else if(chg==='d-eta')updateAct(aid,{eta:v});
    else if(chg==='d-etaend')updateAct(aid,{etaEnd:v});
    else if(chg==='rem-date')remPatch(aid,{date:v},{e:'Reminder updated',t:v?fmtDY(v):''});
    else if(chg==='rem-time')remPatch(aid,{time:v});
    else if(chg==='rem-note')remPatch(aid,{note:v});
    if(chg==='rem-note'||chg==='rem-time'){render();return;}
    renderDetail(dr);render();return;
  }
  if(chg.indexOf('f-')===0&&sheetFor('form')){
    var fr=sheetFor('form'),f=fr.data.f;
    switch(chg){
      case 'f-proj':
        if(v==='__new'){inputSheet('New project','Project name',function(name){var p={id:uid('p'),name:name,code:name.split(/\s+/)[0].toUpperCase().slice(0,6)};S.projects.push(p);saveState();f.projectId=p.id;renderForm(fr);});}
        else{f.projectId=v;renderForm(fr);}break;
      case 'f-ticket':f.ticket=v;break;case 'f-url':f.ticketUrl=v;break;case 'f-line':f.lineItem=v;break;case 'f-task':f.task=v;break;
      case 'f-etakind':f.etaKind=v;renderForm(fr);break;case 'f-eta':f.eta=v;break;case 'f-etaend':f.etaEnd=v;break;
      case 'f-remon':f.remOn=!!v;if(f.remOn&&!f.remDate)f.remDate=todayISO();renderForm(fr);break;
      case 'f-remdate':f.remDate=v;break;case 'f-remtime':f.remTime=v;break;case 'f-remnote':f.remNote=v;break;
      case 'f-status':f.status=v;break;case 'f-notes':f.notes=v;break;
    }
    return;
  }
  if(chg==='lst-proj'){filters.project=(v==='__all')?[]:[v];filters.spoc=[];render();return;}
  if(chg==='lst-spoc'){filters.spoc=(v==='__all')?[]:(v==='__none'?['__tbc']:[v]);render();return;}
  if(chg==='psort'){peopleView.sort=v;render();return;}
  if(chg==='flt-sort'){filters.sort=v;render();return;}
  if(chg==='flt-from'){filters.from=v;render();return;}
  if(chg==='flt-to'){filters.to=v;render();return;}
  if(chg==='rep-proj'){
    /* update the hidden select that export buttons read */
    var sel=$('#rep-proj-sel');if(sel)sel.value=v;
    return;
  }
  if(chg==='set-name'){S.settings.userName=v;saveState();render();return;}
  if(chg==='set-time'){var parts=v.split(':');if(parts.length===2){S.settings.notifHour=+parts[0];S.settings.notifMinute=+parts[1];saveState();syncSchedule();toast('Daily brief at '+v);}return;}
});

function bindViewInputs(){
  var s=$('#srch');
  if(s){s.addEventListener('input',function(){filters.q=s.value;var scroll=window.scrollY,val=s.value,sel=s.selectionStart;render();var s2=$('#srch');if(s2){s2.value=val;s2.focus();try{s2.setSelectionRange(sel,sel);}catch(e){}}window.scrollTo(0,scroll);});}
  /* Sync the hidden proj sel when the report view select changes */
  var repSel=$('select[data-chg="rep-proj"]');
  if(repSel){
    var hidden=document.createElement('select');hidden.id='rep-proj-sel';hidden.style.display='none';
    S.projects.forEach(function(o){var opt=document.createElement('option');opt.value=o.id;opt.textContent=o.name;hidden.appendChild(opt);});
    document.body.appendChild(hidden);
    repSel.addEventListener('change',function(){hidden.value=this.value;});
  }
}

/* ---- BACK / LIFECYCLE ---- */
function goBack(){
  if(sheetStack.length){closeTop();return true;}
  if(history_.length){var prev=history_.pop();view=prev;render();window.scrollTo(0,0);return true;}
  if(view.name!=='list'){view={name:'list',params:{}};render();return true;}
  return false;
}
window.__handleBack=function(){return goBack()?'handled':'exit';};
window.__onResume=function(){render();};

/* ---- CLOUD SYNC BRIDGE (used by sync.js) ---- */
window.__getState=function(){return S;};
window.__applyCloudState=function(obj){
  if(!obj||!obj.actionables)return;
  if(obj.actionables.length===0&&S&&S.actionables&&S.actionables.length>0){
    if(window.Cloud&&window.Cloud.push)window.Cloud.push();   /* cloud is blank but we have data -> push ours up, don't self-wipe */
    return;
  }
  snapshot('Before sync');
  S=obj;ensureDefaults();
  try{localStorage.setItem('act_data',JSON.stringify(S));}catch(e){}
  applyTheme();
  render();                                   /* sheets live in #sheets, untouched by render() */
  var det=sheetFor('detail');if(det)renderDetail(det);
};
window.__cloudStatusChanged=function(){if(view.name==='settings')render();};

/* ---- BOOT ---- */
loadState();
applyTheme();
syncSchedule();
render();
try{if(window.Cloud&&window.Cloud.init)window.Cloud.init();}catch(e){}

/* ================= Excel round-trip template ================= */
function isoFromMs(ms){if(!ms)return '';var d=new Date(ms);function p(n){return(n<10?'0':'')+n;}return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());}
function dateToMs(iso){var p=String(iso).split('-');if(p.length!==3)return Date.now();return new Date(+p[0],+p[1]-1,+p[2],10,0,0).getTime();}
var TMPL_MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
function parseTmplDate(v){
  if(v==null)return '';
  if(typeof v==='number'&&isFinite(v)){var dc=new Date(Math.round((v-25569)*86400000));if(!isNaN(dc)){function p(n){return(n<10?'0':'')+n;}return dc.getUTCFullYear()+'-'+p(dc.getUTCMonth()+1)+'-'+p(dc.getUTCDate());}}
  var s=String(v).trim();if(!s)return '';
  if(/^tbd$/i.test(s))return 'TBD';
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  var m=s.match(/^(\d{1,2})\s*(?:st|nd|rd|th)?\s*([A-Za-z]{3,})\.?\s*(\d{4})?$/);
  if(m){var mo=TMPL_MON[m[2].slice(0,3).toLowerCase()];if(mo){var yr=m[3]?+m[3]:(new Date()).getFullYear();function q(n){return(n<10?'0':'')+n;}return yr+'-'+q(mo)+'-'+q(+m[1]);}}
  var d2=new Date(s);if(!isNaN(d2)){function r(n){return(n<10?'0':'')+n;}return d2.getFullYear()+'-'+r(d2.getMonth()+1)+'-'+r(d2.getDate());}
  return '';
}
function hmap(rows){var h=(rows&&rows[0])||[],m={};for(var i=0;i<h.length;i++){var k=String(h[i]==null?'':h[i]).toLowerCase().replace(/[^a-z0-9]/g,'');if(k&&m[k]===undefined)m[k]=i;}return m;}
function hval(row,map,keys){for(var i=0;i<keys.length;i++){var idx=map[keys[i]];if(idx!==undefined){var v=row[idx];return v==null?'':v;}}return '';}
function ownersToIds(str,add){if(!str)return [];return String(str).split(/[,\/]/).map(function(x){return x.trim();}).filter(Boolean).map(function(n){return add(n);}).filter(Boolean);}
function findOrAddProject(name,c){name=String(name==null?'':name).trim();if(!name)return (S.projects[0]?S.projects[0].id:'');for(var i=0;i<S.projects.length;i++)if(S.projects[i].name.toLowerCase()===name.toLowerCase())return S.projects[i].id;var np={id:uid('p'),name:name,code:name.slice(0,4).toUpperCase()};S.projects.push(np);if(c)c.projNew++;return np.id;}
function findOrAddPerson(name,c){name=String(name==null?'':name).trim();if(!name)return null;for(var i=0;i<S.people.length;i++)if(S.people[i].name.toLowerCase()===name.toLowerCase())return S.people[i].id;var nu={id:uid('u'),name:name};S.people.push(nu);if(c)c.spocNew++;return nu.id;}
function sheetRows(wb,name){var ws=wb.Sheets[name];if(!ws)return [];return XLSX.utils.sheet_to_json(ws,{header:1,defval:''});}

function exportTemplate(){
  if(!xlsxReady()){toast('Export engine loading \u2014 try again');return;}
  var XU=XLSX.utils,wb=XU.book_new();
  var info=[
   ['Actionables \u2014 data template (round-trip)'],
   ['Edit this file, then load it back via Settings \u2192 Update from template.'],
   [''],
   ['ID','Do NOT change or clear the ID on existing rows \u2014 it is how the app matches & updates them. Leave ID blank for NEW rows.'],
   ['Delete?','On the Actionables tab, type Yes to remove that row on import. Blank = keep.'],
   ['Status','Allowed: In Progress / On Hold / Dependency / Completed. Anything else becomes In Progress.'],
   ['Owner / SPOC','Name(s) from the SPOCs tab, comma-separated. Blank = to be assigned. New names are created automatically.'],
   ['Project','Name from the Projects tab. New names are created automatically.'],
   ['Important','Yes / No.'],
   ['ETA / due date','A date YYYY-MM-DD, or TBD, or blank. For a range put the start here and the end in ETA end.'],
   ['Follow-up date','Optional YYYY-MM-DD (turns on a reminder). Follow-up note is optional.'],
   ['Completed date','Only for Completed items; blank = today.'],
   [''],
   ['Items not present in this file are left untouched \u2014 nothing is deleted unless Delete? = Yes.']
  ];
  var wsi=XU.aoa_to_sheet(info);wsi['!cols']=[{wch:16},{wch:104}];XU.book_append_sheet(wb,wsi,'Read me');
  var wsp=XU.aoa_to_sheet([['ID','Project name','Short code']].concat(S.projects.map(function(p){return [p.id,p.name,p.code||''];})));
  wsp['!cols']=[{wch:16},{wch:26},{wch:12}];XU.book_append_sheet(wb,wsp,'Projects');
  var wsu=XU.aoa_to_sheet([['ID','SPOC / Owner name']].concat(S.people.map(function(u){return [u.id,u.name];})));
  wsu['!cols']=[{wch:16},{wch:28}];XU.book_append_sheet(wb,wsu,'SPOCs');
  var aHead=['ID','Project','Ticket / Ref ID','Ticket link','Line item','Description / update','Owner / SPOC','Status','Important','ETA / due date','ETA end (range only)','Follow-up date','Follow-up note','Remarks / notes','Tags','Completed date','Delete?'];
  var aRows=S.actionables.map(function(a){
    var eta='',ee='';
    if(a.etaKind==='tbd')eta='TBD';
    else if(a.etaKind==='range'){eta=a.eta||'';ee=a.etaEnd||'';}
    else if(a.etaKind==='date')eta=a.eta||'';
    var rem=a.rem||{};
    return [a.id,projName(a.projectId),a.ticket||'',a.ticketUrl||'',a.lineItem||'',a.task||'',
      (a.spocIds||[]).map(function(id){return personName(id);}).join(', '),
      a.status,a.important?'Yes':'No',eta,ee,
      rem.on?(rem.date||''):'',rem.on?(rem.note||''):'',a.notes||'',(a.tags||[]).join(', '),
      (a.status==='Completed'&&a.completedAt)?isoFromMs(a.completedAt):'',''];
  });
  var wsa=XU.aoa_to_sheet([aHead].concat(aRows));
  wsa['!cols']=[{wch:20},{wch:14},{wch:16},{wch:22},{wch:34},{wch:46},{wch:22},{wch:14},{wch:10},{wch:15},{wch:16},{wch:14},{wch:28},{wch:40},{wch:20},{wch:15},{wch:8}];
  XU.book_append_sheet(wb,wsa,'Actionables');
  var b64=XLSX.write(wb,{bookType:'xlsx',type:'base64'});
  deliverFile(b64,'Actionables-Template-'+stamp()+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function openTemplateImport(){
  openSheet('<div class="shead"><h2>Update from template</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div>'+
    '<div class="sbody"><p style="color:var(--tx2);font-size:.83rem;line-height:1.5;margin-bottom:12px">Pick the edited Excel template (.xlsx). Existing rows are matched by their <b>ID</b> and updated; rows with a blank ID are added; set <b>Delete?</b> to Yes to remove a row. Items not in the file are left unchanged.</p>'+
    '<button class="btn ghost" data-act="tmpl-file">'+I('dl')+'Choose Excel file</button>'+
    '<input id="tmplFileInput" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style="display:none">'+
    '<div id="tmplStatus" class="note" style="padding:12px 0 0"></div></div>',{tag:'tmplimport'});
}

function runTemplateImport(wb){
  var c={updated:0,added:0,deleted:0,projNew:0,spocNew:0};
  var pr=sheetRows(wb,'Projects');
  if(pr.length){var pm=hmap(pr);for(var i=1;i<pr.length;i++){var r=pr[i];if(!r)continue;
    var pid=String(hval(r,pm,['id'])||'').trim(),pname=String(hval(r,pm,['projectname','project','name'])||'').trim(),pcode=String(hval(r,pm,['shortcode','code'])||'').trim();
    if(!pname)continue;var p=pid?projById(pid):null;
    if(!p)for(var j=0;j<S.projects.length;j++)if(S.projects[j].name.toLowerCase()===pname.toLowerCase()){p=S.projects[j];break;}
    if(p){p.name=pname;if(pcode)p.code=pcode;}else{S.projects.push({id:pid||uid('p'),name:pname,code:pcode||pname.slice(0,4).toUpperCase()});c.projNew++;}
  }}
  var ur=sheetRows(wb,'SPOCs');
  if(ur.length){var um=hmap(ur);for(var k=1;k<ur.length;k++){var u=ur[k];if(!u)continue;
    var uid2=String(hval(u,um,['id'])||'').trim(),uname=String(hval(u,um,['spocownername','spocname','ownername','name','spoc'])||'').trim();
    if(!uname)continue;var pu=uid2?personById(uid2):null;
    if(!pu)for(var j2=0;j2<S.people.length;j2++)if(S.people[j2].name.toLowerCase()===uname.toLowerCase()){pu=S.people[j2];break;}
    if(pu){pu.name=uname;}else{S.people.push({id:uid2||uid('u'),name:uname});c.spocNew++;}
  }}
  var ar=sheetRows(wb,'Actionables');
  if(!ar.length)throw new Error('NO_SHEET');
  var am=hmap(ar),now=Date.now();
  for(var x=1;x<ar.length;x++){var row=ar[x];if(!row)continue;
    var id=String(hval(row,am,['id'])||'').trim();
    var line=cap(String(hval(row,am,['lineitem','line','title'])||'').trim(),200);
    var del=String(hval(row,am,['delete','remove'])||'').trim().toLowerCase();
    if(del==='yes'||del==='y'||del==='x'||del==='true'||del==='1'){if(id&&actById(id)){S.actionables=S.actionables.filter(function(z){return z.id!==id;});c.deleted++;}continue;}
    if(!line)continue;
    var proj=findOrAddProject(hval(row,am,['project','projectname']),c);
    var spocIds=ownersToIds(hval(row,am,['ownerspoc','owner','spoc','owners']),function(n){return findOrAddPerson(n,c);});
    var stIn=String(hval(row,am,['status'])||'').trim();
    var status=STATUSES.indexOf(stIn)>=0?stIn:(STATUS_MAP[stIn]||'In Progress');
    var important=/^(yes|y|true|1)$/i.test(String(hval(row,am,['important'])||'').trim());
    var task=cap(String(hval(row,am,['descriptionupdate','description','update','task'])||'').trim(),4000);
    var ticket=cap(String(hval(row,am,['ticketrefid','ticket','refid','ticketref'])||'').trim(),80);
    var ticketUrl=String(hval(row,am,['ticketlink','link','url'])||'').trim();
    var notes=cap(String(hval(row,am,['remarksnotes','remarks','notes'])||'').trim(),4000);
    var tags=parseTagList(hval(row,am,['tags','tag']));
    var fdate=parseTmplDate(hval(row,am,['followupdate','followup']));if(fdate==='TBD')fdate='';
    var fnote=String(hval(row,am,['followupnote','followupnotes'])||'').trim();
    var cdate=parseTmplDate(hval(row,am,['completeddate','completed','completeddatew']));if(cdate==='TBD')cdate='';
    var e1=parseTmplDate(hval(row,am,['etaduedate','eta','due','etadate']));
    var e2=parseTmplDate(hval(row,am,['etaendrangeonly','etaend','end']));
    var ek,ev,ee;
    if(e1==='TBD'){ek='tbd';ev='';ee='';}
    else if(e1&&e2&&e2!=='TBD'){ek='range';ev=e1;ee=e2;}
    else if(e1){ek='date';ev=e1;ee='';}
    else{ek='none';ev='';ee='';}
    var a=id?actById(id):null;
    if(a){
      a.projectId=proj;a.ticket=ticket;a.ticketUrl=ticketUrl;a.lineItem=line;a.task=task;
      a.spocIds=spocIds.slice();a.etaKind=ek;a.eta=ev;a.etaEnd=ee;a.status=status;a.important=important;a.notes=notes;a.tags=tags;
      a.rem=a.rem||{on:false,date:'',time:'',note:'',done:false};
      a.rem.on=!!fdate;a.rem.date=fdate||'';a.rem.note=fnote;if(!fdate)a.rem.done=false;
      a.completedAt=(status==='Completed')?(cdate?dateToMs(cdate):(a.completedAt||now)):null;
      a.updatedAt=now;logAct(a,'Updated via template');c.updated++;
    }else{
      var na={id:uid('a'),projectId:proj,ticket:ticket,ticketUrl:ticketUrl,lineItem:line,task:task,
        spocIds:spocIds.slice(),etaKind:ek,eta:ev,etaEnd:ee,status:status,important:important,tags:tags,
        rem:{on:!!fdate,date:fdate||'',time:'',note:fnote,done:false},notes:notes,comments:[],
        activity:[{ts:now,user:(S.settings&&S.settings.userName)||'You',event:'Created',from:'',to:''}],
        createdAt:now,updatedAt:now,completedAt:(status==='Completed')?(cdate?dateToMs(cdate):now):null};
      if(na.spocIds.length)logAct(na,'Owner/SPOC assigned','',na.spocIds.map(function(id2){return personName(id2);}).join(' & '));
      S.actionables.unshift(na);c.added++;
    }
  }
  return c;
}

/* ================= Tags helpers ================= */
function normTag(s){return String(s==null?'':s).replace(/,/g,' ').replace(/\s+/g,' ').trim().slice(0,28);}
function allTags(){var seen={},out=[];S.actionables.forEach(function(a){(a.tags||[]).forEach(function(t){var k=t.toLowerCase();if(!seen[k]){seen[k]=1;out.push(t);}});});return out.sort(function(x,y){return x.toLowerCase()<y.toLowerCase()?-1:1;});}
function addTagTo(arr,t){t=normTag(t);if(!t)return;for(var i=0;i<arr.length;i++)if(arr[i].toLowerCase()===t.toLowerCase())return;arr.push(t);}
function parseTagList(str){var out=[];String(str==null?'':str).split(',').forEach(function(x){addTagTo(out,x);});return out;}
function tagsHtml(a){if(!a.tags||!a.tags.length)return '';var sh=a.tags.slice(0,3).map(function(t){return '<span class="rtag">'+esc(t)+'</span>';}).join('');if(a.tags.length>3)sh+='<span class="rtag more">+'+(a.tags.length-3)+'</span>';return '<span class="rtags">'+sh+'</span>';}
function tagEditHtml(tags,delAct,addAct,addbufAct,inputId){
  tags=tags||[];
  var chips=tags.map(function(t){return '<button class="chip on tagpick" data-act="'+delAct+'" data-tag="'+esc(t)+'">'+esc(t)+' \u2715</button>';}).join('');
  var lower={};tags.forEach(function(t){lower[t.toLowerCase()]=1;});
  var sugg=allTags().filter(function(t){return !lower[t.toLowerCase()];}).slice(0,8).map(function(t){return '<button class="chip tagpick" data-act="'+addAct+'" data-tag="'+esc(t)+'">'+esc(t)+'</button>';}).join('');
  return '<div class="chips tagchips">'+(chips+sugg||'<span class="chip" style="border-style:dashed;color:var(--tx3)">No tags yet</span>')+'</div>'+
    '<div class="cmtrow" style="margin-top:8px"><input id="'+inputId+'" placeholder="Type a tag, comma to add several\u2026"><button class="btn ghost" style="flex:none;width:70px;height:42px" data-act="'+addbufAct+'">Add</button></div>';
}

/* ================= Review additions: caps, sync-merge, sync badge, tag manager ================= */
function cap(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n):s;}


/* Sync status dot in the home header (only when cloud sync is configured). */
function cloudBadgeHtml(){
  if(!(window.Cloud&&window.Cloud.status))return '';
  var st=window.Cloud.status();if(!st.configured)return '';
  return '<span class="syncbadge '+syncCls(st.label)+'" title="'+esc(st.label||'')+'"><i></i></span>';
}
function cloudSyncBtnHtml(){
  if(!(window.Cloud&&window.Cloud.status))return '';
  var st=window.Cloud.status();if(!st.configured)return '';
  return '<button class="iconbtn syncbtn" data-act="cloud-sync" title="Sync now">'+I('refresh')+'</button>';
}
function syncCls(lbl){lbl=lbl||'';if(/synced/i.test(lbl))return 'sy-ok';if(/error/i.test(lbl))return 'sy-err';if(/offline|cache|connect|load|sign|out/i.test(lbl))return 'sy-warn';return 'sy-idle';}
window.__cloudStatusChanged=function(){
  var el=document.querySelector('.syncbadge');if(!el||!(window.Cloud&&window.Cloud.status))return;
  var st=window.Cloud.status();el.className='syncbadge '+syncCls(st.label);el.title=st.label||'';
};

/* ---- Tag manager ---- */
function renameTag(oldT,newT){
  oldT=String(oldT);newT=normTag(newT);if(!newT)return false;
  var lo=oldT.toLowerCase();
  S.actionables.forEach(function(a){
    if(!a.tags||!a.tags.length)return;
    var hit=false,out=[];
    a.tags.forEach(function(t){if(t.toLowerCase()===lo)hit=true;else out.push(t);});
    if(hit){addTagTo(out,newT);a.tags=out;a.updatedAt=Date.now();}
  });
  saveState();return true;
}
function deleteTag(t){
  var lo=String(t).toLowerCase();
  S.actionables.forEach(function(a){if(!a.tags)return;var out=a.tags.filter(function(x){return x.toLowerCase()!==lo;});if(out.length!==a.tags.length){a.tags=out;a.updatedAt=Date.now();}});
  saveState();
}
function openTagManager(){var rec=openSheet('<div class="shead"><h2>Manage tags</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div><div class="sbody"></div>',{tag:'tagmgr'});renderTagManager(rec);}
function renderTagManager(rec){
  var tags=allTags(),counts={};
  S.actionables.forEach(function(a){(a.tags||[]).forEach(function(t){var k=t.toLowerCase();counts[k]=(counts[k]||0)+1;});});
  var body=tags.length?('<div class="taglist">'+tags.map(function(t){
    return '<div class="tagmrow"><input value="'+esc(t)+'" data-tagorig="'+esc(t)+'" maxlength="28"><span class="c">'+(counts[t.toLowerCase()]||0)+'</span>'+
      '<button class="btn ghost mini" data-act="tag-rename" data-tag="'+esc(t)+'">Rename</button>'+
      '<button class="btn danger mini" data-act="tag-delete" data-tag="'+esc(t)+'">Delete</button></div>';
  }).join('')+'</div>'):'<div class="note">No tags yet. Add tags to tasks and they\u2019ll appear here to rename or delete.</div>';
  $('.sbody',rec.sheet).innerHTML='<p style="color:var(--tx2);font-size:.83rem;margin-bottom:12px">Rename applies everywhere the tag is used; delete removes it from all tasks.</p>'+body;
}

/* ================= On-device version history (restore points) ================= */
var VERSIONS_KEEP=6;
function loadVersions(){try{return JSON.parse(localStorage.getItem('act_versions')||'[]');}catch(e){return [];}}
function newestNonEmptyVersion(){try{var arr=loadVersions();for(var i=0;i<arr.length;i++){var d=JSON.parse(arr[i].data);if(d&&d.actionables&&d.actionables.length>0)return d;}}catch(e){}return null;}
function snapshot(reason){
  try{
    if(!S||!S.actionables)return;
    var data=JSON.stringify(S);
    var arr=loadVersions();
    if(arr.length&&arr[0].data===data)return;           /* skip if nothing changed */
    arr.unshift({ts:Date.now(),reason:reason||'Restore point',count:S.actionables.length,data:data});
    while(arr.length>VERSIONS_KEEP)arr.pop();
    localStorage.setItem('act_versions',JSON.stringify(arr));
  }catch(e){}
}
function relTime(ts){
  var s=Math.max(0,Math.round((Date.now()-ts)/1000));
  if(s<60)return 'just now';
  var mn=Math.round(s/60);if(mn<60)return mn+' min ago';
  var hr=Math.round(mn/60);if(hr<24)return hr+' hr ago';
  var d=Math.round(hr/24);return d+' day'+(d>1?'s':'')+' ago';
}
function restoreVersion(i){
  var arr=loadVersions(),v=arr[i];if(!v)return;
  snapshot('Before restore');                            /* so the rollback itself is undoable */
  try{S=JSON.parse(v.data);}catch(e){toast('Could not read that version');return;}
  ensureDefaults();saveState();applyTheme();filters=defaultFilters();
  var vr=sheetFor('versions');if(vr)closeSheet(vr);
  render();if(window.syncSchedule)syncSchedule();
  toast('Restored version from '+relTime(v.ts));
}
function openVersions(){var rec=openSheet('<div class="shead"><h2>Version history</h2><button class="x" data-act="close-sheet">'+I('x')+'</button></div><div class="sbody"></div>',{tag:'versions'});renderVersions(rec);}
function renderVersions(rec){
  var arr=loadVersions();
  var rows=arr.length?('<div class="verlist">'+arr.map(function(v,i){
    return '<div class="verrow"><span class="w"><b>'+esc(v.reason)+'</b><span class="s">'+relTime(v.ts)+' \u00b7 '+v.count+' task'+(v.count===1?'':'s')+'</span></span>'+
      '<button class="btn ghost mini" data-act="version-restore" data-i="'+i+'">Restore</button></div>';
  }).join('')+'</div>'):'<div class="note">No restore points yet. They\u2019ll appear here as you use the app.</div>';
  $('.sbody',rec.sheet).innerHTML=
    '<p style="color:var(--tx2);font-size:.83rem;line-height:1.5;margin-bottom:12px">Up to '+VERSIONS_KEEP+' recent states are saved on this device \u2014 when you open the app, before a sync overwrites data, and before resets or imports. Restoring replaces current data and syncs it to your other device.</p>'+
    '<button class="btn ghost" style="margin-bottom:14px" data-act="version-snap">'+I('check')+'Create restore point now</button>'+
    rows;
}

/* ================= V2 reusable ETA component ================= */
function etaDate(iso){if(!iso)return '';var p=iso.split('-');return pad(+p[2])+' '+String(MON[(+p[1])-1]||'').toUpperCase();}
function etaState(a){
  if(a.status==='Completed')return 'done';
  if(a.etaKind==='tbd'||a.etaKind==='none'||!endEta(a))return 'none';
  var k=diffDays(endEta(a),todayISO());
  if(k>=2)return 'future';if(k===1)return 'tomorrow';if(k===0)return 'today';
  return (-k>=8)?'severe':'over';
}
function etaView(a){
  var st=etaState(a),d='',l='';
  if(st==='done'){var cd=a.completedAt?isoFromMs(a.completedAt):(endEta(a)||'');d=cd?etaDate(cd):'';l='COMPLETED';}
  else if(st==='none'){if(a.etaKind==='tbd'){d='TBD';l='Awaiting date';}else{d='NO ETA';l='Awaiting update';}}
  else{var end=endEta(a),k=diffDays(end,todayISO());d=etaDate(end);
    if(st==='future')l='Due in '+k+' day'+(k===1?'':'s');
    else if(st==='tomorrow')l='DUE TOMORROW';
    else if(st==='today')l='DUE TODAY';
    else{var late=-k;l=late+' DAY'+(late===1?'':'S')+' DELAYED';}}
  return '<div class="eta eta-'+st+'">'+(d?'<div class="eta-d">'+esc(d)+'</div>':'')+'<div class="eta-l">'+esc(l)+'</div></div>';
}

/* ================= Form helpers (V2.2) ================= */
function ownersByRecent(){
  var last={};
  S.actionables.forEach(function(a){(a.spocIds||[]).forEach(function(id){last[id]=Math.max(last[id]||0,a.updatedAt||0);});});
  return peopleSorted().slice().sort(function(a,b){var la=last[a.id]||0,lb=last[b.id]||0;if(la!==lb)return lb-la;return a.name.toLowerCase()<b.name.toLowerCase()?-1:1;});
}
function endOfWeekISO(t){var p=t.split('-');var d=new Date(+p[0],+p[1]-1,+p[2]);var add=(5-d.getDay()+7)%7;return addDaysISO(t,add);}
function etaPickHtml(f){
  var t=todayISO(),isDate=f.etaKind==='date',isRange=f.etaKind==='range';
  var today=isDate&&f.eta===t,tmr=isDate&&f.eta===addDaysISO(t,1),wk=isDate&&f.eta===endOfWeekISO(t);
  var custom=(isDate&&!today&&!tmr&&!wk)||isRange, none=(f.etaKind==='none'||f.etaKind==='tbd');
  function c(k,lab,on){return '<button class="etachip'+(on?' on':'')+'" data-act="f-eta-quick" data-k="'+k+'">'+lab+'</button>';}
  var chips='<div class="etapick">'+c('today','Today',today)+c('tomorrow','Tomorrow',tmr)+c('week','This week',wk)+c('custom','Custom date',custom)+c('none','No ETA',none)+'</div>';
  var inp='';
  if(isRange)inp='<div class="etadates"><div class="fld"><label>From</label><input type="date" data-chg="f-eta" value="'+esc(f.eta)+'"></div><div class="fld"><label>To</label><input type="date" data-chg="f-etaend" value="'+esc(f.etaEnd)+'"></div></div>';
  else if(isDate)inp='<div class="etadates"><div class="fld wide"><label>Pick a date</label><input type="date" data-chg="f-eta" value="'+esc(f.eta)+'"></div></div>';
  return chips+inp;
}
function statusPickHtml(f,allowCompleted){
  return '<div class="statuspick">'+STATUSES.filter(function(s){return allowCompleted||s!=='Completed';}).map(function(s){
    var on=f.status===s;return '<button class="badge stpick '+stCls(s)+(on?' on':'')+'" data-act="f-status-set" data-k="'+esc(s)+'">'+esc(s)+'</button>';
  }).join('')+'</div>';
}
function ownerSelHtml(f){
  var sel=f.spocIds.length
    ? f.spocIds.map(function(id){return '<button class="ownchip sel" data-act="f-spoc" data-id="'+id+'">'+I('check')+'<span>'+esc(personName(id))+'</span><b>\u00d7</b></button>';}).join('')
    : '<span class="ownchip tbc">'+I('person')+'<span>To be assigned</span></span>';
  var opts=ownersByRecent().map(function(u){var on=f.spocIds.indexOf(u.id)>=0;return '<button class="own-opt'+(on?' on':'')+'" data-act="f-spoc" data-id="'+u.id+'" data-name="'+esc(u.name.toLowerCase())+'">'+esc(u.name)+(on?'<span class="ok">'+I('check')+'</span>':'')+'</button>';}).join('');
  return '<div class="ownsel"><div class="ownchips">'+sel+'</div>'+
    '<input id="fOwnerSearch" class="ownsearch" placeholder="Search people to assign\u2026" autocomplete="off">'+
    '<div class="ownopts">'+opts+'<button class="own-opt add" data-act="f-spoc-new" data-name="new person">'+I('plus')+'New person</button></div></div>';
}
function formValid(f){return !!(f.lineItem&&f.lineItem.trim())&&(f.quick||!!(f.task&&f.task.trim()));}
function updateSaveBtn(rec,f){var sv=$('.sfoot .btn.pri',rec.sheet);if(sv){var ok=formValid(f);sv.disabled=!ok;if(ok)sv.classList.add('ready');else sv.classList.remove('ready');}}
function wireOwnerSearch(rec){var os=$('#fOwnerSearch',rec.sheet);if(!os)return;os.addEventListener('input',function(){var q=this.value.toLowerCase(),opts=rec.sheet.querySelectorAll('.own-opt');for(var i=0;i<opts.length;i++){if(opts[i].classList.contains('add'))continue;var nm=opts[i].getAttribute('data-name')||'';opts[i].style.display=(!q||nm.indexOf(q)>=0)?'':'none';}});}

/* ===== Home-screen widget hooks (Add / View all) ===== */
window.__widgetAdd=function(proj,spoc){try{var pf={};if(proj&&proj!=='__all')pf.projectId=proj;if(spoc&&spoc!=='__all'&&spoc!=='__none')pf.spocIds=[spoc];openForm(null,pf);}catch(e){}};
window.__widgetView=function(proj,spoc){try{filters=defaultFilters();filters.project=(proj&&proj!=='__all')?[proj]:[];filters.spoc=(!spoc||spoc==='__all')?[]:(spoc==='__none'?['__tbc']:[spoc]);nav('list',{});}catch(e){}};

/* ===== Row leading icon accent (project-coloured; red overdue / green done) ===== */
function projColor(pid){var P=['#4F7DEA','#8B5CF6','#0EA5A4','#E0863B','#D6598B','#3B9AE0','#6366F1','#14B8A6'];pid=String(pid||'');var h=0;for(var i=0;i<pid.length;i++)h=(h*31+pid.charCodeAt(i))>>>0;return P[h%P.length];}
function rowAccent(a){var st=etaState(a);if(st==='over'||st==='severe')return '#F0787C';if(st==='done')return '#63CC8D';return projColor(a.projectId);}

/* ===== Sidebar rail tip (desktop) ===== */
function railTipHtml(){
  var tips=[
    'Group by Owner to spot who\u2019s overloaded.',
    'Tap the calendar icon to review everything by ETA.',
    'Clear red (overdue) items before they pile up.',
    'Every line item deserves a clear owner and ETA.',
    'Use tags to slice work across projects.',
    'Set a follow-up reminder so nothing waits on you silently.',
    'Plan the week from \u201cThis week\u201d every Monday.',
    'One SPOC per line item keeps accountability clear.',
    'Switch to \u201cBy project\u201d to review delivery per client.'
  ];
  var d=new Date(),idx=(d.getFullYear()*372+d.getMonth()*31+d.getDate())%tips.length;
  return '<div class="rt-ic">'+I('star')+'</div><div class="rt-tx"><span class="rt-h">Tip</span>'+esc(tips[idx])+'</div>';
}
