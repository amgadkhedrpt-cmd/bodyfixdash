// BODYFIX — تحليلات المركز ككل (بيحترم اختيار الفرع اللي فوق). من المدفوعات والفواتير والمواعيد اللي متسحبة بالفعل.
'use strict';
const CEN={sub:'trend',doc:'',cache:null};
const DEPTS=[['phy','علاج طبيعي'],['nut','تغذية'],['dev','أجهزة تخسيس وبشرة']];const DEPN=Object.fromEntries(DEPTS);
function deptOfType(t){const n=nAr(tName(t)+' '+t);if(/تغذي|ميزو|مونجار/.test(n))return 'nut';if(/cavitation|\brf\b|cryo|excilis|بشره|اجهزه|كافيت|كرايو/.test(n))return 'dev';return 'phy'}
const ALAA=/الاء|آلاء|alaa|حرفوش/i;
function cenBuild(){const key=S.b;CEN.cc=CEN.cache?CEN.cc||{}:{};CEN.cache=true;if(CEN.cc[key])return CEN.cc[key];
  const A=D.apt.filter(a=>inB(a)&&a.st==='Completed'&&a.pid);const byP={};
  A.forEach(a=>{(byP[a.pid]=byP[a.pid]||[]).push([a.d,deptOfType(a.type),a.doc,a.k])});Object.values(byP).forEach(l=>l.sort((x,y)=>x[0]<y[0]?-1:1));
  const P=D.pay.filter(p=>inB(p)&&!p.bal&&p.amt>0);
  for(const p of P){const l=byP[p.pid];let dp=null;
    if(l){const t=Date.parse(p.d);let best=null,bd=1e9;for(const x of l){const dd=(t-Date.parse(x[0]))/864e5;if(dd>=-7&&dd<=30&&Math.abs(dd)<bd){bd=Math.abs(dd);best=x}}if(best)dp=best[1]}
    p.dept=dp||(ALAA.test(p.doc)?'nut':'phy')}
  // patients
  const pts={},first=D.months[0];for(const pid in byP){const l=byP[pid];pts[pid]={pid,first:l[0][0],k0:l[0][0].slice(0,7),entry:l[0][1],doc0:l[0][2],months:new Set(l.map(x=>x[3])),depts:new Set(l.map(x=>x[1])),n:l.length,paid:0}}
  for(const p of P)if(pts[p.pid])pts[p.pid].paid+=p.amt;
  for(const x of Object.values(pts))x.early=x.k0===first;
  const fi={};D.inv.filter(x=>inB(x)&&x.src).forEach(x=>{if(!fi[x.pid]||x.d<fi[x.pid].d)fi[x.pid]=x});for(const x of Object.values(pts))x.src=(fi[x.pid]||{}).src||'مش متسجل';
  return CEN.cc[key]={key,byP,P,pts}}
const cMonths=()=>monthsList(S.from,S.to);
const CSUB=[['trend','📈 الاتجاهات والتوقع'],['pts','🔁 المرضى والاحتفاظ'],['ops','🩺 الدكاترة والزحمة']];
function vCen(){const top=`<div class="tabs" id="csub" style="border:0;margin-bottom:8px">${CSUB.map(([k,t])=>`<button data-c="${k}" class="${CEN.sub===k?'on':''}">${t}</button>`).join('')}</div>
  <div class="note" style="margin-bottom:10px">🏥 ${BRN[S.b]}. القسم بيتحدد من نوع موعد المريض في نفس اليوم (أو أقرب موعد خلال أسبوع قبل / شهر بعد)، ولو مفيش موعد: د. آلاء = تغذية وأي دكتور تاني = علاج طبيعي.</div>`;
  return top+({trend:cTrendV,pts:cPtsV,ops:cOpsV}[CEN.sub]||cTrendV)()}
function cCen(){document.querySelectorAll('#csub button').forEach(b=>b.onclick=()=>{CEN.sub=b.dataset.c;try{localStorage.setItem('fin_csub',CEN.sub)}catch(e){}render()});({trend:cTrendC,pts:cPtsC,ops:cOpsC}[CEN.sub]||cTrendC)()}
try{const s=localStorage.getItem('fin_csub');if(s)CEN.sub=s}catch(e){}

