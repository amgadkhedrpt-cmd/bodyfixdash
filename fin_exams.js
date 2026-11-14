// BODYFIX — «🩺 الكشوفات»: كل كشف اتعمل بعده إيه · أداء كل دكتور في الكشف
// علاج طبيعي: اتحجزله قبل ما يمشي؟ · باقة كام جلسة (الجلسات اللي جوه الفاتورة) وبكام ودفع كام · عمل كام جلسة بعد الكشف · كمّل مع نفس الدكتور؟ · وقف بدري؟
// تغذية: اتحول لخدمة تانية بعد الكشف ولا لأ (في خلال 30 يوم) · أنهي خدمة · نسب التحويل
'use strict';
const EX={doc:'',kd:'phy',pk:null};
try{EX.kd=localStorage.getItem('fin_exkd')||'phy'}catch(e){}
const exDay=(d,n)=>new Date(Date.parse(d)+n*864e5).toISOString().slice(0,10);
const exAge=d=>Math.round((Date.parse(todayC())-Date.parse(d))/864e5);
const isExamT=t=>/كشف/.test(tName(t)+' '+t);
const isEvalT=t=>/تقييم/.test(tName(t)+' '+t);
const LIVE=/^(open|confirmed|checked ?in|in ?progress|delayed)/i;
// حجم الباقة = عدد الجلسات جوه الفاتورة (من packages.json — نفس اللي الداشبورد بيحسبه من الفواتير)
function exPk(){if(EX.pk)return EX.pk;EX.pk={};fetch('packages.json?'+Date.now()).then(r=>r.ok?r.json():null).then(j=>{if(!j)return;const m={};
  for(const id in (j.inv||{})){const v=j.inv[id];if(v&&v.s)m[id]=+v.s}EX.pk=m;EX.pkOk=1;if(S.tab==='exam')render()}).catch(()=>{EX.pkFail=1;if(S.tab==='exam')render()});return EX.pk}
function exBuild(){const key=S.b+'|'+EX.kd+'|'+(EX.pkOk?1:0);if(EX.c&&EX.c.key===key)return EX.c;const PK=exPk(),td=todayC();
  const byP={};D.apt.forEach(a=>{if(inB(a)&&a.pid)(byP[a.pid]=byP[a.pid]||[]).push(a)});
  const invP={};D.inv.forEach(i=>{if(inB(i)&&i.pid)(invP[i.pid]=invP[i.pid]||[]).push(i)});
  const want=EX.kd==='nut'?'nut':'phy',out=[];
  for(const pid in byP){const L=byP[pid].slice().sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.h-b.h);
    L.forEach((k,ix)=>{if(k.st!=='Completed'||!isExamT(k.type)||deptOfType(k.type)!==want)return;
      const after=L.filter(a=>a!==k&&(a.d>k.d||(a.d===k.d&&a.h>k.h))&&!isExamT(a.type));
      const nextEx=L.find(a=>a!==k&&a.d>k.d&&isExamT(a.type)&&deptOfType(a.type)===want);const lim=nextEx?nextEx.d:'9999';
      const aft=after.filter(a=>a.d<lim);
      const bk=aft.some(a=>a.cr&&a.cr<=k.d&&(a.st==='Completed'||LIVE.test(a.st)||a.d>=td));
      const o={pid,pn:k.pn,d:k.d,k:k.k,doc:k.doc===PAST_DOC?'دكاترة سابقين':k.doc,b:k.b,age:exAge(k.d),bk};
      if(want==='phy'){const ses=aft.filter(a=>a.st==='Completed'&&deptOfType(a.type)==='phy'&&!isEvalT(a.type));
        const s60=ses.filter(a=>a.d<=exDay(k.d,60));o.s60=s60.length;o.sAll=ses.length;o.same=ses.length?ses.filter(a=>a.doc===k.doc).length/ses.length:null;
        o.last=ses.length?ses[ses.length-1].d:null;o.fut=aft.some(a=>a.d>=td&&LIVE.test(a.st));
        o.amg=aft.some(a=>isEvalT(a.type)&&/amgad|أمجد|امجد/i.test(a.doc)&&a.st==='Completed');
        const iv=(invP[pid]||[]).filter(i=>i.d>=exDay(k.d,-3)&&i.d<=exDay(k.d,21)&&i.d<lim).sort((a,b)=>a.d<b.d?-1:1);
        const pk=iv.find(i=>PK[i.iid]);o.pkS=pk?PK[pk.iid]:0;o.pkAmt=pk?pk.total-pk.disc:0;o.pkPaid=pk?pk.paid:0;
        o.rev60=(invP[pid]||[]).filter(i=>i.d>=k.d&&i.d<=exDay(k.d,60)).reduce((s,i)=>s+i.total-i.disc,0);
        o.early=o.age>=30&&!o.fut&&o.sAll<=3&&(!o.last||exAge(o.last)>21);o.none=o.age>=14&&!o.sAll&&!o.fut}
      else{const sv=aft.filter(a=>a.d<=exDay(k.d,30)&&(a.st==='Completed'||(a.d>=td&&LIVE.test(a.st))));
        const lbl=a=>{const n=tName(a.type),dp=deptOfType(a.type);return dp==='phy'?'علاج طبيعي':n};
        o.sv=[...new Set(sv.map(lbl))];o.conv=sv.length>0}
      out.push(o)})}
  out.sort((a,b)=>a.d<b.d?1:-1);return EX.c={key,X:out}}
