// BODYFIX — سجل المكالمات: قراية الملفات (CSV/Excel من الموبايل أو السنترال) + الحفظ في المخزن الخاص (شيت جوجل بمفتاح — نفس مخزن خطة اليوم والتحصيل).
// بيستخدمه fin.html (تاب «📞 المكالمات» + التأكيدات) و index.html (مهمة «📵 المكالمات الفائتة» في خطة اليوم).
// المخزن محمي بمفتاح متسجل على أجهزة الفريق بس (bf_sheet_cfg) — مش في الكود ولا في الريبو.
'use strict';
const cfDig=s=>String(s==null?'':s).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const cfPh=s=>{const d=cfDig(s).replace(/\D/g,'');return d.length>=10?d.slice(-10):d.length===9?'0'+d:d.length>=3?d:''};   // 10+ = موبايل/أرضي كامل · 9 = أرضي من غير الصفر · أقصر = رقم مختصر (خدمة عملاء…) بيتحسب مكالمة بس مش هيطابق مريض
// وقت القاهرة «على الحيطة» كرقم (عشان نقارن بوقت سجل المكالمات اللي متسجل بتوقيت الموبايل)
const cfWall=iso=>{if(!iso)return null;const d=new Date(iso);if(isNaN(d))return null;const s=d.toLocaleString('sv-SE',{timeZone:'Africa/Cairo',hour12:false});return Date.parse(s.replace(' ','T')+'Z')};
const cfFmt=t=>{if(t==null)return '—';const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')};
const cfDay=t=>new Date(t).toISOString().slice(0,10);
const cfDD=c=>Math.round((Date.parse(cfDay(c.aT))-Date.parse(cfDay(c.cT)))/864e5);   // فرق الأيام بالتاريخ (مش بالساعات): 0 = نفس يوم الموعد · 1 = اليوم اللي قبله
// ---------- قراية ملف المكالمات ----------
function cfCSV(txt){txt=txt.replace(/^﻿/,'');const first=txt.split(/\r?\n/)[0]||'';const dl=[',',';','\t'].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
  const rows=[];let row=[],f='',q=false;for(let i=0;i<txt.length;i++){const c=txt[i];
    if(q){if(c==='"'){if(txt[i+1]==='"'){f+='"';i++}else q=false}else f+=c}
    else if(c==='"')q=true;else if(c===dl){row.push(f);f=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&txt[i+1]==='\n')i++;row.push(f);f='';if(row.some(x=>x.trim()))rows.push(row);row=[]}else f+=c}
  row.push(f);if(row.some(x=>x.trim()))rows.push(row);return rows}
const CF_H={ph:/number|phone|mobile|tel|رقم|الرقم|موبايل|تليفون/i,type:/type|direction|نوع|الحاله|الحالة|status/i,dur:/dur|length|مد[ةه]|المد[ةه]|الوقت المستغرق/i,dt:/date|time|تاريخ|وقت|التاريخ/i,date:/date|تاريخ/i,time:/^\s*time\s*:?\s*$|^time\b|الساعه|الساعة|^\s*(ال)?وقت\s*:?\s*$/i,name:/name|اسم|contact/i};
function cfDetect(head,rows){const h=head.map(x=>String(x||'').trim());const pick=(rx,not)=>h.findIndex((x,i)=>rx.test(x)&&!(not||[]).includes(i));
  let ph=pick(CF_H.ph);if(ph<0){ph=h.findIndex((x,i)=>rows.slice(0,30).filter(r=>cfPh(r[i])).length>=Math.min(10,rows.length*0.6))}
  const type=pick(CF_H.type,[ph]),dur=pick(CF_H.dur,[ph,type]);let date=pick(CF_H.date,[ph,type,dur]),time=pick(CF_H.time,[ph,type,dur,date]);
  if(date<0)date=pick(CF_H.dt,[ph,type,dur]);if(time===date)time=-1;
  return {ph,type,dur,date,time}}
