// BODYFIX — «📞 التأكيدات»: مين اتعلّم عليه «مؤكد» من غير اتصال حقيقي.
// التأكيدات: السحب بيسجل كل موعد Confirmed + وقت تعديله على Medicolize (= وقت التأكيد) — متشفرة مع باقي البيانات.
// سجل المكالمات: بيترفع هنا ويتقري على الجهاز بس — مش بيتبعت لأي حتة. بيتحفظ على نفس الجهاز/المتصفح (IndexedDB) عشان ما يترفعش تاني، والمكرر بيتشال.
'use strict';
const CF={a1:'',a2:'',calls:[],files:[],map:null,sheet:null,sheetTry:false,minT:null,maxT:null,d1:'',d2:'',rep:{}};
const cfT1=()=>CF.d1?Date.parse(CF.d1+'T00:00:00Z'):-Infinity,cfT2=()=>CF.d2?Date.parse(CF.d2+'T00:00:00Z')+864e5:Infinity;
const cfInR=t=>t>=cfT1()&&t<cfT2();
// فلاتر المكالمات: الخط (كل ملف = خط/سكرتيرة) + الساعة من/لحد (لو «من» أكبر من «لحد» = بتلف بعد نص الليل)
CF.ln='';CF.h1='';CF.h2='';
const cfHOk=t=>{if(CF.h1===''&&CF.h2==='')return true;const h=new Date(t).getUTCHours(),a=CF.h1===''?0:+CF.h1,b=CF.h2===''?24:+CF.h2;return a<=b?h>=a&&h<b:h>=a||h<b};
const cfCOk=(t,ln,allLines)=>cfInR(t)&&cfHOk(t)&&(allLines||!CF.ln||ln===CF.ln);
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
const CF_H={ph:/number|phone|mobile|tel|رقم|الرقم|موبايل|تليفون/i,type:/type|direction|نوع|الحاله|الحالة|status/i,dur:/dur|length|مد[ةه]|المد[ةه]|الوقت المستغرق/i,dt:/date|time|تاريخ|وقت|التاريخ/i,date:/date|تاريخ/i,time:/^time$|الساعه|الساعة|^وقت$/i,name:/name|اسم|contact/i};
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
async function cfRead(file){let rows;
  if(/\.xlsx?$/i.test(file.name)){if(!window.XLSX&&!(await loadLib('XLSX')))throw new Error('مكتبة Excel ما اتحملتش');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''})}
  else rows=cfCSV(await file.text());
  let hi=rows.findIndex(r=>r.filter(x=>String(x).trim()).length>=3&&r.some(x=>CF_H.ph.test(String(x))||CF_H.dt.test(String(x))));if(hi<0)hi=0;
  const head=rows[hi],body=rows.slice(hi+1).filter(r=>r.length>1);const mp=CF.map&&CF.map.cols===head.join('|')?CF.map:Object.assign(cfDetect(head,body),{cols:head.join('|'),head});
  // يوم/شهر ولا شهر/يوم؟ من الأرقام نفسها
  let dmy=true;const di=mp.date;if(di>=0){let a12=0,b12=0;body.slice(0,400).forEach(r=>{const m=String(cfDig(r[di])).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]/);if(m){if(+m[1]>12)a12++;if(+m[2]>12)b12++}});dmy=!(b12>a12)}
  const out=[];let bad=0;
  let ex=null;
  for(const r of body){const ph=cfPh(r[mp.ph]);const t=cfTime(r[mp.date],mp.time>=0?r[mp.time]:null,dmy);if(!ph||t==null){bad++;if(!ex)ex={d:String(r[mp.date]??''),t:mp.time>=0?String(r[mp.time]??''):'',p:String(r[mp.ph]??'').replace(/\d(?=\d{3})/g,'•'),why:!ph?'الرقم':'التاريخ/الساعة'};continue}
    const dur=mp.dur>=0?cfDur(r[mp.dur]):0;let ty=mp.type>=0?cfType(r[mp.type]):'';if(ty==='miss'&&dur>0)ty='in';if(ty==='in'&&dur===0&&mp.dur>=0)ty='miss';
    out.push({ph,t,dur,ty:ty||'?'})}
  return {out,bad,mp,head,dmy,n:body.length,ex}}
// ---------- الحفظ على الجهاز (IndexedDB) — مش بيتبعت لأي حتة ----------
const cfDB=(mode,fn)=>new Promise((res,rej)=>{let q;try{q=indexedDB.open('bodyfix_calls',1)}catch(e){return rej(e)}q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onerror=()=>rej(q.error);
  q.onsuccess=()=>{const db=q.result,tx=db.transaction('kv',mode),r=fn(tx.objectStore('kv'));tx.oncomplete=()=>{db.close();res(r&&r.result)};tx.onerror=()=>{db.close();rej(tx.error)}}});
const cfMM=()=>{let a=null,b=null;for(const c of CF.calls){if(a==null||c.t<a)a=c.t;if(b==null||c.t>b)b=c.t}CF.minT=a;CF.maxT=b;CF.idx=null;CF.st=null;CF.rch=null};
async function cfSave(){try{await cfDB('readwrite',s=>CF.calls.length||CF.files.length?s.put({v:1,calls:CF.calls,files:CF.files,map:CF.map,at:Date.now()},'log'):s.delete('log'));CF.saved=true}catch(e){console.warn(e);CF.saved=false}}
CF.ready=(async()=>{try{const d=await cfDB('readonly',s=>s.get('log'));if(d&&d.calls&&d.calls.length&&!CF.calls.length){CF.calls=d.calls;CF.files=d.files||[];CF.map=d.map||null;CF.saved=true;cfMM();if(typeof S!=='undefined'&&S.tab==='conf'&&typeof D!=='undefined'&&D)render()}}catch(e){console.warn(e)}})();
async function cfLoad(files,lines){await CF.ready;const seen=new Set(CF.calls.map(c=>c.ph+'|'+c.t+'|'+c.ty));for(const f of files){try{const r=await cfRead(f);CF.map=r.mp;
    let add=0,dup=0;const ln=(lines&&lines[files.indexOf(f)])||f.name.replace(/\.[^.]+$/,'');r.out.forEach(c=>{const k=c.ph+'|'+c.t+'|'+c.ty;if(!seen.has(k)){seen.add(k);c.ln=ln;c.src=f.name;CF.calls.push(c);add++}else dup++});
    CF.files.push({name:f.name,ln,n:r.n,ok:add,dup,bad:r.bad,mp:r.mp,dmy:r.dmy,ex:r.ex,at:Date.now()})}catch(e){CF.files.push({name:f.name,err:e.message||String(e),at:Date.now()})}}
  cfMM();await cfSave();render()}
// ---------- مين المسئولة (من خطة اليوم) ----------
async function cfSheet(){if(CF.sheetTry)return;CF.sheetTry=true;try{const d=await jsonp({action:'getAll'},25000);const r=(d&&d.reasons)||{};const o={sum:{},roles:null};
  for(const k in r){if(k.indexOf('PLANSUM|')===0){try{o.sum[k.slice(8)]=JSON.parse(r[k])}catch(e){}}else if(k==='PLANCFG|roles'){try{o.roles=JSON.parse(r[k])}catch(e){}}}
  CF.sheet=o}catch(e){CF.sheet={sum:{},roles:null,err:1}}if(S.tab==='conf'||S.tab==='sum')render()}
const CF_BR={haram:'BODYFIX Center',dokki:'FIX ZONE'},CF_ROLE={haram:'J',dokki:'DM'};
function cfWho(c){const sh=CF.sheet;if(!sh)return ['…',0];
  for(const d of [cfDay(c.cT),cfDay(c.aT),cfDay(c.cT-864e5)]){const s=sh.sum[d];if(s&&s.cf&&c.puid&&s.cf[c.puid])return [s.cf[c.puid],1]}
  const n=sh.roles&&(sh.roles[CF_BR[c.b]]||{})[CF_ROLE[c.b]];return [n?n+' *':'—',0]}
// ---------- البيانات ----------
function cfConfs(){const T=(RAW&&RAW.kinds&&RAW.kinds.conf&&RAW.kinds.conf.all)||{};const out=[];
  for(const mk in T){const t=T[mk],ci=n=>t.cols.indexOf(n);const I={aid:ci('aid'),s:ci('start'),u:ci('up'),cr:ci('cr'),ty:ci('type'),pid:ci('pid'),pn:ci('pn'),ph:ci('ph'),doc:ci('doc'),b:ci('b'),puid:ci('puid'),ph2:ci('ph2')};
    for(const r of t.rows){const cT=cfWall(r[I.u]),aT=cfWall(r[I.s]),crT=cfWall(r[I.cr]);if(cT==null||aT==null)continue;
      out.push({aid:r[I.aid],cT,aT,crT,type:tName(r[I.ty]||''),pid:r[I.pid],pn:r[I.pn]||'',ph:cfPh(r[I.ph]),ph2:I.ph2>=0?cfPh(r[I.ph2]):'',doc:docName(r[I.doc]||''),b:r[I.b],puid:I.puid>=0?r[I.puid]:null,k:cfDay(aT).slice(0,7)})}}
  return out}