// ---------- الاتجاهات ----------
function deptMonth(k){const {P}=cenBuild();const o={};DEPTS.forEach(([d])=>o[d]={rev:0,pts:new Set()});P.filter(p=>p.k===k).forEach(p=>{o[p.dept].rev+=p.amt;if(p.pid)o[p.dept].pts.add(p.pid)});return o}
function cTrendV(){const k=S.to,td=todayC(),{P}=cenBuild();let fc='';
  if(k===td.slice(0,7)){const rev=P.filter(p=>p.k===k&&p.d<=td).reduce((s,p)=>s+p.amt,0);const last=new Date(Date.UTC(+k.slice(0,4),+k.slice(5,7),0)).toISOString().slice(0,10);
    const done=wdays(k+'-01',td),all=wdays(k+'-01',last),f=done?rev/done*all:null;const pk=shiftK(k,-1),pm=P.filter(p=>p.k===pk&&p.d<=pk+td.slice(7)).reduce((s,p)=>s+p.amt,0),pf=P.filter(p=>p.k===pk).reduce((s,p)=>s+p.amt,0);
    fc=`<div class="grid g4">${kpi('المحصّل لحد النهارده',fm(rev),done+' يوم شغل من '+all)}${kpi('المتوقع آخر الشهر',fm(f),'بنفس معدل الأيام اللي فاتت')}${kpi('الشهر اللي فات لنفس اليوم',fm(pm),delta(rev,pm))}${kpi('الشهر اللي فات كامل',fm(pf),f?'المتوقع '+delta(f,pf):'')}</div>`}
  else fc='<div class="note">التوقع بيظهر لما «لحد» يبقى الشهر الحالي.</div>';
  const M1=deptMonth(k),M0=deptMonth(shiftK(k,-1));const br=DEPTS.map(([d,t])=>{const n0=M0[d].pts.size,n1=M1[d].pts.size,a0=n0?M0[d].rev/n0:0,a1=n1?M1[d].rev/n1:0,vol=(n1-n0)*a0;return [t,n0,n1,a0,a1,vol,M1[d].rev-M0[d].rev-vol]});
  const r0=DEPTS.reduce((s,[d])=>s+M0[d].rev,0),r1=DEPTS.reduce((s,[d])=>s+M1[d].rev,0);
  return `${fc}<div class="card" style="margin-top:12px"><h3>الإيراد اتغير ليه؟<small>${ml(shiftK(k,-1))} ← ${ml(k)}: ${fm(r0)} ← ${fm(r1)} (${fm(r1-r0)})</small></h3><div class="ch lg"><canvas id="cc1"></canvas></div>
   ${tableHTML(['القسم',{t:'مرضى دفعوا قبل',n:1},{t:'بعد',n:1},{t:'إيراد المريض قبل',n:1},{t:'بعد',n:1},{t:'أثر عدد المرضى',n:1},{t:'أثر إيراد المريض',n:1}],br)}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>نسبة كل قسم من الإيراد</h3><div class="ch"><canvas id="cc2"></canvas></div></div>
   <div class="card"><h3>المواسم — الإيراد<small>كل سنة خط</small></h3><div class="ch"><canvas id="cc3"></canvas></div></div>
   <div class="card"><h3>المواسم — الجلسات المكتملة</h3><div class="ch"><canvas id="cc4"></canvas></div></div>
   <div class="card"><h3>المواسم — المرضى الجداد</h3><div class="ch"><canvas id="cc5"></canvas></div></div></div>`}
