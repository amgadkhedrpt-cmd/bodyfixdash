// BODYFIX — «🎯 المتابعة الشهرية»: نفس مؤشرات المتابعة الشهرية مع د. محمود (الدقي) ود. أمجد (الهرم)، لكل فرع لوحده.
// الاستمرار بيتحسب على المرضى اللي بدأوا علاج في الـ 3 شهور اللي قبل الشهر المختار، وحالتهم النهارده:
// كمّل 12 · جاري (آخر جلسة من أقل من 14 يوم أو عنده حجز جاي) · وقف. والمتوقع = اللي كمّلوا + احتمال كمال كل جاري
// من تاريخ الفرع نفسه (من وصل للجلسة n، كام في المية وصل 12). الأهداف بتتعدّل هنا وبتتحفظ في شيت الداشبورد (نفس شيت الطلبات).
'use strict';
const KP={m:'',base:null,tg:null,tgLoaded:0,edit:false,st:''};
const KP_SCRIPT='https://script.google.com/macros/s/AKfycbzy1UbUmQmVOLnrgP69vALV_RH8VlejQ5Npo9a9xS1u9Hhz5oRiPKF7GIgSVYAxCp_m/exec';
const KP_PTS=new Set(['Enum5','Enum13','Enum17','Enum32']);      // جلسات العلاج الطبيعي (عادية، منطقتين، منزلية، أونلاين)
const KP_EXAM='Enum1';
const KP_LIVE=/^(open|confirmed|checked ?in|in ?progress|delayed)/i;
const KP_MAIN={dokki:{rx:/kashef|كاشف/i,n:'د. محمود'},haram:{rx:/amgad|أمجد|امجد/i,n:'د. أمجد'}};
const KP_STOP=14;            // أيام من غير جلسة ولا حجز = وقف
// الأهداف الافتراضية (t = المرحلة الأولى، t2 = بعدها). dir: up = الأعلى أحسن، down = الأقل أحسن
const KP_DEF={
  conv:{dir:'up',t:85,t2:90},docConv:{dir:'up',t:90},stop:{dir:'down',t:15,t2:10},s12:{dir:'up',t:55,t2:60},
  beyond:{dir:'up',t:60,t2:65},th40:{dir:'down',t:20},cancel:{dir:'down',t:20},docS12:{dir:'up',t:60},docStop:{dir:'down',t:20,t2:10},
  khaled:{dir:'up',t:60},walk:{dir:'down',t:25,t2:15},fb:{dir:'up',t:85,t2:90}};
const kpAddM=(k,n)=>{let y=+k.slice(0,4),m=+k.slice(5,7)+n;while(m<1){m+=12;y--}while(m>12){m-=12;y++}return y+'-'+String(m).padStart(2,'0')};
const kpDays=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const kpIn=(b,x)=>b==='both'||x.b===b;
const kpSrc=s=>{const n=nAr(s);if(/khaled|خالد/.test(n))return 'khaled';if(/مرور/.test(n))return 'walk';if(/face|فيس/.test(n))return 'fb';return n?'other':''};

// ---------- الأهداف: افتراضي ← على الجهاز ← الشيت ----------
function kpTgAll(){if(KP.tg)return KP.tg;let o={};try{o=JSON.parse(localStorage.getItem('fin_kpi_tg')||'{}')||{}}catch(e){}KP.tg=o;kpTgFetch();return o}
function kpTg(b){const o=kpTgAll()[b]||{},r={};for(const k in KP_DEF)r[k]=Object.assign({},KP_DEF[k],o[k]||{});return r}
function kpTgFetch(){if(KP.tgLoaded)return;KP.tgLoaded=1;const cb='_kptg_'+Date.now(),sc=document.createElement('script');
  window[cb]=d=>{try{document.head.removeChild(sc)}catch(e){}delete window[cb];const R=(d&&d.reasons)||{};let ch=0;
    for(const b of ['haram','dokki','both']){const v=R['KPITG|'+b];if(!v)continue;try{KP.tg[b]=JSON.parse(v);ch=1}catch(e){}}
    if(ch){try{localStorage.setItem('fin_kpi_tg',JSON.stringify(KP.tg))}catch(e){}if(S.tab==='kpi')render()}};
  sc.src=KP_SCRIPT+'?action=getAll&callback='+cb;sc.onerror=()=>{delete window[cb]};document.head.appendChild(sc)}