const cfApOk=c=>{const d=cfDay(c.aT);return (!CF.a1||d>=CF.a1)&&(!CF.a2||d<=CF.a2)};   // فلتر يوم الموعد
function cfCalc(){const C0=cfConfs().filter(c=>inB(c)&&(CF.d1||CF.d2||CF.a1||CF.a2?((!(CF.d1||CF.d2)||cfInR(c.cT))&&cfApOk(c)):c.k>=S.from&&c.k<=S.to));
  if(!CF.idx){CF.idx={};CF.calls.forEach(c=>(CF.idx[c.ph]=CF.idx[c.ph]||[]).push(c))}
  // نتيجة الموعد من بيانات المواعيد
  const ap={};D.apt.forEach(a=>{if(!a.pid)return;const k=a.pid+'|'+a.d;(ap[k]=ap[k]||[]).push(a.st)});
  const res=c=>{const l=ap[c.pid+'|'+cfDay(c.aT)];if(!l)return c.aT>Date.now()+2*3600e3?'لسه':'—';if(l.some(s=>/complet|check|progress|delay/i.test(s)))return 'حضر';if(l.some(s=>/no ?show/i.test(s)))return 'ما جاش';if(l.some(s=>/cancel/i.test(s)))return 'اعتذر';return 'لسه'};
  C0.forEach(c=>{c.atBook=c.crT!=null&&Math.abs(c.cT-c.crT)<3*60e3;c.res=res(c);[c.who,c.whoOk]=cfWho(c)});
  // ⚡ بالجملة: 5 تأكيدات أو أكتر في 3 دقايق (نفس الفرع)
  const bursts=[];for(const b of ['haram','dokki']){const L=C0.filter(c=>c.b===b&&!c.atBook).sort((x,y)=>x.cT-y.cT);let j=0;
    for(let i=0;i<L.length;i++){while(L[i].cT-L[j].cT>3*60e3)j++;if(i-j+1>=5)for(let k=j;k<=i;k++)L[k].bulk=true}
    let cur=null;L.filter(c=>c.bulk).forEach(c=>{if(cur&&c.cT-cur.e<=3*60e3){cur.e=c.cT;cur.n++;cur.who[c.who]=(cur.who[c.who]||0)+1}else{cur={b,s:c.cT,e:c.cT,n:1,who:{[c.who]:1}};bursts.push(cur)}})}
  // 📞 سجل المكالمات: مكالمة اترد عليها للرقم ده في الـ 36 ساعة قبل التأكيد (لحد ربع ساعة بعده)
  const has=CF.calls.length;C0.forEach(c=>{if(!has||c.atBook){c.cat=c.atBook?'book':'nofile';return}
    if(CF.minT==null||c.cT<CF.minT||c.cT>CF.maxT+15*60e3){c.cat='nocov';return}
    const L=(CF.idx[c.ph]||[]).concat(c.ph2&&c.ph2!==c.ph?CF.idx[c.ph2]||[]:[]).filter(x=>x.t>=c.cT-36*3600e3&&x.t<=c.cT+15*60e3);c.calls=L;   // الرقم الأساسي أو التاني
    c.cat=!c.ph&&!c.ph2?'noph':L.some(x=>x.dur>0&&x.ty!=='miss')?'ok':L.some(x=>x.ty==='out')?'tried':L.length?'missonly':'none'});
  return {C:C0,bursts}}
const CF_CAT={ok:['✅ مكالمة اترد عليها','var(--good)'],tried:['📵 اتصلوا وما ردش — واتأكد','var(--warn)'],missonly:['📵 هو اللي اتصل وما اتردش عليه','var(--warn)'],none:['❌ مفيش أي مكالمة للرقم','var(--bad)'],
  nocov:['خارج فترة ملفات المكالمات','var(--t3)'],noph:['مفيش رقم على السيستم','var(--t3)'],book:['اتحجز «مؤكد» وقت الحجز (مش محتاج مكالمة)','var(--t3)'],nofile:['—','var(--t3)']};
function cfPendHTML(){const ex=[...new Set(CF.calls.map(c=>c.ln).concat(CF.files.map(f=>f.ln).filter(Boolean)))].sort();
  const guess=n=>{const b=n.toLowerCase().replace(/\.[^.]+$/,'');const hit=ex.filter(l=>b.includes(l.toLowerCase())||l.replace(/\D/g,'').length>=3&&b.replace(/\D/g,'').includes(l.replace(/\D/g,'')));return hit.sort((a,c)=>c.length-a.length)[0]||''};
  return `<div class="card" style="margin-top:8px;border:2px solid var(--acc)"><h3>📞 الملفات دي لأنهي خط؟</h3>
   ${CF.pend.map((f,i)=>{const g=guess(f.name);return `<div style="margin:8px 0"><b>${esc(f.name)}</b><div class="bar" style="margin-top:4px">${ex.map(l=>`<button data-cfpk="${i}" data-v="${esc(l)}" class="${l===g?'pri':''}">${esc(l)}</button>`).join('')}
     <label class="sub">${ex.length?'أو خط جديد:':'اسم الخط:'} <input data-cfpl="${i}" value="${esc(g)}" placeholder="مثلاً 010 أو 011 مريم" style="width:170px"></label>${g?'<span class="sub">✔️ اتعرف من اسم الملف</span>':''}</div></div>`}).join('')}
   <div class="bar"><button class="pri" id="cfPGo">✅ ضيف المكالمات</button><button id="cfPX">إلغاء</button><span class="sub">نفس اسم الخط = بيتجمعوا مع بعض في التقييم</span></div></div>`}