function cTrendC(){const k=S.to,c=SER(),M1=deptMonth(k),M0=deptMonth(shiftK(k,-1));
  const r0=DEPTS.reduce((s,[d])=>s+M0[d].rev,0),r1=DEPTS.reduce((s,[d])=>s+M1[d].rev,0);const L=[ml(shiftK(k,-1))],V=[[0,r0]],COL=[css('--t3')];let run=r0;
  DEPTS.forEach(([d,t])=>{const n0=M0[d].pts.size,n1=M1[d].pts.size,a0=n0?M0[d].rev/n0:0,vol=(n1-n0)*a0,pr=M1[d].rev-M0[d].rev-vol;[[t+': عدد المرضى',vol],[t+': إيراد المريض',pr]].forEach(([l,v])=>{if(Math.abs(v)<1)return;L.push(l);V.push([run,run+v]);COL.push(v>=0?css('--good'):css('--bad'));run+=v})});
  L.push(ml(k));V.push([0,r1]);COL.push(css('--t3'));
  chart('cc1',{type:'bar',data:{labels:L,datasets:[{label:'التغيير',data:V,backgroundColor:COL,borderRadius:3,maxBarThickness:40}]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>' '+fm(x.raw[1]-x.raw[0])}}}}});
  const ks=cMonths(),DM=ks.map(deptMonth);chart('cc2',{type:'line',data:{labels:ks.map(mls),datasets:DEPTS.map(([d,t],i)=>line(t+' %',DM.map(m=>{const s=DEPTS.reduce((q,[x])=>q+m[x].rev,0);return s?+(100*m[d].rev/s).toFixed(1):null}),c[i]))},options:{scales:{y:{ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+x.parsed.y+'%'}}}}});
  const yrs=[...new Set(D.months.map(m=>m.slice(0,4)))],cur=curK();const yl=(id,f)=>chart(id,{type:'line',data:{labels:MN.map(x=>x.slice(0,3)),datasets:yrs.map((y,i)=>line(y,MN.map((_,j)=>{const m=y+'-'+pad(j+1);return D.months.includes(m)&&m<=cur?f(m):null}),c[i]))}});
  const {P,pts}=cenBuild();const PT=Object.values(pts);
  yl('cc3',m=>P.filter(p=>p.k===m).reduce((s,p)=>s+p.amt,0));yl('cc4',m=>D.apt.filter(a=>inB(a)&&a.k===m&&a.st==='Completed').length);yl('cc5',m=>PT.filter(p=>p.k0===m&&!p.early).length)}

