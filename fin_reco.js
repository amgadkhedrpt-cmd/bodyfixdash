// BODYFIX — كارت «💡 ترشيحات»: قواعد بتقرا الأرقام على الجهاز وتطلع ملاحظات محددة. مفيش أرقام بتخرج من الصفحة.
'use strict';
function recoMonth(){const c=curK();let k=S.to;const day=+todayC().slice(8,10);if(k===c&&day<20)k=shiftK(k,-1);return k}   // الشهر الحالي لسه ما خلصش: نقيس على اللي قبله
const avgOf=a=>{const b=a.filter(x=>x!=null&&isFinite(x));return b.length?b.reduce((s,x)=>s+x,0)/b.length:null};
function recoList(){const out=[],k=recoMonth(),add=(lvl,title,detail,tab,sub)=>out.push({lvl,title,detail,tab,sub});
  const ks6=monthsList(shiftK(k,-6),shiftK(k,-1)),ks12=monthsList(shiftK(k,-12),shiftK(k,-1));const has=m=>D.months.includes(m);
  try{
  // ---- إيراد ومصروفات المركز ----
  const R=monthsList(shiftK(k,-12),k).filter(has).map(calcMonth),M=R[R.length-1];
  if(M&&M.hasPay){
    const l3=R.slice(-4);if(l3.length===4&&l3[1].net<l3[0].net&&l3[2].net<l3[1].net&&l3[3].net<l3[2].net)add('warn','الإيراد نازل 3 شهور ورا بعض',`من ${fm(l3[0].net)} في ${ml(l3[0].k)} لـ ${fm(l3[3].net)} في ${ml(k)}. شوف «تحليلات المركز ← الإيراد اتغير ليه» علشان تعرف من أنهي قسم.`,'cen','trend');
    const ly=has(shiftK(k,-12))?calcMonth(shiftK(k,-12)):null;if(ly&&ly.net){const g=(M.net-ly.net)/ly.net;if(g>=0.15)add('good','نمو قوي عن السنة اللي فاتت',`إيراد ${ml(k)} أعلى ${pc(g)} من نفس الشهر السنة اللي فاتت.`,'sum');else if(g<=-0.1)add('warn','الإيراد أقل من نفس الشهر السنة اللي فاتت',`${ml(k)} أقل ${pc(-g)} من ${ml(ly.k)} — مش موسم بس، فيه حاجة اتغيرت.`,'cen','trend')}
    const mAvg=avgOf(R.slice(0,-1).map(r=>r.margin));if(M.margin!=null&&mAvg!=null&&M.margin<mAvg-0.05)add('warn','هامش الربح أقل من العادي',`هامش ${ml(k)} ${pc(M.margin)} والمتوسط ${pc(mAvg)}. راجع المصروفات اللي زادت تحت.`,'pl');
    if(M.net&&M.refunds/M.rev>0.03)add('warn','المردودات للمرضى عالية',`${pc(M.refunds/M.rev)} من الإيراد في ${ml(k)} (${fm(M.refunds)} جنيه).`,'exp');
    if(M.beS&&M.sessions<M.beS)add('warn','الجلسات تحت نقطة التعادل',`${fm(M.sessions)} جلسة والتعادل ${fm(M.beS)} جلسة في الشهر.`,'sum')}
  // مصروف زاد فجأة
  const E=D.exp.filter(e=>expIn(e)&&!REFUND_RX.test(e.type));const byT={};E.forEach(e=>{const t=byT[e.type]=byT[e.type]||{};t[e.k]=(t[e.k]||0)+e.amt});
  const spikes=[];for(const t in byT){const cur=byT[t][k]||0,base=avgOf(ks6.map(m=>byT[t][m]||0));if(cur>3000&&base!=null&&cur>1.5*base&&cur-base>2000)spikes.push([t,cur,base])}
  spikes.sort((a,b)=>(b[1]-b[2])-(a[1]-a[2])).slice(0,3).forEach(([t,c,b])=>add('warn',`مصروف «${t}» زاد فجأة`,`${fm(c)} في ${ml(k)} والمتوسط ${fm(b)} آخر 6 شهور (+${fm(c-b)}).`,'exp'));
  // الإلغاء والغياب
  const A=D.apt.filter(a=>inB(a)&&!/^Waiting/i.test(a.room||''));const rate=m=>{const x=A.filter(a=>a.k===m);return x.length?x.filter(a=>/cancel|no ?show/i.test(a.st)).length/x.length:null};
  const rk=rate(k),rb=avgOf(ks6.map(rate));if(rk!=null&&rb!=null&&rk>rb+0.03)add('warn','الإلغاء والغياب زاد',`${pc(rk)} من المواعيد في ${ml(k)} والمتوسط ${pc(rb)}. راجع تأكيدات المواعيد ومتابعة اللي ما جوش.`,'apt');
  // المديونيات القديمة
  const td=todayC(),old=D.inv.filter(x=>inB(x)&&(Date.parse(td)-Date.parse(x.d))/864e5>90).reduce((s,x)=>s+Math.max(0,x.total-x.disc-x.paid),0);
  if(M&&old>0.1*M.net)add('warn','مديونيات قديمة كتير',`${fm(old)} جنيه على فواتير عدّى عليها أكتر من 90 يوم (${pc(old/M.net)} من إيراد شهر). كل ما الدين يقدم بيبقى أصعب يتحصّل.`,'debt');
  // ---- المرضى (المركز) ----
  if(typeof cenBuild==='function'){const {pts}=cenBuild(),PT=Object.values(pts).filter(p=>!p.early);
    const win=PT.filter(p=>nIn(p.k0,shiftK(k,-12),shiftK(k,-2)));const avgL=avgOf(win.map(p=>p.paid));
    // مصادر الإحالة
    const sg={};win.forEach(p=>{(sg[p.src]=sg[p.src]||[]).push(p)});const ads=D.exp.filter(e=>expIn(e)&&nIn(e.k,shiftK(k,-12),k)&&/دعاي|اعلان|إعلان|ماركت|marketing|ads|سوشيال/i.test(e.type+' '+e.info)).reduce((s,e)=>s+e.amt,0);
    for(const s in sg){if(s==='مش متسجل'||sg[s].length<8||!avgL)continue;const v=avgOf(sg[s].map(p=>p.paid));if(v>=1.3*avgL)add('good',`مصدر «${s}» بيجيب مرضى قيمتهم عالية`,`متوسط اللي بيدفعه المريض ${fm(v)} مقابل ${fm(avgL)} للمركز (${sg[s].length} مريض). يستاهل دعاية أو اهتمام أكتر.`,'cen','pts');
      else if(v<=0.6*avgL)add('info',`مرضى «${s}» قيمتهم أقل`,`متوسط ${fm(v)} مقابل ${fm(avgL)} — شوف هل بيوقفوا بدري.`,'cen','pts')}
    const unk=(sg['مش متسجل']||[]).length;if(win.length>20&&unk/win.length>0.3)add('info','مصدر الإحالة مش متسجل لكتير من المرضى',`${pc(unk/win.length)} من المرضى الجداد من غير مصدر — من غيره مش هتعرف الدعاية بتجيب إيه.`,'pts');
    if(ads&&win.length&&avgL){const cac=ads/win.length;if(avgL/cac<3)add('warn','الدعاية غالية مقارنة بقيمة المريض',`قيمة المريض ${fm(avgL)} وتكلفة جلبه حوالي ${fm(cac)} (${fm(avgL/cac,1)}×). المعقول 3× أو أكتر.`,'cen','pts')}
    // الدكاترة
    const dg={};win.forEach(p=>{(dg[p.doc0]=dg[p.doc0]||[]).push(p)});const six=a=>a.filter(p=>p.n>=6).length/a.length,base=win.length?six(win):null;
    const low=Object.entries(dg).filter(([d,a])=>d&&a.length>=10&&!ALAA.test(d)&&base&&six(a)<0.7*base).map(([d,a])=>`${d} (${pc(six(a))})`);
    if(low.length)add('warn','استمرار مرضى أقل من المتوسط عند بعض الدكاترة',`نسبة اللي كمّلوا 6 جلسات أو أكتر من المرضى اللي بدأوا معاهم: ${low.join('، ')} — والمتوسط ${pc(base)}.`,'cen','ops');
    // الأقسام
    const dm=monthsList(shiftK(k,-3),k).map(deptMonth);DEPTS.forEach(([d,t])=>{const v=dm.map(m=>m[d].rev);if(v.length===4&&v[0]>0&&v[1]<v[0]&&v[2]<v[1]&&v[3]<v[2])add('warn',`إيراد ${t} نازل 3 شهور ورا بعض`,`من ${fm(v[0])} لـ ${fm(v[3])}.`,'cen','trend')});
    // تجديد الباقات
    const {byP}=cenBuild(),IV=D.inv.filter(x=>inB(x)&&x.pid&&x.total-x.disc>=1500).sort((a,b)=>a.d<b.d?-1:1),ib={};IV.forEach(x=>(ib[x.pid]=ib[x.pid]||[]).push(x));const rk2={};
    for(const pid in ib){const l=ib[pid],ap=(byP[pid]||[]).map(x=>x[0]);l.forEach((x,i)=>{const nx=l[i+1],la=ap.filter(d=>d>=x.d&&(!nx||d<nx.d)).pop()||x.d,ren=nx&&(Date.parse(nx.d)-Date.parse(la))/864e5<=60;if(!ren&&(Date.parse(td)-Date.parse(la))/864e5<=30)return;const g=rk2[la.slice(0,7)]=rk2[la.slice(0,7)]||{n:0,r:0};g.n++;if(ren)g.r++})}
    const rr=ms=>{const n=ms.reduce((s,m)=>s+(rk2[m]?.n||0),0);return n>=10?ms.reduce((s,m)=>s+(rk2[m]?.r||0),0)/n:null};const r3=rr(monthsList(shiftK(k,-3),shiftK(k,-1))),r6=rr(monthsList(shiftK(k,-9),shiftK(k,-4)));
    if(r3!=null&&r6!=null&&r3<r6-0.05)add('warn','تجديد الباقات نزل',`${pc(r3)} آخر 3 شهور مقابل ${pc(r6)} اللي قبلها. المريض اللي بيخلص باقة محتاج مكالمة قبل آخر جلسة.`,'cen','pts')}
  // الساعات الفاضية
  const AH=D.apt.filter(a=>inB(a)&&nIn(a.k,shiftK(k,-2),k)&&!/cancel/i.test(a.st)&&!/^Waiting/i.test(a.room||''));const g={};AH.forEach(a=>{if(a.w===5)return;const key=a.w+'|'+a.h;g[key]=(g[key]||0)+1});
  const vals=Object.entries(g);if(vals.length>10){const mx=Math.max(...vals.map(v=>v[1])),hrs=vals.map(v=>+v[0].split('|')[1]),hmin=Math.min(...hrs)+1,hmax=Math.max(...hrs)-1;
    const lowS=vals.filter(([key,v])=>{const h=+key.split('|')[1];return h>=hmin&&h<=hmax&&v<0.35*mx}).sort((a,b)=>a[1]-b[1]).slice(0,4).map(([key])=>{const [w,h]=key.split('|');return `${DAYS[w]} ${h}:00`});
    if(lowS.length)add('info','ساعات فاضية في الجدول',`أقل الساعات زحمة آخر 3 شهور: ${lowS.join('، ')}. ممكن تتملى بمتابعات أو عروض أو مرضى الويتنج.`,'cen','ops')}
  // ---- التغذية ----
  if((S.b==='haram'||S.b==='both')&&(RAW.kinds||{}).ops&&typeof nutMonth==='function'){const N=nutMonth(k),C=NUT.cfg;
    if(N.rev){const di=N.byC.inj,dd=N.byC.dev;
      if(di.tot&&di.disc/di.tot>C.alertInjDisc)add('warn','خصم الحقن عالي',`${pc(di.disc/di.tot)} في ${ml(k)} (${fm(di.disc)} جنيه). الخصم بيطلع من الربح بس، والحقن ${pc(N.injRev/N.rev)} من إيراد التغذية.`,'nut','rev');
      if(dd.tot&&dd.disc/dd.tot>C.alertDevDisc)add('warn','خصم الأجهزة عالي',`${pc(dd.disc/dd.tot)} في ${ml(k)}. تكلفة الأجهزة ثابتة، فالمشكلة في الاستخدام مش السعر.`,'nut','dev');
      if(N.injRev/N.rev>C.alertInjShare)add('warn','التغذية معتمدة على الحقن',`الحقن ${pc(N.injRev/N.rev)} من إيراد القسم. كبّر المتابعات وباقة الـ12.`,'nut','trend');
      if(N.after!=null&&N.margin<0.1)add('warn','هامش التغذية رفيع',`صافي بعد راتب د. آلاء ${fm(N.after)} (${pc(N.margin)}).`,'nut','pl');
      const {ops}=nutBuild(),ex=m=>ops.filter(o=>o.k===m&&o.cat==='exam').length,e0=ex(k),eb=avgOf(monthsList(shiftK(k,-3),shiftK(k,-1)).map(ex));
      if(eb&&e0<0.75*eb)add('warn','كشوفات التغذية الجديدة قلّت',`${e0} كشف في ${ml(k)} والمتوسط ${fm(eb,0)}. ده بيبان في الإيراد بعد شهرين.`,'nut','pts');
      if(N.sal.none)add('info','مرتبات التغذية مش مرفوعة','ارفع ملفات المرتبات من «التغذية ← الإعدادات» علشان ربح القسم يبقى حقيقي.','nut','cfg')}}
  }catch(e){console.error(e);add('info','ما قدرتش أحسب كل الترشيحات','فيه بيانات ناقصة — '+e.message)}
  return {k,list:out.sort((a,b)=>({warn:0,good:1,info:2}[a.lvl]-{warn:0,good:1,info:2}[b.lvl]))}}