function vConf(){if(!CF.sheet)cfSheet();const X=cfCalc(),C=X.C,chk=C.filter(c=>!c.atBook),J=chk.filter(c=>['ok','tried','missonly','none'].includes(c.cat));
  const all=cfConfs();const since=all.length?cfFmt(Math.min(...all.map(c=>c.cT))):'';
  const fl=CF.files.map((f,i)=>f.err?`<li><b>${esc(f.name)}</b> — <span class="down">${esc(f.err)}</span></li>`:`<li><b>${esc(f.name)}</b> <label class="sub">📞 الخط: <input data-cfln="${i}" list="cfLnL" value="${esc(f.ln||f.name.replace(/\.[^.]+$/,''))}" style="width:140px"></label>${f.at?` <span class="sub">(اترفع ${cfFmt(cfWall(new Date(f.at).toISOString()))})</span>`:''} — ${f.ok} مكالمة جديدة${f.dup?` <span class="sub">+ ${f.dup} كانت موجودة قبل كده</span>`:''}${f.bad?` (${f.bad} سطر ما اتقراش)`:''}${f.bad&&f.ex?`<div class="sub" style="color:var(--warn)">مثال لسطر ما اتقراش — ${esc(f.ex.why)} مش مفهوم: التاريخ «${esc(f.ex.d)}» · الساعة «${esc(f.ex.t)}» · الرقم «${esc(f.ex.p)}» — ابعت الصورة دي لو لسه مش بيقرا</div>`:''}</li>`).join('');
  const mp=CF.map;const colSel=(k,lbl)=>mp?`<label class="sub">${lbl} <select data-cfc="${k}"><option value="-1">—</option>${mp.head.map((h,i)=>`<option value="${i}"${mp[k]===i?' selected':''}>${esc(String(h)).slice(0,30)}</option>`).join('')}</select></label>`:'';
  const ty={};CF.calls.forEach(c=>ty[c.ty]=(ty[c.ty]||0)+1);
  let h=`<div class="card"><h3>📞 التأكيدات — اتأكد بمكالمة فعلاً؟<small>${BRN[S.b]} · ${ml(S.from)}–${ml(S.to)}</small></h3>
   <div class="note" style="line-height:1.9">كل موعد بيتعلّم عليه «مؤكد» السحب بيسجّل وقته بالظبط${since?` (التسجيل شغال من ${since})`:''}. ارفع ملفات سجل المكالمات (CSV أو Excel — من الموبايل أو السنترال) وأنا أشوف: قبل التأكيد، هل فيه مكالمة <b>اترد عليها</b> لرقم المريض؟<br>
   الملفات بتتقري على جهازك بس — مش بتترفع لأي حتة. <b>بتتحفظ على الجهاز ده</b> (نفس المتصفح) فمش محتاج ترفعها تاني، وكل ما ترفع ملف جديد بيتضاف على القديم والمكالمات المكررة بتتشال لوحدها. على موبايل أو كمبيوتر تاني لازم ترفعها هناك. ملحوظة: التأكيد على <b>واتساب</b> مش بيظهر في سجل المكالمات.</div>
   <div class="bar" style="margin-top:8px"><b class="sub">📅 يوم الموعد:</b><label class="sub">من <input type="date" id="cfA1" value="${CF.a1}"></label><label class="sub">لحد <input type="date" id="cfA2" value="${CF.a2}"></label></div>
   <div class="bar" style="margin-top:6px"><b class="sub">✔️ يوم التأكيد (والمكالمات):</b><label class="sub">من <input type="date" id="cfD1" value="${CF.d1}"></label><label class="sub">لحد <input type="date" id="cfD2" value="${CF.d2}"></label><button id="cfDAll">كل فترة الملفات</button><button id="cfDClr">امسح التواريخ</button></div>
   <div class="bar" style="margin-top:6px"><span class="sub">${CF.a1||CF.a2||CF.d1||CF.d2?'الفلترين مع بعض: مواعيد في «يوم الموعد» اتأكدت في «يوم التأكيد» · «ما اتأكدش خالص» بيتحسب بيوم الموعد':'(من غير تاريخ: المكالمات كلها، والتأكيدات حسب شهور الفلتر فوق)'}</span><button class="pri" id="cfX">📥 نزّل التحليل وخطة العمل (Excel)</button></div>
   <div class="bar" style="margin-top:8px"><label class="drop" style="padding:6px 12px;border:1px dashed var(--brd);border-radius:8px;cursor:pointer">📂 ارفع ملفات المكالمات<input type="file" id="cfF" accept=".csv,.xlsx,.xls,.txt" multiple hidden></label>${CF.calls.length?`<button id="cfClr">🗑️ امسح المكالمات المحفوظة</button><span class="sub">${CF.saved?'💾 محفوظة على الجهاز · ':''}${CF.calls.length} مكالمة · من ${cfFmt(CF.minT)} لـ ${cfFmt(CF.maxT)} · صادرة ${ty.out||0} · واردة ${ty.in||0} · فائتة ${ty.miss||0}${ty['?']?` · من غير نوع ${ty['?']}`:''}</span>`:''}<span id="cfMsg" class="sub"></span></div>
   ${CF.pend?cfPendHTML():''}${fl?`<ul class="ins" style="margin-top:6px">${fl}</ul><datalist id="cfLnL">${[...new Set(CF.calls.map(c=>c.ln))].map(l=>`<option value="${esc(l)}">`).join('')}</datalist><div class="sub">كل ملف = خط. لو رفعت ملفين لنفس الخط (مثلاً شهرين) اكتب نفس اسم الخط في الاتنين وهيتجمعوا.</div>`:''}
   ${CF.calls.length?`<div class="bar" style="margin-top:8px"><b class="sub">📞 الخط:</b><select id="cfLn"><option value="">كل الخطوط</option>${[...new Set(CF.calls.map(c=>c.ln))].sort().map(l=>`<option${l===CF.ln?' selected':''}>${esc(l)}</option>`).join('')}</select>
    <b class="sub">🕐 الساعة:</b><label class="sub">من <input id="cfH1" type="number" min="0" max="23" value="${CF.h1}" placeholder="0" style="width:56px"></label><label class="sub">لحد <input id="cfH2" type="number" min="1" max="24" value="${CF.h2}" placeholder="24" style="width:56px"></label><button id="cfHClr">كل الخطوط وكل الساعات</button>
    <span class="sub">بيفلتر تحليل المكالمات وتقييم الأداء وقايمة «ما اتكلمناش» (مع التاريخ اللي فوق)</span></div>`:''}
   ${mp?`<div class="bar" style="margin-top:4px"><span class="sub">الأعمدة اللي فهمتها (غيّرها لو غلط):</span>${colSel('ph','الرقم')}${colSel('date','التاريخ')}${colSel('time','الساعة')}${colSel('type','النوع')}${colSel('dur','المدة')}</div>`:''}</div>`;
  if(!all.length)return h+`<div class="card" style="margin-top:12px">⏳ التسجيل بيبدأ من أول سحب جاي (11 الصبح). ارفع ملفات مكالمات من بعد كده — قبل كده مفيش تأكيدات متسجلة تتقارن.</div>`;
  const pc_=(a,f)=>a.length?pc(a.filter(f).length/a.length):'—';
  h+=`<div class="grid g4" style="margin-top:12px">${kpi('اتأكدوا (من غير اللي اتحجزوا مؤكد)',chk.length,C.length-chk.length?`+ ${C.length-chk.length} اتحجزوا «مؤكد» وقت الحجز`:'')}
    ${kpi('⚡ اتأكدوا بالجملة',pc_(chk,c=>c.bulk),'5 أو أكتر في 3 دقايق',chk.some(c=>c.bulk)?'down':'')}
    ${kpi('✅ مكالمة اترد عليها',J.length?pc_(J,c=>c.cat==='ok'):'ارفع الملفات',J.length?J.length+' اتقارنوا بالمكالمات':'')}
    ${kpi('❌ من غير مكالمة اترد عليها',J.length?pc_(J,c=>c.cat!=='ok'):'—','',J.length&&J.filter(c=>c.cat!=='ok').length/J.length>0.2?'down':'')}</div>`;
  {const n2=C.filter(c=>c.ph2).length;h+=`<div class="sub" style="margin-top:6px">📱 الرقم التاني (Secondary) من Medicolize: ${n2?`متسجل لـ ${n2} من ${C.length} ميعاد — المكالمات بتتطابق على الرقمين`:'لسه مش واصل (بيتسحب من أول مزامنة بعد 15/11) — المطابقة على الرقم الأساسي بس'}</div>`}
  h+='<!--CFCH-->';
  // قراية
  const L=[];if(J.length){const bad=J.filter(c=>c.cat!=='ok');L.push(`من ${J.length} تأكيد في فترة الملفات: <b>${J.filter(c=>c.cat==='ok').length}</b> قبلهم مكالمة اترد عليها، و<b class="down">${bad.length}</b> لأ (${J.filter(c=>c.cat==='none').length} مفيش أي مكالمة للرقم خالص، ${J.filter(c=>c.cat==='tried').length} اتصلوا وما ردش ومع ذلك اتعلّم مؤكد).`);
  }
  // 🔎 الاعتذار والغياب حسب نوع التأكيد (المواعيد اللي خلصت بس)
  const fin_=c=>c.res==='حضر'||c.res==='اعتذر'||c.res==='ما جاش';
  const grp=[['✅ اتأكد بمكالمة اترد عليها',c=>!c.atBook&&c.cat==='ok'],['📵 اتصلوا وما ردش — واتعلّم مؤكد',c=>!c.atBook&&(c.cat==='tried'||c.cat==='missonly')],['❌ اتأكد من غير أي مكالمة',c=>!c.atBook&&c.cat==='none'],
    ['⚡ اتأكد بالجملة',c=>c.bulk],['اتأكد (مش متقارن بمكالمات)',c=>!c.atBook&&(c.cat==='nocov'||c.cat==='nofile'||c.cat==='noph')],['اتحجز «مؤكد» وقت الحجز',c=>c.atBook]];
  const oRow=(t,a)=>{const n=a.length,ca=a.filter(c=>c.res==='اعتذر').length,ns=a.filter(c=>c.res==='ما جاش').length;return {t,n,at:n-ca-ns,ca,ns,r:n?(ca+ns)/n:null}};
  const OG=grp.map(([t,f])=>oRow(t,C.filter(c=>fin_(c)&&f(c)))).filter(o=>o.n);
  // مواعيد ما اتأكدتش خالص (من أول يوم التسجيل لحد امبارح، ومش في التأكيدات)
  {const t0=all.length?cfDay(Math.min(...all.map(c=>c.cT))):null,y=cfDay(Date.now()+2*3600e3-864e5),seen=new Set(all.map(c=>c.pid+'|'+cfDay(c.aT)));
   if(t0){const st={};D.apt.forEach(a=>{if(!inB(a)||!a.pid||a.d<t0||a.d>y||(CF.a1||CF.a2?((CF.a1&&a.d<CF.a1)||(CF.a2&&a.d>CF.a2)):((CF.d1&&a.d<CF.d1)||(CF.d2&&a.d>CF.d2))))return;const k=a.pid+'|'+a.d;if(seen.has(k))return;(st[k]=st[k]||[]).push(a.st)});
     const nc=Object.values(st).map(l=>({res:l.some(s=>/complet|check|progress|delay/i.test(s))?'حضر':l.some(s=>/no ?show/i.test(s))?'ما جاش':l.some(s=>/cancel/i.test(s))?'اعتذر':''})).filter(fin_);
     const o=oRow('⬜ ما اتأكدش خالص',nc);if(o.n)OG.push(o)}}
  const ogRows=OG.map(o=>[o.t,o.n,o.at,o.ca,o.ns,`<b${o.r>0.2?' class="down"':''}>${pc(o.r)}</b>`]);
  const gOk=OG.find(o=>o.t.startsWith('✅')),sus_=C.filter(c=>fin_(c)&&!c.atBook&&['tried','missonly','none'].includes(c.cat)),gS=oRow('',sus_);
  if(gOk&&gOk.n>=10&&gS.n>=10){const d=gS.r-gOk.r;L.push(`<b>الاعتذار والغياب:</b> اللي اتأكدوا بمكالمة حقيقية ${pc(gOk.r)} · اللي شاكين فيهم (من غير مكالمة اترد عليها) <b${d>0.05?' class="down"':''}>${pc(gS.r)}</b>${d>0.05?` — يعني التأكيد المشكوك فيه بيخلّي الموعد يضيع ${(gS.r/Math.max(gOk.r,0.01)).toFixed(1)} مرة أكتر. ده بيأكد إن التأكيد ده مش حقيقي (أو مش مفيد)`:d<-0.03?' — المشكوك فيهم مش بيغيبوا أكتر، فغالباً اتأكدوا بطريقة تانية (واتساب)':' — تقريباً نفس النسبة'}.`)}
  else if(J.length)L.push(`<span class="sub">مقارنة الاعتذار بين المؤكدين بمكالمة والمشكوك فيهم بتظهر لما يبقى فيه 10 مواعيد خلصوا على الأقل في كل مجموعة.</span>`);
  const susLost=C.filter(c=>(c.res==='اعتذر'||c.res==='ما جاش')&&!c.atBook&&(['tried','missonly','none'].includes(c.cat)||c.bulk)).sort((a,b)=>b.aT-a.aT).map(c=>[cfFmt(c.aT),esc(c.pn),esc(c.type),c.res,cfFmt(c.cT),esc(c.who),(c.bulk?'⚡ بالجملة ':'')+(CF_CAT[c.cat]?CF_CAT[c.cat][0]:'')]);
  if(susLost.length)L.push(`<b class="down">${susLost.length} موعد اعتذر أو ما جاش وكان متعلّم عليه مؤكد من غير مكالمة حقيقية</b> — القايمة تحت.`);
  if(X.bursts.length)L.push(`<b class="down">${X.bursts.length} مرة اتأكد فيها ${X.bursts.reduce((s,b)=>s+b.n,0)} موعد بالجملة</b> (5 أو أكتر في 3 دقايق) — مستحيل يكونوا مكالمات، غالباً اتعلّموا من غير اتصال أو بعد رسالة واتساب جماعية.`);
  if(chk.some(c=>!c.whoOk))L.push(`<span class="sub">* = المسئولة حسب التوزيع الأساسي (خطة اليوم بقت بتسجل مسئولة كل مريض من النهارده — الأيام الجاية هتبقى بالاسم الصح حتى لو حد غايب).</span>`);
  if(L.length)h+=`<div class="card" style="margin-top:12px"><h3>📖 القراية</h3><ul class="ins">${L.map(x=>`<li>${x}</li>`).join('')}</ul></div>`;
  // حسب المسئولة
  const g={};chk.forEach(c=>{const z=g[c.who]=g[c.who]||{n:0,j:0,ok:0,tr:0,no:0,bu:0,done:0,lost:0};z.n++;if(c.bulk)z.bu++;if(['ok','tried','missonly','none'].includes(c.cat)){z.j++;if(c.cat==='ok')z.ok++;else if(c.cat==='none')z.no++;else z.tr++}if(c.res==='حضر'||c.res==='ما جاش'||c.res==='اعتذر'){z.done++;if(c.res!=='حضر')z.lost++}});
  const wRows=Object.entries(g).sort((a,b)=>b[1].n-a[1].n).map(([k,z])=>[esc(k),z.n,z.j?pc(z.ok/z.j):'—',z.j?pc(z.tr/z.j):'—',z.j?pc(z.no/z.j):'—',pc(z.bu/z.n),z.done?pc(z.lost/z.done):'—']);
  // حسب اليوم
  const dg={};chk.forEach(c=>{const d=cfDay(c.cT),z=dg[d]=dg[d]||{n:0,j:0,ok:0,bu:0};z.n++;if(c.bulk)z.bu++;if(['ok','tried','missonly','none'].includes(c.cat)){z.j++;if(c.cat==='ok')z.ok++}});
  const dRows=Object.keys(dg).sort().reverse().slice(0,31).map(d=>{const z=dg[d];return [d.slice(8,10)+'/'+d.slice(5,7)+' '+DAYS[new Date(d+'T12:00:00Z').getUTCDay()],z.n,z.bu,z.j?pc(z.ok/z.j):'—']});
  const bRows=X.bursts.sort((a,b)=>b.s-a.s).slice(0,40).map(b=>[cfFmt(b.s)+(b.e>b.s?'–'+cfFmt(b.e).slice(6):''),BRN[b.b],b.n,esc(Object.entries(b.who).map(([k,v])=>k+(Object.keys(b.who).length>1?' ('+v+')':'')).join('، '))]);
  const sus=chk.filter(c=>['none','tried','missonly'].includes(c.cat)||c.bulk).sort((a,b)=>b.cT-a.cT).slice(0,300).map(c=>[cfFmt(c.cT),esc(c.pn),cfFmt(c.aT)+' · '+esc(c.type),esc(c.who),
    c.bulk?'⚡ بالجملة':'',CF_CAT[c.cat]?`<span style="color:${CF_CAT[c.cat][1]}">${CF_CAT[c.cat][0]}</span>`:'',(c.calls||[]).length?(c.calls.map(x=>(x.ty==='out'?'📤':x.ty==='in'?'📥':'📵')+cfFmt(x.t).slice(6)+(x.dur?' '+x.dur+'ث':'')).join(' ')):'',c.res]);
  CF.rep.conf={kpi:[['تأكيدات (من غير اللي اتحجزوا مؤكد)',chk.length],['اتأكدوا بالجملة',pc_(chk,c=>c.bulk)],['اتقارنوا بالمكالمات',J.length],['بمكالمة اترد عليها',J.length?pc_(J,c=>c.cat==='ok'):'—'],['من غير مكالمة اترد عليها',J.length?pc_(J,c=>c.cat!=='ok'):'—']],
    L,wRows,dRows,bRows,sus,g,J,chk,bursts:X.bursts,ogRows,susLost,gOk,gS};
  h+=`<div class="grid g2" style="margin-top:12px">
   <div class="card"><h3>حسب المسئولة عن التأكيد<small>من خطة اليوم</small></h3>${tableHTML(['',{t:'تأكيدات',n:1},{t:'✅ بمكالمة',n:1},{t:'📵 ما ردش',n:1},{t:'❌ مفيش مكالمة',n:1},{t:'⚡ بالجملة',n:1},{t:'ما جاش/اعتذر',n:1}],wRows,{h:340})}</div>
   ${ogRows.length?`<div class="card" style="grid-column:1/-1"><h3>🔎 الاعتذار والغياب حسب نوع التأكيد<small>المواعيد اللي خلصت بس · «ما اتأكدش خالص» = مواعيد من أول يوم التسجيل ما ظهرتش مؤكدة</small></h3>${tableHTML(['',{t:'مواعيد',n:1},{t:'حضر',n:1},{t:'اعتذر',n:1},{t:'ما جاش',n:1},{t:'اعتذر + ما جاش',n:1}],ogRows,{h:300})}<div class="note">لو «اتأكد من غير مكالمة» نسبته قريبة من «ما اتأكدش خالص» وبعيدة عن «اتأكد بمكالمة» = التأكيد ده على الورق بس.</div></div>`:''}
   ${susLost.length?`<div class="card" style="grid-column:1/-1"><h3>اعتذروا أو ما جوش — وكانوا متأكدين من غير مكالمة<small>${susLost.length}</small></h3>${tableHTML(['الموعد','المريض','الخدمة','النتيجة','اتأكد','المسئولة','ليه مشكوك فيه'],susLost,{h:360})}</div>`:''}
   <div class="card"><h3>كل يوم</h3>${tableHTML(['يوم التأكيد',{t:'تأكيدات',n:1},{t:'⚡ بالجملة',n:1},{t:'✅ بمكالمة',n:1}],dRows,{h:340})}</div>
   ${bRows.length?`<div class="card" style="grid-column:1/-1"><h3>⚡ تأكيد بالجملة<small>5 مواعيد أو أكتر اتعلّم عليهم مؤكد في 3 دقايق</small></h3>${tableHTML(['الوقت','الفرع',{t:'مواعيد',n:1},'المسئولة'],bRows,{h:300})}</div>`:''}
   ${sus.length?`<div class="card" style="grid-column:1/-1"><h3>المواعيد المشكوك فيها<small>${sus.length}</small></h3>${tableHTML(['اتأكد','المريض','الموعد','المسئولة','','المكالمات','مكالمات الرقم قبلها','النتيجة'],sus,{h:420})}</div>`:''}
  </div>`;
  // 📊 الصورة في رسومات — من Medicolize لوحده (من غير ملفات المكالمات)
  {const done=C.filter(fin_),lost=c=>c.res==='اعتذر'||c.res==='ما جاش',CH_=[];
   const tot=OG.reduce((s,o)=>s+o.n,0),okG=OG.filter(o=>!/ما اتأكدش|وقت الحجز|بالجملة/.test(o.t)),nConf=okG.reduce((s,o)=>s+o.n,0),nBook=(OG.find(o=>/وقت الحجز/.test(o.t))||{n:0}).n,nNone=(OG.find(o=>/ما اتأكدش/.test(o.t))||{n:0}).n;
   const G1=OG.filter(o=>!/بالجملة/.test(o.t));
   if(G1.length)CH_.push(['cfc1','التأكيد بيفرق؟ — من كل 100 ميعاد، كام ضاع (اعتذر أو ما جاش)',{type:'bar',data:{labels:G1.map(o=>o.t.replace(/[✅📵❌⬜⚡]/g,'').trim()+' ('+o.n+')'),datasets:[bar('ضاع %',G1.map(o=>Math.round(o.r*1000)/10),G1.map(o=>/ما اتأكدش/.test(o.t)?'#888780':/وقت الحجز/.test(o.t)?'#1baf7a':o.r>0.25?'#e34948':'#2a78d6'))]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}}}]);
   if(tot)CH_.push(['cfc2','بنأكد على كام من المواعيد أصلاً؟',{type:'doughnut',data:{labels:['اتأكد ('+nConf+')','مؤكد من الحجز ('+nBook+')','ما اتأكدش ('+nNone+')'],datasets:[{data:[nConf,nBook,nNone],backgroundColor:['#2a78d6','#1baf7a','#888780'],borderWidth:2}]},options:{cutout:'60%'}}]);
   const W=Object.entries(g).filter(([k,z])=>z.done>0).sort((a,b)=>b[1].done-a[1].done);
   if(W.length)CH_.push(['cfc3','لكل سكرتيرة — اللي أكدت عليهم: جم ولا ضاعوا؟',{type:'bar',data:{labels:W.map(([k,z])=>k+' ('+pc(z.lost/z.done)+')'),datasets:[bar('جه',W.map(([k,z])=>z.done-z.lost),'#1baf7a',{stack:'s'}),bar('ضاع',W.map(([k,z])=>z.lost),'#e34948',{stack:'s'})]},options:{indexAxis:'y',scales:{x:{stacked:true},y:{stacked:true}}}},Math.max(160,W.length*42+60)]);
   const BK=[['قبلها بيومين+',c=>cfDD(c)>=2],['قبلها بيوم',c=>cfDD(c)===1],['نفس اليوم — قبلها بـ3 ساعات+',c=>cfDD(c)===0&&(c.aT-c.cT)/36e5>=3],['نفس اليوم — أقل من 3 ساعات',c=>cfDD(c)===0&&(c.aT-c.cT)>=0&&(c.aT-c.cT)/36e5<3]];
   const L4=BK.map(b=>{const a=done.filter(c=>!c.atBook&&b[1](c));return {t:b[0],n:a.length,r:a.length?a.filter(lost).length/a.length:null}}).filter(x=>x.n);
   if(L4.length)CH_.push(['cfc4','التأكيد بدري ولا متأخر أحسن؟ — كام ضاع حسب إمتى اتأكد',{type:'bar',data:{labels:L4.map(x=>x.t+' ('+x.n+')'),datasets:[bar('ضاع %',L4.map(x=>Math.round(x.r*1000)/10),'#2a78d6')]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}}}]);
   const bu=done.filter(c=>c.bulk),nb=done.filter(c=>!c.bulk&&!c.atBook);
   if(bu.length&&nb.length)CH_.push(['cfc5','⚡ التأكيد بالجملة (5+ في 3 دقايق) — بيضيع أكتر؟',{type:'bar',data:{labels:['بالجملة ('+bu.length+')','واحد واحد ('+nb.length+')'],datasets:[bar('ضاع %',[Math.round(bu.filter(lost).length/bu.length*1000)/10,Math.round(nb.filter(lost).length/nb.length*1000)/10],['#e34948','#2a78d6'])]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}}}]);
   CF.charts=CH_;
   // 📋 الأسامي حسب إمتى اتأكد (كل المواعيد في الفترة — اللي لسه ما جاش يومها مكتوب «لسه»)
   const LB=[['🟢 اتحجز «مؤكد» وقت الحجز — والموعد بعدها بأكتر من يوم',c=>c.atBook&&c.crT!=null&&(c.aT-c.crT)/36e5>24],
     ['اتأكد قبلها بيومين أو أكتر (بالتاريخ)',c=>!c.atBook&&cfDD(c)>=2],['اتأكد اليوم اللي قبله',c=>!c.atBook&&cfDD(c)===1],
     ['اتأكد نفس يوم الموعد — قبله بـ3 ساعات أو أكتر',c=>!c.atBook&&cfDD(c)===0&&(c.aT-c.cT)/36e5>=3],['اتأكد نفس يوم الموعد — قبله بأقل من 3 ساعات',c=>!c.atBook&&cfDD(c)===0&&(c.aT-c.cT)>=0&&(c.aT-c.cT)/36e5<3]];
   const resC=r=>r==='حضر'?'<span style="color:var(--good)">حضر</span>':(r==='اعتذر'||r==='ما جاش')?`<b class="down">${r}</b>`:esc(r||'—');
   const lead=c=>{const hrs=((c.atBook&&c.crT!=null?c.aT-c.crT:c.aT-c.cT))/36e5;return hrs>=48?Math.round(hrs/24)+' يوم':hrs>=1?Math.round(hrs)+' ساعة':Math.round(hrs*60)+' د'};
   const lists=LB.map(([t,f])=>{const a=C.filter(f).sort((x,y)=>y.aT-x.aT),dn=a.filter(fin_),ls=dn.filter(lost);
     return a.length?`<details open style="margin-top:6px"><summary style="cursor:pointer;font-weight:700;font-size:.78rem">${t} — ${a.length} موعد${dn.length?` · ضاع ${ls.length} من ${dn.length} (${pc(ls.length/dn.length)})`:''}</summary>${tableHTML(['المريض','الموعد','اتأكد إمتى',{t:'قبلها بـ',n:1},'النتيجة','المسئولة'],a.slice(0,400).map(c=>[esc(c.pn),cfFmt(c.aT)+' · '+esc(c.type),cfFmt(c.atBook&&c.crT!=null?c.crT:c.cT)+(c.atBook?' (وقت الحجز)':'')+(c.bulk?' ⚡':''),lead(c),resC(c.res),esc(c.who||'')]),{h:360})}</details>`:''}).join('');
   CF.listsHTML=lists?`<div class="card" style="margin-top:12px"><h3>📋 الأسامي حسب إمتى اتأكد<small>دوس على أي مجموعة تفتح أساميها</small></h3>${lists}</div>`:'';
   const few=done.length<60?`<div class="sub" style="margin-top:6px">⚠️ لسه ${done.length} ميعاد بس خلصوا في الفترة دي — الأرقام هتتظبط كل ما الشهر يكمل.</div>`:'';
   const noDone=!CH_.length&&C.length?`<div class="card" style="margin-top:12px"><h3>📊 الصورة في رسومات</h3><div class="sub">الرسومات بتتحسب من المواعيد اللي <b>عدّت</b> (جه / اعتذر / ما جاش) — ولا ميعاد من اللي في الفلتر ده عدّى لسه. وسّع «📅 يوم الموعد» لأيام فاتت (مثلاً من أول الشهر لحد امبارح).</div></div>`:'';
   h=h.replace('<!--CFCH-->',noDone+(CH_.length?`<div class="card" style="margin-top:12px"><h3>📊 الصورة في رسومات<small>من Medicolize لوحده — من غير ملفات المكالمات</small></h3>${few}<div class="grid g2" style="margin-top:8px">${CH_.map(c=>`<div><div style="font-weight:700;font-size:.78rem;margin-bottom:4px">${c[1]}</div><div style="position:relative;height:${c[3]||220}px"><canvas id="${c[0]}"></canvas></div></div>`).join('')}</div></div>`:'')+(CF.listsHTML||''))}
  return h}
