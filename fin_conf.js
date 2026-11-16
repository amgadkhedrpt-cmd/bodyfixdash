// BODYFIX — «📞 التأكيدات»: مين اتعلّم عليه «مؤكد» من غير اتصال حقيقي.
// التأكيدات: السحب بيسجل كل موعد Confirmed + وقت تعديله على Medicolize (= وقت التأكيد) — متشفرة مع باقي البيانات.
// سجل المكالمات: بيتحفظ في المخزن الخاص (calls_core.js → CS) — نفس مخزن خطة اليوم، محمي بمفتاح على أجهزة الفريق. لو الجهاز مش مربوط: بيتحفظ على الجهاز بس (IndexedDB).
'use strict';
const CF={a1:'',a2:'',calls:[],files:[],map:null,sheet:null,sheetTry:false,minT:null,maxT:null,d1:'',d2:'',rep:{}};
const cfT1=()=>CF.d1?Date.parse(CF.d1+'T00:00:00Z'):-Infinity,cfT2=()=>CF.d2?Date.parse(CF.d2+'T00:00:00Z')+864e5:Infinity;
const cfInR=t=>t>=cfT1()&&t<cfT2();
// فلاتر المكالمات: الخط (كل ملف = خط/سكرتيرة) + الساعة من/لحد (لو «من» أكبر من «لحد» = بتلف بعد نص الليل)
CF.ln='';CF.h1='';CF.h2='';
const cfHOk=t=>{if(CF.h1===''&&CF.h2==='')return true;const h=new Date(t).getUTCHours(),a=CF.h1===''?0:+CF.h1,b=CF.h2===''?24:+CF.h2;return a<=b?h>=a&&h<b:h>=a||h<b};
const cfCOk=(t,ln,allLines)=>cfInR(t)&&cfHOk(t)&&(allLines||!CF.ln||ln===CF.ln);
// قراية الملفات + الوقت + الرقم: في calls_core.js (مشترك مع خطة اليوم)
const cfRead=f=>cfReadFile(f,CF.map,()=>loadLib('XLSX'));
// ---------- الحفظ على الجهاز (IndexedDB) — مش بيتبعت لأي حتة ----------
const cfDB=(mode,fn)=>new Promise((res,rej)=>{let q;try{q=indexedDB.open('bodyfix_calls',1)}catch(e){return rej(e)}q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onerror=()=>rej(q.error);
  q.onsuccess=()=>{const db=q.result,tx=db.transaction('kv',mode),r=fn(tx.objectStore('kv'));tx.oncomplete=()=>{db.close();res(r&&r.result)};tx.onerror=()=>{db.close();rej(tx.error)}}});
const cfMM=()=>{let a=null,b=null;for(const c of CF.calls){if(a==null||c.t<a)a=c.t;if(b==null||c.t>b)b=c.t}CF.minT=a;CF.maxT=b;CF.idx=null;CF.st=null;CF.rch=null};
async function cfSave(){try{await cfDB('readwrite',s=>CF.calls.length||CF.files.length?s.put({v:1,calls:CF.calls,files:CF.files,map:CF.map,at:Date.now()},'log'):s.delete('log'));CF.saved=true}catch(e){console.warn(e);CF.saved=false}}
CF.lines={};
async function cfCloudLoad(){CF.calls=await CS.load(CS.months(4));CF.upl=await CS.logs(CS.months(2)).catch(()=>[]);CF.lines=await CS.lines();CF.cloud=true;CF.saved=false;cfMM()}
CF.ready=(async()=>{try{if(CS.cfg()){await cfCloudLoad();try{const d=await cfDB('readonly',s=>s.get('log'));CF.local=d&&d.calls&&d.calls.length?d:null}catch(e){}}
    else{const d=await cfDB('readonly',s=>s.get('log'));if(d&&d.calls&&d.calls.length&&!CF.calls.length){CF.calls=d.calls;CF.files=d.files||[];CF.map=d.map||null;CF.saved=true;cfMM()}}}
  catch(e){console.warn(e);CF.cloudErr=e.message||String(e)}if(typeof S!=='undefined'&&(S.tab==='conf'||S.tab==='calls')&&typeof D!=='undefined'&&D)render()})();
// ☁️ نقل اللي كان محفوظ على الجهاز ده للمخزن (مرة واحدة)
async function cfPushLocal(){const d=CF.local;if(!d)return;const by={};d.calls.forEach(c=>(by[c.ln||'—']=by[c.ln||'—']||[]).push(c));const m=$('#cfMsg');
  try{let add=0;for(const ln in by){if(m)m.textContent='بينقل خط '+ln+'…';const r=await CS.merge(by[ln],ln,{file:'من جهاز المدير',by:'fin'});add+=r.add}
    await cfDB('readwrite',s=>s.delete('log'));CF.local=null;await cfCloudLoad();render();alert('اتنقل '+add+' مكالمة للمخزن')}catch(e){alert('ما اتنقلش: '+(e.message||e))}}
async function cfLoad(files,lines){await CF.ready;
  if(CF.cloud){const msg=$('#cfMsg');for(const f of files){const ln=CS.normLn((lines&&lines[files.indexOf(f)])||f.name.replace(/\.[^.]+$/,''));
      try{if(msg)msg.textContent='بيقرا '+f.name+'…';const r=await cfRead(f);CF.map=r.mp;if(!r.out.length||r.bad>r.n*0.3)throw new Error('الملف مش مفهوم ('+r.bad+' من '+r.n+' سطر ما اتقروش) — ما اتحفظش. اتأكد من الأعمدة أو ابعت الملف');if(msg)msg.textContent='بيحفظ '+f.name+' في المخزن…';
        const m=await CS.merge(r.out,ln,{file:f.name,by:'fin'});if(m.back===0)throw new Error('اتبعت للمخزن بس مش قادر أقراه تاني');CF.files.push({name:f.name,ln,n:r.n,ok:m.add,dup:m.dup,gone:m.gone.length,bad:r.bad,ex:r.ex,at:Date.now()})}
      catch(e){CF.files.push({name:f.name,ln,err:e.message||String(e),at:Date.now()})}}
    for(const l0 of new Set(lines||[])){const ln=CS.normLn(l0);if(ln&&!CF.lines[ln])CF.lines[ln]=CS.newLine(ln,S.b==='dokki'?'FIX ZONE':'BODYFIX Center')}
    try{await CS.setLines(CF.lines)}catch(e){}
    try{await cfCloudLoad()}catch(e){}render();return}
const have=new Map();CF.calls.forEach(c=>{const k=cfK(c);have.set(k,(have.get(k)||0)+1)});for(const f of files){try{const r=await cfRead(f);CF.map=r.mp;
    let add=0,dup=0;const ln=(lines&&lines[files.indexOf(f)])||f.name.replace(/\.[^.]+$/,''),fc=new Map();r.out.forEach(c=>{const k=cfK(c),n=(fc.get(k)||0)+1;fc.set(k,n);if(n>(have.get(k)||0)){c.ln=ln;c.src=f.name;CF.calls.push(c);add++}else dup++});fc.forEach((n,k)=>{if(n>(have.get(k)||0))have.set(k,n)});
    CF.files.push({name:f.name,ln,n:r.n,ok:add,dup,bad:r.bad,mp:r.mp,dmy:r.dmy,ex:r.ex,at:Date.now()})}catch(e){CF.files.push({name:f.name,err:e.message||String(e),at:Date.now()})}}
  cfMM();await cfSave();render()}
// ---------- مين المسئولة (من خطة اليوم) ----------
async function cfSheet(){if(CF.sheetTry)return;CF.sheetTry=true;try{const d=await jsonp({action:'getAll'},25000);const r=(d&&d.reasons)||{};const o={sum:{},roles:null};
  for(const k in r){if(k.indexOf('PLANSUM|')===0){try{o.sum[k.slice(8)]=JSON.parse(r[k])}catch(e){}}else if(k==='PLANCFG|roles'){try{o.roles=JSON.parse(r[k])}catch(e){}}}
  CF.sheet=o}catch(e){CF.sheet={sum:{},roles:null,err:1}}if(S.tab==='conf'||S.tab==='sum')render()}
const CF_BR={haram:'BODYFIX Center',dokki:'FIX ZONE'},CF_ROLE={haram:'J',dokki:'DM'};
function cfWho(c){if(c.ub)return [typeof planNormName==='function'?c.ub:c.ub.split(' ')[0],1];const sh=CF.sheet;if(!sh)return ['…',0];
  for(const d of [cfDay(c.cT),cfDay(c.aT),cfDay(c.cT-864e5)]){const s=sh.sum[d];if(s&&s.cf&&c.puid&&s.cf[c.puid])return [s.cf[c.puid],1]}
  const n=sh.roles&&(sh.roles[CF_BR[c.b]]||{})[CF_ROLE[c.b]];return [n?n+' *':'—',0]}
// ---------- البيانات ----------
function cfConfs(){const T=(RAW&&RAW.kinds&&RAW.kinds.conf&&RAW.kinds.conf.all)||{};const out=[];
  for(const mk in T){const t=T[mk],ci=n=>t.cols.indexOf(n);const I={aid:ci('aid'),s:ci('start'),u:ci('up'),cr:ci('cr'),ty:ci('type'),pid:ci('pid'),pn:ci('pn'),ph:ci('ph'),doc:ci('doc'),b:ci('b'),puid:ci('puid'),ph2:ci('ph2'),ub:ci('ub')};
    for(const r of t.rows){const cT=cfWall(r[I.u]),aT=cfWall(r[I.s]),crT=cfWall(r[I.cr]);if(cT==null||aT==null)continue;
      out.push({aid:r[I.aid],cT,aT,crT,type:tName(r[I.ty]||''),pid:r[I.pid],pn:r[I.pn]||'',ph:cfPh(r[I.ph]),ph2:I.ph2>=0?cfPh(r[I.ph2]):'',doc:docName(r[I.doc]||''),b:r[I.b],puid:I.puid>=0?r[I.puid]:null,ub:I.ub>=0?r[I.ub]||'':'',k:cfDay(aT).slice(0,7)})}}
  return out}
