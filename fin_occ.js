// BODYFIX — «🩺 الإشغال»: الطاقة = ساعات وجود الدكتور من البصمة (Medicolize ← Logs ← Attendance) × جلسة في الساعة.
// الإشغال = الجلسات المكتملة اللي عملها في ساعات البصمة ÷ ساعات البصمة.
'use strict';
const OC={};try{OC.sph=+(localStorage.getItem('fin_oc_sph')||1)||1}catch(e){OC.sph=1}
const ocN=s=>nAr(String(s||'')).replace(/^(dr|د)\.?\s+/i,'').replace(/\s+/g,' ').trim().toLowerCase();
const ocWall=iso=>{if(!iso)return null;const d=new Date(iso);if(isNaN(d))return null;const s=d.toLocaleString('sv-SE',{timeZone:'Africa/Cairo',hour12:false});return Date.parse(s.replace(' ','T')+'Z')};
const ocDay=t=>new Date(t).toISOString().slice(0,10),ocHr=t=>new Date(t).getUTCHours()+new Date(t).getUTCMinutes()/60;
// 📌 شيت التثبيتات (مواعيد شيفت كل دكتور لكل يوم + المرضى المتثبتين) — نفس شيتات الداشبورد
const OC_SH={haram:'https://script.google.com/macros/s/AKfycbx2zEjS2Bk3IT9NAQgounmv_YRNGCNvbgqt5sxkyVjkIlGbprO69rA3CmSdoqu_V3j_/exec',dokki:'https://script.google.com/macros/s/AKfycbyAW7vO8RLqdUccJwn_7Pz1rXSwYwqt5D-dTezRuNBEll28CdqXKUuXxQzkrHgAa3De/exec'};
function ocJsonp(url,timeout){return new Promise((res,rej)=>{const cb='_oc'+Date.now()+Math.floor(Math.random()*1e6),sc=document.createElement('script');let done=false;
  const end=(ok,v)=>{if(done)return;done=true;clearTimeout(t);try{sc.remove()}catch(e){}delete window[cb];ok?res(v):rej(v)};const t=setTimeout(()=>end(false,new Error('timeout')),timeout||30000);
  window[cb]=d=>end(true,d);sc.onerror=()=>end(false,new Error('net'));sc.src=url+'?action=getData&callback='+cb+'&t='+Date.now();document.head.appendChild(sc)})}
async function ocLoadSched(){if(OC.schTry)return;OC.schTry=true;const out={haram:[],dokki:[]},err=[];
  try{OC.dmap=await (await fetch('data/doc_map.json?v='+Date.now())).json()}catch(e){OC.dmap={}}
  await Promise.all(Object.entries(OC_SH).map(async([b,u])=>{try{const d=await ocJsonp(u);out[b]=(d&&d.doctors)||[]}catch(e){err.push(BRN[b])}}));
  OC.sched=out;OC.schErr=err;OC.c=null;if(S.tab==='occ')render()}
const OC_WD={sun:0,mon:1,tue:2,wed:3,thu:4,sat:6};const ocT=x=>{const p=String(x||'').trim().split(':');let n=parseInt(p[0]);if(!isFinite(n))return null;if(n<12)n+=12;return n+(+(p[1]||0))/60};
function ocSchedFor(name,b){const S0=OC.sched;if(!S0)return null;const ar=(OC.dmap||{})[name]||Object.entries(OC.dmap||{}).find(([k])=>k.toLowerCase()===String(name).toLowerCase())?.[1];
  const n1=ocN(name),n2=ar?ocN(ar):'';const L=b==='both'?[...S0.haram,...S0.dokki]:(S0[b]||[]);
  const d=L.find(x=>{const dn=ocN(x.name);return dn&&(dn===n1||dn===n2||(n1.length>3&&(dn.includes(n1)||n1.includes(dn)))||(n2.length>3&&(dn.includes(n2)||n2.includes(dn))))});if(!d)return null;
  const w={};for(const k in (d.days||{})){const p=String(d.days[k]||'').replace(/ /g,'').split('-');if(p.length!==2)continue;const a=ocT(p[0]),e=ocT(p[1]);if(a!=null&&e!=null&&e>a&&OC_WD[k]!=null)w[OC_WD[k]]=[a,e]}
  const sl=Object.values(d.slots||{});const filled=sl.filter(x=>x&&x.patient&&x.patient!=='-'&&x.patient!=='—').length;return {w,slots:sl.length,filled}}