function cConf(){(CF.charts||[]).forEach(c=>chart(c[0],c[2]));const d1=$('#cfD1'),d2=$('#cfD2'),da=$('#cfDAll'),x=$('#cfX');const rr=()=>{CF.st=null;CF.rep={};render()};
  if(d1)d1.onchange=()=>{CF.d1=d1.value;rr()};if(d2)d2.onchange=()=>{CF.d2=d2.value;rr()};
  const a1=$('#cfA1'),a2=$('#cfA2'),dc=$('#cfDClr');if(a1)a1.onchange=()=>{CF.a1=a1.value;rr()};if(a2)a2.onchange=()=>{CF.a2=a2.value;rr()};if(dc)dc.onclick=()=>{CF.a1=CF.a2=CF.d1=CF.d2='';rr()};
  if(da)da.onclick=()=>{if(CF.minT!=null){CF.d1=cfDay(CF.minT);CF.d2=cfDay(CF.maxT)}else{CF.d1=CF.d2=''}rr()};if(x)x.onclick=()=>cfExcel();
  const f=$('#cfF');if(f)f.onchange=e=>{const fs=[...e.target.files];if(fs.length){CF.pend=fs;render()}};
  // اختيار الخط لكل ملف قبل القراية
  document.querySelectorAll('[data-cfpk]').forEach(b=>b.onclick=()=>{const i=$(`[data-cfpl="${b.dataset.cfpk}"]`);if(i)i.value=b.dataset.v;document.querySelectorAll(`[data-cfpk="${b.dataset.cfpk}"]`).forEach(x=>x.classList.toggle('pri',x===b))});
  const pg=$('#cfPGo'),px=$('#cfPX');if(px)px.onclick=()=>{CF.pend=null;render()};
  if(pg)pg.onclick=()=>{const L=CF.pend.map((f,i)=>{const v=($(`[data-cfpl="${i}"]`)||{}).value;return (v||'').trim()});const bad=L.findIndex(v=>!v);if(bad>=0){alert('اختار الخط للملف: '+CF.pend[bad].name);return}
    const fs=CF.pend;CF.pend=null;$('#cfMsg').textContent='بيقرا الملفات…';cfLoad(fs,L)};
  const ls=$('#cfLn'),h1=$('#cfH1'),h2=$('#cfH2'),hc=$('#cfHClr');if(ls)ls.onchange=()=>{CF.ln=ls.value;rr()};const hv=v=>v===''?'':String(Math.max(0,Math.min(24,Math.round(+v)||0)));
  if(h1)h1.onchange=()=>{CF.h1=hv(h1.value);rr()};if(h2)h2.onchange=()=>{CF.h2=hv(h2.value);rr()};if(hc)hc.onclick=()=>{CF.ln=CF.h1=CF.h2='';rr()};
  document.querySelectorAll('[data-cfln]').forEach(x=>x.onchange=async()=>{const f=CF.files[+x.dataset.cfln],v=x.value.trim();if(!f||!v)return;const old=f.ln||f.name.replace(/\.[^.]+$/,'');f.ln=v;CF.calls.forEach(c=>{if(c.src===f.name)c.ln=v});if(CF.ln===old)CF.ln=v;cfMM();CF.rep={};await cfSave();render()});
  const c=$('#cfClr');if(c)c.onclick=async()=>{if(!confirm('امسح كل المكالمات المحفوظة على الجهاز ده؟ هتحتاج ترفع الملفات تاني.'))return;CF.calls=[];CF.files=[];CF.map=null;cfMM();await cfSave();CF.saved=false;render()};
  document.querySelectorAll('[data-cfc]').forEach(s=>s.onchange=async()=>{const cols=CF.map.cols;CF.map[s.dataset.cfc]=+s.value;const bad=new Set(CF.files.filter(f=>f.mp&&f.mp.cols===cols).map(f=>f.name));CF.calls=CF.calls.filter(c=>!bad.has(c.src));CF.files=CF.files.filter(f=>!bad.has(f.name));cfMM();await cfSave();render();const m=$('#cfMsg');if(m)m.textContent='ارفع الملفات دي تاني بعد تعديل الأعمدة: '+[...bad].join('، ')})}
