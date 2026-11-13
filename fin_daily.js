// BODYFIX — الملخص اليومي (بيتقري آخر اليوم): أداء اليوم في الفرعين + المشاكل اللي لسه مفتوحة (بتتقفل لوحدها).
// الملخص القديم (الترشيحات والقرايات) بقى تاب «📋 الصورة الكاملة».
'use strict';
VIEWS.full=VIEWS.sum;
const DY={day:''};
const dyDay=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const dyAge=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const dyLost=s=>/cancel|no ?show/i.test(s),dyOpen=s=>/open|confirm|booked|pending/i.test(s);
const dyBrs=()=>['haram','dokki'].filter(b=>D.apt.some(a=>a.b===b));
const dyFmtD=d=>new Date(d+'T12:00:00Z').toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long'});
function dyNames(){if(D._dyNM)return D._dyNM;const NM={};for(const x of D.inv)if(x.pid&&x.pn)NM[x.pid]=x.pn;for(const x of D.pay)if(x.pid&&x.pn&&!NM[x.pid])NM[x.pid]=x.pn;return D._dyNM=NM}
function dyByPid(b){D._dyP=D._dyP||{};if(D._dyP[b])return D._dyP[b];const by={};D.apt.forEach(a=>{if(a.b===b&&a.pid)(by[a.pid]=by[a.pid]||[]).push(a)});return D._dyP[b]=by}
// ---------- أرقام يوم ----------
function dyM(b,T){return withB(b,()=>{const pay=D.pay.filter(p=>p.d===T&&inB(p)&&!p.bal),apt=D.apt.filter(a=>a.d===T&&inB(a));
  const done=apt.filter(a=>a.st==='Completed'),lost=apt.filter(a=>dyLost(a.st));const P=ptIndex();let np=0;for(const id in P)if(P[id].first===T&&!P[id].early)np++;
  const by=dyByPid(b);const ex=done.filter(a=>/كشف/.test(tName(a.type)+' '+a.type));const exB=ex.filter(a=>(by[a.pid]||[]).some(x=>x.d>T&&x.cr&&x.cr<=T&&!/كشف/.test(tName(x.type))));
  return {rev:pay.reduce((s,p)=>s+p.amt,0),ses:done.length,booked:apt.length,lost:lost.length,canc:apt.length?lost.length/apt.length:null,np,ex:ex.length,exB:exB.length,exR:ex.length?exB.length/ex.length:null}})}
const DYM=[['rev','الإيراد (التحصيل)','n',1],['ses','الجلسات اللي اتعملت','n',1],['canc','الإلغاء والغياب','r',-1],['np','مرضى جداد','n',1],['exR','كشوفات اتحجزلها قبل ما تمشي','r',1]];
function dyCmp(b,T){const t=dyM(b,T),w=[7,14,21,28].map(n=>dyM(b,dyDay(T,-n))).filter(x=>x.booked>0),ly=dyM(b,dyDay(T,-364));
  const avg=k=>{const v=w.map(x=>x[k]).filter(x=>x!=null);return v.length?v.reduce((a,c)=>a+c,0)/v.length:null};return {t,avg:Object.fromEntries(DYM.map(([k])=>[k,avg(k)])),ly:ly.booked?ly:null,nW:w.length}}
const dyCh=(a,b,ty)=>a==null||b==null?null:ty==='r'?a-b:(b?(a-b)/Math.abs(b):null);
function dyArrow(v,ty,good,label){if(v==null)return '';const big=ty==='r'?Math.abs(v)>=0.05:Math.abs(v)>=0.1;const g=(v>=0)===(good>0);
  const s=ty==='r'?(Math.abs(v)*100).toFixed(0)+' نقطة':pc(Math.abs(v));return `<span class="${big?(g?'up':'down'):'sub'}">${label} ${v>=0?'▲':'▼'} ${s}</span>`}
// ---------- المشاكل المفتوحة (لحد يوم T) ----------
function dyStreak(b,T){const by=dyByPid(b),NM=dyNames(),out=[];
  for(const pid in by){const days={};by[pid].forEach(a=>{if(a.d<=T)(days[a.d]=days[a.d]||[]).push(a)});const ds=Object.keys(days).sort().reverse();let n=0,first=null,last=null;const miss=[];
    for(const d of ds){const l=days[d];if(l.some(a=>a.st==='Completed'))break;if(l.every(a=>dyLost(a.st))){n++;first=d;miss.push(d);if(!last)last=d}else if(d===T)continue;else break}
    if(n>=2&&dyAge(last,T)<=14){const second=miss[miss.length-2];out.push({pid,n:NM[pid]||'',age:dyAge(second,T),x:n+' مرات ورا بعض'})}}
  return out}