function recoCard(){const {k,list}=recoList();const ic={warn:'⚠️',good:'✅',info:'💡'};
  return `<div class="card" style="margin-bottom:12px"><h3>💡 ترشيحات<small>${BRN[S.b]} — محسوبة على ${ml(k)}${k!==S.to?' (الشهر الحالي لسه ما خلصش)':''} — على جهازك بس</small></h3>
  ${list.length?`<div style="display:grid;gap:8px">${list.slice(0,12).map(r=>`<div class="note" style="border-inline-start:4px solid var(${r.lvl==='warn'?'--warn':r.lvl==='good'?'--good':'--c1'});cursor:${r.tab?'pointer':'default'}" ${r.tab?`data-go="${r.tab}|${r.sub||''}"`:''}><b>${ic[r.lvl]} ${esc(r.title)}</b><br>${esc(r.detail)}${r.tab?' <span class="muted">← افتح</span>':''}</div>`).join('')}</div>${list.length>12?`<div class="muted">و${list.length-12} ملاحظة تانية أقل أهمية</div>`:''}`:'<div class="muted">مفيش ملاحظات مهمة الشهر ده ✓</div>'}</div>`}
const _vSum=VIEWS.sum[0],_cSum=VIEWS.sum[1];
VIEWS.sum=[()=>recoCard()+_vSum(),()=>{_cSum();document.querySelectorAll('[data-go]').forEach(el=>el.onclick=()=>{const [t,s]=el.dataset.go.split('|');S.tab=t;if(t==='nut'&&s)NUT.sub=s;if(t==='cen'&&s)CEN.sub=s;render();window.scrollTo({top:0})})}];
