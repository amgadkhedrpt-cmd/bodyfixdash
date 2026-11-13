// BODYFIX — «📞 التأكيدات»: مين اتعلّم عليه «مؤكد» من غير اتصال حقيقي.
// التأكيدات: السحب بيسجل كل موعد Confirmed + وقت تعديله على Medicolize (= وقت التأكيد) — متشفرة مع باقي البيانات.
// سجل المكالمات: بيترفع هنا ويتقري على الجهاز بس — مش بيتبعت ولا بيتحفظ في أي حتة.
'use strict';
const CF={calls:[],files:[],map:null,sheet:null,sheetTry:false,minT:null,maxT:null};
const cfDig=s=>String(s==null?'':s).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
const cfPh=s=>{const d=cfDig(s).replace(/\D/g,'');return d.length>=10?d.slice(-10):''};
// وقت القاهرة «على الحيطة» كرقم (عشان نقارن بوقت سجل المكالمات اللي متسجل بتوقيت الموبايل)
const cfWall=iso=>{if(!iso)return null;const d=new Date(iso);if(isNaN(d))return null;const s=d.toLocaleString('sv-SE',{timeZone:'Africa/Cairo',hour12:false});return Date.parse(s.replace(' ','T')+'Z')};
const cfFmt=t=>{if(t==null)return '—';const d=new Date(t);return String(d.getUTCDate()).padStart(2,'0')+'/'+String(d.getUTCMonth()+1).padStart(2,'0')+' '+String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')};
const cfDay=t=>new Date(t).toISOString().slice(0,10);
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
function cfTime(dv,tv,dmy){let s=cfDig(dv).trim()+(tv!=null&&tv!==''?' '+cfDig(tv).trim():'');if(!s.trim())return null;
  if(/^\d{12,13}$/.test(s))return cfWall(new Date(+s).toISOString());
  if(typeof dv==='number'&&dv>20000&&dv<80000){const ms=Math.round((dv-25569)*864e5);return ms}            // تاريخ Excel
  s=s.replace(/ص|AM/i,' AM').replace(/م\b|PM/i,' PM');let m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i),y,mo,d,H,M,S,ap;
  if(m){[,y,mo,d,H,M,S,ap]=m}else{m=s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);if(!m)return null;
    let a=+m[1],b=+m[2];y=m[3].length===2?'20'+m[3]:m[3];if(dmy){d=a;mo=b}else{mo=a;d=b}H=m[4];M=m[5];S=m[6];ap=m[7]}
  H=+H;if(ap){ap=ap.toUpperCase();if(ap==='PM'&&H<12)H+=12;if(ap==='AM'&&H===12)H=0}
  return Date.UTC(+y,+mo-1,+d,H,+M,+(S||0))}
async function cfRead(file){let rows;
  if(/\.xlsx?$/i.test(file.name)){if(!window.XLSX&&!(await loadLib('XLSX')))throw new Error('مكتبة Excel ما اتحملتش');
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:''})}
  else rows=cfCSV(await file.text());
  let hi=rows.findIndex(r=>r.filter(x=>String(x).trim()).length>=3&&r.some(x=>CF_H.ph.test(String(x))||CF_H.dt.test(String(x))));if(hi<0)hi=0;
  const head=rows[hi],body=rows.slice(hi+1).filter(r=>r.length>1);const mp=CF.map&&CF.map.cols===head.join('|')?CF.map:Object.assign(cfDetect(head,body),{cols:head.join('|'),head});
  // يوم/شهر ولا شهر/يوم؟ من الأرقام نفسها
  let dmy=true;const di=mp.date;if(di>=0){let a12=0,b12=0;body.slice(0,400).forEach(r=>{const m=String(cfDig(r[di])).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-]/);if(m){if(+m[1]>12)a12++;if(+m[2]>12)b12++}});dmy=!(b12>a12)}
  const out=[];let bad=0;
  for(const r of body){const ph=cfPh(r[mp.ph]);const t=cfTime(r[mp.date],mp.time>=0?r[mp.time]:null,dmy);if(!ph||t==null){bad++;continue}
    const dur=mp.dur>=0?cfDur(r[mp.dur]):0;let ty=mp.type>=0?cfType(r[mp.type]):'';if(ty==='miss'&&dur>0)ty='in';
    out.push({ph,t,dur,ty:ty||'?'})}
  return {out,bad,mp,head,dmy,n:body.length}}