// البصمات
function ocShifts(){if(OC.sh)return OC.sh;const T=(RAW.kinds&&RAW.kinds.att)||{},rows=[];
  for(const b in T)for(const m in T[b]){const t=T[b][m];if(!t||!t.cols)continue;const ci=n=>t.cols.indexOf(n);const I={cr:ci('createdAt'),up:ci('updatedAt'),du:ci('duration'),u:ci('user.name'),br:ci('branch.name'),ap:ci('approved')};
    for(const r of t.rows)rows.push({cr:r[I.cr],up:r[I.up],du:I.du>=0?+r[I.du]:NaN,u:r[I.u],br:I.br>=0?r[I.br]:'',bk:b})}
  // وحدة المدة: ساعات / دقايق / ثواني / ملي ثانية — من القيم نفسها
  const dv=rows.map(r=>r.du).filter(x=>isFinite(x)&&x>0).sort((a,b)=>a-b),med=dv.length?dv[dv.length>>1]:0;
  const unit=med<=24?3600e3:med<=1440?60e3:med<=86400?1e3:1;const uName={3600000:'ساعات',60000:'دقايق',1000:'ثواني',1:'ملي ثانية'}[unit];
  const out=[];for(const r of rows){const s=ocWall(r.cr);if(s==null)continue;let e=null,src='';
    if(isFinite(r.du)&&r.du>0){e=s+r.du*unit;src='duration'}else{const u=ocWall(r.up);if(u&&u-s>15*60e3&&u-s<16*3600e3){e=u;src='updatedAt'}}
    const b=/FIX ?ZONE/i.test(r.br||'')?'dokki':/BODYFIX|center/i.test(r.br||'')?'haram':r.bk;
    out.push({u:r.u,n:ocN(r.u),b,s,e,src,ok:e!=null&&e-s>=30*60e3&&e-s<=16*3600e3,d:ocDay(s)})}
  return OC.sh={list:out,unit:uName,med}}
function ocCalc(){const key=S.b+'|'+S.from+'|'+S.to+'|'+OC.sph;if(OC.c&&OC.c.key===key)return OC.c;const {list,unit}=ocShifts();
  const A=D.apt.filter(a=>inB(a)&&a.st==='Completed'&&a.doc&&a.doc!==PAST_DOC&&nIn(a.k,S.from,S.to));
  const docs={};A.forEach(a=>{const n=ocN(a.doc);(docs[n]=docs[n]||{name:a.doc,n,ses:[]}).ses.push(a)});
  // ربط اسم البصمة باسم الدكتور: مطابق، أو أول كلمتين
  const byN={};list.forEach(x=>{if(!x.n)return;let k=docs[x.n]?x.n:Object.keys(docs).find(d=>d.split(' ').slice(0,2).join(' ')===x.n.split(' ').slice(0,2).join(' '));if(k)(byN[k]=byN[k]||[]).push(x)});
  const H={};const cell=(w,h)=>{const k=w+'|'+h;return H[k]=H[k]||{cap:0,ses:0}};const M={};const mm=k=>M[k]=M[k]||{cap:0,ses:0,out:0};
  const R=[];
  for(const n in docs){const D0=docs[n],sh=(byN[n]||[]).filter(x=>(S.b==='both'||x.b===S.b)&&nIn(x.d.slice(0,7),S.from,S.to));const shOk=sh.filter(x=>x.ok);
    const byDay={};shOk.forEach(x=>(byDay[x.d]=byDay[x.d]||[]).push(x));let cap=0,inS=0,outS=0,noFp=0,noFpDays=new Set(),broken=sh.length-shOk.length;
    shOk.forEach(x=>{const hrs=(x.e-x.s)/3600e3;cap+=hrs*OC.sph;mm(x.d.slice(0,7)).cap+=hrs*OC.sph;const w=new Date(x.s).getUTCDay();for(let t=Math.floor(ocHr(x.s));t<Math.ceil(ocHr(x.e));t++){const a=Math.max(ocHr(x.s),t),b=Math.min(ocHr(x.e),t+1);if(b>a)cell(w,t).cap+=(b-a)*OC.sph}});
    D0.ses.forEach(a=>{const L=byDay[a.d];const h=a.h+(a.mi||0)/60;const k=a.k;
      if(!L){noFp++;noFpDays.add(a.d);return}
      if(L.some(x=>h>=ocHr(x.s)-0.25&&h<ocHr(x.e)+0.25)){inS++;mm(k).ses++;cell(a.w,a.h).ses++}else{outS++;mm(k).out++}});
    // 📌 مقارنة بالتثبيت
    const sc=ocSchedFor(D0.name,S.b);let sH=0,sDays=0,abs=0,extra=0,late=[],early=0,sSes=0;
    if(sc){const fpD={};shOk.forEach(x=>(fpD[x.d]=fpD[x.d]||[]).push(x));const sesD={};D0.ses.forEach(a=>(sesD[a.d]=sesD[a.d]||[]).push(a));const td=todayC();
      for(const k of monthsList(S.from,S.to)){const y=+k.slice(0,4),m=+k.slice(5,7);for(let dd=1;dd<=31;dd++){const day=new Date(Date.UTC(y,m-1,dd));if(day.getUTCMonth()!==m-1)break;const iso=day.toISOString().slice(0,10);if(iso>=td)break;
        const r=sc.w[day.getUTCDay()],f=fpD[iso];
        if(r){sDays++;sH+=r[1]-r[0];(sesD[iso]||[]).forEach(a=>{if(a.h>=r[0]-0.25&&a.h<r[1])sSes++});
          if(!f&&!(sesD[iso]||[]).length)abs++;
          if(f){const st=Math.min(...f.map(x=>ocHr(x.s))),en=Math.max(...f.map(x=>ocHr(x.e)));if(st>r[0]+10/60)late.push((st-r[0])*60);if(en<r[1]-10/60)early++}}
        else if(f)extra++}}}
    R.push({sched:!!sc,sH:sH*OC.sph,sDays,abs,extra,lateN:late.length,lateAvg:late.length?late.reduce((a,b)=>a+b,0)/late.length:null,early,sSes,slots:sc?sc.slots:0,filled:sc?sc.filled:0,
      name:D0.name,fp:!!byN[n],days:Object.keys(byDay).length,hrs:shOk.reduce((s,x)=>s+(x.e-x.s)/3600e3,0),cap,inS,outS,noFp,noFpDays:noFpDays.size,broken,occ:cap?inS/cap:null,idle:Math.max(0,cap-inS)})}
  R.sort((a,b)=>b.cap-a.cap);const T={cap:0,inS:0,outS:0,noFp:0,sH:0,sSes:0,abs:0};R.forEach(r=>{T.cap+=r.cap;T.inS+=r.inS;T.outS+=r.outS;T.noFp+=r.noFp;T.sH+=r.sH;T.sSes+=r.sSes;T.abs+=r.abs});
  return OC.c={key,R,T,H,M,unit,has:list.length>0}}