function dyExams(b,T){const by=dyByPid(b),NM=dyNames(),out=[];
  for(const pid in by){const L=by[pid];L.filter(a=>a.st==='Completed'&&a.d<T&&a.d>=dyDay(T,-14)&&/كشف/.test(tName(a.type)+' '+a.type)).forEach(e=>{
    if(L.some(x=>x.d>e.d&&x.cr&&x.cr<=T&&!dyLost(x.st)&&x!==e&&!/كشف/.test(tName(x.type))))return;if(!out.some(o=>o.pid===pid))out.push({pid,n:NM[pid]||'',age:dyAge(e.d,T),x:'كشف '+e.d.slice(8,10)+'/'+e.d.slice(5,7)})})}
  return out}
function dyNewGone(b,T){const by=dyByPid(b),NM=dyNames(),P=withB(b,()=>ptIndex()),out=[];
  for(const pid in P){const p=P[pid];if(p.early||p.first<dyDay(T,-30)||p.first>dyDay(T,-7))continue;const L=by[pid]||[];
    if(L.some(a=>a.st==='Completed'&&a.d>p.first&&a.d<=T))continue;if(L.some(a=>a.d>T&&a.cr&&a.cr<=T&&!dyLost(a.st)))continue;out.push({pid,n:NM[pid]||p.n||'',age:dyAge(p.first,T),x:'أول زيارة '+p.first.slice(8,10)+'/'+p.first.slice(5,7)})}
  return out}
function dyPtVal(b){D._dyV=D._dyV||{};if(D._dyV[b]!=null)return D._dyV[b];const T=todayC(),a=dyDay(T,-90);return D._dyV[b]=withB(b,()=>{const pay=D.pay.filter(p=>inB(p)&&!p.bal&&p.d>=a&&p.d<=T),pts=new Set(D.apt.filter(x=>inB(x)&&x.st==='Completed'&&x.d>=a).map(x=>x.pid));return pts.size?pay.reduce((s,p)=>s+p.amt,0)/pts.size/3:0})}
function dyIdle(b,T){if(typeof ocShifts!=='function')return null;const {list}=ocShifts();const d1=dyDay(T,-7),d2=dyDay(T,-1);const sh=list.filter(x=>x.ok&&x.b===b&&x.d>=d1&&x.d<=d2);if(sh.length<5)return null;
  const A=D.apt.filter(a=>a.b===b&&a.st==='Completed'&&a.d>=d1&&a.d<=d2&&a.doc&&a.doc!==PAST_DOC);const docs={};A.forEach(a=>{const n=ocN(a.doc);(docs[n]=docs[n]||{name:a.doc,ses:[]}).ses.push(a)});
  const R=[];for(const n in docs){const S0=sh.filter(x=>x.n===n||x.n.split(' ').slice(0,2).join(' ')===n.split(' ').slice(0,2).join(' '));if(!S0.length)continue;const cap=S0.reduce((s,x)=>s+(x.e-x.s)/3600e3,0)*(OC.sph||1);
    const inS=docs[n].ses.filter(a=>S0.some(x=>x.d===a.d&&a.h>=ocHr(x.s)-0.25&&a.h<ocHr(x.e)+0.25)).length;R.push({name:docs[n].name,cap,inS,idle:Math.max(0,cap-inS),occ:cap?inS/cap:null})}
  const cap=R.reduce((s,r)=>s+r.cap,0),inS=R.reduce((s,r)=>s+r.inS,0);return {occ:cap?inS/cap:null,idle:Math.max(0,cap-inS),R:R.sort((a,b)=>b.idle-a.idle)}}