function kpTgSave(b,val){KP.tg[b]=val;try{localStorage.setItem('fin_kpi_tg',JSON.stringify(KP.tg))}catch(e){}
  KP.st='⏳ بيتحفظ…';const cb='_kpts_'+Date.now(),sc=document.createElement('script');let done=0;
  const t=setTimeout(()=>{if(done)return;done=1;KP.st='⚠️ اتحفظ على الجهاز ده بس (الشيت ما ردّش)';if(S.tab==='kpi')render()},12000);
  window[cb]=r=>{if(done)return;done=1;clearTimeout(t);try{document.head.removeChild(sc)}catch(e){}delete window[cb];
    KP.st=(r&&r.ok!==false)?'✅ الأهداف اتحفظت في الداشبورد، والإيميل الشهري هيستخدمها':'⚠️ اتحفظ على الجهاز ده بس';if(S.tab==='kpi')render()};
  sc.src=KP_SCRIPT+'?action=saveAction&reqId='+encodeURIComponent('KPITG|'+b)+'&decision=kpitg&reason='+encodeURIComponent(JSON.stringify(val))+'&callback='+cb;
  document.head.appendChild(sc)}

// ---------- البيانات: مريض مريض ----------
function kpBase(b){const key=b+'|'+D.apt.length+'|'+D.inv.length;if(KP.base&&KP.base.key===key)return KP.base;const td=todayC();
  const byP={};D.apt.forEach(a=>{if(kpIn(b,a)&&a.pid)(byP[a.pid]=byP[a.pid]||[]).push(a)});
  const src={};D.inv.filter(i=>kpIn(b,i)&&i.pid&&i.src).sort((x,y)=>x.d<y.d?-1:1).forEach(i=>{if(!src[i.pid])src[i.pid]=i.src});
  const P=[];
  for(const pid in byP){const L=byP[pid].sort((x,y)=>x.d<y.d?-1:x.d>y.d?1:x.h-y.h);
    const ses=L.filter(a=>a.st==='Completed'&&KP_PTS.has(a.type));
    const ex=L.filter(a=>a.st==='Completed'&&a.type===KP_EXAM).map(a=>({d:a.d,k:a.k,doc:a.doc}));
    const fv=L.find(a=>a.st==='Completed');
    const dc={};ses.forEach(a=>{if(a.doc!==PAST_DOC)dc[a.doc]=(dc[a.doc]||0)+1});
    let th='';const l3=new Set(ses.slice(-3).map(a=>a.doc));for(const [d,c] of Object.entries(dc).sort((x,y)=>y[1]-x[1]))if(c>=0.4*ses.length&&l3.has(d)){th=d;break}
    P.push({pid,pn:L.find(a=>a.pn)?.pn||pid,ses:ses.map(a=>a.d),n:ses.length,ex,fut:L.some(a=>a.d>=td&&KP_LIVE.test(a.st)),first:fv?fv.d:null,
      s1:ses.length?ses[0].d:null,s12:ses.length>=12?ses[11].d:null,last:ses.length?ses[ses.length-1].d:null,th,src:kpSrc(src[pid]||'')})}
  // احتمال الوصول لـ 12 من تاريخ الفرع: المرضى اللي بدأوا من أكتر من 150 يوم
  const H=P.filter(p=>p.s1&&kpDays(p.s1,td)>150),pr={};
  for(let n=1;n<=11;n++){const r=H.filter(p=>p.n>=n);pr[n]=r.length>=10?r.filter(p=>p.n>=12).length/r.length:null}
  return KP.base={key,P,pr,hN:H.length,td}}
function kpStat(p,td){if(p.n>=12)return 'done';if(p.fut||(p.last&&kpDays(p.last,td)<=KP_STOP))return 'run';return 'stop'}