const exDocs=X=>[...new Set(X.map(x=>x.doc))].sort();
function vExam(){const {X:all}=exBuild();const X0=all.filter(inR),X=X0.filter(x=>!EX.doc||x.doc===EX.doc);
  const bar=`<div class="bar"><label class="sub">الكشف <select id="exKd"><option value="phy"${EX.kd==='phy'?' selected':''}>علاج طبيعي</option><option value="nut"${EX.kd==='nut'?' selected':''}>تغذية</option></select></label>
    <label class="sub">الدكتور <select id="exDoc"><option value="">كل الدكاترة</option>${exDocs(X0).map(d=>`<option${d===EX.doc?' selected':''}>${esc(d)}</option>`).join('')}</select></label>
    <span class="sub">الفترة والفرع من فوق · ${BRN[S.b]} · ${ml(S.from)}–${ml(S.to)}</span></div>`;
  if(!X.length)return `<div class="card">${bar}<div class="sub" style="margin-top:8px">مفيش كشوفات في الفترة دي.</div></div>`;
  return EX.kd==='nut'?exNut(X,X0,bar):exPhy(X,X0,bar)}
function exPhy(X,X0,bar){const M=X.filter(x=>x.age>=30),avg=(a,f)=>a.length?a.reduce((s,x)=>s+f(x),0)/a.length:null;
  const r=(a,f)=>a.length?a.filter(f).length/a.length:null;const pkN=X.filter(x=>x.pkS);
  const kp=`<div class="grid g4">${kpi('كشوفات مكتملة',X.length)}${kpi('اتحجزله قبل ما يمشي',pc(r(X,x=>x.bk)))}${kpi('اشترى باقة',pc(r(X,x=>x.pkS)),pkN.length?'متوسط '+(avg(pkN,x=>x.pkS)).toFixed(1)+' جلسة':'')}
    ${kpi('جلسات في أول 60 يوم',M.length?avg(M,x=>x.s60).toFixed(1):'—','كشوفات عدى عليها 30 يوم')}${kpi('وقف بدري (3 جلسات أو أقل)',pc(r(M,x=>x.early)),'',r(M,x=>x.early)>0.3?'down':'')}
    ${kpi('ما بدأش خالص',pc(r(X.filter(x=>x.age>=14),x=>x.none)))}${kpi('التحصيل لكل كشف (60 يوم)',M.length?fm(avg(M,x=>x.rev60)):'—')}${kpi('كمّل مع نفس الدكتور',pc(avg(M.filter(x=>x.same!=null),x=>x.same)))}</div>`;
  // أداء الدكاترة (على كل كشوفات الفترة — النتايج على اللي عدى عليهم 30 يوم)
  const G={};X0.forEach(x=>(G[x.doc]=G[x.doc]||[]).push(x));
  const dRows=Object.entries(G).filter(([d,a])=>a.length>=3).map(([d,a])=>{const m=a.filter(x=>x.age>=30),p=a.filter(x=>x.pkS);
    return {d,n:a.length,bk:r(a,x=>x.bk),pk:r(a,x=>x.pkS),ps:p.length?avg(p,x=>x.pkS):null,s60:m.length?avg(m,x=>x.s60):null,early:r(m,x=>x.early),none:r(a.filter(x=>x.age>=14),x=>x.none),rev:m.length?avg(m,x=>x.rev60):null,same:avg(m.filter(x=>x.same!=null),x=>x.same),amg:/amgad|أمجد|امجد/i.test(d)?null:r(a,x=>x.amg),m:m.length}})
    .sort((a,b)=>(b.s60||0)-(a.s60||0));
  const dt=tableHTML([{t:'الدكتور'},{t:'كشوفات',n:1},{t:'اتحجزله',n:1},{t:'اشترى باقة',n:1},{t:'متوسط الباقة',n:1},{t:'جلسات 60 يوم',n:1},{t:'وقف بدري',n:1},{t:'ما بدأش',n:1},{t:'تحصيل/كشف',n:1},{t:'نفس الدكتور',n:1},{t:'إعادة تقييم مع د. أمجد',n:1}],
    dRows.map(z=>[esc(z.d)+(z.m<8?' <small class="sub">(عينة صغيرة)</small>':''),z.n,pc(z.bk),pc(z.pk),z.ps?z.ps.toFixed(1):'—',z.s60!=null?z.s60.toFixed(1):'—',pc(z.early),pc(z.none),z.rev!=null?fm(z.rev):'—',pc(z.same),z.amg==null?'—':pc(z.amg)]));
  const rows=X.slice(0,300).map(x=>[x.d.slice(8,10)+'/'+x.d.slice(5,7),esc(x.pn||x.pid),esc(x.doc),x.bk?'✅':'❌',x.pkS?x.pkS+' جلسة':'—',x.pkS?fm(x.pkAmt):'—',x.pkS?fm(x.pkPaid):'—',x.s60,x.sAll,
    x.age<30?'<small class="sub">لسه بدري</small>':x.early?'<b class="down">وقف بدري</b>':x.none?'<b class="down">ما بدأش</b>':x.fut?'مكمّل':'خلص']);
  const lt=tableHTML([{t:'اليوم'},{t:'المريض'},{t:'الدكتور'},{t:'اتحجزله'},{t:'الباقة'},{t:'بكام',n:1},{t:'دفع',n:1},{t:'جلسات 60 يوم',n:1},{t:'كل الجلسات',n:1},{t:'الحالة'}],rows,{h:520});
  return `<div class="card"><h3>🩺 كشوفات العلاج الطبيعي<small>الباقة = عدد الجلسات جوه الفاتورة (فاتورة من 3 أيام قبل الكشف لحد 21 يوم بعده) · «وقف بدري» = 3 جلسات أو أقل ومالوش ميعاد جاي وآخر جلسة من أكتر من 21 يوم · النتايج بتتحسب على الكشوفات اللي عدى عليها 30 يوم</small></h3>${bar}${kp}${EX.pkOk?'':EX.pkFail?'<div class="sub down">مقدرتش أحمّل أحجام الباقات (packages.json) — عمود الباقة فاضي</div>':'<div class="sub">⏳ بيحمّل أحجام الباقات…</div>'}</div>
    <div class="card" style="margin-top:12px"><h3>👨‍⚕️ أداء كل دكتور في الكشف<small>مترتب بالجلسات في أول 60 يوم · دكتور أقل من 3 كشوفات مش ظاهر</small></h3>${dt}</div>
    <div class="card" style="margin-top:12px"><h3>📋 كل كشف${EX.doc?' — '+esc(EX.doc):''} (${X.length})</h3>${lt}</div>`}