// ================= 📊 تحليل سجل المكالمات =================
try{CF.oh=JSON.parse(localStorage.getItem('fin_cfoh')||'null')||[10,22]}catch(e){CF.oh=[10,22]}
const cfIsOpen=t=>{const h=new Date(t).getUTCHours();return h>=CF.oh[0]&&h<CF.oh[1]};
const cfDurF=m=>m==null?'—':m<60?Math.round(m)+' د':m<1440?(m/60).toFixed(1)+' س':(m/1440).toFixed(1)+' يوم';
const cfMed=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y);return b[b.length>>1]};
function cfPts(){if(CF.pts)return CF.pts;const P={};D.apt.forEach(a=>{const ph=cfPh(a.ph);if(!ph)return;const z=P[ph]=P[ph]||{pn:a.pn,last:'',next:''};
    if(/complet/i.test(a.st)&&a.d>z.last)z.last=a.d;if(/open|confirm/i.test(a.st)&&a.d>=todayC()&&(!z.next||a.d<z.next))z.next=a.d;if(a.pn)z.pn=a.pn});return CF.pts=P}
function cfStats(){if(CF.st)return CF.st;const by={};CF.calls.forEach(c=>(by[c.ph]=by[c.ph]||[]).push(c));const end=CF.maxT,EP=[];
  for(const ph in by){const L=by[ph].sort((a,b)=>a.t-b.t);let ep=null;
    for(const c of L){if(c.ty==='miss'){if(!ep)ep={ph,t0:c.t,last:c.t,n:1,ln:c.ln,open:cfIsOpen(c.t)};else{ep.n++;ep.last=c.t}continue}
      if(!ep)continue;
      if(c.ty==='out'){if(ep.tA==null){ep.tA=c.t;ep.lnA=c.ln}ep.tries=(ep.tries||0)+1;if(c.dur>0){ep.tC=c.t;ep.how='رجعناله';EP.push(ep);ep=null}}
      else if(c.dur>0){ep.tC=c.t;ep.how='هو رجع كلمنا';EP.push(ep);ep=null}}
    if(ep)EP.push(ep)}
  EP.forEach(e=>{e.wA=e.tA!=null?(e.tA-e.t0)/60e3:null;e.wC=e.tC!=null?(e.tC-e.t0)/60e3:null;
    e.st=e.tC!=null?(e.how==='رجعناله'?'ok':'self'):e.tA!=null?'tried':(end-e.last<60*60e3?'pend':'none')});
  const EPr=EP.filter(e=>cfCOk(e.t0,e.ln,true));return CF.st={EP:EPr,by}}