// ---------- المرضى ----------
function cPtsV(){const {pts,P}=cenBuild(),PT=Object.values(pts),td=todayC();
  const coh=cMonths().filter(k=>k!==D.months[0]).slice(-18),OFF=[1,2,3,4,5,6];
  const coht=`<div class="tw"><table><thead><tr><th>شهر البداية</th><th class="n">مرضى</th>${OFF.map(o=>`<th class="n">شهر ${o}</th>`).join('')}</tr></thead><tbody>${coh.map(k=>{const ps=PT.filter(p=>p.k0===k);
    return `<tr><td>${ml(k)}</td><td class="n">${ps.length}</td>${OFF.map(o=>{const m=shiftK(k,o);if(m>curK()||!ps.length)return '<td></td>';const v=ps.filter(p=>p.months.has(m)).length/ps.length;return `<td class="n" style="${hm(v,1)}">${pc(v)}</td>`}).join('')}</tr>`}).join('')}</tbody></table></div>`;
  const N=PT.filter(p=>!p.early&&nIn(p.k0,S.from,S.to));const eg={};N.forEach(p=>{const g=eg[p.entry]=eg[p.entry]||{n:0,paid:0,s:0};g.n++;g.paid+=p.paid;g.s+=p.n});
  const sg={};N.forEach(p=>{const g=sg[p.src]=sg[p.src]||{n:0,paid:0};g.n++;g.paid+=p.paid});
  const ad=D.exp.filter(e=>expIn(e)&&inR(e)&&/دعاي|اعلان|إعلان|ماركت|marketing|ads|سوشيال/i.test(e.type+' '+e.info)).reduce((s,e)=>s+e.amt,0),ltv=N.length?N.reduce((s,p)=>s+p.paid,0)/N.length:null;
  // cross-department
  const act=PT.filter(p=>[...p.months].some(m=>nIn(m,S.from,S.to)));const combo={};act.forEach(p=>{const k=DEPTS.filter(([d])=>p.depts.has(d)).map(x=>x[1]).join(' + ')||'—';const g=combo[k]=combo[k]||{n:0,paid:0};g.n++;g.paid+=p.paid});
  const multi=act.filter(p=>p.depts.size>1),single=act.filter(p=>p.depts.size===1);const avg=a=>a.length?a.reduce((s,p)=>s+p.paid,0)/a.length:null;
  const {byP}=cenBuild();const mv=(a,b)=>{const s=act.filter(p=>p.entry===a);return [s.length,s.filter(p=>(byP[p.pid]||[]).some(x=>x[1]===b)).length]};
  // renewals (big invoices = packages)
  const IV=D.inv.filter(x=>inB(x)&&x.pid&&x.total-x.disc>=1500).sort((a,b)=>a.d<b.d?-1:1);const ib={};IV.forEach(x=>(ib[x.pid]=ib[x.pid]||[]).push(x));const rs={};
  for(const pid in ib){const l=ib[pid],ap=(byP[pid]||[]).map(x=>x[0]);l.forEach((x,i)=>{const nx=l[i+1];const lastAp=ap.filter(d=>d>=x.d&&(!nx||d<nx.d)).pop()||x.d;const dep=ALAA.test(x.doc)?'تغذية':'علاج طبيعي';
    if(!nIn(lastAp.slice(0,7),S.from,S.to))return;const ren=nx&&(Date.parse(nx.d)-Date.parse(lastAp))/864e5<=60;if(!ren&&(Date.parse(td)-Date.parse(lastAp))/864e5<=30)return;
    const g=rs[dep]=rs[dep]||{n:0,r:0,days:[]};g.n++;if(ren){g.r++;g.days.push(Math.max(0,Math.round((Date.parse(nx.d)-Date.parse(lastAp))/864e5)))}})}
  const med=a=>a.length?a.slice().sort((x,y)=>x-y)[a.length>>1]:null;
  const ex=coh.map(k=>({k,ps:PT.filter(p=>p.k0===k)})).find(x=>x.ps.length&&shiftK(x.k,2)<=curK());
  const exTxt=ex?(()=>{const n=ex.ps.length,a=ex.ps.filter(p=>p.months.has(shiftK(ex.k,1))).length,b=ex.ps.filter(p=>p.months.has(shiftK(ex.k,2))).length;
    return `<div class="note" style="margin-bottom:8px;line-height:1.9"><b>إزاي تقراه:</b> كل صف = المرضى اللي أول جلسة ليهم كانت في الشهر ده. مثال: في ${ml(ex.k)} بدأ <b>${n}</b> مريض جديد. منهم <b>${a}</b> (${pc(a/n)}) جم تاني في ${ml(shiftK(ex.k,1))} = «شهر 1»، و<b>${b}</b> (${pc(b/n)}) جم في ${ml(shiftK(ex.k,2))} = «شهر 2»… وهكذا لحد 6 شهور.<br>
     <b>امشي على الصف</b> تشوف الدفعة دي بتقل إزاي. <b>انزل في العمود</b> (خصوصاً «شهر 1») تقارن الدفعات ببعض: لو الأرقام بتقل وإنت نازل، يبقى المرضى الجداد بقوا يقفوا أسرع من زمان. اللون الغامق = استمرار أعلى.<br>
     <i>مش كل اللي وقف خسارة: اللي خلّص علاجه طبيعي ما يجيش. المهم المقارنة بين الصفوف.</i></div>`})():'';
  return `<div class="card"><h3>خريطة الاحتفاظ لكل دفعة<small>نسبة المرضى اللي ليهم جلسة مكتملة بعد كام شهر من أول شهر</small></h3>${exTxt}${coht}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>قيمة المريض حسب أول قسم دخل منه<small>مرضى بدأوا في الفترة — كل اللي دفعوه لحد النهارده</small></h3>
    ${tableHTML(['أول قسم',{t:'مرضى',n:1},{t:'متوسط اللي دفعه',n:1},{t:'متوسط الجلسات',n:1}],Object.entries(eg).sort((a,b)=>b[1].n-a[1].n).map(([e,g])=>[DEPN[e]||e,g.n,g.paid/g.n,fm(g.s/g.n,1)]))}
    <div class="grid g4" style="margin-top:10px">${kpi('متوسط قيمة المريض',fm(ltv))}${kpi('مصاريف الدعاية',fm(ad),N.length&&ad?'تكلفة المريض الجديد '+fm(ad/N.length):'')}${kpi('القيمة ÷ تكلفة الجلب',ad&&N.length?fm(ltv/(ad/N.length),1)+'×':'—')}</div></div>
   <div class="card"><h3>قيمة المريض حسب مصدر الإحالة</h3>${tableHTML(['المصدر',{t:'مرضى',n:1},{t:'متوسط اللي دفعه',n:1},{t:'الإجمالي',n:1}],Object.entries(sg).sort((a,b)=>b[1].paid-a[1].paid).map(([s,g])=>[esc(s),g.n,g.paid/g.n,g.paid]),{h:380})}</div>
   <div class="card"><h3>التحويل بين الأقسام<small>مرضى ليهم جلسات في الفترة</small></h3>${tableHTML(['الأقسام اللي عملها',{t:'مرضى',n:1},{t:'متوسط اللي دفعه',n:1}],Object.entries(combo).sort((a,b)=>b[1].n-a[1].n).map(([k,g])=>[k,g.n,g.paid/g.n]))}
    <div class="grid g4" style="margin-top:10px">${kpi('مريض أكتر من قسم',fm(avg(multi)),fm(multi.length)+' مريض')}${kpi('مريض قسم واحد',fm(avg(single)),fm(single.length)+' مريض')}
    ${(()=>{const [a,b]=mv('phy','nut'),[c2,d2]=mv('nut','phy'),[e,f]=mv('phy','dev');return kpi('علاج طبيعي ← تغذية',pc(a?b/a:null),fm(b)+' من '+fm(a))+kpi('تغذية ← علاج طبيعي',pc(c2?d2/c2:null),fm(d2)+' من '+fm(c2))+kpi('علاج طبيعي ← أجهزة',pc(e?f/e:null),fm(f)+' من '+fm(e))})()}</div></div>
   <div class="card"><h3>تجديد الباقات<small>فاتورة 1,500 جنيه أو أكتر = باقة. اتجددت لو اتعملت فاتورة كبيرة تانية خلال 60 يوم من آخر جلسة</small></h3>
    ${tableHTML(['القسم',{t:'باقات خلصت',n:1},{t:'اتجددت',n:1},{t:'نسبة التجديد',n:1},{t:'وسيط الأيام',n:1}],Object.entries(rs).map(([d,g])=>[d,g.n,g.r,pc(g.n?g.r/g.n:null),med(g.days)??'—']))}<div class="ch sm" style="margin-top:10px"><canvas id="cp1"></canvas></div></div></div>`}