const cfApOk=c=>{const d=cfDay(c.aT);return (!CF.a1||d>=CF.a1)&&(!CF.a2||d<=CF.a2)};   // فلتر يوم الموعد
function cfCalc(){const C0=cfConfs().filter(c=>inB(c)&&(CF.a1||CF.a2?cfApOk(c):c.k>=S.from&&c.k<=S.to));   // تاب التأكيدات: فلتر واحد = يوم الموعد (وإلا الشهور اللي فوق)
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
function cfUpHTML(compact){
  const fl=CF.files.map((f,i)=>f.err?`<li><b>${esc(f.name)}</b> — <span class="down">${esc(f.err)}</span></li>`:`<li><b>${esc(f.name)}</b> ${CF.cloud?`<span class="sub">📞 خط <b>${esc(f.ln||'')}</b>${f.gone?` · <b class="down">⚠️ ${f.gone} مكالمة كانت متحفظة واختفت من الملف ده</b>`:''}</span>`:`<label class="sub">📞 الخط: <input data-cfln="${i}" list="cfLnL" value="${esc(f.ln||f.name.replace(/\.[^.]+$/,''))}" style="width:140px"></label>`}${f.at?` <span class="sub">(اترفع ${cfFmt(cfWall(new Date(f.at).toISOString()))})</span>`:''} — ${f.ok} مكالمة جديدة${f.dup?` <span class="sub">+ ${f.dup} كانت موجودة قبل كده</span>`:''}${f.bad?` (${f.bad} سطر ما اتقراش)`:''}${f.bad&&f.ex?`<div class="sub" style="color:var(--warn)">مثال لسطر ما اتقراش — ${esc(f.ex.why)} مش مفهوم: التاريخ «${esc(f.ex.d)}» · الساعة «${esc(f.ex.t)}» · الرقم «${esc(f.ex.p)}» — ابعت الصورة دي لو لسه مش بيقرا</div>`:''}</li>`).join('');
  const mp=CF.map;const colSel=(k,lbl)=>mp?`<label class="sub">${lbl} <select data-cfc="${k}"><option value="-1">—</option>${mp.head.map((h,i)=>`<option value="${i}"${mp[k]===i?' selected':''}>${esc(String(h)).slice(0,30)}</option>`).join('')}</select></label>`:'';
  const ty={};CF.calls.forEach(c=>ty[c.ty]=(ty[c.ty]||0)+1);
  let h=`<div class="card"><h3>📂 سجل المكالمات<small>${CF.cloud?'☁️ متحفظ في المخزن الخاص — الفريق كله شايفه':'💾 على الجهاز ده بس'}</small></h3>
   <div class="note" style="line-height:1.9">${CF.cloud?'كل ملف بيترفع (منك أو من السكرتيرة في «خطة اليوم») بيتحفظ في <b>المخزن الخاص</b> (شيت جوجل المحمي بمفتاح — نفس مخزن خطة اليوم)، والمكرر بيتشال لوحده. لو مكالمة كانت متحفظة واختفت من ملف أحدث لنفس الأيام = <b>اتمسحت من الموبايل</b> وبتظهر في التنبيهات تحت.':'⚠️ الجهاز ده مش مربوط بالمخزن الخاص (افتح أداة التحصيل مرة على الجهاز ده واربطها) — فالمكالمات بتتحفظ على الجهاز ده بس.'}</div>
   <div class="bar" style="margin-top:6px"><b class="sub">📅 أيام المكالمات:</b><label class="sub">من <input type="date" id="cfD1" value="${CF.d1}"></label><label class="sub">لحد <input type="date" id="cfD2" value="${CF.d2}"></label><button id="cfDAll">كل فترة الملفات</button><button id="cfDClr">امسح التاريخ</button></div>
   <div class="bar" style="margin-top:8px"><label class="drop" style="padding:6px 12px;border:1px dashed var(--brd);border-radius:8px;cursor:pointer">📂 ارفع ملفات المكالمات<input type="file" id="cfF" accept=".csv,.xlsx,.xls,.txt" multiple hidden></label>${CF.cloud?`<button id="cfRef">🔄 تحديث</button>`:''}${CF.cloud&&CF.local?`<button class="pri" id="cfPush">☁️ انقل ${CF.local.calls.length} مكالمة محفوظة على الجهاز ده للمخزن</button>`:''}${CF.cloudErr?`<span class="down sub">المخزن ما ردش: ${esc(CF.cloudErr)}</span>`:''}${CF.calls.length?`${CF.cloud?'':'<button id="cfClr">🗑️ امسح المكالمات المحفوظة</button>'}<span class="sub">${CF.saved?'💾 محفوظة على الجهاز · ':''}${CF.calls.length} مكالمة · من ${cfFmt(CF.minT)} لـ ${cfFmt(CF.maxT)} · صادرة ${ty.out||0} · واردة ${ty.in||0} · فائتة ${ty.miss||0}${ty['?']?` · من غير نوع ${ty['?']}`:''}</span>`:''}<span id="cfMsg" class="sub"></span></div>
   ${CF.pend?cfPendHTML():''}${fl?`<ul class="ins" style="margin-top:6px">${fl}</ul><datalist id="cfLnL">${[...new Set(CF.calls.map(c=>c.ln))].map(l=>`<option value="${esc(l)}">`).join('')}</datalist><div class="sub">كل ملف = خط. لو رفعت ملفين لنفس الخط (مثلاً شهرين) اكتب نفس اسم الخط في الاتنين وهيتجمعوا.</div>`:''}
   ${CF.calls.length?`<div class="bar" style="margin-top:8px"><b class="sub">📞 الخط:</b><select id="cfLn"><option value="">كل الخطوط</option>${[...new Set(CF.calls.map(c=>c.ln))].sort().map(l=>`<option${l===CF.ln?' selected':''}>${esc(l)}</option>`).join('')}</select>
    <b class="sub">🕐 الساعة:</b><label class="sub">من <input id="cfH1" type="number" min="0" max="23" value="${CF.h1}" placeholder="0" style="width:56px"></label><label class="sub">لحد <input id="cfH2" type="number" min="1" max="24" value="${CF.h2}" placeholder="24" style="width:56px"></label>${(()=>{const sw=S.b==='dokki'?17:15,on=(a,b)=>String(CF.h1)===String(a)&&String(CF.h2)===String(b);return `<button data-cfhp="11,${sw}" class="${on(11,sw)?'pri':''}">☀️ الصباحي (11–${sw-12})</button><button data-cfhp="${sw},23" class="${on(sw,23)?'pri':''}">🌙 المسائي (${sw-12}–11)</button>`})()}<button id="cfHClr">كل الخطوط وكل الساعات</button>
    <span class="sub">بيفلتر تحليل المكالمات وتقييم الأداء وقايمة «ما اتكلمناش» (مع التاريخ اللي فوق)</span></div>`:''}
   ${mp?`<div class="bar" style="margin-top:4px"><span class="sub">الأعمدة اللي فهمتها (غيّرها لو غلط):</span>${colSel('ph','الرقم')}${colSel('date','التاريخ')}${colSel('time','الساعة')}${colSel('type','النوع')}${colSel('dur','المدة')}</div>`:''}</div>`;
  if(compact)h=h.replace(/<div class="bar" style="margin-top:6px"><b class="sub">📅 أيام المكالمات[\s\S]*?<\/div>/,'').replace(/<div class="bar" style="margin-top:8px"><b class="sub">📞 الخط:[\s\S]*?«ما اتكلمناش» \(مع التاريخ اللي فوق\)<\/span><\/div>/,'');
  return h}
function vConf(){if(!CF.sheet)cfSheet();const X=cfCalc(),C=X.C,chk=C.filter(c=>!c.atBook),J=chk.filter(c=>['ok','tried','missonly','none'].includes(c.cat));
  const all=cfConfs();const since=all.length?cfFmt(Math.min(...all.map(c=>c.cT))):'';
  let h=`<div class="card"><h3>📞 التأكيدات — اتأكد بمكالمة فعلاً؟<small>${BRN[S.b]} · ${ml(S.from)}–${ml(S.to)}</small></h3>
   <div class="note" style="line-height:1.9">كل موعد بيتعلّم عليه «مؤكد» السحب بيسجّل وقته بالظبط${since?` (التسجيل شغال من ${since})`:''}. ارفع ملفات سجل المكالمات (CSV أو Excel — من الموبايل أو السنترال) وأنا أشوف: قبل التأكيد، هل فيه مكالمة <b>اترد عليها</b> لرقم المريض؟<br>
   ملفات المكالمات بتترفع وتتحفظ من تاب «📞 المكالمات» (${CF.calls.length?CF.calls.length+' مكالمة محفوظة':'لسه مفيش'}). ملحوظة: التأكيد على <b>واتساب</b> مش بيظهر في سجل المكالمات.</div>
   <div class="bar" style="margin-top:8px"><b class="sub">📅 يوم الموعد:</b><label class="sub">من <input type="date" id="cfA1" value="${CF.a1}"></label><label class="sub">لحد <input type="date" id="cfA2" value="${CF.a2}"></label><button id="cfDClr">امسح التاريخ</button><span class="sub">(من غير تاريخ = حسب الشهور اللي فوق)</span></div>
   <div class="bar" style="margin-top:6px"><span class="sub"></span><button class="pri" id="cfX">📥 نزّل التحليل وخطة العمل (Excel)</button><button class="pri" id="cfTodo0">📋 ملف اتصالات للسكرتارية</button></div>
  </div>`;
  if(!all.length)return h+`<div class="card" style="margin-top:12px">⏳ التسجيل بيبدأ من أول سحب جاي (11 الصبح). ارفع ملفات مكالمات من بعد كده — قبل كده مفيش تأكيدات متسجلة تتقارن.</div>`;
  const pc_=(a,f)=>a.length?pc(a.filter(f).length/a.length):'—';
  h+=`<div class="grid g4" style="margin-top:12px">${kpi('اتأكدوا (من غير اللي اتحجزوا مؤكد)',chk.length,C.length-chk.length?`+ ${C.length-chk.length} اتحجزوا «مؤكد» وقت الحجز`:'')}
    ${kpi('⚡ اتأكدوا بالجملة',pc_(chk,c=>c.bulk),'5 أو أكتر في 3 دقايق',chk.some(c=>c.bulk)?'down':'')}
    ${kpi('✅ مكالمة اترد عليها',J.length?pc_(J,c=>c.cat==='ok'):'ارفع الملفات',J.length?J.length+' اتقارنوا بالمكالمات':'')}
    ${kpi('❌ من غير مكالمة اترد عليها',J.length?pc_(J,c=>c.cat!=='ok'):'—','',J.length&&J.filter(c=>c.cat!=='ok').length/J.length>0.2?'down':'')}</div>`;
  {const n2=C.filter(c=>c.ph2).length;h+=`<div class="sub" style="margin-top:6px">📱 الرقم التاني (Secondary) من Medicolize: ${n2?`متسجل لـ ${n2} من ${C.length} ميعاد — المكالمات بتتطابق على الرقمين`:'لسه مش واصل (بيتسحب من أول مزامنة بعد 15/11) — المطابقة على الرقم الأساسي بس'}</div>`}
  h+='<!--CFCMP--><!--CFCH-->';
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
   if(t0){const st={};D.apt.forEach(a=>{if(!inB(a)||!a.pid||a.d<t0||a.d>y||(CF.a1||CF.a2?((CF.a1&&a.d<CF.a1)||(CF.a2&&a.d>CF.a2)):(a.d.slice(0,7)<S.from||a.d.slice(0,7)>S.to)))return;const k=a.pid+'|'+a.d;if(seen.has(k))return;(st[k]=st[k]||[]).push(a.st)});
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
   // أسامي واضحة للرسمة (من غير ما نغيّر أسامي الجروبات اللي بتتقري في حتت تانية)
   const nice=t=>/^✅/.test(t)?'كلّموه ورد عليهم ثم اتعلّم مؤكد':/^📵/.test(t)?'اتصلوا وما ردش — واتعلّم مؤكد برضه':/^❌/.test(t)?'اتعلّم مؤكد من غير ما حد يتصل بيه':/وقت الحجز/.test(t)?'اتحجز «مؤكد» من أول مرة':/ما اتأكدش/.test(t)?'ما حدش أكد عليه خالص':/مش متقارن/.test(t)?'اتأكد (مفيش ملف مكالمات للوقت ده)':t.replace(/[✅📵❌⬜⚡]/g,'').trim();
   if(G1.length)CH_.push(['cfc1','المواعيد اللي ضاعت (اعتذر أو ما جاش) — حسب طريقة التأكيد',{type:'bar',data:{labels:G1.map(o=>nice(o.t)+' · '+o.n+' ميعاد'),datasets:[bar('ضاع %',G1.map(o=>Math.round(o.r*1000)/10),G1.map(o=>/ما اتأكدش/.test(o.t)?'#888780':/وقت الحجز/.test(o.t)?'#1baf7a':o.r>0.25?'#e34948':'#2a78d6'))]},
     options:{indexAxis:'y',plugins:{legend:{display:false},tooltip:{callbacks:{title:x=>nice(G1[x[0].dataIndex].t),label:x=>{const o=G1[x.dataIndex];return ` ضاع ${o.ca+o.ns} من ${o.n} (${pc(o.r)}) — اعتذر ${o.ca} · ما جاش ${o.ns}`}}}},scales:{x:{ticks:{callback:v=>v+'%'}},y:{ticks:{autoSkip:false}}}}},Math.max(200,G1.length*46+50),
     'كل عمود = المواعيد اللي اتأكدت بالطريقة دي، والرقم = كام في المية منهم <b>ضاع</b> (اعتذر أو ما جاش). العمود الأطول = طريقة تأكيد مش نافعة. لو جنب الاسم عدد صغير (أقل من 20) النسبة لسه مش مضمونة.']);
   if(tot)CH_.push(['cfc2','من كل المواعيد اللي خلصت: كام اتأكد عليه؟',{type:'doughnut',data:{labels:['السكرتيرة أكدت عليه ('+nConf+')','اتحجز «مؤكد» من أول مرة ('+nBook+')','ما حدش أكد عليه ('+nNone+')'],datasets:[{label:'مواعيد',data:[nConf,nBook,nNone],backgroundColor:['#2a78d6','#1baf7a','#888780'],borderWidth:2}]},options:{cutout:'60%',plugins:{tooltip:{callbacks:{label:x=>' '+x.raw+' ميعاد ('+pc(x.raw/(nConf+nBook+nNone))+')'}}}}},240,'الأزرق = اتغيّر لـ«مؤكد» بعد الحجز · الأخضر = اتسجّل «مؤكد» وقت الحجز نفسه (غالباً المريض كان قدامهم) · الرمادي = فضل «مفتوح» لحد الميعاد.']);
   const W=Object.entries(g).filter(([k,z])=>z.done>0).sort((a,b)=>b[1].done-a[1].done);
   if(W.length)CH_.push(['cfc3','لكل سكرتيرة — اللي أكدت عليهم: جم ولا ضاعوا؟',{type:'bar',data:{labels:W.map(([k,z])=>k+' ('+pc(z.lost/z.done)+')'),datasets:[bar('جه',W.map(([k,z])=>z.done-z.lost),'#1baf7a',{stack:'s'}),bar('ضاع',W.map(([k,z])=>z.lost),'#e34948',{stack:'s'})]},options:{indexAxis:'y',scales:{x:{stacked:true},y:{stacked:true}}}},Math.max(160,W.length*42+60),'كل سطر = سكرتيرة: الأخضر = المريض جه، الأحمر = اعتذر أو ما جاش. النسبة جنب الاسم = كام في المية ضاع من اللي هي أكدت عليهم.']);
   const BK=[['قبلها بيومين+',c=>cfDD(c)>=2],['قبلها بيوم',c=>cfDD(c)===1],['نفس اليوم — قبلها بـ3 ساعات+',c=>cfDD(c)===0&&(c.aT-c.cT)/36e5>=3],['نفس اليوم — أقل من 3 ساعات',c=>cfDD(c)===0&&(c.aT-c.cT)>=0&&(c.aT-c.cT)/36e5<3]];
   const L4=BK.map(b=>{const a=done.filter(c=>!c.atBook&&b[1](c));return {t:b[0],n:a.length,r:a.length?a.filter(lost).length/a.length:null}}).filter(x=>x.n);
   if(L4.length)CH_.push(['cfc4','التأكيد بدري ولا متأخر أحسن؟ — كام ضاع حسب إمتى اتأكد',{type:'bar',data:{labels:L4.map(x=>x.t+' ('+x.n+')'),datasets:[bar('ضاع %',L4.map(x=>Math.round(x.r*1000)/10),'#2a78d6')]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}}},undefined,'اتأكد قبل الميعاد بقد إيه (نفس اليوم / اليوم اللي قبله …)، وكام في المية من دول ضاع. العمود الأقصر = أحسن توقيت للتأكيد.']);
   const bu=done.filter(c=>c.bulk),nb=done.filter(c=>!c.bulk&&!c.atBook);
   if(bu.length&&nb.length)CH_.push(['cfc5','⚡ التأكيد بالجملة (5+ في 3 دقايق) — بيضيع أكتر؟',{type:'bar',data:{labels:['بالجملة ('+bu.length+')','واحد واحد ('+nb.length+')'],datasets:[bar('ضاع %',[Math.round(bu.filter(lost).length/bu.length*1000)/10,Math.round(nb.filter(lost).length/nb.length*1000)/10],['#e34948','#2a78d6'])]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}}},undefined,'«بالجملة» = 5 مواعيد أو أكتر اتعلّم عليهم مؤكد في 3 دقايق (غالباً من غير مكالمات). لو العمود الأحمر أطول = التأكيد بالجملة بيضيّع مواعيد.']);
   CF.charts=CH_;
   // 🎯 التأكيد من غير مكالمة بيضيّع قد إيه؟ — مقارنة بالنسبة العادية لكل المواعيد في نفس الفترة
   // الفترة = يوم الموعد: «يوم الموعد» لو متحدد، وإلا الشهور اللي فوق — من أول يوم التسجيل لحد امبارح · نفس الفترة للأعمدة وللنسبة العادية
   {const t0=all.length?cfDay(Math.min(...all.map(c=>c.cT))):null,y=cfDay(Date.now()+2*3600e3-864e5),st={};
    const mEnd=k=>{const [Y,M]=k.split('-').map(Number);return new Date(Date.UTC(Y,M,0)).toISOString().slice(0,10)};
    const pF=[t0||'9999',CF.a1||(S.from+'-01')].sort().pop(),pT=[y,CF.a2||mEnd(S.to)].sort()[0],inP=d=>d>=pF&&d<=pT;
    if(t0)D.apt.forEach(a=>{if(!inB(a)||!a.pid||!inP(a.d))return;(st[a.pid+'|'+a.d]=st[a.pid+'|'+a.d]||[]).push(a.st)});
    const allR=Object.values(st).map(l=>({res:l.some(s=>/complet|check|progress|delay/i.test(s))?'حضر':l.some(s=>/no ?show/i.test(s))?'ما جاش':l.some(s=>/cancel/i.test(s))?'اعتذر':''})).filter(fin_);
    const Cp=C.filter(c=>fin_(c)&&!c.atBook&&inP(cfDay(c.aT)));
    const gA=oRow('',allR),gNo=oRow('',Cp.filter(c=>c.cat==='none')),gTr=oRow('',Cp.filter(c=>c.cat==='tried'||c.cat==='missonly')),gK=oRow('',Cp.filter(c=>c.cat==='ok'));
    const pLbl=`📅 مواعيد من <b>${pF.slice(8,10)}/${pF.slice(5,7)}</b> لـ <b>${pT.slice(8,10)}/${pT.slice(5,7)}</b> · ${BRN[S.b]}`+(CF.a1||CF.a2?' · حسب «يوم الموعد»':' · حسب الشهور اللي فوق')+(pF===t0?' (تسجيل التأكيدات شغال من '+t0.slice(8,10)+'/'+t0.slice(5,7)+')':'');
    const G=[['✅ اتأكد بمكالمة اترد عليها',gK,'#1baf7a'],['📵 اتصلوا وما ردش — واتعلّم مؤكد',gTr,'#f59e0b'],['❌ اتأكد من غير أي مكالمة',gNo,'#e34948'],['⚪ كل المواعيد (العادي)',gA,'#888780']].filter(g=>g[1].n);
    const x_=(a,b)=>a.r!=null&&b.r?(a.r/b.r):null,wo=oRow('',Cp.filter(c=>['none','tried','missonly'].includes(c.cat))),k1=x_(wo,gA),k2=x_(wo,gK);
    if(G.length>1){const card=`<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--down,#dc2626)"><h3>🎯 التأكيد من غير مكالمة بيضيّع قد إيه؟<small>اعتذر أو ما جاش — مقارنة بالنسبة العادية لكل المواعيد في نفس الفترة</small></h3>
      <div class="note" style="margin-bottom:8px">${pLbl} — <span class="sub">بيتغيّر بـ: الفرع · الشهور اللي فوق · «يوم الموعد» (لو حددته)</span></div>
      <div class="grid g4">${kpi('اتأكدوا من غير مكالمة مسجلة',wo.n,wo.n?`ضاع منهم <b>${pc(wo.r)}</b> (اعتذر ${wo.ca} · ما جاش ${wo.ns})`:'','down')}
       ${kpi('اتأكدوا بمكالمة اترد عليها',gK.n,gK.n?`ضاع منهم ${pc(gK.r)}`:'')}
       ${kpi('النسبة العادية (كل المواعيد)',pc(gA.r),gA.n+' ميعاد خلص في نفس الفترة')}
       ${kpi('من غير مكالمة = كام ضعف؟',k1!=null?k1.toFixed(1)+'×':'—',k2!=null?`العادي · و${k2.toFixed(1)}× اللي اتأكدوا بمكالمة`:'العادي',k1>1.2?'down':'')}</div>
      <div style="position:relative;height:${Math.max(220,G.length*58+70)}px;margin-top:10px"><canvas id="cfcmp"></canvas></div>
      <div class="sub" style="margin-top:4px">كل عمود = مواعيد خلصت (جه / اعتذر / ما جاش) · الأحمر = ما جاش · البرتقاني = اعتذر · الأخضر = جه · «من غير مكالمة مسجلة» = مفيش مكالمة اترد عليها لرقم المريض في الـ 36 ساعة قبل التأكيد (الواتساب مش بيظهر) · لو الأعداد صغيرة (أقل من 20) النسبة لسه مش مضمونة</div></div>`;
     h=h.replace('<!--CFCMP-->',card);
     CF.charts.push(['cfcmp','',{type:'bar',data:{labels:G.map(g=>g[0]+' · '+g[1].n),datasets:[bar('ما جاش %',G.map(g=>Math.round(g[1].ns/g[1].n*1000)/10),'#e34948',{stack:'s'}),bar('اعتذر %',G.map(g=>Math.round(g[1].ca/g[1].n*1000)/10),'#f59e0b',{stack:'s'}),bar('جه %',G.map(g=>Math.round(g[1].at/g[1].n*1000)/10),'#1baf7a',{stack:'s'})]},
       options:{indexAxis:'y',plugins:{tooltip:{callbacks:{footer:it=>{const g=G[it[0].dataIndex][1];return 'ضاع '+(g.ca+g.ns)+' من '+g.n+' ('+pc(g.r)+')'}}}},scales:{x:{stacked:true,max:100,ticks:{callback:v=>v+'%'}},y:{stacked:true,ticks:{autoSkip:false}}}},plugins:[{id:'cfpct',afterDatasetsDraw(ch){const x=ch.ctx;x.save();x.font='bold 12px Cairo,sans-serif';x.textBaseline='middle';x.textAlign='center';x.fillStyle='#fff';ch.data.datasets.forEach((ds,di)=>ch.getDatasetMeta(di).data.forEach((el,i)=>{const v=ds.data[i];if(v>=6)x.fillText(v.toFixed(v<10?1:0)+'%',(el.x+el.base)/2,el.y)}));x.restore()}}]}])}}
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
   h=h.replace('<!--CFCH-->',noDone+(CH_.length?`<div class="card" style="margin-top:12px"><h3>📊 الصورة في رسومات<small>من Medicolize لوحده — من غير ملفات المكالمات</small></h3>${few}<div class="grid g2" style="margin-top:8px">${CH_.map(c=>`<div><div style="font-weight:700;font-size:.78rem;margin-bottom:4px">${c[1]}</div>${c[4]?`<div class="sub" style="margin-bottom:6px;line-height:1.7">${c[4]}</div>`:''}<div style="position:relative;height:${c[3]||220}px"><canvas id="${c[0]}"></canvas></div></div>`).join('')}</div></div>`:'')+(CF.listsHTML||''))}
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
  if(h1)h1.onchange=()=>{CF.h1=hv(h1.value);rr()};if(h2)h2.onchange=()=>{CF.h2=hv(h2.value);rr()};if(hc)hc.onclick=()=>{CF.ln=CF.h1=CF.h2='';rr()};document.querySelectorAll('[data-cfhp]').forEach(x=>x.onclick=()=>{const [a,b]=x.dataset.cfhp.split(',');if(CF.h1===a&&CF.h2===b){CF.h1=CF.h2=''}else{CF.h1=a;CF.h2=b}rr()});
  document.querySelectorAll('[data-cfln]').forEach(x=>x.onchange=async()=>{const f=CF.files[+x.dataset.cfln],v=x.value.trim();if(!f||!v)return;const old=f.ln||f.name.replace(/\.[^.]+$/,'');f.ln=v;CF.calls.forEach(c=>{if(c.src===f.name)c.ln=v});if(CF.ln===old)CF.ln=v;cfMM();CF.rep={};await cfSave();render()});
  const rf=$('#cfRef'),pu=$('#cfPush');if(rf)rf.onclick=async()=>{rf.textContent='…';try{await cfCloudLoad()}catch(e){CF.cloudErr=e.message}render()};if(pu)pu.onclick=()=>{pu.disabled=true;cfPushLocal()};
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
   <div class="card" style="grid-column:1/-1"><h3>🏅 تقييم الأداء — الإجمالي وكل خط لوحده<small>دوس على اسم الخط عشان التحليل كله يبقى عليه</small></h3><div class="bar" style="margin-bottom:6px"><button class="pri" data-cfimg="">🖼️ صورة مقارنة الخطوط</button>${lns.map(l=>`<button data-cfimg="${esc(l)}">🖼️ صورة خط ${esc(l)}</button>`).join('')}<span class="sub">صورة للسكرتارية — من غير أسماء ولا أرقام مرضى · بتاخد فلتر التاريخ والساعة</span></div>${tableHTML(['الخط',{t:'داخلة',n:1},{t:'فاتت %',n:1},{t:'فاتت وقت الشغل',n:1},{t:'رجعنا خلال ساعة',n:1},{t:'نرجع بعد (النص)',n:1},{t:'ما رجعناش',n:1},{t:'طالعة',n:1},{t:'ردوا علينا',n:1},{t:'لسه محدش رجعلهم',n:1}],lRows,{h:360})}<div class="sub">«رجعنا خلال ساعة» و«ما رجعناش» محسوبين على المكالمات اللي فاتت في مواعيد الشغل · لو حد رجع للمريض من خط تاني بيتحسب إنه اترجعله.</div></div>
   <div class="card"><h3>بالساعة</h3>${tableHTML(['الساعة',{t:'داخلة',n:1},{t:'فاتت',n:1},{t:'نسبة',n:1},{t:'نرجع بعد',n:1}],hRows,{h:360})}</div>
   <div class="card"><h3>باليوم</h3>${tableHTML(['اليوم',{t:'داخلة',n:1},{t:'فاتت',n:1},{t:'نسبة',n:1},{t:'نرجع بعد',n:1}],wRows,{h:360})}</div>
   <div class="card" style="grid-column:1/-1"><h3>📵 فاتت ولسه محدش رجعلهم<small>${none.length} رقم</small></h3>${tableHTML(['الرقم','مين',{t:'مرات',n:1},'فاتت',{t:'من',n:1},'','الخط'],nRows,{h:420})}</div>
   ${tRows.length?`<div class="card" style="grid-column:1/-1"><h3>📤 رجعنالهم وما ردوش (ولسه ما اتكلمناش)<small>${tRows.length}</small></h3>${tableHTML(['الرقم','مين',{t:'فاتت',n:1},'أول مرة',{t:'حاولنا',n:1},{t:'رجعنا بعد',n:1},'من خط'],tRows,{h:360})}</div>`:''}
  </div>`}
function cCalls(){if(!CF.calls.length)return;const o1=$('#cfO1'),o2=$('#cfO2');const sv=()=>{CF.oh=[+o1.value||0,+o2.value||24];try{localStorage.setItem('fin_cfoh',JSON.stringify(CF.oh))}catch(e){}CF.st=null;render()};if(o1)o1.onchange=sv;if(o2)o2.onchange=sv;document.querySelectorAll('[data-cfimg]').forEach(b=>b.onclick=()=>cfLineImg(b.dataset.cfimg||null));document.querySelectorAll('[data-cfl]').forEach(a=>a.onclick=e=>{e.preventDefault();CF.ln=CF.ln===a.dataset.cfl?'':a.dataset.cfl;CF.st=null;CF.rep={};render()});
  const H={};CF.calls.filter(c=>cfCOk(c.t,c.ln)&&(c.ty==='in'||c.ty==='miss')).forEach(c=>{const h=new Date(c.t).getUTCHours(),z=H[h]=H[h]||{n:0,m:0};z.n++;if(c.ty==='miss')z.m++});const hs=Object.keys(H).map(Number).sort((a,b)=>a-b);
  chart('cl1',{data:{labels:hs.map(h=>(h%12||12)+(h<12?'ص':'م')),datasets:[bar('فاتت %',hs.map(h=>+(100*H[h].m/H[h].n).toFixed(1)),SER()[0])]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>' فاتت '+x.parsed.y+'% من '+H[hs[x.dataIndex]].n+' مكالمة'}}},scales:{y:{ticks:{callback:v=>v+'%'}}}}})}

// ================= 🔎 رقم ما اتكلمناش معاه — حصل إيه بعد كده؟ =================
// «مرة ما اتكلمناش» = بتبدأ بمكالمة ما حصلش فيها كلام (فاتتنا / اتصلنا وما ردش) وبتخلص عند أول مكالمة اتكلمنا فيها (أي اتجاه) — بنشوف في كل الملفات المحفوظة، حتى بعد الفترة
CF.rf='all';CF.rs='all';CF.rq='';
function cfReach(){if(CF.rch)return CF.rch;return CF.rch=cfEpisodes(CF.calls)}
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
   <div class="bar" style="margin-top:6px"><button class="pri" id="cfTodo">📋 نزّل ملف اتصالات للسكرتارية (Excel)</button><input id="cfRq" type="search" placeholder="🔍 رقم أو اسم" value="${esc(CF.rq)}" style="min-width:220px"></div>
   <div id="cfRchB">${cfReachBody()}</div></div>`}