function vOcc(){if(!OC.schTry)ocLoadSched();const c=ocCalc();if(!c.has)return `<div class="card">⏳ بيانات البصمة (Logs ← Attendance) لسه بتتسحب — جرّب بعد السحب الجاي.</div>`;
  const {R,T,H,M}=c,occ=T.cap?T.inS/T.cap:null;const fpR=R.filter(r=>r.fp&&r.cap>0);
  const L=[];
  L.push(`في ${ml(S.from)}–${ml(S.to)}: الدكاترة كانوا موجودين بالبصمة <b>${fm(T.cap/OC.sph)} ساعة</b> = طاقة ${fm(T.cap)} جلسة، واتعمل فيها <b>${fm(T.inS)}</b> جلسة مكتملة → <b>الإشغال ${pc(occ)}</b>. يعني حوالي <b class="${occ<0.6?'down':''}">${fm(Math.max(0,T.cap-T.inS))} ساعة دكتور فاضية</b>.`);
  const lo=fpR.filter(r=>r.cap>=40).sort((a,b)=>a.occ-b.occ);if(lo.length>1)L.push(`أقل إشغال: <b>${esc(lo[0].name)}</b> ${pc(lo[0].occ)} (${fm(lo[0].idle)} ساعة فاضية) · أعلى: <b>${esc(lo[lo.length-1].name)}</b> ${pc(lo[lo.length-1].occ)}.`);
  if(T.outS)L.push(`<b class="down">${fm(T.outS)} جلسة متسجلة على دكتور في وقت ما كانش باصم فيه</b> — يا إما غلط في تسجيل الدكتور/الساعة، يا إما بصمة ناقصة.`);
  if(T.noFp)L.push(`${fm(T.noFp)} جلسة لدكاترة في أيام ما فيهاش بصمة خالص — مش داخلين في الإشغال (الجدول بيوضح مين).`);
  const busy=Object.entries(H).filter(([k,z])=>z.cap>=8).map(([k,z])=>({k,z,o:z.ses/z.cap}));if(busy.length){const s=busy.slice().sort((a,b)=>b.o-a.o);const f=x=>{const [w,h]=x.k.split('|');return DAYS[+w]+' '+((+h)%12||12)+(+h<12?'ص':'م')};
    L.push(`أزحم وقت: <b>${f(s[0])}</b> (${pc(s[0].o)}) · أفضى وقت: <b>${f(s[s.length-1])}</b> (${pc(s[s.length-1].o)}) — الأفضى ده ممكن يقل فيه عدد الدكاترة أو يتملى بمتابعات/عروض.`)}
  const rows=R.filter(r=>r.cap||r.inS||r.noFp).map(r=>[esc(r.name)+(r.fp?'':' <span class="sub">(مالوش بصمة)</span>'),r.days,fm(r.hrs,1),fm(r.inS),r.occ==null?'—':`<b class="${r.occ<0.6?'down':r.occ>0.95?'up':''}">${pc(r.occ)}</b>`,fm(r.idle),r.outS,r.noFp?`${r.noFp} (${r.noFpDays} يوم)`:'',r.broken||'']);
  const hrs=[...new Set(Object.keys(H).map(k=>+k.split('|')[1]))].sort((a,b)=>a-b),wds=[6,0,1,2,3,4,5].filter(w=>hrs.some(h=>H[w+'|'+h]));
  const heat=wds.map(w=>[DAYS[w]].concat(hrs.map(h=>{const z=H[w+'|'+h];if(!z||z.cap<1)return '';const o=z.ses/z.cap;return `<span style="display:block;text-align:center;border-radius:4px;padding:2px;background:rgba(${o>=0.85?'40,180,120':o>=0.6?'230,170,40':'230,80,80'},${Math.min(0.85,0.2+o*0.6)})">${Math.round(o*100)}%</span>`})));
  return `<div class="card"><h3>🩺 الإشغال الفعلي للدكاترة<small>${BRN[S.b]} · ${ml(S.from)}–${ml(S.to)} · من البصمة</small></h3>
   <div class="bar"><label class="sub">جلسات في الساعة للدكتور <input id="ocSph" type="number" min="0.5" max="4" step="0.5" value="${OC.sph}" style="width:60px"></label><span class="sub">الطاقة = ساعات البصمة (من الدخول للخروج) × ده · الإشغال = الجلسات المكتملة في ساعات البصمة ÷ الطاقة · مدة البصمة متسجلة بالـ${c.unit||'—'}</span></div>
   <div class="grid g4">${kpi('الإشغال',pc(occ),'',occ!=null&&occ<0.6?'down':'')}${kpi('ساعات دكاترة (بصمة)',fm(T.cap/OC.sph))}${kpi('جلسات في ساعات البصمة',fm(T.inS))}${kpi('ساعات فاضية',fm(Math.max(0,T.cap-T.inS)),'',T.cap-T.inS>0?'down':'')}</div>
   <h3 style="margin-top:12px">📖 القراية</h3><ul class="ins">${L.map(x=>`<li>${x}</li>`).join('')}</ul>
   <div class="card" style="margin-top:10px"><h3>الإشغال كل شهر</h3><div class="ch"><canvas id="oc1"></canvas></div></div></div>
  <div class="card" style="margin-top:12px"><h3>كل دكتور</h3>${tableHTML(['الدكتور',{t:'أيام بصمة',n:1},{t:'ساعات',n:1},{t:'جلسات',n:1},{t:'الإشغال',n:1},{t:'ساعات فاضية',n:1},{t:'جلسات برة البصمة',n:1},{t:'جلسات في أيام من غير بصمة',n:1},{t:'بصمات ناقصة',n:1}],rows,{h:460})}
   <div class="note">«بصمات ناقصة» = دخول من غير خروج (أو مدة أقل من نص ساعة / أكتر من 16 ساعة) — مش داخلة في الحساب.</div></div>
  ${ocSchedV(c)}
  <div class="card" style="margin-top:12px"><h3>الإشغال حسب اليوم والساعة<small>جلسات ÷ ساعات الدكاترة الموجودين بالبصمة</small></h3>${tableHTML(['اليوم'].concat(hrs.map(h=>(h%12||12)+(h<12?'ص':'م'))),heat,{h:340})}</div>`}