const cfType=v=>{const s=String(v||'').toLowerCase();if(/miss|فائت|فايت|لم يرد|rejected|reject|رفض|blocked|unanswered/.test(s))return 'miss';if(/out|صادر|dial|طالع/.test(s))return 'out';if(/in|وارد|داخل|recei|answered/.test(s))return 'in';return ''};
const cfDur=v=>{const s=cfDig(v).trim();if(!s)return 0;if(/^\d+(\.\d+)?$/.test(s))return +s;let m=s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);if(m)return m[1]*3600+m[2]*60+ +m[3];m=s.match(/^(\d+):(\d{1,2})$/);if(m)return m[1]*60+ +m[2];
  let t=0;s.replace(/(\d+)\s*(h|ساع)/i,(_,a)=>t+=a*3600).replace(/(\d+)\s*(m|دق)/i,(_,a)=>t+=a*60).replace(/(\d+)\s*(s|ث)/i,(_,a)=>t+=+a);return t};
// وقت المكالمة: بيقبل «2026-11-14 10:05» · «14/11/2026 10:05 PM» · «14-Nov-2026» · «Nov 14, 2026» · تاريخ Excel (رقم) والساعة كسر يوم أو نص
const CF_MON={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12,'يناير':1,'فبراير':2,'مارس':3,'ابريل':4,'أبريل':4,'مايو':5,'يونيو':6,'يوليو':7,'اغسطس':8,'أغسطس':8,'سبتمبر':9,'اكتوبر':10,'أكتوبر':10,'نوفمبر':11,'ديسمبر':12};
function cfTime(dv,tv,dmy){
  const xd=v=>typeof v==='number'&&v>20000&&v<80000, frac=v=>typeof v==='number'&&v>=0&&v<1;
  if(xd(dv)){let ms=Math.round((Math.floor(dv)-25569)*864e5),f=dv%1;                      // تاريخ Excel
    if(frac(tv))f=tv;else if(tv!=null&&tv!==''){const t=cfHM(cfDig(tv));if(t!=null)return ms+t}
    return ms+Math.round(f*864e5)}
  let s=(cfDig(dv).trim()+(tv!=null&&tv!==''?' '+(frac(tv)?cfHMs(tv):cfDig(tv).trim()):'')).trim();if(!s)return null;
  if(/^\d{12,13}$/.test(s))return cfWall(new Date(+s).toISOString());
  if(/^\d{10}$/.test(s))return cfWall(new Date(+s*1000).toISOString());
  s=s.replace(/ص\b|\bص\b/,' AM').replace(/(\d)\s*م\b/,'$1 PM');
  let y,mo,d,m;
  if((m=s.match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/))){y=+m[1];mo=+m[2];d=+m[3]}
  else if((m=s.match(/(\d{1,2})[-\/. ]+([A-Za-z؀-ۿ]{3,9})\.?[-\/., ]+(\d{2,4})/))&&CF_MON[m[2].toLowerCase().slice(0,m[2].length>4&&/[a-z]/i.test(m[2])?3:99)]!=null){d=+m[1];mo=CF_MON[m[2].toLowerCase().slice(0,/[a-z]/i.test(m[2])?3:99)];y=+m[3]}
  else if((m=s.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/))&&CF_MON[m[1].toLowerCase().slice(0,3)]){mo=CF_MON[m[1].toLowerCase().slice(0,3)];d=+m[2];y=+m[3]}
  else if((m=s.match(/(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))){const a=+m[1],b=+m[2];y=+m[3];if(dmy){d=a;mo=b}else{mo=a;d=b}}
  else return null;
  if(y<100)y+=2000; if(mo>12&&d<=12){const z=mo;mo=d;d=z}
  const t=cfHM(s);return Date.UTC(y,mo-1,d)+(t||0)}
function cfHM(s){const m=String(s).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?/i);if(!m)return null;let H=+m[1];const ap=(m[4]||'').toUpperCase();
  if(ap==='PM'&&H<12)H+=12;if(ap==='AM'&&H===12)H=0;return ((H*60+ +m[2])*60+ +(m[3]||0))*1000}