function vCalls(){if(!CF.calls.length)return '';const EPa=cfStats().EP,EP=EPa.filter(e=>!CF.ln||e.ln===CF.ln),C0=CF.calls.filter(c=>cfCOk(c.t,c.ln,true)),C=C0.filter(c=>!CF.ln||c.ln===CF.ln),P=cfPts();if(!C.length)return '<div class="card" style="margin-top:12px">مفيش مكالمات بالفلتر ده (التاريخ/الساعة/الخط).</div>';
  const inc=C.filter(c=>c.ty==='in'||c.ty==='miss'),ans=C.filter(c=>c.ty==='in'&&c.dur>0),out=C.filter(c=>c.ty==='out'),outA=out.filter(c=>c.dur>0);
  const E0=EPa.filter(e=>e.st!=='pend'),E=E0.filter(e=>!CF.ln||e.ln===CF.ln),Eo=E.filter(e=>e.open),ret=E.filter(e=>e.wA!=null);
  const r=(a,f)=>a.length?a.filter(f).length/a.length:null;
  const bk=[[0,15,'أقل من ربع ساعة'],[15,60,'ربع ساعة – ساعة'],[60,180,'1–3 ساعات'],[180,1440,'3 ساعات – يوم'],[1440,1e9,'أكتر من يوم']];
  const dist=(arr)=>bk.map(b=>arr.filter(e=>e.wA!=null&&e.wA>=b[0]&&e.wA<b[1]).length).concat([arr.filter(e=>e.wA==null&&e.st!=='self').length,arr.filter(e=>e.st==='self'&&e.wA==null).length]);
  const dO=dist(Eo),dC=dist(E.filter(e=>!e.open));
  const distRows=bk.map((b,i)=>[b[2],dO[i],pc(dO[i]/(Eo.length||1)),dC[i]]).concat([['ما رجعناش خالص',dO[5],pc(dO[5]/(Eo.length||1)),dC[5]],['هو اللي رجع كلمنا قبل ما نكلمه',dO[6],pc(dO[6]/(Eo.length||1)),dC[6]]]);
  // بالساعة
  const H={};inc.forEach(c=>{const h=new Date(c.t).getUTCHours(),z=H[h]=H[h]||{n:0,m:0,w:[]};z.n++;if(c.ty==='miss')z.m++});E.forEach(e=>{const h=new Date(e.t0).getUTCHours();(H[h]=H[h]||{n:0,m:0,w:[]}).w.push(e.wA==null?1e9:e.wA)});
  const hRows=Object.keys(H).map(Number).sort((a,b)=>a-b).map(h=>{const z=H[h];return [(h%12||12)+(h<12?' ص':' م'),z.n,z.m,z.n?pc(z.m/z.n):'—',(cfMed(z.w)>=1e9?'أغلبها ما رجعناش':cfDurF(cfMed(z.w)))]});
  // باليوم
  const W={};inc.forEach(c=>{const w=new Date(c.t).getUTCDay(),z=W[w]=W[w]||{n:0,m:0,w:[]};z.n++;if(c.ty==='miss')z.m++});E.forEach(e=>{const w=new Date(e.t0).getUTCDay();(W[w]=W[w]||{n:0,m:0,w:[]}).w.push(e.wA==null?1e9:e.wA)});
  const wRows=[6,0,1,2,3,4,5].filter(w=>W[w]).map(w=>{const z=W[w];const md=cfMed(z.w);return [DAYS[w],z.n,z.m,pc(z.m/z.n),(md>=1e9?'أغلبها ما رجعناش':cfDurF(md))]});
  // بالخط (كل ملف = خط)
  // تقييم الأداء: الإجمالي + كل خط لوحده (بفلتر التاريخ والساعة — من غير فلتر الخط عشان تقارن)
  const lns=[...new Set(C0.map(c=>c.ln))].sort();const lStat=(l,cc,ee)=>{const ii=cc.filter(c=>c.ty==='in'||c.ty==='miss'),oo=cc.filter(c=>c.ty==='out'),eo=ee.filter(e=>e.open);
    const md=cfMed(eo.filter(e=>e.wA!=null).map(e=>e.wA)),mR=ii.length?ii.filter(c=>c.ty==='miss').length/ii.length:null,r1=r(eo,e=>e.wA!=null&&e.wA<60),rN=r(eo,e=>e.st==='none');
    const row=[l,ii.length,mR==null?'—':`<span class="${mR>0.2?'down':''}">${pc(mR)}</span>`,eo.length,r1==null?'—':pc(r1),cfDurF(md),rN==null?'—':`<span class="${rN>0.1?'down':''}">${pc(rN)}</span>`,oo.length,oo.length?pc(oo.filter(c=>c.dur>0).length/oo.length):'—',ee.filter(e=>e.st==='none').length];
    return row};
  const lRows=[Object.assign(lStat('<b>الإجمالي</b>',C0,E0).map((x,i)=>i&&typeof x!=='number'?'<b>'+x+'</b>':x),{_c:'tot'})].concat(lns.map(l=>{const x=lStat(`<a href="#" data-cfl="${esc(l)}">${esc(l)}</a>`,C0.filter(c=>c.ln===l),E0.filter(e=>e.ln===l));if(l===CF.ln)x._c='hl';return x}));
  // قوايم
  const who=ph=>{const p=P[ph];return p?esc(p.pn||'مريض')+(p.next?` <span class="sub">· موعد ${p.next.slice(8,10)}/${p.next.slice(5,7)}</span>`:p.last?` <span class="sub">· آخر زيارة ${p.last.slice(8,10)}/${p.last.slice(5,7)}</span>`:''):'<b style="color:var(--warn)">مش متسجل — ممكن مريض جديد</b>'};
  const ph0=ph=>'0'+ph;const now=CF.maxT;
  const none=EP.filter(e=>e.st==='none').sort((a,b)=>b.last-a.last),tried=EP.filter(e=>e.st==='tried').sort((a,b)=>b.last-a.last);
  const nRows=none.map(e=>[`<span dir="ltr">${ph0(e.ph)}</span>`,who(e.ph),e.n,cfFmt(e.t0)+(e.n>1?' … '+cfFmt(e.last).slice(6):''),cfDurF((now-e.last)/60e3),e.open?'':'بعد المواعيد',esc(e.ln||'')]);
  const tRows=tried.map(e=>[`<span dir="ltr">${ph0(e.ph)}</span>`,who(e.ph),e.n,cfFmt(e.t0),e.tries,cfDurF(e.wA),esc(e.lnA||'')]);
  const unk=none.filter(e=>!P[e.ph]).length;
  const md=cfMed(Eo.filter(e=>e.wA!=null).map(e=>e.wA));
  const L=[];
  L.push(`من ${inc.length} مكالمة داخلة، <b>${pc(ans.length/(inc.length||1))}</b> اترد عليها و<b class="${inc.length&&(inc.length-ans.length)/inc.length>0.2?'down':''}">${pc((inc.length-ans.length)/(inc.length||1))}</b> فاتت.`);
  if(Eo.length)L.push(`المكالمات اللي فاتت <b>في وقت الشغل</b> (${CF.oh[0]}–${CF.oh[1]}): ${Eo.length} مرة. رجعنا كلمناهم في خلال ساعة ${pc(r(Eo,e=>e.wA!=null&&e.wA<60))}، ونص الوقت بنرجع في خلال <b>${cfDurF(md)}</b>. ما رجعناش خالص: <b class="${r(Eo,e=>e.st==='none')>0.1?'down':''}">${pc(r(Eo,e=>e.st==='none'))}</b>.`);
  if(none.length)L.push(`<b class="down">${none.length} رقم فاتهم مكالمة ولسه محدش رجعلهم</b>${unk?` — منهم <b>${unk}</b> رقم مش متسجل عندنا (غالباً حد بيسأل أو مريض جديد ضاع)`:''}.`);
  if(tried.length)L.push(`${tried.length} رقم رجعنالهم وما ردوش ولسه ما اتكلمناش معاهم.`);
  if(out.length)L.push(`المكالمات الطالعة: ${out.length} — المريض رد على ${pc(outA.length/out.length)} منها. متوسط المكالمة: داخلة ${Math.round((ans.reduce((s,c)=>s+c.dur,0)/(ans.length||1)))} ث، طالعة ${Math.round(outA.reduce((s,c)=>s+c.dur,0)/(outA.length||1))} ث.`);
  const hs=Object.entries(H).filter(([h,z])=>z.n>=10&&cfIsOpen(Date.UTC(2026,0,1,+h))).sort((a,b)=>b[1].m/b[1].n-a[1].m/a[1].n)[0];if(hs&&hs[1].m/hs[1].n>0.25)L.push(`أكتر ساعة بتفوت فيها مكالمات: <b>${(hs[0]%12||12)+(hs[0]<12?' ص':' م')}</b> (${pc(hs[1].m/hs[1].n)}) — غالباً مفيش حد فاضي على التليفون الساعة دي.`);
  const worstH=Object.entries(H).filter(([h,z])=>z.n>=10&&cfIsOpen(Date.UTC(2026,0,1,+h))).sort((a,b)=>b[1].m/b[1].n-a[1].m/a[1].n)[0];
  CF.rep.calls={kpi:[['مكالمات داخلة',inc.length],['اترد عليها',pc(ans.length/(inc.length||1))],['فاتت وقت الشغل (مرات)',Eo.length],['بنرجع بعد (النص) — وقت الشغل',cfDurF(md)],['رجعنا خلال ساعة',pc(r(Eo,e=>e.wA!=null&&e.wA<60))],['ما رجعناش خالص (وقت الشغل)',pc(r(Eo,e=>e.st==='none'))],['أرقام لسه محدش رجعلهم',none.length],['منهم مش متسجلين',unk],['رجعنالهم وما ردوش',tried.length],['مكالمات طالعة',out.length],['ردوا على الطالعة',out.length?pc(outA.length/out.length):'—']],
    L,distRows,lRows,hRows,wRows,nRows,tRows,none,tried,P,r1h:r(Eo,e=>e.wA!=null&&e.wA<60),rNone:r(Eo,e=>e.st==='none'),outR:out.length?outA.length/out.length:null,worstH,
    lines:lns.map(l=>{const ee=E0.filter(e=>e.ln===l),ii=C0.filter(c=>c.ln===l&&(c.ty==='in'||c.ty==='miss'));return {l,miss:ii.length?ii.filter(c=>c.ty==='miss').length/ii.length:0,med:cfMed(ee.filter(e=>e.wA!=null).map(e=>e.wA)),none:ee.filter(e=>e.st==='none').length,n:ee.length}})};
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--acc)"><h3>📊 تحليل سجل المكالمات${CF.ln?' — '+esc(CF.ln):' — كل الخطوط'}<small>${CF.h1!==''||CF.h2!==''?'🕐 '+(CF.h1||0)+'–'+(CF.h2||24)+' · ':''}${CF.d1||CF.d2?(CF.d1||'…')+' → '+(CF.d2||'…'):cfFmt(CF.minT)+' – '+cfFmt(CF.maxT)}</small></h3>
   <div class="bar"><label class="sub">مواعيد الشغل من <input id="cfO1" type="number" min="0" max="23" value="${CF.oh[0]}" style="width:52px"> لـ <input id="cfO2" type="number" min="1" max="24" value="${CF.oh[1]}" style="width:52px"></label><span class="sub">«فاتت» = واردة ما اترد عليهاش · «رجعنا» = أول مكالمة طالعة للرقم بعد ما فاتت (حتى لو ما ردش) · لو ما اترد عليهاش وفاتت تاني قبل ما نرجع = نفس المرة</span></div>
   <div class="grid g4">${kpi('مكالمات داخلة',inc.length,`اترد ${pc(ans.length/(inc.length||1))}`)}${kpi('فاتت وقت الشغل',Eo.length,`نرجع في خلال ${cfDurF(md)} (النص)`)}${kpi('رجعنا في خلال ساعة',pc(r(Eo,e=>e.wA!=null&&e.wA<60)),'من اللي فاتت وقت الشغل')}${kpi('لسه محدش رجعلهم',none.length,unk?unk+' مش متسجلين':'',none.length?'down':'')}</div>
   <h3 style="margin-top:12px">📖 القراية</h3><ul class="ins">${L.map(x=>`<li>${x}</li>`).join('')}</ul>
   <div class="card" style="margin-top:10px"><h3>نسبة المكالمات اللي بتفوت كل ساعة</h3><div class="ch"><canvas id="cl1"></canvas></div></div></div>
  <div class="grid g2" style="margin-top:12px">
   <div class="card"><h3>رجعنا كلمناه بعد قد إيه؟</h3>${tableHTML(['',{t:'وقت الشغل',n:1},{t:'النسبة',n:1},{t:'بعد المواعيد',n:1}],distRows,{h:320})}</div>
   <div class="card" style="grid-column:1/-1"><h3>🏅 تقييم الأداء — الإجمالي وكل خط لوحده<small>دوس على اسم الخط عشان التحليل كله يبقى عليه</small></h3>${tableHTML(['الخط',{t:'داخلة',n:1},{t:'فاتت %',n:1},{t:'فاتت وقت الشغل',n:1},{t:'رجعنا خلال ساعة',n:1},{t:'نرجع بعد (النص)',n:1},{t:'ما رجعناش',n:1},{t:'طالعة',n:1},{t:'ردوا علينا',n:1},{t:'لسه محدش رجعلهم',n:1}],lRows,{h:360})}<div class="sub">«رجعنا خلال ساعة» و«ما رجعناش» محسوبين على المكالمات اللي فاتت في مواعيد الشغل · لو حد رجع للمريض من خط تاني بيتحسب إنه اترجعله.</div></div>
   <div class="card"><h3>بالساعة</h3>${tableHTML(['الساعة',{t:'داخلة',n:1},{t:'فاتت',n:1},{t:'نسبة',n:1},{t:'نرجع بعد',n:1}],hRows,{h:360})}</div>
   <div class="card"><h3>باليوم</h3>${tableHTML(['اليوم',{t:'داخلة',n:1},{t:'فاتت',n:1},{t:'نسبة',n:1},{t:'نرجع بعد',n:1}],wRows,{h:360})}</div>
   <div class="card" style="grid-column:1/-1"><h3>📵 فاتت ولسه محدش رجعلهم<small>${none.length} رقم</small></h3>${tableHTML(['الرقم','مين',{t:'مرات',n:1},'فاتت',{t:'من',n:1},'','الخط'],nRows,{h:420})}</div>
   ${tRows.length?`<div class="card" style="grid-column:1/-1"><h3>📤 رجعنالهم وما ردوش (ولسه ما اتكلمناش)<small>${tRows.length}</small></h3>${tableHTML(['الرقم','مين',{t:'فاتت',n:1},'أول مرة',{t:'حاولنا',n:1},{t:'رجعنا بعد',n:1},'من خط'],tRows,{h:360})}</div>`:''}
  </div>`}
function cCalls(){if(!CF.calls.length)return;const o1=$('#cfO1'),o2=$('#cfO2');const sv=()=>{CF.oh=[+o1.value||0,+o2.value||24];try{localStorage.setItem('fin_cfoh',JSON.stringify(CF.oh))}catch(e){}CF.st=null;render()};if(o1)o1.onchange=sv;if(o2)o2.onchange=sv;document.querySelectorAll('[data-cfl]').forEach(a=>a.onclick=e=>{e.preventDefault();CF.ln=CF.ln===a.dataset.cfl?'':a.dataset.cfl;CF.st=null;CF.rep={};render()});
  const H={};CF.calls.filter(c=>cfCOk(c.t,c.ln)&&(c.ty==='in'||c.ty==='miss')).forEach(c=>{const h=new Date(c.t).getUTCHours(),z=H[h]=H[h]||{n:0,m:0};z.n++;if(c.ty==='miss')z.m++});const hs=Object.keys(H).map(Number).sort((a,b)=>a-b);
  chart('cl1',{data:{labels:hs.map(h=>(h%12||12)+(h<12?'ص':'م')),datasets:[bar('فاتت %',hs.map(h=>+(100*H[h].m/H[h].n).toFixed(1)),SER()[0])]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>' فاتت '+x.parsed.y+'% من '+H[hs[x.dataIndex]].n+' مكالمة'}}},scales:{y:{ticks:{callback:v=>v+'%'}}}}})}

// ================= 🔎 رقم ما اتكلمناش معاه — حصل إيه بعد كده؟ =================
// «مرة ما اتكلمناش» = بتبدأ بمكالمة ما حصلش فيها كلام (فاتتنا / اتصلنا وما ردش) وبتخلص عند أول مكالمة اتكلمنا فيها (أي اتجاه) — بنشوف في كل الملفات المحفوظة، حتى بعد الفترة
CF.rf='all';CF.rs='all';CF.rq='';
const cfTalk=c=>c.dur>0&&c.ty!=='miss';
function cfReach(){if(CF.rch)return CF.rch;const by={},E=[];CF.calls.forEach(c=>(by[c.ph]=by[c.ph]||[]).push(c));
  for(const ph in by){const L=by[ph].sort((a,b)=>a.t-b.t);let e=null;
    for(const c of L){if(cfTalk(c)){if(e){e.tC=c.t;e.how=c.ty==='out'?'we':'he';e.lnC=c.ln;E.push(e);e=null}continue}
      if(!e)e={ph,t0:c.t,s:c.ty==='out'?'out':'miss',ln:c.ln,nO:0,nI:0};
      if(c.ty==='out'){e.nO++;if(e.tA==null&&e.s==='miss')e.tA=c.t}else e.nI++;e.last=c.t}
    if(e)E.push(e)}
  return CF.rch={E,by}}
const cfRoW=e=>e.tC==null?'still':e.how;
function cfReachBody(){const {E,by}=cfReach(),P=cfPts(),q=cfDig(CF.rq).trim(),qd=q.replace(/\D/g,''),ql=q.toLowerCase();
  const nm=ph=>P[ph]&&P[ph].pn||'';
  let R=E.filter(e=>cfCOk(e.t0,e.ln)&&(CF.rs==='all'||e.s===CF.rs));
  const cnt={we:0,he:0,still:0};R.forEach(e=>cnt[cfRoW(e)]++);
  if(CF.rf!=='all')R=R.filter(e=>cfRoW(e)===CF.rf);
  if(q)R=R.filter(e=>qd.length>=3?('0'+e.ph).includes(qd)||e.ph.includes(qd):nm(e.ph).toLowerCase().includes(ql));
  R.sort((a,b)=>b.t0-a.t0);
  const res=e=>e.tC==null?`<b class="down">لسه ما اتكلمناش</b>${e.nO&&e.s==='miss'?' <span class="sub">(حاولنا '+e.nO+')</span>':''}`:e.how==='we'?`<b style="color:var(--ok,#16a34a)">احنا رجعنا كلمناه</b>`:`<b style="color:var(--acc)">هو اللي كلمنا</b>`;
  const who=ph=>{const p=P[ph];return p?esc(p.pn||'مريض')+(p.next?` <span class="sub">· موعد ${p.next.slice(8,10)}/${p.next.slice(5,7)}</span>`:''):'<span class="sub" style="color:var(--warn)">مش متسجل</span>'};
  const rows=R.slice(0,600).map(e=>[`<a href="#" data-cfph="${e.ph}" dir="ltr">0${e.ph}</a>`,who(e.ph),e.s==='miss'?'📵 فاتتنا':'📤 اتصلنا وما ردش',cfFmt(e.t0),e.nI,e.nO,res(e),e.tC!=null?cfFmt(e.tC):'بقاله '+cfDurF((CF.maxT-e.last)/60e3),e.tC!=null?cfDurF((e.tC-e.t0)/60e3):'—']);
  const chip=(k,t,n)=>`<button data-cfrf="${k}" class="${CF.rf===k?'pri':''}">${t}${n!=null?' ('+n+')':''}</button>`;
  const chip2=(k,t)=>`<button data-cfrs="${k}" class="${CF.rs===k?'pri':''}">${t}</button>`;
  // تاريخ رقم واحد
  let tl='';const one=qd.length>=7?Object.keys(by).filter(ph=>('0'+ph).includes(qd)||ph.includes(qd)):[];
  if(one.length===1){const ph=one[0],L=by[ph].slice().sort((a,b)=>b.t-a.t);const ic={in:'📥 واردة',out:'📤 صادرة',miss:'📵 فايتة','?':'📞'};
    tl=`<div class="card" style="margin-top:8px"><h3>📜 كل مكالمات <span dir="ltr">0${ph}</span> ${P[ph]?'— '+esc(P[ph].pn||''):''}<small>${L.length} مكالمة</small></h3>${tableHTML(['الوقت','النوع',{t:'المدة (ث)',n:1},'اتكلمنا؟','الخط'],L.slice(0,200).map(c=>[cfFmt(c.t),ic[c.ty]||c.ty,c.dur||0,cfTalk(c)?'✅':'—',esc(c.ln||'')]),{h:300})}</div>`}
  return `<div class="bar" style="margin-top:6px">${chip('all','الكل',cnt.we+cnt.he+cnt.still)}${chip('we','✅ احنا رجعنا كلمناه',cnt.we)}${chip('he','📥 هو اللي كلمنا',cnt.he)}${chip('still','⏳ لسه ما اتكلمناش',cnt.still)}</div>
   <div class="bar" style="margin-top:6px"><span class="sub">بدأت بـ:</span>${chip2('all','الاتنين')}${chip2('miss','📵 مكالمة فاتتنا')}${chip2('out','📤 اتصلنا وما ردش')}</div>
   ${R.length?tableHTML(['الرقم','مين','بدأت بـ','أول مرة',{t:'اتصل هو',n:1},{t:'اتصلنا',n:1},'حصل إيه','إمتى اتكلمنا',{t:'بعد قد إيه',n:1}],rows,{h:460}):'<div class="sub" style="margin-top:8px">مفيش أرقام بالفلتر ده.</div>'}
   ${R.length>600?`<div class="sub">بيعرض أول 600 من ${R.length} — ضيّق التاريخ أو ابحث برقم.</div>`:''}${tl}`}
function vReach(){if(!CF.calls.length)return '';
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--warn)"><h3>🔎 رقم ما اتكلمناش معاه — رجعنا كلمناه ولا هو كلمنا؟<small>${CF.ln?esc(CF.ln)+' · ':''}${CF.d1||CF.d2?(CF.d1||'…')+' → '+(CF.d2||'…'):'كل المكالمات المحفوظة'}</small></h3>
   <div class="sub" style="line-height:1.8">كل رقم <b>بدأ</b> فيه «ما اتكلمناش» في الفترة اللي فوق (يوم التأكيد/المكالمات) — مكالمة فاتتنا أو اتصلنا وما ردش — وبعدها حصل إيه في كل الملفات المحفوظة (حتى بعد الفترة): احنا رجعنا اتكلمنا معاه، ولا هو اللي اتصل واتكلمنا، ولا لسه. اكتب رقم (7 أرقام أو أكتر) يطلعلك كل مكالماته.</div>
   <div class="bar" style="margin-top:6px"><input id="cfRq" type="search" placeholder="🔍 رقم أو اسم" value="${esc(CF.rq)}" style="min-width:220px"></div>
   <div id="cfRchB">${cfReachBody()}</div></div>`}