function cPtsC(){const {byP}=cenBuild(),td=todayC(),ks=cMonths();const IV=D.inv.filter(x=>inB(x)&&x.pid&&x.total-x.disc>=1500).sort((a,b)=>a.d<b.d?-1:1);const ib={};IV.forEach(x=>(ib[x.pid]=ib[x.pid]||[]).push(x));
  const byK={};for(const pid in ib){const l=ib[pid],ap=(byP[pid]||[]).map(x=>x[0]);l.forEach((x,i)=>{const nx=l[i+1];const la=ap.filter(d=>d>=x.d&&(!nx||d<nx.d)).pop()||x.d;const ren=nx&&(Date.parse(nx.d)-Date.parse(la))/864e5<=60;if(!ren&&(Date.parse(td)-Date.parse(la))/864e5<=30)return;const g=byK[la.slice(0,7)]=byK[la.slice(0,7)]||{n:0,r:0};g.n++;if(ren)g.r++})}
  chart('cp1',{type:'line',data:{labels:ks.map(mls),datasets:[line('% تجديد حسب شهر آخر جلسة',ks.map(k=>byK[k]&&byK[k].n?Math.round(100*byK[k].r/byK[k].n):null),SER()[0])]},options:{scales:{y:{ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:x=>' '+x.parsed.y+'%'}}}}})}