function cfHMs(f){const t=Math.round(f*86400);return Math.floor(t/3600)+':'+String(Math.floor(t%3600/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0')}

const cfK=c=>c.u?'u'+c.u:c.ph+'|'+c.t+'|'+c.ty+'|'+c.dur;
// صفوف الملف → مكالمات {ph,t,dur,ty,u?}
function cfParse(rows,prevMap){
  let hi=rows.findIndex(r=>r.filter(x=>String(x).trim()).length>=3&&r.some(x=>CF_H.ph.test(String(x))||CF_H.dt.test(String(x))));if(hi<0)hi=0;
  const head=rows[hi]||[],body=rows.slice(hi+1).filter(r=>r.length>1);const mp=prevMap&&prevMap.cols===head.join('|')?prevMap:Object.assign(cfDetect(head,body),{cols:head.join('|'),head});
  let dmy=true;const di=mp.date;if(di>=0){let a12=0,b12=0;body.slice(0,400).forEach(r=>{const m=String(cfDig(r[di])).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]/);if(m){if(+m[1]>12)a12++;if(+m[2]>12)b12++}});dmy=!(b12>a12)}
  const out=[];let bad=0,ex=null;const ui=head.findIndex(x=>/unique\s*id|call\s*id/i.test(String(x)));   // رقم المكالمة الثابت لو موجود — عشان المكرر
  for(const r of body){const ph=cfPh(r[mp.ph]);const t=cfTime(r[mp.date],mp.time>=0?r[mp.time]:null,dmy);
    if(!ph||t==null){bad++;if(!ex)ex={d:String(r[mp.date]??''),t:mp.time>=0?String(r[mp.time]??''):'',p:String(r[mp.ph]??'').replace(/\d(?=\d{3})/g,'•'),why:!ph?'الرقم':'التاريخ/الساعة'};continue}
    const dur=mp.dur>=0?cfDur(r[mp.dur]):0;let ty=mp.type>=0?cfType(r[mp.type]):'';if(ty==='in'&&dur===0&&mp.dur>=0)ty='miss';   // «فائتة» بتفضل فائتة حتى لو الملف حاطط وقت الرنة في المدة
    const o={ph,t,dur:ty==='miss'?0:dur,ty:ty||'?'};if(ui>=0&&String(r[ui]).trim())o.u=String(r[ui]).trim();out.push(o)}
  return {out,bad,mp,head,dmy,n:body.length,ex}}
async function cfReadFile(file,prevMap,loadX){let rows;
  if(/\.xlsx?$/i.test(file.name)){if(!window.XLSX&&!(loadX&&await loadX()))throw new Error('مكتبة Excel ما اتحملتش');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''})}
  else rows=cfCSV(await file.text());
  return cfParse(rows,prevMap)}
// «مرة ما اتكلمناش»: بتبدأ بمكالمة من غير كلام (فاتتنا / اتصلنا وما ردش) وبتخلص عند أول مكالمة اتكلمنا فيها (أي اتجاه، أي خط)
const cfTalk=c=>c.dur>0&&c.ty!=='miss';
function cfEpisodes(calls){const by={},E=[];calls.forEach(c=>(by[c.ph]=by[c.ph]||[]).push(c));
  for(const ph in by){const L=by[ph].sort((a,b)=>a.t-b.t);let e=null,lt=null;
    for(const c of L){if(cfTalk(c)){lt=c.t;if(e){e.tC=c.t;e.how=c.ty==='out'?'we':'he';e.lnC=c.ln;E.push(e);e=null}continue}
      if(!e)e={ph,t0:c.t,s:c.ty==='out'?'out':'miss',ln:c.ln,nO:0,nI:0,pT:lt};
      if(c.ty==='out'){e.nO++;if(e.tA==null&&e.s==='miss')e.tA=c.t}else e.nI++;e.last=c.t}
    if(e)E.push(e)}
  return {E,by}}