function exNut(X,X0,bar){const M=X.filter(x=>x.age>=30),r=(a,f)=>a.length?a.filter(f).length/a.length:null;
  const S_={};M.forEach(x=>x.sv.forEach(s=>S_[s]=(S_[s]||0)+1));
  const sRows=Object.entries(S_).sort((a,b)=>b[1]-a[1]).map(([s,n])=>[esc(s),n,pc(n/M.length)]);
  const G={};X0.forEach(x=>(G[x.doc]=G[x.doc]||[]).push(x));
  const dRows=Object.entries(G).filter(([d,a])=>a.length>=3).map(([d,a])=>{const m=a.filter(x=>x.age>=30);const top={};m.forEach(x=>x.sv.forEach(s=>top[s]=(top[s]||0)+1));
    const t=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([s,n])=>esc(s)+' ('+n+')').join('، ');return [esc(d)+(m.length<8?' <small class="sub">(عينة صغيرة)</small>':''),a.length,pc(r(a,x=>x.bk)),pc(r(m,x=>x.conv)),t||'—']})
    .sort((a,b)=>parseFloat(b[3])-parseFloat(a[3]));
  const rows=X.slice(0,300).map(x=>[x.d.slice(8,10)+'/'+x.d.slice(5,7),esc(x.pn||x.pid),esc(x.doc),x.bk?'✅':'❌',x.sv.length?esc(x.sv.join('، ')):(x.age<30?'<small class="sub">لسه بدري</small>':'<b class="down">ما اتحولش</b>')]);
  return `<div class="card"><h3>🥗 كشوفات التغذية: اتحول لخدمة تانية؟<small>«اتحول» = حضر أو حاجز أي خدمة في خلال 30 يوم من الكشف · النسب على الكشوفات اللي عدى عليها 30 يوم</small></h3>${bar}
    <div class="grid g4">${kpi('كشوفات تغذية',X.length)}${kpi('اتحجزله قبل ما يمشي',pc(r(X,x=>x.bk)))}${kpi('اتحول لخدمة',pc(r(M,x=>x.conv)),M.length+' كشف عدى عليه 30 يوم',r(M,x=>x.conv)<0.5?'down':'')}${kpi('ما اتحولش',M.filter(x=>!x.conv).length)}</div></div>
    <div class="grid g2" style="margin-top:12px"><div class="card"><h3>اتحولوا لإيه<small>% من الكشوفات (المريض ممكن ياخد أكتر من خدمة)</small></h3>${tableHTML([{t:'الخدمة'},{t:'مرضى',n:1},{t:'نسبة التحويل',n:1}],sRows)}</div>
    <div class="card"><h3>👩‍⚕️ حسب الدكتور</h3>${tableHTML([{t:'الدكتور'},{t:'كشوفات',n:1},{t:'اتحجزله',n:1},{t:'اتحول',n:1},{t:'أكتر خدمة'}],dRows)}</div></div>
    <div class="card" style="margin-top:12px"><h3>📋 كل كشف${EX.doc?' — '+esc(EX.doc):''} (${X.length})</h3>${tableHTML([{t:'اليوم'},{t:'المريض'},{t:'الدكتور'},{t:'اتحجزله'},{t:'اتحول لـ'}],rows,{h:520})}</div>`}
function cExam(){const k=document.getElementById('exKd'),d=document.getElementById('exDoc');
  if(k)k.onchange=()=>{EX.kd=k.value;EX.doc='';try{localStorage.setItem('fin_exkd',EX.kd)}catch(e){}render()};
  if(d)d.onchange=()=>{EX.doc=d.value;render()}}
VIEWS.exam=[vExam,cExam];