function cReach(){const box=$('#cfRchB'),q=$('#cfRq');if(!box)return;const up=()=>{box.innerHTML=cfReachBody()};
  if(q)q.oninput=()=>{CF.rq=q.value;up()};
  box.onclick=e=>{const a=e.target.closest('[data-cfrf],[data-cfrs],[data-cfph]');if(!a)return;e.preventDefault();
    if(a.dataset.cfrf)CF.rf=a.dataset.cfrf;else if(a.dataset.cfrs)CF.rs=a.dataset.cfrs;else{CF.rq='0'+a.dataset.cfph;if(q)q.value=CF.rq}up()}}

// ================= 📥 Excel: التحليل + خطة العمل =================
const cfTxt=x=>{if(x==null)return '';const d=document.createElement('div');d.innerHTML=String(x).replace(/<br\s*\/?>/gi,' ');return d.textContent.replace(/\s+/g,' ').trim()};
const cfHr=h=>(h%12||12)+(h<12?' ص':' م');
function cfActions(){const A=[],R=CF.rep,c=R.calls,f=R.conf;const add=(p,a,why,who,when)=>A.push([p,a,why,who,when]);
  if(c){const unk=c.none.filter(e=>!c.P[e.ph]),kn=c.none.filter(e=>c.P[e.ph]);
    if(unk.length)add('🔴 عالية',`اتصل بالـ ${unk.length} رقم اللي مش متسجلين وفاتتهم مكالمة ولسه محدش رجعلهم (ممكن مرضى جداد)`,`مكالمة واحدة فايتة من رقم جديد = مريض ممكن يروح لمكان تاني`,'المسئولة عن الخط','النهارده');
    if(kn.length)add('🔴 عالية',`اتصل بالـ ${kn.length} مريض اللي فاتتهم مكالمة ولسه محدش رجعلهم`,'القايمة في شيت «فاتت ولسه محدش رجعلهم»','المسئولة عن الخط','النهارده');
    if(c.tried.length)add('🟠 متوسطة',`محاولة تانية للـ ${c.tried.length} رقم اللي رجعنالهم وما ردوش — وابعت واتساب`,'لسه ما اتكلمناش معاهم','المسئولة عن الخط','بكره');
    if(c.r1h!=null&&c.r1h<0.7)add('🔴 عالية','قاعدة ثابتة: أي مكالمة فايتة وقت الشغل ترجع في خلال ربع ساعة',`دلوقتي بنرجع في خلال ساعة لـ ${pc(c.r1h)} بس`,'المشرفة + كل الاستقبال','من النهارده — تتراجع كل أسبوع');
    if(c.rNone!=null&&c.rNone>0.05)add('🔴 عالية','مراجعة يومية آخر الشيفت: مفيش مكالمة فايتة من غير رد',`${pc(c.rNone)} من المكالمات الفايتة وقت الشغل ما رجعناش خالص`,'المشرفة','كل يوم آخر الشيفت');
    if(c.worstH&&c.worstH[1].m/c.worstH[1].n>0.25)add('🟠 متوسطة',`حد ثابت على التليفون الساعة ${cfHr(+c.worstH[0])}`,`${pc(c.worstH[1].m/c.worstH[1].n)} من المكالمات بتفوت الساعة دي`,'المدير — توزيع الشيفتات','الأسبوع ده');
    const ls=c.lines.filter(x=>x.n>=5).sort((a,b)=>b.miss-a.miss);if(ls.length>1&&ls[0].miss>ls[ls.length-1].miss+0.1)add('🟠 متوسطة',`مراجعة مع خط «${ls[0].l}»: أعلى نسبة مكالمات فايتة`,`${pc(ls[0].miss)} مقابل ${pc(ls[ls.length-1].miss)} في «${ls[ls.length-1].l}»`,'المدير','الأسبوع ده');
    if(c.outR!=null&&c.outR<0.5)add('🟡 عادية','قبل المكالمة ابعت واتساب قصير، وجرّب أوقات تانية للي ما بيردوش',`المرضى بيردوا على ${pc(c.outR)} بس من مكالماتنا`,'الاستقبال','الأسبوع ده')}
  if(f&&f.J&&f.J.length){const bad=f.J.filter(x=>x.cat!=='ok').length/f.J.length;
    if(bad>0.2)add('🔴 عالية','قاعدة: ممنوع «مؤكد» غير بعد مكالمة اترد عليها أو رد على واتساب — والطريقة تتكتب في ملحوظة الموعد',`${pc(bad)} من التأكيدات مالهاش مكالمة اترد عليها`,'المشرفة + الاستقبال','من النهارده');
    Object.entries(f.g).filter(([k,z])=>k!=='—'&&k!=='…'&&z.j>=10&&(z.j-z.ok)/z.j>0.3).sort((a,b)=>(b[1].j-b[1].ok)/b[1].j-(a[1].j-a[1].ok)/a[1].j).forEach(([k,z])=>add('🔴 عالية',`مراجعة مع ${k.replace(' *','')}: تأكيدات من غير مكالمة`,`${pc((z.j-z.ok)/z.j)} من تأكيداتها (${z.j-z.ok} من ${z.j})`,'المدير','الأسبوع ده'))}
  if(f&&f.gOk&&f.gS&&f.gOk.n>=10&&f.gS.n>=10&&f.gS.r>f.gOk.r+0.05)add('🔴 عالية','عرض الأرقام دي على السكرتارية: التأكيد من غير مكالمة بيضيّع المواعيد',`اعتذار/غياب ${pc(f.gS.r)} للمشكوك فيهم مقابل ${pc(f.gOk.r)} للي اتأكدوا بمكالمة`,'المدير','الاجتماع الجاي');
  if(f&&f.susLost&&f.susLost.length)add('🟠 متوسطة',`مراجعة الـ ${f.susLost.length} موعد اللي اعتذروا وتأكيدهم مشكوك فيه مع المسئولة عن كل واحد`,'شيت «اعتذروا وتأكيدهم مشكوك فيه»','المدير','الأسبوع ده');
  if(f&&f.bursts&&f.bursts.length)add('🔴 عالية',`مراجعة ${f.bursts.length} مرة اتأكد فيها مواعيد بالجملة`,`${f.bursts.reduce((s,b)=>s+b.n,0)} موعد اتعلّم مؤكد (5+ في 3 دقايق) — التفاصيل في شيت «تأكيد بالجملة»`,'المدير مع المسئولة','الأسبوع ده');
  if(!A.length)add('🟢','مفيش مشاكل واضحة في الفترة دي — كمّل على نفس الطريقة','','','');
  return A}