// ---------- الدكاترة والزحمة ----------
function cOpsV(){const {P,pts}=cenBuild();const A=D.apt.filter(a=>inB(a)&&inR(a)&&!/cancel/i.test(a.st));const done=A.filter(a=>a.st==='Completed');
  const docs=[...new Set(done.map(a=>a.doc))].filter(d=>d&&d!=='—');const nm2=Object.values(pts);
  const rows=docs.map(d=>{const s=done.filter(a=>a.doc===d),rev=P.filter(p=>inR(p)&&p.doc===d).reduce((q,p)=>q+p.amt,0),np=nm2.filter(p=>p.doc0===d&&!p.early&&nIn(p.k0,S.from,S.to));
    return [esc(d),s.length,new Set(s.map(a=>a.pid)).size,rev,s.length?rev/s.length:0,np.length,np.length?fm(np.reduce((q,p)=>q+p.n,0)/np.length,1):'—',np.length?pc(np.filter(p=>p.n>=6).length/np.length):'—']}).sort((a,b)=>b[1]-a[1]);
  const dsel=`<select id="cDoc"><option value="">المركز كله</option>${docs.sort().map(d=>`<option${CEN.doc===d?' selected':''}>${esc(d)}</option>`).join('')}</select>`;
  const H=A.filter(a=>!CEN.doc||a.doc===CEN.doc),hrs=[...new Set(H.map(a=>a.h))].sort((a,b)=>a-b),dd=[6,0,1,2,3,4],g={};H.forEach(a=>{const k=a.w+'|'+a.h;g[k]=(g[k]||0)+1});const mx=Math.max(0,...Object.values(g)),wk=Math.max(1,cMonths().length*4.3);
  const heat=`<div class="tw"><table><thead><tr><th>اليوم</th>${hrs.map(h=>`<th class="n">${h}:00</th>`).join('')}</tr></thead><tbody>${dd.map(w=>`<tr><td>${DAYS[w]}</td>${hrs.map(h=>{const v=g[w+'|'+h]||0;return `<td class="n" style="${hm(v,mx)}">${v?(v/wk).toFixed(1):''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<div class="card"><h3>الدكاترة<small>${ml(S.from)} لـ ${ml(S.to)} — الإيراد من المدفوعات المسجلة على الدكتور</small></h3>${tableHTML(['الدكتور',{t:'جلسات مكتملة',n:1},{t:'مرضى',n:1},{t:'الإيراد',n:1},{t:'إيراد الجلسة',n:1},{t:'مرضى جداد بدأوا معاه',n:1},{t:'متوسط جلساتهم',n:1},{t:'كمّلوا 6+',n:1}],rows,{h:460})}</div>
  <div class="card" style="margin-top:12px"><h3>الجلسات المكتملة شهري — أكتر 6 دكاترة</h3><div class="ch"><canvas id="co1"></canvas></div></div>
  <div class="card" style="margin-top:12px"><h3>زحمة المواعيد<small>متوسط المواعيد في الأسبوع لكل يوم وساعة (من غير الملغي)</small></h3><div class="bar">${dsel}</div>${heat}</div>`}
function cOpsC(){const ks=cMonths(),c=SER(),done=D.apt.filter(a=>inB(a)&&a.st==='Completed'&&nIn(a.k,S.from,S.to));const top=groupSum(done,'doc',()=>1).slice(0,6).map(x=>x[0]);
  chart('co1',{type:'line',data:{labels:ks.map(mls),datasets:top.map((d,i)=>line(d,ks.map(k=>done.filter(a=>a.k===k&&a.doc===d).length),c[i]))}});
  const s=$('#cDoc');if(s)s.onchange=()=>{CEN.doc=s.value;render()}}
VIEWS.cen=[vCen,cCen];