function ocSchedV(c){if(!OC.sched)return `<div class="card" style="margin-top:12px">📌 بيحمّل شيت التثبيتات…</div>`;
  const R=c.R.filter(r=>r.sched&&(r.sH||r.cap));const T=c.T;if(!R.length)return `<div class="card" style="margin-top:12px">📌 ما لقيتش الدكاترة في شيت التثبيتات${OC.schErr.length?' (ما اتحملش: '+OC.schErr.join('، ')+')':''}.</div>`;
  const oS=T.sH?T.sSes/T.sH:null,oF=T.cap?T.inS/T.cap:null,fpH=R.reduce((s,r)=>s+r.hrs,0),sH=R.reduce((s,r)=>s+r.sH/OC.sph,0);
  const L=[];L.push(`حسب شيت التثبيتات الدكاترة المفروض يكونوا موجودين <b>${fm(sH)} ساعة</b>، والبصمة بتقول اتواجدوا <b>${fm(fpH)} ساعة</b> (${fpH>=sH?'+':''}${fm(fpH-sH)}).`);
  L.push(`الإشغال على مواعيد التثبيت <b>${pc(oS)}</b> · على ساعات البصمة <b>${pc(oF)}</b>.`);
  const ab=R.filter(r=>r.abs>=2).sort((a,b)=>b.abs-a.abs);if(ab.length)L.push(`<b class="down">أيام متثبت فيها ومفيش بصمة ولا جلسات:</b> ${ab.slice(0,5).map(r=>`${esc(r.name)} (${r.abs})`).join('، ')}.`);
  const lt=R.filter(r=>r.lateN>=3).sort((a,b)=>b.lateN-a.lateN);if(lt.length)L.push(`<b>تأخير عن ميعاد التثبيت (أكتر من 10 دقايق):</b> ${lt.slice(0,5).map(r=>`${esc(r.name)} ${r.lateN} مرة، متوسط ${Math.round(r.lateAvg)} د`).join('، ')}.`);
  const ea=R.filter(r=>r.early>=3).sort((a,b)=>b.early-a.early);if(ea.length)L.push(`<b>خرج قبل ميعاد التثبيت:</b> ${ea.slice(0,5).map(r=>`${esc(r.name)} ${r.early} مرة`).join('، ')}.`);
  const rows=R.map(r=>[esc(r.name),fm(r.sH/OC.sph,1),fm(r.hrs,1),`<span class="${r.hrs<r.sH/OC.sph-1?'down':''}">${r.hrs-r.sH/OC.sph>=0?'+':''}${fm(r.hrs-r.sH/OC.sph,1)}</span>`,r.abs||'',r.extra||'',r.lateN?`${r.lateN} (${Math.round(r.lateAvg)} د)`:'',r.early||'',r.sH?pc(r.sSes/r.sH):'—',r.occ==null?'—':pc(r.occ),r.slots?`${r.filled}/${r.slots}`:'']);
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--acc)"><h3>📌 التثبيت مقابل البصمة<small>مواعيد كل دكتور من شيت التثبيتات (الجدول الحالي) قصاد بصمته الفعلية</small></h3>
   <ul class="ins">${L.map(x=>`<li>${x}</li>`).join('')}</ul>
   ${tableHTML(['الدكتور',{t:'ساعات التثبيت',n:1},{t:'ساعات البصمة',n:1},{t:'الفرق',n:1},{t:'غياب (متثبت ومفيش بصمة)',n:1},{t:'أيام زيادة',n:1},{t:'تأخير',n:1},{t:'خرج بدري',n:1},{t:'إشغال على التثبيت',n:1},{t:'إشغال على البصمة',n:1},{t:'مرضى متثبتين/خانات',n:1}],rows,{h:420})}
   <div class="note">شيت التثبيتات فيه الجدول <b>الحالي</b> بس، فالمقارنة أدق للشهور القريبة. «غياب» = يوم الدكتور متثبت فيه ومفيش بصمة ولا جلسات (ممكن يكون إجازة أو إذن متسجل في شيت الغيابات). «إشغال على التثبيت» = جلساته جوه مواعيد التثبيت ÷ ساعات التثبيت.</div></div>`}
function cOcc(){const i=$('#ocSph');if(i)i.onchange=()=>{OC.sph=+i.value||1;try{localStorage.setItem('fin_oc_sph',OC.sph)}catch(e){}render()};
  const c=ocCalc();if(!c.has)return;const ks=Object.keys(c.M).sort();chart('oc1',{data:{labels:ks.map(mls),datasets:[bar('الإشغال %',ks.map(k=>c.M[k].cap?+(100*c.M[k].ses/c.M[k].cap).toFixed(1):null),SER()[0])]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>{const m=c.M[ks[x.dataIndex]];return ' '+x.parsed.y+'% — '+fm(m.ses)+' جلسة من '+fm(m.cap)}}}},scales:{y:{min:0,ticks:{callback:v=>v+'%'}}}}})}
VIEWS.occ=[vOcc,cOcc];