async function cfLoad(files){const msg=$('#cfMsg');for(const f of files){try{const r=await cfRead(f);CF.map=r.mp;
    const seen=new Set(CF.calls.map(c=>c.ph+'|'+c.t+'|'+c.ty));let add=0;r.out.forEach(c=>{const k=c.ph+'|'+c.t+'|'+c.ty;if(!seen.has(k)){seen.add(k);CF.calls.push(c);add++}});
    CF.files.push({name:f.name,n:r.n,ok:add,bad:r.bad,mp:r.mp,dmy:r.dmy})}catch(e){CF.files.push({name:f.name,err:e.message||String(e)})}}
  CF.minT=CF.calls.length?Math.min(...CF.calls.map(c=>c.t)):null;CF.maxT=CF.calls.length?Math.max(...CF.calls.map(c=>c.t)):null;CF.idx=null;render()}
// ---------- مين المسئولة (من خطة اليوم) ----------
async function cfSheet(){if(CF.sheetTry)return;CF.sheetTry=true;try{const d=await jsonp({action:'getAll'},25000);const r=(d&&d.reasons)||{};const o={sum:{},roles:null};
  for(const k in r){if(k.indexOf('PLANSUM|')===0){try{o.sum[k.slice(8)]=JSON.parse(r[k])}catch(e){}}else if(k==='PLANCFG|roles'){try{o.roles=JSON.parse(r[k])}catch(e){}}}
  CF.sheet=o}catch(e){CF.sheet={sum:{},roles:null,err:1}}if(S.tab==='conf')render()}
const CF_BR={haram:'BODYFIX Center',dokki:'FIX ZONE'},CF_ROLE={haram:'J',dokki:'DM'};
function cfWho(c){const sh=CF.sheet;if(!sh)return ['…',0];
  for(const d of [cfDay(c.cT),cfDay(c.aT),cfDay(c.cT-864e5)]){const s=sh.sum[d];if(s&&s.cf&&c.puid&&s.cf[c.puid])return [s.cf[c.puid],1]}
  const n=sh.roles&&(sh.roles[CF_BR[c.b]]||{})[CF_ROLE[c.b]];return [n?n+' *':'—',0]}
// ---------- البيانات ----------
function cfConfs(){const T=(RAW&&RAW.kinds&&RAW.kinds.conf&&RAW.kinds.conf.all)||{};const out=[];
  for(const mk in T){const t=T[mk],ci=n=>t.cols.indexOf(n);const I={aid:ci('aid'),s:ci('start'),u:ci('up'),cr:ci('cr'),ty:ci('type'),pid:ci('pid'),pn:ci('pn'),ph:ci('ph'),doc:ci('doc'),b:ci('b'),puid:ci('puid')};
    for(const r of t.rows){const cT=cfWall(r[I.u]),aT=cfWall(r[I.s]),crT=cfWall(r[I.cr]);if(cT==null||aT==null)continue;
      out.push({aid:r[I.aid],cT,aT,crT,type:tName(r[I.ty]||''),pid:r[I.pid],pn:r[I.pn]||'',ph:cfPh(r[I.ph]),doc:docName(r[I.doc]||''),b:r[I.b],puid:I.puid>=0?r[I.puid]:null,k:cfDay(aT).slice(0,7)})}}
  return out}
function cfCalc(){const C0=cfConfs().filter(c=>inB(c)&&c.k>=S.from&&c.k<=S.to);
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
    const L=(CF.idx[c.ph]||[]).filter(x=>x.t>=c.cT-36*3600e3&&x.t<=c.cT+15*60e3);c.calls=L;
    c.cat=!c.ph?'noph':L.some(x=>x.dur>0&&x.ty!=='miss')?'ok':L.some(x=>x.ty==='out')?'tried':L.length?'missonly':'none'});
  return {C:C0,bursts}}
const CF_CAT={ok:['✅ مكالمة اترد عليها','var(--good)'],tried:['📵 اتصلوا وما ردش — واتأكد','var(--warn)'],missonly:['📵 هو اللي اتصل وما اتردش عليه','var(--warn)'],none:['❌ مفيش أي مكالمة للرقم','var(--bad)'],
  nocov:['خارج فترة ملفات المكالمات','var(--t3)'],noph:['مفيش رقم على السيستم','var(--t3)'],book:['اتحجز «مؤكد» وقت الحجز (مش محتاج مكالمة)','var(--t3)'],nofile:['—','var(--t3)']};