// ================= ☁️ المخزن الخاص =================
const CS={
  cfg(){try{const c=JSON.parse(localStorage.getItem('bf_sheet_cfg')||'null');return c&&c.url&&c.key?c:null}catch(e){return null}},
  async call(body){const c=CS.cfg();if(!c)throw new Error('nocfg');
    const r=await fetch(c.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({},body,{key:c.key}))});
    const j=await r.json();if(j&&j.error)throw new Error(j.error);return j},
  lk:ln=>encodeURIComponent(String(ln||'—')).replace(/[%.~\/]/g,'_'),
  TY:{in:'i',out:'o',miss:'m','?':'q'},YT:{i:'in',o:'out',m:'miss',q:'?'},
  d0:d=>Date.parse(d+'T00:00:00Z'),
  pack:c=>[c.ph,Math.round((c.t-CS.d0(cfDay(c.t)))/1000),CS.TY[c.ty]||'q',c.dur||0,c.u||''],
  unpack(r,d,ln){const o={ph:r[0],t:CS.d0(d)+r[1]*1000,ty:CS.YT[r[2]]||'?',dur:r[3]||0,ln};if(r[4])o.u=r[4];return o},
  months(n,end){const out=[],e=new Date(end||Date.now());for(let i=0;i<n;i++){const d=new Date(Date.UTC(e.getUTCFullYear(),e.getUTCMonth()-i,1));out.push(d.toISOString().slice(0,7))}return out},
  // المخزن ممكن يرجّع البيانات object أو نص JSON أو جوه data — نفكها في كل الحالات
  dd(x){let d=x&&x.data!==undefined?x.data:x;if(typeof d==='string'){try{d=JSON.parse(d)}catch(e){}}if(d&&d.data&&!d.r&&!d.ln&&!d.at)d=typeof d.data==='string'?JSON.parse(d.data):d.data;return d||{}},
  async list(prefix){const j=await CS.call({action:'list',prefix});const D=(j&&j.docs)||[];if(D.length&&!CS.dbg)CS.dbg=Object.keys(D[0]).join(',')+'|'+typeof D[0].data+'|'+Object.keys(CS.dd(D[0])).slice(0,6).join(',');return D},
  // كل المكالمات المحفوظة في الشهور دي
  // الترتيب زي باقي المخزن (days/<يوم>/rows/<id>): مجموعة = calls/<شهر>/days · واحد تحت = <الخط>~<اليوم>
  async load(months){const docs=[].concat(...await Promise.all(months.map(m=>CS.list('calls/'+m+'/days'))));const out=[];
    docs.forEach(x=>{const d=CS.dd(x);(d.r||[]).forEach(r=>out.push(CS.unpack(r,d.d,d.ln)))});return out},
  async logs(months){const docs=[].concat(...await Promise.all(months.map(m=>CS.list('calls/'+m+'/up'))));return docs.map(x=>CS.dd(x)).sort((a,b)=>(b.at||0)-(a.at||0))},
  // مين ماسك الموبايل (من د. أمجد): am = لحد الساعة sw · pm = بعدها — اللي اتغيّر من جدول الخطوط بيكسب
  // الهرم: 010 و011 مع الشيفت الصباحي لحد 3 العصر، وبعدها 010 مريم (عيادة 1) · 011 إنجي (عيادة 2) — الدقي: الصباحي لحد 5 والمسائي من 5 لـ 11
  DEF:{'010':{br:'BODYFIX Center',sw:15,am:'F',pm:'H'},'011':{br:'BODYFIX Center',sw:15,am:'F',pm:'J'}},
  // الدور اللي ماسك الخط: h = الساعة · old = يوم فات (الصبح أول واحد بيمسك الموبايل)
  roleAt(cfg,br,h,old){cfg=cfg||{};const sw=cfg.sw||(br==='FIX ZONE'?17:15),am=cfg.am||cfg.role||(br==='FIX ZONE'?'DM':'F'),pm=cfg.pm||cfg.role||(br==='FIX ZONE'?'DE':am);return old||h<sw?am:pm},
  normLn:ln=>cfDig(String(ln||'')).trim(),
  newLine(ln,br){return Object.assign(br==='FIX ZONE'?{br,sw:17,am:'DM',pm:'DE'}:{br,sw:15,am:'F',pm:'F'},CS.DEF[ln]||{},{auto:1})},
  async lines(){let L={};try{const j=await CS.call({action:'get',path:'config/call_lines'});const d=j&&j.doc;L=(d&&(d.lines||(d.data&&d.data.lines)))||{}}catch(e){}
    for(const k in CS.DEF)if(!L[k]||L[k].auto)L[k]=Object.assign({},CS.DEF[k],{auto:1});return L},
  async setLines(lines){await CS.call({action:'batch',items:[{path:'config/call_lines',data:{lines,at:Date.now()}}]})},
  // ضيف مكالمات ملف لخط: المكرر بيتشال · اللي كان محفوظ في أيام الملف مغطيها كلها واختفى من الملف الجديد = «اتمسح من الموبايل» (بيفضل محفوظ وبيتسجل)
  async merge(calls,ln,meta){ln=CS.normLn(ln);if(!calls.length)return {add:0,dup:0,gone:[]};
    let mn=Infinity,mx=-Infinity;calls.forEach(c=>{if(c.t<mn)mn=c.t;if(c.t>mx)mx=c.t});
    const ms=[...new Set(calls.map(c=>cfDay(c.t).slice(0,7)))],lk=CS.lk(ln);
    const docs=[].concat(...await Promise.all(ms.map(m=>CS.list('calls/'+m+'/days'))));
    const old={},oldU=new Map();docs.forEach(x=>{const d=CS.dd(x);if(d.ln!==ln)return;(old[d.d]=old[d.d]||[]).push(...(d.r||[]).map(r=>CS.unpack(r,d.d,ln)))});
    for(const d in old)old[d].forEach(c=>{if(c.u)oldU.set(c.u,{d,c})});
    const d1=cfDay(mn),d2=cfDay(mx);let add=0,dup=0,fix=0;const gone=[],items=[],dirty=new Set(),M={};for(const d in old)M[d]=old[d].slice();
    // 1) مكالمات ليها رقم ثابت (UniqueID): موجودة بنفس البيانات = مكرر · موجودة ببيانات مختلفة (وقت/نوع اتقرا غلط قبل كده) = تتصلح
    const rest=[];calls.forEach(c=>{if(!c.u){rest.push(c);return}const o=oldU.get(c.u);
      if(o&&o.c.t===c.t&&o.c.ty===c.ty&&o.c.dur===c.dur){dup++;return}
      if(o){M[o.d]=M[o.d].filter(x=>x!==o.c);dirty.add(o.d);fix++}else add++;
      const d=cfDay(c.t);(M[d]=M[d]||[]).push(c);dirty.add(d);oldU.set(c.u,{d,c})});
    // 2) من غير رقم ثابت: بالعدد (نفس الرقم/الدقيقة/النوع/المدة)
    const nw={};rest.forEach(c=>{(nw[cfDay(c.t)]=nw[cfDay(c.t)]||[]).push(c)});
    for(const d in nw){const O=old[d]||[],have=new Map(),fc=new Map();O.forEach(c=>{if(!c.u)have.set(cfK(c),(have.get(cfK(c))||0)+1)});
      nw[d].forEach(c=>{const k=cfK(c),n=(fc.get(k)||0)+1;fc.set(k,n);if(n>(have.get(k)||0)){(M[d]=M[d]||[]).push(c);dirty.add(d);add++}else dup++})}
    // 3) «اتمسحت»: أيام الملف مغطيها كلها — اللي كان متحفظ ومش في الملف الجديد
    const inFile=new Map();calls.forEach(c=>inFile.set(cfK(c),(inFile.get(cfK(c))||0)+1));
    for(const d in old){if(!(d>d1&&d<d2))continue;old[d].forEach(c=>{const k=cfK(c),n=inFile.get(k)||0;if(n>0)inFile.set(k,n-1);else gone.push(c)})}
    for(const d of dirty){const R=(M[d]||[]).sort((a,b)=>a.t-b.t).map(CS.pack),np=Math.max(1,Math.ceil(R.length/800)),op=Math.ceil((old[d]||[]).length/800);
      for(let p=0;p<Math.max(np,op);p++)items.push({_d:d,path:'calls/'+d.slice(0,7)+'/days/'+lk+'~'+d+(p?'~'+p:''),data:{ln,d,p,r:R.slice(p*800,p*800+800),at:Date.now()}})}
    const at=Date.now();
    items.push({path:'calls/'+cfDay(at).slice(0,7)+'/up/'+at+'_'+lk,data:Object.assign({ln,at,n:calls.length,add,dup,fix,gone:gone.length,goneR:gone.slice(0,300).map(c=>[cfDay(c.t)].concat(CS.pack(c))),mn,mx},meta||{})});
    for(let i=0;i<items.length;i+=15)await CS.call({action:'batch',items:items.slice(i,i+15).map(x=>({path:x.path,data:x.data}))});
    // نتأكد إن اللي اتحفظ بيتقري تاني
    let back=-1;try{back=(await CS.list('calls/'+cfDay(mx).slice(0,7)+'/days')).length}catch(e){}
    return {add,dup,fix,gone,back}}
};