function dyProblems(T){const out=[],Y=dyDay(T,-1);
  for(const b of dyBrs()){const v=dyPtVal(b);
    const P=[['streak','بيلغوا ورا بعض (مرتين أو أكتر ومجوش بعدها)',dyStreak,'الاستقبال','apt'],['exam','عملوا كشف وما اتحجزلهمش (آخر 14 يوم)',dyExams,'الاستقبال','apt'],['newg','مرضى جداد ما رجعوش ومالهمش ميعاد (أول زيارة من 7–30 يوم)',dyNewGone,'الاستقبال + الدكتور','cen']];
    for(const [id,t,fn,own,tab] of P){const now=fn(b,T),yd=fn(b,Y),nowK=new Set(now.map(x=>x.pid)),solved=yd.filter(x=>!nowK.has(x.pid)).length;
      if(now.length||solved)out.push({id,b,t,own,tab,items:now.sort((a,c)=>c.age-a.age),n:now.length,prev:yd.length,solved,old:now.length?Math.max(...now.map(x=>x.age)):0,val:now.length*v})}
    // 💸 خدمات اتعملت (خطوة Completed في Operation Steps) ومتدفعتش — نفس حساب تاب المراجعة (data/audit.json)
    {const NM=dyNames(),A=D._aud,AB={'BODYFIX Center':'haram','FIX ZONE':'dokki'},CALL=/متابع|انقطاع|منقطع|استرداد|ملاحظ|تقييم الجلسه|اتصال|مكالم/;
     const nrm=t=>String(t||'').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/\s+/g,' ').trim();
     if(A){const debts=(A.debts||[]).filter(d=>AB[d.b]===b&&d.d&&d.d<=T),seen={};
       (A.appts||[]).concat((A.steps||[]).filter(x=>x.st==='COMPLETED')).forEach(a=>{if(AB[a.b]===b&&a.d&&a.d<=T&&!CALL.test(a.s||''))(seen[a.pid]=seen[a.pid]||new Set()).add(a.d)});
       const refBy={};Object.entries(NM).forEach(([r,n])=>{const k=nrm(n);if(!refBy[k])refBy[k]=r});const by=dyByPid(b);
       debts.forEach(d=>{const r=refBy[nrm(d.p)];if(r)(by[r]||[]).forEach(a=>{if(a.st==='Completed'&&a.d<=T)(seen[d.pid]=seen[d.pid]||new Set()).add(a.d)})});
       const bp={};debts.forEach(d=>(bp[d.pid]=bp[d.pid]||[]).push(d));const came=[],older=[],today=[];
       Object.entries(bp).forEach(([pid,L])=>{const first=L.map(d=>d.d).sort()[0],later=[...(seen[pid]||[])].filter(v=>v>first).length,rem=L.reduce((s,d)=>s+(+d.rem||0),0);if(rem<20)return;
         const it={n:L[0].p||'',age:dyAge(first,T),rem,x:`${[...new Set(L.map(d=>d.s))].join('، ').slice(0,60)} · ${L.length} خدمة · باقي ${fm(rem)} جنيه`+(later?` · حضر ${later} مرة بعدها`:'')};
         (later?came:first<T?older:today).push(it)});
       const add=(id,t,own,L,lvl)=>{if(!L.length)return;L.sort((a,c)=>c.age-a.age);out.push({id,b,t,own,tab:null,items:L.map(i=>({...i,age:id==='unpaidT'?null:i.age})),n:L.length,prev:null,solved:0,old:id==='unpaidT'?0:L[0].age,val:L.reduce((s,i)=>s+i.rem,0),lvl})};
       add('cameowe','🚨 حضر تاني وسايب خدمة اتعملت ومتدفعتش','الاستقبال + الحسابات',came,3);
       add('unpaid','💸 خدمة اتعملت ومتدفعتش (من يوم أو أكتر)','الاستقبال + الحسابات',older,2);
       add('unpaidT','💸 خدمة اتعملت النهارده ومتدفعتش','الاستقبال',today,2);
       if((A.to||'')>=T){const st=new Set((A.steps||[]).filter(x=>x.d===T&&x.st==='COMPLETED').map(x=>x.pid)),nos={};
         (A.appts||[]).forEach(a=>{if(AB[a.b]===b&&a.d===T&&!CALL.test(a.s||'')&&!st.has(a.pid)&&!nos[a.pid])nos[a.pid]={n:a.p||'',age:null,x:(a.s||'')+' · '+(a.dr||'')}});
         const L=Object.values(nos);if(L.length)out.push({id:'nostep',b,t:'🧾 حضر النهارده ومفيش خدمة اتسجلت اتعملت في العمليات',own:'الاستقبال',tab:null,items:L,n:L.length,prev:null,solved:0,old:0,val:0,lvl:1})}}
     // خصم كبير / دفعات اتردت النهارده
     {const big=D.inv.filter(x=>x.b===b&&x.d===T&&x.total>0&&x.disc/x.total>=0.3);if(big.length)out.push({id:'disc',b,t:'🏷️ خصم 30% أو أكتر النهارده',own:'المدير',tab:null,items:big.map(x=>({n:x.pn||NM[x.pid]||'',age:null,x:`خصم ${fm(x.disc)} من ${fm(x.total)} (${Math.round(x.disc/x.total*100)}%)`})),n:big.length,unit:'فاتورة',prev:null,solved:0,old:0,val:big.reduce((s,x)=>s+x.disc,0),lvl:1});
      const rf=D.pay.filter(p=>p.b===b&&p.d===T&&p.ref);if(rf.length)out.push({id:'refund',b,t:'↩️ دفعات اتردت النهارده',own:'المدير',tab:null,items:rf.map(p=>({n:p.pn||NM[p.pid]||'',age:null,x:fm(p.amt)+' جنيه'})),n:rf.length,unit:'دفعة',prev:null,solved:0,old:0,val:rf.reduce((s,p)=>s+p.amt,0),lvl:1})}}
    // ديون أقدم من 6 شهور
    {const I=D.inv.filter(x=>x.b===b),rem=x=>Math.max(0,x.total-x.disc-x.paid),old=I.filter(x=>rem(x)>1&&dyAge(x.d,T)>180),amt=old.reduce((s,x)=>s+rem(x),0);
      if(amt>0){const NM=dyNames(),byP={};old.forEach(x=>{const k=x.pid||x.pn;(byP[k]=byP[k]||{pid:x.pid,n:x.pn||NM[x.pid]||'',amt:0,d:x.d}).amt+=rem(x);if(x.d<byP[k].d)byP[k].d=x.d});
        out.push({id:'debt',b,t:'مديونيات أقدم من 6 شهور',own:'الحسابات',tab:'debt',items:Object.values(byP).sort((a,c)=>c.amt-a.amt).map(p=>({pid:p.pid,n:p.n,age:dyAge(p.d,T),x:fm(p.amt)+' جنيه'})),n:Object.keys(byP).length,prev:null,solved:0,old:Math.max(...old.map(x=>dyAge(x.d,T))),val:amt,money:amt})}}
    // دكاترة فاضيين (البصمة، آخر 7 أيام)
    try{const id_=dyIdle(b,T);if(id_&&id_.occ!=null&&id_.occ<0.6){const sp=withB(b,()=>{const a=grAgg(dyDay(T,-90),T);return a.avgS||0});
      out.push({id:'idle',b,t:`إشغال الدكاترة ${pc(id_.occ)} آخر 7 أيام (من البصمة)`,own:'المدير',tab:'occ',items:id_.R.filter(r=>r.idle>=3).map(r=>({n:r.name,age:null,x:`${fm(r.idle)} ساعة فاضية · إشغال ${pc(r.occ)}`})),n:Math.round(id_.idle),unit:'ساعة فاضية',prev:null,solved:0,old:null,val:id_.idle*sp})}}catch(e){console.error(e)}}
  // مهام خطة اليوم اللي ما اتعملتش (من شيت الطلبات)
  try{if(typeof cfSheet==='function'){if(!CF.sheet)cfSheet();const s=CF.sheet&&CF.sheet.sum&&CF.sheet.sum[T];if(s&&s.sec){const it=Object.entries(s.sec).map(([k,z])=>({n:k,age:null,x:`فاضل ${z.tot-z.done} من ${z.tot}`,left:z.tot-z.done})).filter(x=>x.left>0).sort((a,c)=>c.left-a.left);
    const left=it.reduce((a,c)=>a+c.left,0);if(left)out.push({id:'plan',b:'',t:'مهام خطة اليوم اللي ما اتعملتش',own:'السكرتارية',tab:null,items:it,n:left,prev:null,solved:0,old:null,val:0})}}}catch(e){console.error(e)}
  return out.sort((a,c)=>(c.lvl||1)-(a.lvl||1)||(c.val||0)-(a.val||0)||(c.old||0)-(a.old||0))}