function cReach(){['#cfTodo','#cfTodo0'].forEach(id=>{const b=$(id);if(b)b.onclick=()=>cfTodoXL()});const box=$('#cfRchB'),q=$('#cfRq');if(!box)return;const up=()=>{box.innerHTML=cfReachBody()};
  if(q)q.oninput=()=>{CF.rq=q.value;up()};
  box.onclick=e=>{const a=e.target.closest('[data-cfrf],[data-cfrs],[data-cfph]');if(!a)return;e.preventDefault();
    if(a.dataset.cfrf)CF.rf=a.dataset.cfrf;else if(a.dataset.cfrs)CF.rs=a.dataset.cfrs;else{CF.rq='0'+a.dataset.cfph;if(q)q.value=CF.rq}up()}}

// ================= 📋 ملف اتصالات للسكرتارية (Excel) =================
// مين لازم يتكلم: (1) فاتتنا ولسه محدش اتكلم معاه (2) اتصلنا وما ردش ولسه ما اتكلمناش (3) مواعيد جاية اتعلّم عليها «مؤكد» من غير مكالمة اترد عليها
const cfPh0=ph=>ph.length===10&&ph[0]!=='0'?'0'+ph:ph;
function cfTodo(){const {E}=cfReach(),P=cfPts(),now=cfWall(new Date().toISOString()),soon=now+7*864e5,day=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'';
  // بنشيل اللي مش محتاج اتصال فعلاً: جه العيادة بعد المحاولة · اتكلمنا معاه قبلها بأقل من أسبوع (المحاولة غالباً تذكير) · محاولة قديمة ومفيش ميعاد قريب
  const L=[],drop={came:0,recent:0,old:0};E.filter(e=>e.tC==null&&e.ph.length>=9&&cfCOk(e.t0,e.ln)).forEach(e=>{const p=P[e.ph],nx=p&&p.next,nxT=nx?Date.parse(nx+'T00:00:00Z'):null;
    if(p&&p.last&&p.last>=cfDay(e.last)){drop.came++;return}
    let pr,act;
    if(e.s==='miss'){pr=p?2:1;act=p?'رجّع له المكالمة واعرف كان عايز إيه':'رجّع له المكالمة — رقم مش متسجل (ممكن مريض جديد): اعرف عايز إيه واحجزله'}
    else if(nxT!=null&&nxT<=soon){pr=3;act='عنده ميعاد '+day(nx)+' — كلّمه وأكّد الميعاد (أو ابعت واتساب)'}
    else if(e.pT!=null&&e.t0-e.pT<7*864e5){drop.recent++;return}
    else if(CF.maxT-e.last>3*864e5){drop.old++;return}
    else{pr=4;act=p?'حاول تاني أو ابعت واتساب':'حاول تاني — رقم مش متسجل'}
    L.push({pr,e,p,act})});
  L.sort((a,b)=>a.pr-b.pr||b.e.last-a.e.last);
  // مواعيد جاية متأكدة من غير مكالمة
  if(!CF.idx){CF.idx={};CF.calls.forEach(c=>(CF.idx[c.ph]=CF.idx[c.ph]||[]).push(c))}
  const U=cfConfs().filter(c=>inB(c)&&c.aT>=now&&!(c.crT!=null&&Math.abs(c.cT-c.crT)<3*60e3)&&CF.minT!=null&&c.cT>=CF.minT&&c.cT<=CF.maxT+15*60e3).filter(c=>{
    const K=(CF.idx[c.ph]||[]).concat(c.ph2&&c.ph2!==c.ph?CF.idx[c.ph2]||[]:[]);return (c.ph||c.ph2)&&!K.some(x=>x.dur>0&&x.ty!=='miss'&&x.t>=c.cT-36*3600e3)}).sort((a,b)=>a.aT-b.aT);
  U.forEach(c=>{c.who=cfWho(c)[0]});
  return {L,U,drop}}