// ---------- المؤشرات لشهر واحد ----------
function kpCalc(b,M){const B=kpBase(b),{P,pr,td}=B,cur=M===td.slice(0,7);
  const r=(a,f)=>a.length?a.filter(f).length/a.length:null;
  const cohW=[kpAddM(M,-3),kpAddM(M,-1)],inW=(d,w)=>d&&d.slice(0,7)>=w[0]&&d.slice(0,7)<=w[1];
  const coh=P.filter(p=>inW(p.s1,cohW));
  const proj=a=>{if(!a.length)return null;let s=0;a.forEach(p=>{const st=kpStat(p,td);if(st==='done')s+=1;else if(st==='run')s+=pr[p.n]??0});return s/a.length};
  const stp=a=>r(a,p=>kpStat(p,td)==='stop'&&p.n<=5);
  // الكشوفات
  const exM=[];P.forEach(p=>p.ex.forEach(e=>{if(e.k===M)exM.push({p,e})}));
  const conv=a=>r(a,x=>x.p.ses.some(d=>d>=x.e.d));
  const main=KP_MAIN[b];
  // الإلغاءات: مواعيد جلسات العلاج الطبيعي اللي معادها عدّى
  const ap=D.apt.filter(a=>kpIn(b,a)&&a.k===M&&KP_PTS.has(a.type)&&a.d<td&&/^(completed|canceled|no show)$/i.test(a.st));
  // كمّلوا بعد الـ 12: اللي وصلوا الجلسة 12 في الـ 3 شهور، وعدّى عليها 14 يوم
  const by=P.filter(p=>inW(p.s12,cohW)&&kpDays(p.s12,td)>=KP_STOP);
  // الأخصائيين: مرضى 6 شهور، متوقع كمالهم
  const coh6=P.filter(p=>inW(p.s1,[kpAddM(M,-6),kpAddM(M,-1)])&&p.th),G={};coh6.forEach(p=>(G[p.th]=G[p.th]||[]).push(p));
  const thR=Object.entries(G).filter(([,a])=>a.length>=8).map(([d,a])=>({d,n:a.length,v:proj(a)}));
  const thN=thR.reduce((s,x)=>s+x.n,0),thLow=thR.filter(x=>x.v<0.4).reduce((s,x)=>s+x.n,0);
  // مرضى الدكتور المسؤول: اللي هو أخصائيهم الأساسي، ولو مش أخصائي أساسي لحد (الهرم) فاللي كشف عليهم
  let docP=main?coh.filter(p=>main.rx.test(p.th)):[],docBy='th';if(main&&docP.length<5){docP=coh.filter(p=>p.ex.some(e=>main.rx.test(e.doc)));docBy='ex'}
  const fbEx=[];P.filter(p=>p.src==='fb').forEach(p=>p.ex.forEach(e=>{if(inW(e.d,[kpAddM(M,-2),M]))fbEx.push({p,e})}));
  const st={done:0,run:0,stop:0};coh.forEach(p=>st[kpStat(p,td)]++);
  return {M,cur,cohW,coh,st,
    newP:P.filter(p=>p.first&&p.first.slice(0,7)===M).length,
    ses:D.apt.filter(a=>kpIn(b,a)&&a.k===M&&a.st==='Completed'&&KP_PTS.has(a.type)).length,
    exN:exM.length,conv:conv(exM),docConv:main?conv(exM.filter(x=>main.rx.test(x.e.doc))):null,docExN:main?exM.filter(x=>main.rx.test(x.e.doc)).length:0,
    stop:stp(coh),s12a:r(coh,p=>p.n>=12),s12:proj(coh),beyond:r(by,p=>p.n>12||p.fut),byN:by.length,
    th40:thN?thLow/thN:null,thR,cancel:ap.length?ap.filter(a=>a.st!=='Completed').length/ap.length:null,
    docS12:docP.length?proj(docP):null,docStop:docP.length?stp(docP):null,docN:docP.length,docBy,
    khaled:proj(coh.filter(p=>p.src==='khaled')),khN:coh.filter(p=>p.src==='khaled').length,
    walk:stp(coh.filter(p=>p.src==='walk')),wkN:coh.filter(p=>p.src==='walk').length,
    fb:conv(fbEx),fbN:fbEx.length}}