// ---------- العرض ----------
function dyDefaultDay(){const t=todayC();for(let i=0;i<8;i++){const d=dyDay(t,-i);if(D.apt.some(a=>a.d===d&&a.st==='Completed'))return d}return t}
function vDaily(){if(!DY.day)DY.day=dyDefaultDay();const T=DY.day,brs=dyBrs(),now=new Date(),isToday=T===todayC();
  const C0={};brs.forEach(b=>C0[b]=dyCmp(b,T));
  const upd=RAW.todayAt||RAW.at;const ud=upd?new Date(upd):null;const updS=ud&&!isNaN(ud)?ud.toLocaleString('ar-EG',{weekday:'short',hour:'numeric',minute:'2-digit'}):(upd||'');
  // جملة لكل فرع
  const head=brs.map(b=>{const c=C0[b],r=dyCh(c.t.rev,c.avg.rev,'n'),s=dyCh(c.t.ses,c.avg.ses,'n');if(!c.t.booked)return `<b>${BRN[b]}</b>: مفيش مواعيد.`;
    const lvl=(r??0)+(s??0);const word=lvl>=0.15?'يوم أحسن من العادي':lvl<=-0.15?'يوم أقل من العادي':'يوم عادي';
    return `<b>${BRN[b]}</b>: ${word} — الإيراد ${dyArrow(r,'n',1,'')} والجلسات ${dyArrow(s,'n',1,'')} عن متوسط ${DAYS[new Date(T+'T12:00:00Z').getUTCDay()]} في آخر ${c.nW} أسابيع.`}).join('<br>');
  const rows=DYM.map(([k,t,ty,good])=>[t].concat(brs.map(b=>{const c=C0[b],v=c.t[k];const f=v==null?'—':ty==='r'?pc(v):fm(v);
    return `<b>${f}</b>${k==='ses'?` <span class="sub">من ${c.t.booked}</span>`:k==='exR'&&c.t.ex?` <span class="sub">(${c.t.exB} من ${c.t.ex})</span>`:''}<br>${[dyArrow(dyCh(v,c.avg[k],ty),ty,good,'عن العادي'),c.ly?dyArrow(dyCh(v,c.ly[k],ty),ty,good,'عن السنة اللي فاتت'):''].filter(Boolean).join(' · ')}`})));
  // الأسبوع والشهر
  const sat=dyDay(T,-((new Date(T+'T12:00:00Z').getUTCDay()+1)%7)),m1=T.slice(0,8)+'01';
  const per=(a1,a2,lbl)=>brs.map(b=>{const A=withB(b,()=>grAgg(a1,a2)),L=withB(b,()=>grAgg(dyDay(a1,-364),dyDay(a2,-364)));const L2=withB(b,()=>grAgg(String(+a1.slice(0,4)-1)+a1.slice(4),String(+a2.slice(0,4)-1)+a2.slice(4)));const LL=lbl==='الشهر'?L2:L;
    return `<b>${BRN[b]}</b>: ${fm(A.net)} جنيه · ${fm(A.sessions)} جلسة · ${fm(A.np)} مريض جديد ${LL.net?`<span class="sub">— قصاد نفس الفترة السنة اللي فاتت:</span> ${dyArrow(dyCh(A.net,LL.net,'n'),'n',1,'الإيراد')} ${dyArrow(dyCh(A.sessions,LL.sessions,'n'),'n',1,'الجلسات')} ${dyArrow(dyCh(A.np,LL.np,'n'),'n',1,'الجداد')}`:''}`}).join('<br>');
  // المشاكل
  const PB=dyProblems(T);const solved=PB.reduce((s,p)=>s+(p.solved||0),0);
  const BO=['haram','dokki',undefined,null,''];let lastB='#';
  const pb=PB.filter(p=>p.n>0).sort((a,c)=>BO.indexOf(a.b)-BO.indexOf(c.b)).map((p,i)=>{const hd=p.b!==lastB&&p.b?`<div style="margin-top:14px;padding:6px 10px;border-radius:8px;background:var(--card2,#eff6ff);font-weight:700">🏥 ${BRN[p.b]}${(()=>{const n=PB.filter(q=>q.b===p.b).reduce((s,q)=>s+(q.solved||0),0);return n?` <span class="up" style="font-weight:400">· ✓ اتحل ${n} من امبارح</span>`:''})()}</div>`:'';lastB=p.b;const tr=p.prev==null?'':p.n>p.prev?`<span class="down">▲ زادت (امبارح ${p.prev})</span>`:p.n<p.prev?`<span class="up">▼ قلّت (امبارح ${p.prev})</span>`:'<span class="sub">زي امبارح</span>';
    return hd+`<div class="card" style="margin-top:8px;border-inline-start:4px solid ${(p.lvl||1)>=2||p.old>7||p.id==='debt'?'var(--bad)':'var(--warn)'}">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${p.t}</b></div>${p.tab?`<button data-dyt="${p.tab}">افتح ←</button>`:''}</div>
      <div style="margin-top:4px"><b style="font-size:1.15em">${fm(p.n)}</b> ${p.unit||(p.id==='plan'?'مهمة':'مريض')} ${tr}${p.old?` · <span class="${p.old>7?'down':''}">أقدم واحدة من ${p.old} يوم</span>`:''}${p.val?` · <span class="sub">قيمة تقريبية ${fm(p.val)} جنيه</span>`:''} · <span class="sub">المسئول: ${p.own}</span>${p.solved?` · <span class="up">✓ اتحل ${p.solved} من امبارح</span>`:''}</div>
      ${p.items.length?`<details style="margin-top:4px"><summary class="sub" style="cursor:pointer">الأسماء (${p.items.length})</summary><div class="sub" style="line-height:1.9;margin-top:4px">${p.items.slice(0,25).map(x=>`${esc(x.n||'—')} <span>(${x.x}${x.age!=null?' · من '+x.age+' يوم':''})</span>`).join('<br>')}${p.items.length>25?'<br>…':''}</div></details>`:''}</div>`}).join('');
  return `<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3 style="margin:0">📅 تقرير ${dyFmtD(T)}</h3>
     <div class="bar" style="margin:0"><input type="date" id="dyD" value="${T}" max="${todayC()}"><span class="sub">آخر تحديث ${updS}</span></div></div>
    ${isToday&&now.getHours()<22?'<div class="note" style="margin-top:6px">اليوم لسه ما خلصش — الأرقام لحد آخر تحديث، والمقارنة بأيام كاملة.</div>':''}
    <div style="margin-top:10px;line-height:2">${head}</div></div>
   <div class="card" style="margin-top:12px"><h3>أداء اليوم<small>«عن العادي» = متوسط نفس اليوم في آخر 4 أسابيع · «عن السنة اللي فاتت» = نفس اليوم من الأسبوع السنة اللي فاتت</small></h3>
    ${tableHTML(['',...brs.map(b=>BRN[b])],rows,{h:420})}
    <div style="margin-top:10px;line-height:2"><div><b>الأسبوع لحد النهارده</b> (من السبت):<br>${per(sat,T,'الأسبوع')}</div><div style="margin-top:6px"><b>الشهر لحد النهارده</b>:<br>${per(m1,T,'الشهر')}</div></div></div>
   <div class="card" style="margin-top:12px"><h3>🔴 مشاكل لسه مفتوحة<small>بتتقفل لوحدها أول ما تتحل · الفلوس الأول، بعدين القيمة والعمر</small></h3>
    ${solved?`<div class="up" style="margin-bottom:6px">✓ اتحل ${solved} من امبارح</div>`:''}${pb||'<div class="note">✅ مفيش مشاكل مفتوحة.</div>'}</div>
   <div class="note" style="margin-top:12px">التحليلات الكاملة والترشيحات في تاب <a href="#" id="dyFull">📋 الصورة الكاملة</a>.</div>`}
function cDaily(){if(!D._aud&&!D._audTry){D._audTry=1;fetch('data/audit.json?'+Date.now()).then(r=>r.ok?r.json():null).then(j=>{if(j){D._aud=j;if(S.tab==='sum')render()}}).catch(()=>{})}const d=$('#dyD');if(d)d.onchange=()=>{DY.day=d.value||'';render()};
  document.querySelectorAll('[data-dyt]').forEach(b=>b.onclick=()=>{S.tab=b.dataset.dyt;render();window.scrollTo({top:0})});
  const f=$('#dyFull');if(f)f.onclick=e=>{e.preventDefault();S.tab='full';render();window.scrollTo({top:0})};
  if(typeof cfSheet==='function'&&!CF.sheetTry)cfSheet()}
VIEWS.sum=[vDaily,cDaily];