function vConf(){if(!CF.sheet)cfSheet();const X=cfCalc(),C=X.C,chk=C.filter(c=>!c.atBook),J=chk.filter(c=>['ok','tried','missonly','none'].includes(c.cat));
  const all=cfConfs();const since=all.length?cfFmt(Math.min(...all.map(c=>c.cT))):'';
  const fl=CF.files.map(f=>f.err?`<li><b>${esc(f.name)}</b> — <span class="down">${esc(f.err)}</span></li>`:`<li><b>${esc(f.name)}</b> — ${f.ok} مكالمة${f.bad?` (${f.bad} سطر ما اتقراش)`:''}</li>`).join('');
  const mp=CF.map;const colSel=(k,lbl)=>mp?`<label class="sub">${lbl} <select data-cfc="${k}"><option value="-1">—</option>${mp.head.map((h,i)=>`<option value="${i}"${mp[k]===i?' selected':''}>${esc(String(h)).slice(0,30)}</option>`).join('')}</select></label>`:'';
  const ty={};CF.calls.forEach(c=>ty[c.ty]=(ty[c.ty]||0)+1);
  let h=`<div class="card"><h3>📞 التأكيدات — اتأكد بمكالمة فعلاً؟<small>${BRN[S.b]} · ${ml(S.from)}–${ml(S.to)}</small></h3>
   <div class="note" style="line-height:1.9">كل موعد بيتعلّم عليه «مؤكد» السحب بيسجّل وقته بالظبط${since?` (التسجيل شغال من ${since})`:''}. ارفع ملفات سجل المكالمات (CSV أو Excel — من الموبايل أو السنترال) وأنا أشوف: قبل التأكيد، هل فيه مكالمة <b>اترد عليها</b> لرقم المريض؟<br>
   الملفات بتتقري على جهازك بس — مش بتترفع ولا بتتحفظ في أي حتة، ولو قفلت الصفحة لازم ترفعها تاني. ملحوظة: التأكيد على <b>واتساب</b> مش بيظهر في سجل المكالمات.</div>
   <div class="bar" style="margin-top:8px"><label class="drop" style="padding:6px 12px;border:1px dashed var(--brd);border-radius:8px;cursor:pointer">📂 ارفع ملفات المكالمات<input type="file" id="cfF" accept=".csv,.xlsx,.xls,.txt" multiple hidden></label>${CF.calls.length?`<button id="cfClr">🗑️ امسح الملفات</button><span class="sub">${CF.calls.length} مكالمة · من ${cfFmt(CF.minT)} لـ ${cfFmt(CF.maxT)} · صادرة ${ty.out||0} · واردة ${ty.in||0} · فائتة ${ty.miss||0}${ty['?']?` · من غير نوع ${ty['?']}`:''}</span>`:''}<span id="cfMsg" class="sub"></span></div>
   ${fl?`<ul class="ins" style="margin-top:6px">${fl}</ul>`:''}
   ${mp?`<div class="bar" style="margin-top:4px"><span class="sub">الأعمدة اللي فهمتها (غيّرها لو غلط):</span>${colSel('ph','الرقم')}${colSel('date','التاريخ')}${colSel('time','الساعة')}${colSel('type','النوع')}${colSel('dur','المدة')}</div>`:''}</div>`;
  if(!all.length)return h+`<div class="card" style="margin-top:12px">⏳ التسجيل بيبدأ من أول سحب جاي (11 الصبح). ارفع ملفات مكالمات من بعد كده — قبل كده مفيش تأكيدات متسجلة تتقارن.</div>`;
  const pc_=(a,f)=>a.length?pc(a.filter(f).length/a.length):'—';
  h+=`<div class="grid g4" style="margin-top:12px">${kpi('اتأكدوا (من غير اللي اتحجزوا مؤكد)',chk.length,C.length-chk.length?`+ ${C.length-chk.length} اتحجزوا «مؤكد» وقت الحجز`:'')}
    ${kpi('⚡ اتأكدوا بالجملة',pc_(chk,c=>c.bulk),'5 أو أكتر في 3 دقايق',chk.some(c=>c.bulk)?'down':'')}
    ${kpi('✅ مكالمة اترد عليها',J.length?pc_(J,c=>c.cat==='ok'):'ارفع الملفات',J.length?J.length+' اتقارنوا بالمكالمات':'')}
    ${kpi('❌ من غير مكالمة اترد عليها',J.length?pc_(J,c=>c.cat!=='ok'):'—','',J.length&&J.filter(c=>c.cat!=='ok').length/J.length>0.2?'down':'')}</div>`;
  // قراية
  const L=[];if(J.length){const bad=J.filter(c=>c.cat!=='ok');L.push(`من ${J.length} تأكيد في فترة الملفات: <b>${J.filter(c=>c.cat==='ok').length}</b> قبلهم مكالمة اترد عليها، و<b class="down">${bad.length}</b> لأ (${J.filter(c=>c.cat==='none').length} مفيش أي مكالمة للرقم خالص، ${J.filter(c=>c.cat==='tried').length} اتصلوا وما ردش ومع ذلك اتعلّم مؤكد).`);
    const r=(a,s)=>a.length?a.filter(c=>c.res===s).length/a.length:null,ok=J.filter(c=>c.cat==='ok'&&c.res!=='لسه'&&c.res!=='—'),nb=bad.filter(c=>c.res!=='لسه'&&c.res!=='—');
    if(ok.length>=10&&nb.length>=10)L.push(`اللي اتأكدوا بمكالمة: ما جاش أو اعتذر ${pc((r(ok,'ما جاش')||0)+(r(ok,'اعتذر')||0))} · اللي من غير مكالمة: ${pc((r(nb,'ما جاش')||0)+(r(nb,'اعتذر')||0))}${(r(nb,'ما جاش')||0)+(r(nb,'اعتذر')||0)>(r(ok,'ما جاش')||0)+(r(ok,'اعتذر')||0)+0.05?' — <b class="down">التأكيد من غير مكالمة مش بيحمي الموعد</b>':''}.`)}
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
  h+=`<div class="grid g2" style="margin-top:12px">
   <div class="card"><h3>حسب المسئولة عن التأكيد<small>من خطة اليوم</small></h3>${tableHTML(['',{t:'تأكيدات',n:1},{t:'✅ بمكالمة',n:1},{t:'📵 ما ردش',n:1},{t:'❌ مفيش مكالمة',n:1},{t:'⚡ بالجملة',n:1},{t:'ما جاش/اعتذر',n:1}],wRows,{h:340})}</div>
   <div class="card"><h3>كل يوم</h3>${tableHTML(['يوم التأكيد',{t:'تأكيدات',n:1},{t:'⚡ بالجملة',n:1},{t:'✅ بمكالمة',n:1}],dRows,{h:340})}</div>
   ${bRows.length?`<div class="card" style="grid-column:1/-1"><h3>⚡ تأكيد بالجملة<small>5 مواعيد أو أكتر اتعلّم عليهم مؤكد في 3 دقايق</small></h3>${tableHTML(['الوقت','الفرع',{t:'مواعيد',n:1},'المسئولة'],bRows,{h:300})}</div>`:''}
   ${sus.length?`<div class="card" style="grid-column:1/-1"><h3>المواعيد المشكوك فيها<small>${sus.length}</small></h3>${tableHTML(['اتأكد','المريض','الموعد','المسئولة','','المكالمات','مكالمات الرقم قبلها','النتيجة'],sus,{h:420})}</div>`:''}
  </div>`;
  return h}
function cConf(){const f=$('#cfF');if(f)f.onchange=e=>{const fs=[...e.target.files];if(fs.length){$('#cfMsg').textContent='بيقرا الملفات…';cfLoad(fs)}};
  const c=$('#cfClr');if(c)c.onclick=()=>{CF.calls=[];CF.files=[];CF.map=null;CF.idx=null;CF.minT=CF.maxT=null;render()};
  document.querySelectorAll('[data-cfc]').forEach(s=>s.onchange=()=>{CF.map[s.dataset.cfc]=+s.value;$('#cfMsg').textContent='ارفع الملفات تاني بعد تعديل الأعمدة';CF.calls=[];CF.files=[];CF.idx=null;render()})}
VIEWS.conf=[vConf,cConf];