const CF_PR={1:'🔴 عاجل — رقم جديد',2:'🔴 عاجل',3:'🟠 عنده ميعاد قريب',4:'⚪ عادي'};
async function cfTodoXL(){CF.lists=null;
  if(!window.XLSX&&!(await loadLib('XLSX'))){alert('مكتبة Excel ما اتحملتش');return}
  const {L,U,drop}=CF.calls.length?cfTodo():{L:[],U:[],drop:{came:0,recent:0,old:0}},wb=XLSX.utils.book_new();wb.Workbook={Views:[{RTL:true}]};
  const add=(name,head,rows,w)=>{const ws=XLSX.utils.aoa_to_sheet([head].concat(rows));ws['!cols']=w.map(x=>({wch:x}));ws['!views']=[{RTL:true}];ws['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:Math.max(rows.length,1),c:head.length-1}})};XLSX.utils.book_append_sheet(wb,ws,name.replace(/[\/\\?*\[\]:]/g,'-').slice(0,31))};
  const H=['#','الأولوية','الرقم','الاسم','اللي حصل','أول مرة','آخر محاولة','اتصل هو','اتصلنا','الميعاد الجاي','آخر زيارة','الخط','المطلوب','اتصلت؟ (✔)','النتيجة','ملاحظة'],W=[4,18,14,24,18,12,12,8,8,11,11,12,48,10,22,24];
  const d2=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'';
  const row=(x,i)=>[i+1,CF_PR[x.pr],cfPh0(x.e.ph),x.p?x.p.pn||'مريض':'مش متسجل',x.e.s==='miss'?'📵 فاتتنا مكالمة':'📤 اتصلنا وما ردش',cfFmt(x.e.t0),cfFmt(x.e.last),x.e.nI,x.e.nO,x.p?d2(x.p.next):'',x.p?d2(x.p.last):'',x.e.ln||'',x.act,'','',''];
  const per=(CF.d1||CF.d2?(CF.d1||'…')+' → '+(CF.d2||'…'):cfDay(CF.minT)+' → '+cfDay(CF.maxT))+(CF.h1!==''||CF.h2!==''?` · الساعة ${CF.h1||0}–${CF.h2||24}`:'');
  const lines=[...new Set(L.map(x=>x.e.ln||''))].sort(),cnt=p=>L.filter(x=>x.pr===p).length;
  const sum=[['📋 ملف اتصالات للسكرتارية'],['اتعمل',cfFmt(cfWall(new Date().toISOString()))],['الفترة',per],['الخط',CF.ln||'كل الخطوط'],[''],
    ['🔴 فاتتنا ولسه محدش رجعله — رقم جديد',cnt(1)],['🔴 فاتتنا ولسه محدش رجعله — مريض',cnt(2)],['🟠 اتصلنا وما ردش وعنده ميعاد خلال أسبوع',cnt(3)],['⚪ اتصلنا وما ردش (باقي الأرقام)',cnt(4)],['✋ مواعيد جاية «مؤكد» من غير مكالمة اترد عليها',U.length],['📞 أكّد تاني: مواعيد جاية متأكدة من يومين أو أكتر',cfLists().S3.length],['🔍 مراجعة ١: اتعلّم مؤكد من غير اتصال',cfLists().S1.length],['🔍 مراجعة ٢: بيعتذروا كتير (آخر 90 يوم)',cfLists().S2.length],[''],
    ['اتشالوا من الليستة (مش محتاجين اتصال):'],['  جه العيادة بعد المحاولة',drop.came],['  اتكلمنا معاه قبلها بأقل من أسبوع (المكالمة كانت تذكير غالباً)',drop.recent],['  اتصلنا وما ردش من أكتر من 3 أيام ومفيش ميعاد قريب',drop.old],[''],
    ['إزاي تستخدمه'],['كل سكرتيرة تفتح شيت الخط بتاعها وتبدأ من فوق (الأحمر الأول).'],['بعد المكالمة: حط ✔ في «اتصلت؟» واكتب النتيجة (حجز / مش عايز / ما ردش تاني / رقم غلط…).'],['الأرقام دي محسوبة من ملفات المكالمات اللي اترفعت لحد '+cfFmt(CF.maxT)+' — أي حد اتكلمنا معاه بعد كده مش هيظهر لما ترفع الملفات الجديدة.']];
  const ws0=XLSX.utils.aoa_to_sheet(sum);ws0['!cols']=[{wch:48},{wch:40}];ws0['!views']=[{RTL:true}];XLSX.utils.book_append_sheet(wb,ws0,'الملخص');
  add('الكل',H,L.map(row),W);
  if(lines.length>1||(lines[0]||''))lines.forEach(l=>add('خط '+(l||'—'),H,L.filter(x=>(x.e.ln||'')===l).map(row),W));
  add('مؤكد من غير مكالمة',['#','الميعاد','المريض','الرقم','نوع الميعاد','الدكتور','اتعلّم مؤكد','مين أكد','المطلوب','اتصلت؟ (✔)','النتيجة','ملاحظة'],
    U.map((c,i)=>[i+1,cfFmt(c.aT),c.pn,cfPh0(c.ph||c.ph2),c.type,c.doc,cfFmt(c.cT),c.who||'',(c.aT-cfWall(new Date().toISOString())<36*3600e3?'⚠️ قريب — ':'')+'كلّم المريض وأكّد الميعاد بنفسك (ملقناش مكالمة اترد عليها قبل التأكيد)','','','']),[4,12,24,14,18,16,12,14,52,10,22,24]);
  const Q=cfLists();
  add('📞 أكّد تاني',['#','الميعاد','المريض','الرقم','نوع الميعاد','الدكتور','اتعلّم مؤكد','قبل الميعاد بـ','مين أكد','المطلوب','أكدت تاني؟ (✔)','النتيجة','ملاحظة'],
    Q.S3.map((c,i)=>[i+1,cfFmt(c.aT),c.pn,cfPh0(c.ph||c.ph2),c.type,c.doc,cfFmt(c.cT),cfDD(c)+' يوم',c.who||'','كلّمه اليوم اللي قبل الميعاد وأكّد تاني (التأكيد اتعمل من بدري)','','','']),[4,12,24,14,18,16,12,10,14,44,10,22,24]);
  add('🔍 مراجعة ١ مؤكد من غير اتصال',['#','الميعاد','المريض','الرقم','اتعلّم مؤكد','مين أكد','اللي لقيناه في المكالمات','الميعاد حصل؟','اتسألت؟ (✔)','قالت إيه','ملاحظة'],
    Q.S1.map((c,i)=>[i+1,cfFmt(c.aT),c.pn,cfPh0(c.ph||c.ph2),cfFmt(c.cT),c.who||'',(c.bulk?'⚡ اتأكد بالجملة · ':'')+(c.cat==='none'?'مفيش أي مكالمة للرقم':c.cat==='tried'?'اتصلوا وما ردش':c.cat==='missonly'?'مكالمة فايتة بس':'اتكلموا (بس اتأكد بالجملة)'),c.res||'','','','']),[4,12,24,14,12,14,30,10,10,24,24]);
  add('🔍 مراجعة ٢ بيعتذروا كتير',['#','المريض','الرقم','مواعيد (90 يوم)','اعتذر','ما جاش','نسبة','آخر مرة','الميعاد الجاي','المطلوب','ملاحظة'],
    Q.S2.map((z,i)=>[i+1,z.pn,cfPh0(cfPh(z.ph)),z.n,z.ca,z.ns,pc((z.ca+z.ns)/(z.n||1)),Q.d2(z.lastC),Q.d2(z.next),z.next?'تأكيد بمكالمة (مش واتساب) يوم قبل الميعاد + اسأله لو فيه مشكلة في المواعيد':'اسأله ليه بيعتذر — ممكن نغيّر الوقت أو الدكتور','']),[4,24,14,12,8,8,8,10,12,52,24]);
  XLSX.writeFile(wb,`اتصالات السكرتارية — ${BRN[S.b]} — ${cfDay(cfWall(new Date().toISOString()))}.xlsx`)}

// ================= 📋 3 قوايم: (1) شك: مؤكد من غير اتصال (2) بيعتذروا كتير — للمراجعة · (3) متأكد من أكتر من يوم — أكّد تاني =================
function cfLists(){if(CF.lists)return CF.lists;const now=cfWall(new Date().toISOString()),today=cfDay(now),d2=d=>d?d.slice(8,10)+'/'+d.slice(5,7):'';
  const X=CF.calls.length?cfCalc().C:[],S1=X.filter(c=>!c.atBook&&(['none','tried','missonly'].includes(c.cat)||c.bulk)).sort((a,b)=>b.cT-a.cT);
  const from=cfDay(now-90*864e5),P={};D.apt.filter(a=>inB(a)&&a.pid&&a.d>=from).forEach(a=>{const z=P[a.pid]=P[a.pid]||{pn:a.pn,ph:a.ph,n:0,ca:0,ns:0,lastC:'',next:'',b:a.b};
    if(a.d<=today){z.n++;if(/cancel/i.test(a.st)){z.ca++;if(a.d>z.lastC)z.lastC=a.d}else if(/no ?show/i.test(a.st)){z.ns++;if(a.d>z.lastC)z.lastC=a.d}}
    else if(/open|confirm/i.test(a.st)&&(!z.next||a.d<z.next))z.next=a.d;if(a.pn)z.pn=a.pn;if(a.ph)z.ph=a.ph});
  const S2=Object.values(P).filter(z=>{const k=z.ca+z.ns;return k>=3||(k>=2&&k/z.n>=0.4)}).sort((a,b)=>(b.ca+b.ns)-(a.ca+a.ns)||(b.ca+b.ns)/b.n-(a.ca+a.ns)/a.n);
  const S3=cfConfs().filter(c=>inB(c)&&c.aT>=now&&c.aT<now+8*864e5&&cfDD(c)>=2).sort((a,b)=>a.aT-b.aT);
  if(CF.sheet)S3.forEach(c=>{c.who=cfWho(c)[0]});
  return {S1,S2,S3,d2,from}}
function vLists(){const Q=cfLists(),w=c=>esc(c.who||'…'),ph=x=>`<span dir="ltr">${x}</span>`;
  const t1=Q.S1.slice(0,300).map(c=>[cfFmt(c.aT),esc(c.pn),ph(cfPh0(c.ph||c.ph2)),cfFmt(c.cT),w(c),(c.bulk?'⚡ بالجملة · ':'')+(c.cat==='none'?'مفيش مكالمة':c.cat==='tried'?'اتصلوا وما ردش':c.cat==='missonly'?'فايتة بس':''),esc(c.res||'')]);
  const t2=Q.S2.slice(0,300).map(z=>[esc(z.pn),ph(cfPh0(cfPh(z.ph))),z.n,z.ca,z.ns,pc((z.ca+z.ns)/(z.n||1)),Q.d2(z.lastC),Q.d2(z.next)]);
  const t3=Q.S3.map(c=>[cfFmt(c.aT),esc(c.pn),ph(cfPh0(c.ph||c.ph2)),cfFmt(c.cT),cfDD(c)+' يوم',w(c)]);
  const none='<div class="sub" style="margin:6px 0">مفيش.</div>';
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--acc)"><h3>📋 قوايم للسكرتارية والمراجعة<small>كلها جوه «📋 ملف اتصالات للسكرتارية»</small></h3>
   <details open><summary><b>📞 أكّد تاني — مأكدين عليها من بدري (يومين أو أكتر قبل الميعاد)</b> <span class="sub">(${t3.length} · الـ7 أيام الجاية · للسكرتارية)</span></summary>${t3.length?tableHTML(['الميعاد','المريض','الرقم','اتعلّم مؤكد',{t:'قبلها بـ',n:1},'مين أكد'],t3,{h:320}):none}</details>
   <details style="margin-top:8px"><summary><b>🔍 مراجعة ١ — شك: اتعلّم مؤكد من غير اتصال</b> <span class="sub">(${t1.length} · ${CF.calls.length?'بفلتر التاريخ فوق':'ارفع ملفات المكالمات الأول'})</span></summary>${t1.length?tableHTML(['الميعاد','المريض','الرقم','اتعلّم مؤكد','مين','اللي لقيناه','الميعاد حصل؟'],t1,{h:360}):none}</details>
   <details style="margin-top:8px"><summary><b>🔍 مراجعة ٢ — بيعتذروا كتير</b> <span class="sub">(${t2.length} · آخر 90 يوم: 3 مرات أو أكتر، أو مرتين وأكتر من 40% من مواعيده)</span></summary>${t2.length?tableHTML(['المريض','الرقم',{t:'مواعيد',n:1},{t:'اعتذر',n:1},{t:'ما جاش',n:1},{t:'نسبة',n:1},'آخر مرة','الجاي'],t2,{h:360}):none}</details></div>`}

// ================= 🖼️ صورة تقييم الخطوط (تتبعت للسكرتارية) — من غير أسماء ولا أرقام مرضى =================
function cfLineStats(){const EP=cfStats().EP.filter(e=>e.st!=='pend'),C0=CF.calls.filter(c=>cfCOk(c.t,c.ln,true)),r=(a,f)=>a.length?a.filter(f).length/a.length:null;
  const one=(l,cc,ee)=>{const ii=cc.filter(c=>c.ty==='in'||c.ty==='miss'),oo=cc.filter(c=>c.ty==='out'),eo=ee.filter(e=>e.open);
    return {l,inc:ii.length,miss:ii.length?ii.filter(c=>c.ty==='miss').length/ii.length:null,eo:eo.length,r1:r(eo,e=>e.wA!=null&&e.wA<60),md:cfMed(eo.filter(e=>e.wA!=null).map(e=>e.wA)),
      rN:r(eo,e=>e.st==='none'),none:ee.filter(e=>e.st==='none').length,out:oo.length,outR:oo.length?oo.filter(c=>c.dur>0).length/oo.length:null,talk:Math.round(cc.reduce((s,c)=>s+(c.ty!=='miss'?c.dur:0),0)/60)}};
  const lns=[...new Set(C0.map(c=>c.ln))].sort();
  return {T:one('الإجمالي',C0,EP),L:lns.map(l=>one(l,C0.filter(c=>c.ln===l),EP.filter(e=>e.ln===l)))}}
// [المقياس, المفتاح, شكل الرقم, الأحسن: 1 أعلى / -1 أقل / 0 مش بيتقارن, شرح بسيط]
const CF_M=[['📥 مكالمات داخلة','inc',v=>fm(v),0,'كل اللي اتصل بينا'],['📵 فاتت من غير رد','miss',v=>pc(v),-1,'من الداخلة — كل ما تقل أحسن'],['⏱️ رجعنا خلال ساعة','r1',v=>pc(v),1,'من اللي فاتت في مواعيد الشغل'],
  ['🕐 بنرجع بعد (في المتوسط)','md',v=>cfDurF(v),-1,'نص المرات بنرجع في الوقت ده أو أقل'],['🚫 ما رجعناش خالص','rN',v=>pc(v),-1,'فاتت ومحدش رجعله'],['📌 أرقام لسه محدش رجعلها','none',v=>fm(v),-1,'لحد آخر ملف اترفع'],
  ['📤 مكالمات طالعة','out',v=>fm(v),0,'كل اللي اتصلنا بيه'],['✅ المريض رد على الطالعة','outR',v=>pc(v),1,''],['🗣️ دقايق كلام','talk',v=>fm(v),0,'']];
const CF_GOAL={miss:[0.1,0.2,-1],r1:[0.7,0.4,1],rN:[0.05,0.1,-1],md:[30,120,-1]};   // [كويس, وحش, اتجاه]
function cfGrade(k,v){const g=CF_GOAL[k];if(!g||v==null)return 0;return g[2]<0?(v<=g[0]?1:v>g[1]?-1:0):(v>=g[0]?1:v<g[1]?-1:0)}
function cfNotes(x){const good=[],bad=[];
  if(x.miss!=null){if(cfGrade('miss',x.miss)>0)good.push('بيرد على أغلب المكالمات ('+pc(1-x.miss)+')');else if(cfGrade('miss',x.miss)<0)bad.push('مكالمات كتير بتفوت من غير رد ('+pc(x.miss)+') — لازم حد يبقى فاضي للتليفون')}
  if(x.r1!=null){if(cfGrade('r1',x.r1)>0)good.push('بيرجع بسرعة للي فاتته ('+pc(x.r1)+' خلال ساعة)');else if(cfGrade('r1',x.r1)<0)bad.push('بيتأخر يرجع للي فاتته — '+pc(x.r1)+' بس خلال ساعة (المطلوب 70%)')}
  if(x.rN!=null){if(cfGrade('rN',x.rN)>0)good.push('تقريباً مفيش حد فاته من غير ما نرجعله');else if(cfGrade('rN',x.rN)<0)bad.push(pc(x.rN)+' من اللي فاتوا محدش رجعلهم خالص')}
  if(x.none)bad.push(x.none+' رقم لسه مستني حد يرجعله — يتكلموا النهارده');
  return {good,bad}}
async function cfLineImg(only){const {T,L}=cfLineStats();if(!L.length){alert('مفيش مكالمات بالفلتر ده');return}
  const cols=only?[L.find(x=>x.l===only),T].filter(Boolean):(L.length>1?L.concat([T]):L),cmp=!only&&L.length>1;
  const ff=getComputedStyle(document.body).fontFamily||'Cairo, sans-serif',W=1080,P=40,cv=document.createElement('canvas'),x=cv.getContext('2d');
  const dd=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'…',per='من '+dd(CF.d1||cfDay(CF.minT))+' لحد '+dd(CF.d2||cfDay(CF.maxT))+(CF.h1!==''||CF.h2!==''?'   ·   '+cfShiftLbl():'');
  const notesL=(only?cols.slice(0,1):L).map(c=>({c,n:cfNotes(c)}));
  const rowH=58,hdr=150,tblH=60+CF_M.length*rowH,notesH=notesL.reduce((s,o)=>s+70+Math.max(1,o.n.good.length+o.n.bad.length)*40,0),H=hdr+tblH+40+notesH+90;
  cv.width=W;cv.height=H;x.direction='rtl';x.textBaseline='middle';
  const F=(sz,w)=>x.font=(w||400)+' '+sz+'px '+ff,T_=(t,X,Y,al,c)=>{x.fillStyle=c||'#1f2937';x.textAlign=al||'right';x.fillText(t,X,Y)},R=(X,Y,w,h,c,rad)=>{x.fillStyle=c;x.beginPath();x.roundRect?x.roundRect(X,Y,w,h,rad||0):x.rect(X,Y,w,h);x.fill()};
  R(0,0,W,H,'#ffffff');R(0,0,W,hdr-20,'#0f766e');
  F(40,800);T_(only?'📞 تقييم أداء خط '+only:'📞 تقييم أداء خطوط التليفون',W-P,52,'right','#fff');
  F(24,600);T_((typeof BRN!=='undefined'?BRN[S.b]+'   ·   ':'')+per,W-P,100,'right','#d1fae5');
  // الجدول
  let y=hdr;const labW=360,cw=(W-2*P-labW)/cols.length;
  R(P,y,W-2*P,54,'#f1f5f9',10);F(24,800);T_('المقياس',W-P-16,y+27);
  cols.forEach((c,i)=>{const cx=W-P-labW-cw*i-cw/2;T_(c.l,cx,y+27,'center',c===T?'#475569':'#0f766e')});y+=60;
  CF_M.forEach(([lab,k,f,dir,why],ri)=>{if(ri%2)R(P,y,W-2*P,rowH,'#f8fafc');F(23,700);T_(lab,W-P-16,y+(why?20:rowH/2));if(why){F(16);T_(why,W-P-16,y+44,'right','#64748b')}
    const vals=cols.filter(c=>c!==T).map(c=>c[k]).filter(v=>v!=null),best=dir&&cmp&&vals.length>1?(dir>0?Math.max(...vals):Math.min(...vals)):null,worst=dir&&cmp&&vals.length>1?(dir>0?Math.min(...vals):Math.max(...vals)):null;
    cols.forEach((c,i)=>{const v=c[k],cx=W-P-labW-cw*i-cw/2;let bg=null,fg='#111827';
      if(v!=null&&c!==T&&best!==worst){if(v===best){bg='#dcfce7';fg='#166534'}else if(v===worst){bg='#fee2e2';fg='#991b1b'}}
      if(!bg&&c!==T&&!cmp){const g=cfGrade(k,v);if(g>0){bg='#dcfce7';fg='#166534'}else if(g<0){bg='#fee2e2';fg='#991b1b'}}
      if(bg)R(cx-cw/2+6,y+6,cw-12,rowH-12,bg,8);F(26,c===T?600:800);T_(v==null?'—':f(v),cx,y+rowH/2,'center',c===T?'#475569':fg)});
    y+=rowH});
  x.strokeStyle='#e2e8f0';x.lineWidth=2;x.strokeRect(P,hdr,W-2*P,y-hdr);
  F(17);T_(cmp?'🟩 الأحسن بين الخطوط   🟥 الأضعف   ·   «الإجمالي» للمقارنة بس':'🟩 كويس   🟥 محتاج يتحسن   ·   «الإجمالي» = كل الخطوط مع بعض',W-P,y+22,'right','#64748b');y+=50;
  // ملاحظات لكل خط
  notesL.forEach(({c,n})=>{R(P,y,W-2*P,56,'#ecfeff',10);F(26,800);T_('📋 خط '+c.l,W-P-16,y+28,'right','#0e7490');y+=68;F(22,600);
    if(!n.good.length&&!n.bad.length){T_('• أداء متوسط — مفيش حاجة واضحة لا كويسة ولا وحشة',W-P-16,y+14);y+=40}
    n.good.forEach(t=>{T_('✅ '+t,W-P-16,y+14,'right','#166534');y+=40});n.bad.forEach(t=>{T_('⚠️ '+t,W-P-16,y+14,'right','#991b1b');y+=40});y+=6});
  const BD=cfBadDays().filter(b=>(!only||b.ln===only)&&(!CF.d1||b.d>=CF.d1)&&(!CF.d2||b.d<=CF.d2));if(BD.length){F(20,800);T_('⚠️ تنبيه: ملف '+BD.map(b=>'خط '+b.ln+' يوم '+b.d.slice(8,10)+'/'+b.d.slice(5,7)).join(' · ')+' اتحفظ من غير ساعات — الأرقام دي مش دقيقة',W-P,H-96,'right','#dc2626')}
  F(16);T_('«فاتت» = مكالمة داخلة ما اترد عليهاش  ·  «رجعنا» = اتصلنا بالرقم بعدها (حتى لو ما ردش)',W-P,H-62,'right','#94a3b8');T_('من سجل المكالمات اللي اترفع لحد '+cfFmt(CF.maxT),W-P,H-36,'right','#94a3b8');
  F(18,800);T_('BODYFIX',P,H-36,'left','#0f766e');
  cv.toBlob(async b=>{const name=(only?'تقييم خط '+only:'تقييم الخطوط')+' — '+cfDay(cfWall(new Date().toISOString()))+'.png';const file=new File([b],name,{type:'image/png'});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){await navigator.share({files:[file],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)},'image/png')}

// ⚠️ يوم اتحفظ من غير ساعات (كل المكالمات 12:00 بالليل — ملف عربي اتقرا قبل التصليح): الأرقام بتاعته غلط لحد ما الملف يترفع تاني
function cfBadDays(){const g={};CF.calls.forEach(c=>{const k=c.ln+'|'+cfDay(c.t),z=g[k]=g[k]||{n:0,z:0};z.n++;if(c.t%864e5===0)z.z++});
  return Object.keys(g).filter(k=>g[k].n>=10&&g[k].z/g[k].n>0.8).map(k=>{const [ln,d]=k.split('|');return {ln,d,n:g[k].n}}).sort((a,b)=>a.d<b.d?1:-1)}
function cfBadHTML(){const B=cfBadDays();if(!B.length)return '';return `<div class="card" style="margin-top:12px;border:2px solid var(--down,#dc2626)"><b class="down">⚠️ ملفات اتحفظت من غير ساعات — أرقامها غلط (الرجوع والتقييم):</b><ul class="ins">${B.map(b=>`<li>خط <b>${esc(b.ln)}</b> يوم <b>${b.d.slice(8,10)}/${b.d.slice(5,7)}</b> (${b.n} مكالمة كلهم 12:00 بالليل)</li>`).join('')}</ul><div class="sub">الحل: ارفع ملف اليوم ده تاني (من هنا أو من خطة اليوم) — الرفع بيصلّح الساعات لوحده.</div></div>`}
// ================= ⚠️ تنبيهات المكالمات + مين ماسك كل خط =================
const cfShiftLbl=()=>{const sw=S.b==='dokki'?'17':'15',h=x=>{x=+x;return (x%12||12)+(x<12||x===24?' ص':' م')};return (CF.h1==='11'&&CF.h2===sw?'☀️ الشيفت الصباحي ':CF.h1===sw&&CF.h2==='23'?'🌙 الشيفت المسائي ':'')+'من '+h(CF.h1||0)+' لـ '+h(CF.h2||24)};
const CF_RL={'BODYFIX Center':['F','H','J','L'],'FIX ZONE':['DM','DE']},CF_RLL={L:'المشرف',F:'الشيفت الصباحي',H:'عيادة 1',J:'عيادة 2',DM:'الشيفت الصباحي',DE:'الشيفت المسائي'};
function vCallAlerts(){if(!CF.calls.length&&!(CF.upl||[]).length)return '';if(!CF.sheet)cfSheet();
  const lns=[...new Set(CF.calls.map(c=>c.ln).concat(Object.keys(CF.lines||{})))].sort(),U=CF.upl||[],today=cfDay(cfWall(new Date().toISOString()));
  const rows=lns.map(l=>{const cc=CF.calls.filter(c=>c.ln===l),days=new Set(cc.map(c=>cfDay(c.t))),last=cc.reduce((m,c)=>Math.max(m,c.t),0),u=U.filter(x=>x.ln===l),cfg=CF.lines[l]||{},br=cfg.br||'BODYFIX Center';
    const miss=[];if(cc.length){const first=cc.reduce((m,c)=>Math.min(m,c.t),Infinity);for(let i=1;i<=14;i++){const d=cfDay(Date.parse(today+'T00:00:00Z')-i*864e5);if(d<cfDay(first))break;if(new Date(d+'T00:00:00Z').getUTCDay()===5)continue;if(!days.has(d))miss.push(d.slice(8,10)+'/'+d.slice(5,7))}}
    const gone=u.reduce((s,x)=>s+(x.gone||0),0),names=(CF.sheet&&CF.sheet.roles&&CF.sheet.roles[br])||{};
    return [`<b>${esc(l)}</b>`,`<select data-cfbr="${esc(l)}"><option value="BODYFIX Center"${br==='BODYFIX Center'?' selected':''}>الهرم</option><option value="FIX ZONE"${br==='FIX ZONE'?' selected':''}>الدقي</option></select>`,
      (()=>{const sw=cfg.sw||(br==='FIX ZONE'?17:15),am=CS.roleAt(cfg,br,0),pm=CS.roleAt(cfg,br,23),sel=(k,v)=>`<select data-cfrole="${esc(l)}" data-k="${k}">${CF_RL[br].map(r=>`<option value="${r}"${v===r?' selected':''}>${CF_RLL[r]}${names[r]?' — '+esc(names[r]):''}</option>`).join('')}</select>`;
        return `<span class="sub">لحد الساعة <input data-cfsw="${esc(l)}" type="number" min="8" max="23" value="${sw}" style="width:48px">:</span> ${sel('am',am)}<br><span class="sub">بعدها:</span> ${sel('pm',pm)}`})(),
      u[0]?cfFmt(cfWall(new Date(u[0].at).toISOString())):'—',last?cfFmt(last):'—',miss.length?`<span class="down">${miss.length}: ${miss.slice(0,6).join('، ')}${miss.length>6?'…':''}</span>`:'✅',gone?`<b class="down">⚠️ ${gone}</b>`:'—']});
  const visit={};(D.apt||[]).forEach(a=>{if(!/complet|check|progress/i.test(a.st||''))return;const p=cfPh(a.ph);if(p&&(!visit[p]||a.d>visit[p]))visit[p]=a.d});
  const OPEN={};cfEpisodes(CF.calls).E.forEach(e=>{if(e.s!=='miss'||e.tC!=null||e.ph.length<9)return;if(visit[e.ph]&&visit[e.ph]>=cfDay(e.t0))return;OPEN[e.ln]=(OPEN[e.ln]||0)+1});
  rows.forEach((r,i)=>r.splice(5,0,OPEN[lns[i]]?`<b class="down">${OPEN[lns[i]]}</b>`:'✅ 0'));
  const G=[];U.forEach(x=>(x.goneR||[]).forEach(r=>G.push({ln:x.ln,at:x.at,c:CS.unpack(r.slice(1),r[0],x.ln)})));
  const ic={in:'📥 واردة',out:'📤 صادرة',miss:'📵 فايتة','?':'📞'};
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--warn)"><h3>📞 الخطوط والتنبيهات</h3>
   ${tableHTML(['الخط','الفرع','مين ماسك الموبايل (المكالمات الفايتة بتروح له)','آخر رفع','آخر مكالمة','📵 مستنيين حد يرجعلهم (زي الخطة)','أيام شغل من غير مكالمات (آخر 14 يوم)','مكالمات اتمسحت'],rows,{h:300})}
   <div class="sub" style="margin-top:4px">«أيام من غير مكالمات» = يوم شغل (من غير الجمعة) مفيش فيه ولا مكالمة في الملفات — يا إما الملف بتاعه ما اترفعش، يا إما حاجة غلط. · «اتمسحت» = مكالمة كانت متحفظة من ملف قديم، وملف أحدث لنفس الأيام ما فيهوش.</div>
   ${G.length?`<details style="margin-top:8px"><summary><b class="down">⚠️ المكالمات اللي اتمسحت (${G.length})</b></summary>${tableHTML(['الخط','وقت المكالمة','الرقم','النوع',{t:'المدة (ث)',n:1},'اتكشفت في رفع'],G.sort((a,b)=>b.c.t-a.c.t).slice(0,300).map(g=>[esc(g.ln),cfFmt(g.c.t),`<span dir="ltr">${cfPh0(g.c.ph)}</span>`,ic[g.c.ty]||'',g.c.dur,cfFmt(cfWall(new Date(g.at).toISOString()))]),{h:320})}</details>`:''}
   ${U.length?`<details style="margin-top:8px"><summary><b>📜 آخر مرات الرفع (${U.length})</b></summary>${tableHTML(['إمتى','الخط','الملف','من',{t:'جديدة',n:1},{t:'كانت موجودة',n:1},{t:'اتمسحت',n:1}],U.slice(0,40).map(x=>[cfFmt(cfWall(new Date(x.at).toISOString())),esc(x.ln||''),esc(x.file||''),esc(x.by==='fin'?'صفحة الماليات':x.by||''),x.add||0,x.dup||0,x.gone?`<b class="down">${x.gone}</b>`:0]),{h:300})}</details>`:''}</div>`}
function cCallCfg(){const sv=async()=>{try{await CS.setLines(CF.lines)}catch(e){alert('ما اتحفظش: '+(e.message||e))}render()};
  document.querySelectorAll('[data-cfbr]').forEach(x=>x.onchange=()=>{const l=x.dataset.cfbr;CF.lines[l]=x.value==='FIX ZONE'?{br:x.value,sw:17,am:'DM',pm:'DE'}:{br:x.value,sw:15,am:'F',pm:'F'};sv()});
  const fix=l=>{const c=CF.lines[l]=Object.assign({br:'BODYFIX Center'},CF.lines[l]||{});c.sw=c.sw||(c.br==='FIX ZONE'?17:15);c.am=CS.roleAt(c,c.br,0);c.pm=CS.roleAt(c,c.br,23);delete c.role;delete c.auto;return c};
  document.querySelectorAll('[data-cfrole]').forEach(x=>x.onchange=()=>{const c=fix(x.dataset.cfrole);c[x.dataset.k]=x.value;sv()});
  document.querySelectorAll('[data-cfsw]').forEach(x=>x.onchange=()=>{const c=fix(x.dataset.cfsw);c.sw=Math.max(8,Math.min(23,+x.value||15));sv()})}

// ================= 🔍 مراجعة يوم: No Show / ملغي — اتأكد إمتى ومين · اتغيّر إمتى ومين · سبب الإلغاء · المكالمات قبلها =================
CF.dr={d:'',doc:'',st:'all'};
const CF_STL={NOSHOW:'No Show',NO_SHOW:'No Show',CANCELED:'اتلغى',CANCELLED:'اتلغى'};
function cfCx(){const T=(RAW&&RAW.kinds&&RAW.kinds.cx&&RAW.kinds.cx.all)||{},out=[];
  for(const mk in T){const t=T[mk],ci=n=>t.cols.indexOf(n);for(const r of t.rows){const g=n=>ci(n)>=0?r[ci(n)]:null;const aT=cfWall(g('start'));if(aT==null)continue;
    out.push({aid:g('aid'),aT,st:String(g('st')||'').toUpperCase(),upT:cfWall(g('up')),ub:g('ub')||'',rsn:g('rsn')||'',type:tName(g('type')||''),pn:g('pn')||'',ph:cfPh(g('ph')),doc:docName(g('doc')||''),b:g('b'),by:g('by')||'',crT:cfWall(g('cr'))})}}
  return out}
// مين عمل «مؤكد»: الاسم المتسجل — ولو مش متسجل: صاحب الشيفت ساعتها (الهرم: الصباحي لحد 3 / الدقي لحد 5) *
function cfConfBy(c){if(c.ub)return [c.ub,1];const R=(CF.sheet&&CF.sheet.roles&&CF.sheet.roles[CF_BR[c.b]])||{},h=new Date(c.cT).getUTCHours(),dk=c.b==='dokki';
  const rk=dk?(h<17?'DM':'DE'):(h<15?'F':'J');return [(R[rk]||(dk?(h<17?'الشيفت الصباحي':'الشيفت المسائي'):(h<15?'الشيفت الصباحي':'عيادة 2')))+' *',0]}
function cfDayRev(){if(!CF.sheet)cfSheet();const day=CF.dr.d||cfDay(cfWall(new Date().toISOString())),X=cfCx().filter(x=>inB(x)&&cfDay(x.aT)===day&&(!CF.dr.doc||x.doc===CF.dr.doc));
  const conf={};cfConfs().forEach(c=>{conf[c.aid]=c});if(!CF.idx){CF.idx={};CF.calls.forEach(c=>(CF.idx[c.ph]=CF.idx[c.ph]||[]).push(c))}
  const R=X.filter(x=>CF.dr.st==='all'||(CF.dr.st==='ns'?/NO/.test(x.st):!/NO/.test(x.st))).sort((a,b)=>(/NO/.test(a.st)?0:1)-(/NO/.test(b.st)?0:1)||a.aT-b.aT).map(x=>{
    const c=conf[x.aid],L=((CF.idx[x.ph]||[]).concat(c&&c.ph2&&CF.idx[c.ph2]||[])).filter(k=>k.t<x.aT).sort((a,b)=>a.t-b.t);
    const ref=c?c.cT:x.aT,talk=L.filter(k=>k.dur>0&&k.ty!=='miss'),lastTalk=talk.length?talk[talk.length-1]:null,before=L.filter(k=>k.t<=ref+15*60e3&&k.t>=ref-36*3600e3);
    const flags=[];const cov=CF.minT!=null&&ref>=CF.minT&&ref<=CF.maxT+864e5;
    if(c&&cov&&!before.some(k=>k.dur>0&&k.ty!=='miss'))flags.push('اتأكد من غير مكالمة اترد عليها');
    if(c&&before.some(k=>k.ty==='out'&&k.dur===0&&c.cT-k.t>=0&&c.cT-k.t<=40*60e3)&&!before.some(k=>k.dur>0&&k.ty!=='miss'))flags.push('اتعلّم «مؤكد» بعد مكالمة ما اتردتش بدقايق');
    if(/عدم الرد|ما ردش|مردش|لا يرد|no ?answer/i.test(x.rsn)&&cov&&!L.some(k=>k.ty==='out'&&x.upT&&k.t<=x.upT&&k.t>=x.upT-3*864e5))flags.push('إلغاء «لعدم الرد» ومفيش محاولة اتصال');
    const cb=c?cfConfBy(c):null;
    return {x,c,cb,lastTalk,tried:L.filter(k=>k.ty==='out'&&k.dur===0&&k.t>=x.aT-7*864e5).length,flags,cov}});
  // تأكيد بالجملة: 3 أو أكتر في نص ساعة
  const cs=R.filter(r=>r.c).map(r=>r.c.cT).sort((a,b)=>a-b);let bulk=null;for(let i=0;i+2<cs.length;i++){let j=i;while(j+1<cs.length&&cs[j+1]-cs[i]<=30*60e3)j++;if(j-i>=2&&(!bulk||j-i>bulk[2]))bulk=[cs[i],cs[j],j-i+1]}
  return {day,R,bulk,docs:[...new Set(cfCx().filter(x=>inB(x)&&cfDay(x.aT)===day).map(x=>x.doc))].sort()}}
const cfHm=t=>{if(t==null)return '';const d=new Date(t),h=d.getUTCHours();return (h%12||12)+':'+String(d.getUTCMinutes()).padStart(2,'0')+(h<12?' ص':' م')};
const cfDm=t=>t==null?'':String(new Date(t).getUTCDate()).padStart(2,'0')+'/'+String(new Date(t).getUTCMonth()+1).padStart(2,'0')+' '+cfHm(t);
function cfDrRows(V,full){return V.R.map(r=>{const x=r.x,ns=/NO/.test(x.st);return {ns,cells:[cfHm(x.aT),...(full?[x.pn,x.ph?cfPh0(x.ph):'']:[]),x.type,...(CF.dr.doc?[]:[x.doc]),
  r.c?'✔️ '+cfDm(r.c.cT)+' · 👤 '+r.cb[0]:'— ما اتأكدش',(ns?'🚫 No Show':'✖️ اتلغى')+(x.upT?' '+cfDm(x.upT):'')+(x.ub?' · 👤 '+x.ub:''),ns?'':(x.rsn||'—'),
  r.lastTalk?'آخر كلام '+cfDm(r.lastTalk.t):(r.cov?'❌ ولا مكالمة اترد عليها':'(مفيش سجل مكالمات للوقت ده)'),r.flags.map(f=>'⚠️ '+f).join(' · ')]}})}
function cfDrHead(full){return ['الميعاد',...(full?['المريض','الرقم']:[]),'النوع',...(CF.dr.doc?[]:['الدكتور']),'اتعلّم Confirmed · مين','الحالة · إمتى · مين','سبب الإلغاء','المكالمات','ملاحظات']}
function cfDrNotes(V){const N=[],R=V.R,ns=R.filter(r=>r.ns||/NO/.test(r.x.st)),cx=R.filter(r=>!/NO/.test(r.x.st));
  if(ns.length)N.push(`${ns.length} No Show — منهم ${ns.filter(r=>r.c).length} كانوا «مؤكد»، و${ns.filter(r=>r.c&&r.flags.some(f=>/من غير مكالمة/.test(f))).length} اتأكدوا من غير مكالمة اترد عليها`);
  if(V.bulk)N.push(`${V.bulk[2]} مواعيد اتعلّم عليهم «مؤكد» مع بعض: ${cfDm(V.bulk[0])} – ${cfHm(V.bulk[1])}`);
  const nr=R.filter(r=>r.flags.some(f=>/لعدم الرد/.test(f)));if(nr.length)N.push(`${nr.length} إلغاء «لعدم الرد» ومفيش ولا محاولة اتصال قبلها`);
  const af=R.filter(r=>r.flags.some(f=>/بعد مكالمة ما اتردتش/.test(f)));if(af.length)N.push(`${af.length} اتعلّم «مؤكد» بعد مكالمة ما اتردتش بدقايق`);
  if(R.some(r=>r.c&&!r.c.ub))N.push('* اسم اللي أكد مش متسجل → صاحب الشيفت ساعتها');return N}
function vDayRev(){let V;try{V=cfDayRev()}catch(e){return `<div class="card">مراجعة يوم: ${esc(e.message)}</div>`}
  const has=!!((RAW&&RAW.kinds&&RAW.kinds.cx));const H=cfDrHead(true),rows=cfDrRows(V,true).map(r=>Object.assign(r.cells.map((c,i)=>H[i]==='الرقم'?`<span dir="ltr">${esc(c)}</span>`:H[i]==='ملاحظات'?`<b class="down">${esc(c)}</b>`:esc(c)),{_c:r.ns?'':''}));
  const N=cfDrNotes(V);
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--down,#dc2626)"><h3>🔍 مراجعة يوم — No Show والملغي<small>اتأكد إمتى ومين · اتغيّر إمتى ومين · سبب الإلغاء · المكالمات قبلها</small></h3>
   <div class="bar"><label class="sub">اليوم <input type="date" id="drD" value="${V.day}"></label><label class="sub">الدكتور <select id="drDoc"><option value="">كل الدكاترة</option>${V.docs.map(d=>`<option${d===CF.dr.doc?' selected':''}>${esc(d)}</option>`).join('')}</select></label>
    <label class="sub">الحالة <select id="drSt"><option value="all">No Show + ملغي</option><option value="ns"${CF.dr.st==='ns'?' selected':''}>No Show بس</option><option value="cx"${CF.dr.st==='cx'?' selected':''}>الملغي بس</option></select></label>
    <button class="pri" id="drImgF">🖼️ صورة كاملة (بالأسامي والأرقام)</button><button class="pri" id="drImgG">🖼️ صورة للجروب (من غير أسامي ولا أرقام المرضى)</button></div>
   ${!has?'<div class="note" style="margin-top:8px">⏳ تسجيل الملغي والـ No Show (مين وإمتى والسبب) بيبدأ من أول مزامنة كاملة جاية — الأيام اللي قبل كده مش هتبان هنا.</div>':''}
   ${N.length?`<ul class="ins" style="margin-top:8px">${N.map(n=>`<li>${esc(n)}</li>`).join('')}</ul>`:''}
   ${rows.length?tableHTML(H,rows,{h:520}):'<div class="sub" style="margin-top:8px">مفيش No Show ولا ملغي في اليوم ده (بالفلتر ده).</div>'}
   <div class="sub" style="margin-top:4px">المكالمات = سجل الخطوط اللي اترفع (تاب 📞 المكالمات) · التأكيد على الواتساب مش بيظهر · «اتأكد من غير مكالمة» = مفيش مكالمة اترد عليها لرقم المريض في الـ 36 ساعة قبل التأكيد</div></div>`}
function cDayRev(){const d=$('#drD'),dc=$('#drDoc'),st=$('#drSt'),f=$('#drImgF'),g=$('#drImgG');if(d)d.onchange=()=>{CF.dr.d=d.value;render()};if(dc)dc.onchange=()=>{CF.dr.doc=dc.value;render()};if(st)st.onchange=()=>{CF.dr.st=st.value;render()};
  if(f)f.onclick=()=>cfDrImg(true);if(g)g.onclick=()=>cfDrImg(false)}
// 🖼️ صورة الجدول (canvas) — full = بأسامي وأرقام المرضى · للجروب = من غير (أسامي السكرتارية موجودة)
function cfDrImg(full){const V=cfDayRev(),H=cfDrHead(full),Rw=cfDrRows(V,full),N=cfDrNotes(V);if(!Rw.length){alert('مفيش حاجة في اليوم ده');return}
  const ff=getComputedStyle(document.body).fontFamily||'Cairo, sans-serif',W=Math.max(1400,H.length*190),P=36,cv=document.createElement('canvas'),x=cv.getContext('2d');
  const F=(sz,w)=>x.font=(w||400)+' '+sz+'px '+ff;const wrap=(t,w)=>{const out=[];String(t).split(' · ').forEach(seg=>{let line='';seg.split(' ').forEach(wd=>{const tt=line?line+' '+wd:wd;if(x.measureText(tt).width>w&&line){out.push(line);line=wd}else line=tt});if(line)out.push(line)});return out};
  const cw=H.map(h=>/ملاحظات|المكالمات|Confirmed|الحالة/.test(h)?2.1:/المريض/.test(h)?1.6:/الرقم|الدكتور|النوع|سبب/.test(h)?1.2:0.8),sw=cw.reduce((a,b)=>a+b,0),CW=cw.map(c=>c/sw*(W-2*P));
  F(17,600);const lines=Rw.map(r=>r.cells.map((c,i)=>wrap(c,CW[i]-16))),rh=lines.map(L=>Math.max(...L.map(l=>l.length))*24+18);
  const hdr=130,th=46,notesH=N.length*30+30,H2=hdr+th+rh.reduce((a,b)=>a+b,0)+notesH+70;cv.width=W;cv.height=H2;x.direction='rtl';x.textBaseline='middle';
  const T_=(t,X,Y,c,al)=>{x.fillStyle=c||'#111827';x.textAlign=al||'right';x.fillText(t,X,Y)},Rc=(X,Y,w,h,c)=>{x.fillStyle=c;x.fillRect(X,Y,w,h)};
  Rc(0,0,W,H2,'#fff');Rc(0,0,W,hdr-20,'#0f766e');F(34,800);T_('🔍 مراجعة '+(CF.dr.st==='ns'?'الـ No Show':CF.dr.st==='cx'?'الإلغاء':'الغياب والإلغاء')+(CF.dr.doc?' — '+CF.dr.doc:''),W-P,46,'#fff');
  F(20,600);T_((BRN[S.b]||'')+' · '+V.day.slice(8,10)+'/'+V.day.slice(5,7)+'/'+V.day.slice(0,4)+' · من سحبات Medicolize + سجل مكالمات الخطوط',W-P,88,'#d1fae5');
  let y=hdr;Rc(P,y,W-2*P,th,'#f1f5f9');F(17,800);let X=W-P;H.forEach((h,i)=>{T_(h,X-8,y+th/2,'#334155');X-=CW[i]});y+=th;
  Rw.forEach((r,ri)=>{if(ri%2)Rc(P,y,W-2*P,rh[ri],'#fafafa');X=W-P;r.cells.forEach((c,i)=>{const col=/^⚠️|❌/.test(c)?'#b91c1c':/^✔️/.test(c)?'#1d4ed8':/^🚫|^✖️/.test(c)?'#b91c1c':'#111827';F(17,/^(✔️|🚫|✖️|⚠️)/.test(c)||i===1&&full?700:500);
      lines[ri][i].forEach((l,li)=>T_(l,X-8,y+20+li*24,col));X-=CW[i]});x.strokeStyle='#e5e7eb';x.beginPath();x.moveTo(P,y+rh[ri]);x.lineTo(W-P,y+rh[ri]);x.stroke();y+=rh[ri]});
  y+=14;if(N.length){Rc(P,y,W-2*P,notesH-10,'#fef2f2');F(18,700);N.forEach((n,i)=>T_('• '+n,W-P-14,y+24+i*30,'#7f1d1d'))}
  F(14);T_('التأكيد على الواتساب مش بيظهر في سجل المكالمات · BODYFIX',W-P,H2-24,'#94a3b8');
  cv.toBlob(async b=>{const name='مراجعة '+V.day+(full?'':' (للجروب)')+'.png',file=new File([b],name,{type:'image/png'});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){await navigator.share({files:[file],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)},'image/png')}

// ================= 🖼️ 3 قوايم تتنزّل صورة: اتحجز مؤكد وقت الحجز · اتأكد قبلها بيومين أو أكتر · اتأكد من غير مكالمة =================
// صورة جدول عامة (canvas) — نفس شكل صورة «مراجعة يوم»
function cfTableImg(o){const ff=getComputedStyle(document.body).fontFamily||'Cairo, sans-serif',H=o.head,W=Math.max(1300,H.length*185),P=36,cv=document.createElement('canvas'),x=cv.getContext('2d');
  const F=(sz,w)=>x.font=(w||400)+' '+sz+'px '+ff;const wrap=(t,w)=>{const out=[];String(t==null?'':t).split(' · ').forEach(seg=>{let line='';seg.split(' ').forEach(wd=>{const tt=line?line+' '+wd:wd;if(x.measureText(tt).width>w&&line){out.push(line);line=wd}else line=tt});if(line)out.push(line)});return out.length?out:['']};
  const cw=H.map(h=>o.wide&&o.wide.test(h)?2:/المريض/.test(h)?1.6:1.1),sw=cw.reduce((a,b)=>a+b,0),CW=cw.map(c=>c/sw*(W-2*P));
  F(17,600);const lines=o.rows.map(r=>r.map((c,i)=>wrap(c,CW[i]-16))),rh=lines.map(L=>Math.max(...L.map(l=>l.length))*24+18);
  const N=o.notes||[],hdr=130,th=46,notesH=N.length?N.length*30+30:0,H2=hdr+th+rh.reduce((a,b)=>a+b,0)+notesH+70;cv.width=W;cv.height=H2;x.direction='rtl';x.textBaseline='middle';
  const T_=(t,X,Y,c)=>{x.fillStyle=c||'#111827';x.textAlign='right';x.fillText(t,X,Y)},Rc=(X,Y,w,h,c)=>{x.fillStyle=c;x.fillRect(X,Y,w,h)};
  Rc(0,0,W,H2,'#fff');Rc(0,0,W,hdr-20,o.color||'#0f766e');F(32,800);T_(o.title,W-P,46,'#fff');F(19,600);T_(o.sub||'',W-P,88,'#e0f2f1');
  let y=hdr;Rc(P,y,W-2*P,th,'#f1f5f9');F(17,800);let X=W-P;H.forEach((h,i)=>{T_(h,X-8,y+th/2,'#334155');X-=CW[i]});y+=th;
  o.rows.forEach((r,ri)=>{if(ri%2)Rc(P,y,W-2*P,rh[ri],'#fafafa');X=W-P;r.forEach((c,i)=>{const s=String(c==null?'':c),col=/^(⚠️|❌|ما جاش|اعتذر)/.test(s)?'#b91c1c':/^(✅|حضر)/.test(s)?'#15803d':'#111827';F(17,/المريض/.test(H[i])?700:500);
      lines[ri][i].forEach((l,li)=>T_(l,X-8,y+20+li*24,col));X-=CW[i]});x.strokeStyle='#e5e7eb';x.beginPath();x.moveTo(P,y+rh[ri]);x.lineTo(W-P,y+rh[ri]);x.stroke();y+=rh[ri]});
  y+=14;if(N.length){Rc(P,y,W-2*P,notesH-10,'#fef2f2');F(18,700);N.forEach((n,i)=>T_('• '+n,W-P-14,y+24+i*30,'#7f1d1d'))}
  F(14);T_('BODYFIX · '+(o.foot||''),W-P,H2-24,'#94a3b8');
  cv.toBlob(async b=>{const name=o.fname+'.png',file=new File([b],name,{type:'image/png'});
    try{if(navigator.canShare&&navigator.canShare({files:[file]})&&/Android|iPhone|iPad/i.test(navigator.userAgent)){await navigator.share({files:[file],title:name});return}}catch(e){if(e&&e.name==='AbortError')return}
    const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500)},'image/png')}
const CF_L3=[
  {k:'book',t:'🟢 اتحجز «مؤكد» وقت الحجز',d:'الميعاد اتسجّل «مؤكد» من أول ما اتحجز (من غير تأكيد بعد كده)',col:'#0f766e',f:c=>c.atBook},
  {k:'early',t:'📅 اتأكد قبل الميعاد بيومين أو أكتر',d:'التأكيد اتعمل من بدري — محتاج تأكيد تاني اليوم اللي قبله',col:'#1d4ed8',f:c=>!c.atBook&&cfDD(c)>=2},
  {k:'nocall',t:'❌ اتأكد من غير مكالمة اترد عليها',d:'مفيش مكالمة اترد عليها لرقم المريض في الـ 36 ساعة قبل التأكيد (الواتساب مش بيظهر)',col:'#b91c1c',f:c=>!c.atBook&&['none','tried','missonly'].includes(c.cat)}];
function cfL3Rows(L,k,full){const resT=c=>c.res==='حضر'?'✅ حضر':c.res==='ما جاش'?'ما جاش':c.res==='اعتذر'?'اعتذر':c.res==='لسه'?'لسه':'—';
  return L.map(c=>{const by=k==='book'?(c.by||'—'):cfConfBy(c)[0];
    const base=[cfDm(c.aT),...(full?[c.pn,cfPh0(c.ph||c.ph2||'')]:[]),c.type,c.doc];
    if(k==='book')return [...base,cfDm(c.crT),by,resT(c)];
    if(k==='early')return [...base,cfDm(c.cT),cfDD(c)+' يوم',by,resT(c)];
    return [...base,cfDm(c.cT),by,c.cat==='none'?'❌ مفيش أي مكالمة للرقم':'⚠️ اتصلوا وما ردش',resT(c)]})}
function cfL3Head(k,full){const b=['الميعاد',...(full?['المريض','الرقم']:[]),'النوع','الدكتور'];
  return k==='book'?[...b,'اتحجز إمتى','مين حجز','النتيجة']:k==='early'?[...b,'اتأكد إمتى','قبلها بـ','مين أكد','النتيجة']:[...b,'اتأكد إمتى','مين أكد','المكالمات','النتيجة']}
function vL3(){const C=cfCalc().C.sort((a,b)=>a.aT-b.aT),per=CF.a1||CF.a2?(CF.a1||'…')+' → '+(CF.a2||'…'):ml(S.from)+' – '+ml(S.to);
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--acc)"><h3>🖼️ قوايم تتنزّل صورة<small>📅 ${esc(per)} (يوم الموعد) · ${BRN[S.b]}</small></h3>`+CF_L3.map(g=>{const L=C.filter(g.f),lost=L.filter(c=>c.res==='اعتذر'||c.res==='ما جاش').length,done=L.filter(c=>['حضر','اعتذر','ما جاش'].includes(c.res)).length;
    const H=cfL3Head(g.k,true),R=cfL3Rows(L,g.k,true).map(r=>r.map((c,i)=>H[i]==='الرقم'?`<span dir="ltr">${esc(c)}</span>`:esc(c)));
    return `<details style="margin-top:8px"${L.length?'':' '}><summary><b>${g.t}</b> <span class="sub">(${L.length}${done?` · ضاع ${lost} من ${done} خلصوا (${pc(lost/done)})`:''})</span></summary>
     <div class="bar" style="margin:6px 0"><button class="pri" data-l3="${g.k}|1">🖼️ صورة كاملة (بالأسامي والأرقام)</button><button data-l3="${g.k}|0">🖼️ صورة للجروب (من غير أسامي ولا أرقام المرضى)</button><span class="sub">${esc(g.d)}</span></div>
     ${L.length?tableHTML(H,R,{h:380}):'<div class="sub">مفيش في الفترة دي.</div>'}</details>`}).join('')+`</div>`}
function cL3(){document.querySelectorAll('[data-l3]').forEach(b=>b.onclick=()=>{const [k,f]=b.dataset.l3.split('|'),full=f==='1',g=CF_L3.find(x=>x.k===k),C=cfCalc().C.sort((a,b)=>a.aT-b.aT),L=C.filter(g.f);if(!L.length){alert('مفيش حاجة في القايمة دي');return}
  const lost=L.filter(c=>c.res==='اعتذر'||c.res==='ما جاش').length,done=L.filter(c=>['حضر','اعتذر','ما جاش'].includes(c.res)).length,per=CF.a1||CF.a2?(CF.a1||'…')+' → '+(CF.a2||'…'):ml(S.from)+' – '+ml(S.to);
  cfTableImg({title:g.t,sub:(BRN[S.b]||'')+' · مواعيد '+per+' · '+L.length+' ميعاد',head:cfL3Head(k,full),rows:cfL3Rows(L,k,full),color:g.col,wide:/المكالمات|اتأكد إمتى|اتحجز إمتى/,
    notes:[g.d,...(done?[`من اللي مواعيدهم خلصت (${done}): ضاع ${lost} (${pc(lost/done)}) — اعتذر أو ما جاش`]:[]),...(k!=='book'&&L.some(c=>!c.ub)?['* اسم اللي أكد مش متسجل → صاحب الشيفت ساعتها']:[])],
    foot:'من سحبات Medicolize'+(k==='nocall'?' + سجل مكالمات الخطوط':''),fname:g.t.replace(/[^؀-ۿ\w ]/g,'').trim()+' '+per.replace(/[\/\\:]/g,'-')+(full?'':' (للجروب)')})})}

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
VIEWS.conf=[()=>{CF.lists=null;let s='';try{s+=vDayRev()}catch(e){console.error(e)}try{s+=cfUpHTML(true)}catch(e){console.error(e);s+='<div class="card">خطأ في رفع الملفات: '+esc(e.message)+'</div>'}try{s+=vL3()}catch(e){console.error(e)}s+=vConf();try{s+=vLists()}catch(e){console.error(e);s+='<div class="card">خطأ في القوايم: '+esc(e.message)+'</div>'}return s},()=>{cConf();try{cReach()}catch(e){console.error(e)}try{cDayRev()}catch(e){console.error(e)}try{cL3()}catch(e){console.error(e)}}];
VIEWS.calls=[()=>{let s='';for(const f of [cfUpHTML,cfBadHTML,vCallAlerts,vCalls,vReach]){try{s+=f()}catch(e){console.error(e);s+='<div class="card">خطأ: '+esc(e.message)+'</div>'}}return s},()=>{cConf();for(const f of [cCalls,cReach,cCallCfg]){try{f()}catch(e){console.error(e)}}}];