async function cfExcel(){if(!CF.rep.calls&&!CF.rep.conf){alert('ارفع ملفات المكالمات الأول');return}
  if(!window.XLSX&&!(await loadLib('XLSX'))){alert('مكتبة Excel ما اتحملتش');return}
  const wb=XLSX.utils.book_new(),R=CF.rep;const per=CF.d1||CF.d2?(CF.d1||'…')+' → '+(CF.d2||'…'):(CF.minT!=null?cfDay(CF.minT)+' → '+cfDay(CF.maxT):ml(S.from)+' – '+ml(S.to));
  const sh=(name,head,rows,w)=>{const ws=XLSX.utils.aoa_to_sheet([head].concat(rows.map(r=>r.map(x=>typeof x==='number'?x:cfTxt(x)))));ws['!cols']=(w||head.map(()=>18)).map(x=>({wch:x}));ws['!views']=[{RTL:true}];if(!wb.Workbook)wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31))};
  const sum=[['الفرع',BRN[S.b]],['الفترة',per],['اتعمل',new Date().toLocaleString('ar-EG')],[]];
  if(R.calls){sum.push(['— سجل المكالمات —']);R.calls.kpi.forEach(k=>sum.push(k));sum.push([]);R.calls.L.forEach(l=>sum.push([cfTxt(l)]));sum.push([])}
  if(R.conf){sum.push(['— التأكيدات —']);R.conf.kpi.forEach(k=>sum.push(k));sum.push([]);R.conf.L.forEach(l=>sum.push([cfTxt(l)]))}
  const ws0=XLSX.utils.aoa_to_sheet(sum);ws0['!cols']=[{wch:44},{wch:90}];ws0['!views']=[{RTL:true}];wb.Workbook={Views:[{RTL:true}]};XLSX.utils.book_append_sheet(wb,ws0,'الملخص');
  sh('خطة العمل',['الأولوية','الإجراء','ليه','المسئول','إمتى','اتعمل؟'],cfActions().map(a=>a.concat([''])),[12,70,55,24,22,10]);
  if(R.calls){const c=R.calls;
    sh('فاتت ولسه محدش رجعلهم',['الرقم','مين','مرات','فاتت','من','','الخط','اتصلنا؟','النتيجة'],c.nRows.map(r=>r.concat(['',''])),[16,40,8,22,10,14,16,10,24]);
    if(c.tRows.length)sh('رجعنالهم وما ردوش',['الرقم','مين','فاتت','أول مرة','حاولنا','رجعنا بعد','من خط'],c.tRows,[16,40,8,18,8,12,16]);
    sh('رجعنا بعد قد إيه',['','وقت الشغل','النسبة','بعد المواعيد'],c.distRows,[34,12,10,14]);
    sh('بالساعة',['الساعة','داخلة','فاتت','نسبة','نرجع بعد'],c.hRows,[10,10,10,10,20]);
    sh('باليوم',['اليوم','داخلة','فاتت','نسبة','نرجع بعد'],c.wRows,[12,10,10,10,20]);
    sh('تقييم كل خط',['الخط','داخلة','فاتت %','فاتت وقت الشغل','رجعنا خلال ساعة','نرجع بعد (النص)','ما رجعناش','طالعة','ردوا علينا','لسه محدش رجعلهم'],c.lRows,[22,10,10,14,14,16,12,10,12,16])}
  if(R.conf){const f=R.conf;
    sh('التأكيد — حسب المسئولة',['المسئولة','تأكيدات','بمكالمة','ما ردش','مفيش مكالمة','بالجملة','ما جاش/اعتذر'],f.wRows,[22,10,10,10,12,10,14]);
    sh('التأكيد — كل يوم',['اليوم','تأكيدات','بالجملة','بمكالمة'],f.dRows,[18,10,10,10]);
    if(f.ogRows.length)sh('الاعتذار حسب نوع التأكيد',['نوع التأكيد','مواعيد','حضر','اعتذر','ما جاش','اعتذر + ما جاش'],f.ogRows,[36,10,10,10,10,16]);
    if(f.susLost.length)sh('اعتذروا وتأكيدهم مشكوك فيه',['الموعد','المريض','الخدمة','النتيجة','اتأكد','المسئولة','ليه مشكوك فيه'],f.susLost,[14,30,24,10,14,18,34]);
    if(f.bRows.length)sh('تأكيد بالجملة',['الوقت','الفرع','مواعيد','المسئولة'],f.bRows,[22,10,10,30]);
    if(f.sus.length)sh('تأكيدات مشكوك فيها',['اتأكد','المريض','الموعد','المسئولة','','المكالمات','مكالمات الرقم قبلها','النتيجة'],f.sus,[14,30,26,18,12,34,40,10])}
  XLSX.writeFile(wb,`تحليل المكالمات والتأكيدات — ${BRN[S.b]} — ${per.replace(/[\/\\?*\[\]:]/g,'-')}.xlsx`)}
VIEWS.conf=[()=>{let s=vConf();try{s+=vCalls()}catch(e){console.error(e);s+='<div class="card">خطأ في تحليل المكالمات: '+esc(e.message)+'</div>'}try{s+=vReach()}catch(e){console.error(e);s+='<div class="card">خطأ: '+esc(e.message)+'</div>'}return s},()=>{cConf();try{cCalls()}catch(e){console.error(e)}try{cReach()}catch(e){console.error(e)}}];