// ---------- العرض ----------
function kpMonths(){const td=todayC().slice(0,7),ms=D.months.filter(m=>m<=td);if(!ms.includes(td))ms.push(td);return ms.slice(-18).reverse()}
function vKpi(){const b=S.b,ms=kpMonths();if(!KP.m||!ms.includes(KP.m))KP.m=ms[0];const M=KP.m;
  const C=kpCalc(b,M),Pv=kpCalc(b,kpAddM(M,-1)),A3=[1,2,3].map(i=>kpCalc(b,kpAddM(M,-i))),T=kpTg(b),B=kpBase(b),main=KP_MAIN[b];
  const av=k=>{const v=A3.map(x=>x[k]).filter(x=>x!=null);return v.length?v.reduce((s,x)=>s+x,0)/v.length:null};
  const fP=v=>v==null?'—':Math.round(v*100)+'%',fN=v=>v==null?'—':fm(v);
  const ok=(k,v)=>{const t=T[k];if(!t||v==null)return '';const x=v*100;const g=t.dir==='up'?x>=t.t:x<=t.t;return g?'<b class="up">✔ في الهدف</b>':'<b class="down">✖ تحت الهدف</b>'};
  const tgTxt=k=>{const t=T[k];if(!t)return 'متابعة بس';const s=(t.dir==='up'?'':'أقل من ')+t.t+'%';return t.t2!=null?s+'، وبعدها '+t.t2+'%':s};
  const tgIn=k=>{const t=T[k];if(!t)return 'متابعة بس';return `<input class="kpT" data-k="${k}" data-f="t" type="number" value="${t.t}" style="width:58px">% · بعدها <input class="kpT" data-k="${k}" data-f="t2" type="number" value="${t.t2??''}" style="width:58px">%`};
  const arr=(k,a,p,dir)=>{if(a==null||p==null)return '';const d=a-p;if(Math.abs(d)<0.005)return '';const good=dir==='down'?d<0:d>0;return ` <small class="${good?'up':'down'}">${d>0?'▲':'▼'}</small>`};
  const row=(g,l,k,pct,note,n)=>{const t=T[k],cv=C[k],dir=t?t.dir:'up';
    return [g,esc(l)+(note?` <small class="sub">${note}</small>`:''),(pct?fP(cv):fN(cv))+arr(k,cv,Pv[k],dir)+(n!=null?` <small class="sub">(${n})</small>`:''),pct?fP(Pv[k]):fN(Pv[k]),pct?fP(av(k)):fN(av(k)),KP.edit?tgIn(k):tgTxt(k),pct?ok(k,cv):'']};
  const rows=[row('الحجم','مرضى جداد','newP',0),row('','جلسات علاج طبيعي مكتملة','ses',0),
    row('الكشوفات','عدد كشوفات العلاج الطبيعي','exN',0),row('','من الكشف لعلاج','conv',1,C.cur?'الشهر لسه مكملش':''),
    main?row('',`كشوفات ${main.n}: بدأوا علاج`,'docConv',1,'',C.docExN):null,
    row('الاستمرار','وقفوا بين 1 و5 جلسات','stop',1,'من اللي بدأوا في الـ 3 شهور اللي فاتت'),
    [ '',`كمّلوا 12 جلسة <small class="sub">فعلي ${fP(C.s12a)} · <b>متوقع</b> (اللي كمّلوا + احتمال الجاريين)</small>`,fP(C.s12)+arr('s12',C.s12,Pv.s12,'up'),fP(Pv.s12),fP(av('s12')),KP.edit?tgIn('s12'):tgTxt('s12'),ok('s12',C.s12)],
    row('','كمّلوا بعد الـ 12','beyond',1,'من اللي وصلوا 12 في الـ 3 شهور',C.byN),
    row('','مرضى مع أخصائيين تحت 40% (متوقع)','th40',1,'آخر 6 شهور'),
    row('','مواعيد اتلغت أو ما جاش','cancel',1),
    main?row(`مرضى ${main.n}`,'كمّلوا 12 جلسة (متوقع)','docS12',1,C.docBy==='ex'?'اللي كشف عليهم':'',C.docN):null,
    main?row('','وقفوا بين 1 و5','docStop',1):null,
    row('حسب المصدر','د. خالد: كمّلوا 12 (متوقع)','khaled',1,'',C.khN),row('','مرور عابر: وقفوا بين 1 و5','walk',1,'',C.wkN),
    row('','فيسبوك: من الكشف لعلاج','fb',1,'آخر 3 شهور',C.fbN)].filter(Boolean);
  const head=[{t:'المجموعة'},{t:'المؤشر'},{t:ml(M)+(C.cur?' (لحد النهارده)':''),n:1},{t:ml(kpAddM(M,-1)),n:1},{t:'متوسط 3 شهور',n:1},{t:'الهدف'},{t:'الحالة'}];
  const bar=`<div class="bar"><label class="sub">الشهر <select id="kpM">${ms.map(m=>`<option value="${m}"${m===M?' selected':''}>${ml(m)}</option>`).join('')}</select></label>
    <span class="sub">الفرع من فوق: <b>${BRN[b]}</b></span>
    ${b==='both'?'':`<button id="kpEd" class="pri">${KP.edit?'💾 حفظ الأهداف':'✏️ تعديل الأهداف'}</button>${KP.edit?' <button id="kpCx" class="btn">إلغاء</button>':''}`}
    ${KP.st?`<span class="sub">${esc(KP.st)}</span>`:''}</div>`;
  // المرضى الجاريين والتوقع
  const n=C.coh.length,exp12=C.coh.filter(p=>kpStat(p,B.td)==='run').reduce((s,p)=>s+(B.pr[p.n]??0),0);
  // كل المرضى الجاريين دلوقتي (مش بس اللي في الـ 3 شهور): اللي مالهمش حجز الأول، وبعدين الأقل في احتمال الكمال
  const run=B.P.filter(p=>p.n>=1&&kpStat(p,B.td)==='run').map(p=>({p,v:B.pr[p.n]??0,gap:p.last?kpDays(p.last,B.td):0})).sort((x,y)=>(x.p.fut-y.p.fut)||(x.v-y.v)||(y.gap-x.gap));
  const kp=`<div class="grid g4" style="margin-top:10px">${kpi('بدأوا علاج',n,`${ml(C.cohW[0])} – ${ml(C.cohW[1])}`)}${kpi('كمّلوا 12',C.st.done,n?pc(C.st.done/n):'')}
    ${kpi('جاريين',C.st.run,(n?pc(C.st.run/n):'')+` · متوقع يكمّل منهم حوالي ${Math.round(exp12)}`)}${kpi('وقفوا',C.st.stop,n?pc(C.st.stop/n):'','down')}</div>`;
  const prT=tableHTML([{t:'وصل للجلسة'}].concat([1,2,3,4,5,6,8,10,11].map(i=>({t:String(i),n:1}))),[['احتمال يوصل 12'].concat([1,2,3,4,5,6,8,10,11].map(i=>fP(B.pr[i])))]);
  const rl=tableHTML([{t:'المريض'},{t:'جلسات',n:1},{t:'آخر جلسة من',n:1},{t:'حجز جاي'},{t:'الأخصائي'},{t:'المصدر'},{t:'احتمال يكمّل 12',n:1}],
    run.slice(0,80).map(x=>[esc(x.p.pn),x.p.n,x.gap+' يوم',x.p.fut?'✅':'<b class="down">لأ</b>',esc(x.p.th||'—'),{khaled:'د. خالد',walk:'مرور عابر',fb:'فيسبوك',other:'تاني'}[x.p.src]||'—',fP(x.v)]),{h:420});
  const thT=C.thR.length?tableHTML([{t:'الأخصائي'},{t:'مرضى (6 شهور)',n:1},{t:'متوقع يكمّلوا 12',n:1}],C.thR.sort((a,b)=>b.v-a.v).map(x=>[esc(x.d),x.n,x.v<0.4?`<b class="down">${fP(x.v)}</b>`:fP(x.v)])):'';
  return `<div class="card">${bar}
    <div class="note" style="margin:8px 0">الاستمرار محسوب على المرضى اللي بدأوا علاج في الـ 3 شهور اللي قبل الشهر المختار، وحالتهم النهارده. «جاري» = آخر جلسة من أقل من ${KP_STOP} يوم أو عنده حجز. «متوقع» = اللي كمّلوا + احتمال كمال كل مريض جاري حسب عدد جلساته، من تاريخ الفرع (${B.hN} مريض بدأوا من أكتر من 5 شهور).</div>
    ${tableHTML(head,rows)}</div>
   <div class="card" style="margin-top:12px"><h3>المرضى الجاريين والتوقع<small>${BRN[b]}</small></h3>${kp}
    <div style="margin-top:10px">${prT}</div>
    <h3 style="margin-top:14px">كل المرضى الجاريين دلوقتي<small>${run.length} مريض · اللي مالهمش حجز جاي الأول، وبعدين الأقل في احتمال الكمال</small></h3>${run.length?rl:'<div class="sub">مفيش.</div>'}</div>
   ${thT?`<div class="card" style="margin-top:12px"><h3>الأخصائيين<small>متوقع الكمال لـ 12 — 8 مرضى أو أكتر</small></h3>${thT}</div>`:''}`}
function cKpi(){const s=$('#kpM');if(s)s.onchange=()=>{KP.m=s.value;render()};
  const e=$('#kpEd');if(e)e.onclick=()=>{if(!KP.edit){KP.edit=true;KP.st='';render();return}
    const v={};document.querySelectorAll('.kpT').forEach(i=>{const k=i.dataset.k,f=i.dataset.f;v[k]=v[k]||{};const x=i.value.trim();if(x!=='')v[k][f]=+x;else if(f==='t2')v[k][f]=null});
    for(const k in v)if(v[k].t==null)delete v[k];KP.edit=false;kpTgSave(S.b,v);render()};
  const x=$('#kpCx');if(x)x.onclick=()=>{KP.edit=false;render()}}
VIEWS.kpi=[vKpi,cKpi];
