// BODYFIX — كارت «💡 ترشيحات»: قواعد بتقرا الأرقام على الجهاز وتطلع ملاحظات محددة. مفيش أرقام بتخرج من الصفحة.
'use strict';
function recoMonth(){const c=curK();let k=S.to;const day=+todayC().slice(8,10);if(k===c&&day<20)k=shiftK(k,-1);return k}   // الشهر الحالي لسه ما خلصش: نقيس على اللي قبله
const avgOf=a=>{const b=a.filter(x=>x!=null&&isFinite(x));return b.length?b.reduce((s,x)=>s+x,0)/b.length:null};
function recoList(){const out=[],k=recoMonth(),add=(lvl,title,detail,tab,sub,drill)=>out.push({lvl,title,detail,tab,sub,drill:drill||null,k});
  const ks6=monthsList(shiftK(k,-6),shiftK(k,-1)),ks12=monthsList(shiftK(k,-12),shiftK(k,-1));const has=m=>D.months.includes(m);
  try{
  // ---- إيراد ومصروفات المركز ----
  const R=monthsList(shiftK(k,-12),k).filter(has).map(calcMonth),M=R[R.length-1];
  if(M&&M.hasPay){
    const l3=R.slice(-4);if(l3.length===4&&l3[1].net<l3[0].net&&l3[2].net<l3[1].net&&l3[3].net<l3[2].net)add('warn','الإيراد نازل 3 شهور ورا بعض',`من ${fm(l3[0].net)} في ${ml(l3[0].k)} لـ ${fm(l3[3].net)} في ${ml(k)}. شوف «تحليلات المركز ← الإيراد اتغير ليه» علشان تعرف من أنهي قسم.`,'cen','trend',{t:'rev'});
    const ly=has(shiftK(k,-12))?calcMonth(shiftK(k,-12)):null;if(ly&&ly.net){const g=(M.net-ly.net)/ly.net;if(g>=0.15)add('good','نمو قوي عن السنة اللي فاتت',`إيراد ${ml(k)} أعلى ${pc(g)} من نفس الشهر السنة اللي فاتت.`,'sum','',{t:'rev'});else if(g<=-0.1)add('warn','الإيراد أقل من نفس الشهر السنة اللي فاتت',`${ml(k)} أقل ${pc(-g)} من ${ml(ly.k)} — مش موسم بس، فيه حاجة اتغيرت.`,'cen','trend',{t:'rev'})}
    const mAvg=avgOf(R.slice(0,-1).map(r=>r.margin));if(M.margin!=null&&mAvg!=null&&M.margin<mAvg-0.05)add('warn','هامش الربح أقل من العادي',`هامش ${ml(k)} ${pc(M.margin)} والمتوسط ${pc(mAvg)}. راجع المصروفات اللي زادت تحت.`,'pl','',{t:'margin'});
    if(M.net&&M.refunds/M.rev>0.03)add('warn','المردودات للمرضى عالية',`${pc(M.refunds/M.rev)} من الإيراد في ${ml(k)} (${fm(M.refunds)} جنيه).`,'exp','',{t:'refund'});
    if(M.beS&&M.sessions<M.beS)add('warn','الجلسات تحت نقطة التعادل',`${fm(M.sessions)} جلسة والتعادل ${fm(M.beS)} جلسة في الشهر.`,'sum','',{t:'be'})}
  // مصروف زاد فجأة
  const E=D.exp.filter(e=>expIn(e)&&!REFUND_RX.test(e.type));const byT={};E.forEach(e=>{const t=byT[e.type]=byT[e.type]||{};t[e.k]=(t[e.k]||0)+e.amt});
  const spikes=[];for(const t in byT){const cur=byT[t][k]||0,base=avgOf(ks6.map(m=>byT[t][m]||0));if(cur>3000&&base!=null&&cur>1.5*base&&cur-base>2000)spikes.push([t,cur,base])}
  spikes.sort((a,b)=>(b[1]-b[2])-(a[1]-a[2])).slice(0,3).forEach(([t,c,b])=>add('warn',`مصروف «${t}» زاد فجأة`,`${fm(c)} في ${ml(k)} والمتوسط ${fm(b)} آخر 6 شهور (+${fm(c-b)}).`,'exp','',{t:'exp',type:t}));
  // الإلغاء والغياب
  const A=D.apt.filter(a=>inB(a)&&!/^Waiting/i.test(a.room||''));const rate=m=>{const x=A.filter(a=>a.k===m);return x.length?x.filter(a=>/cancel|no ?show/i.test(a.st)).length/x.length:null};
  const rk=rate(k),rb=avgOf(ks6.map(rate));
  if(rk!=null&&rk>0.25&&!(rb!=null&&rk>rb+0.03))add('warn','ربع المواعيد بتتلغي أو ما بتحصلش',`${pc(rk)} من مواعيد ${ml(k)} اتلغت أو المريض ما جاش — يعني تقريباً موعد من كل ${Math.round(1/rk)}. التأكيد قبلها بيوم وإعادة الحجز الفوري بيقللوا ده.`,'apt','',{t:'cancel'});if(rk!=null&&rb!=null&&rk>rb+0.03)add('warn','الإلغاء والغياب زاد',`${pc(rk)} من المواعيد في ${ml(k)} والمتوسط ${pc(rb)}. راجع تأكيدات المواعيد ومتابعة اللي ما جوش.`,'apt','',{t:'cancel'});
  // المديونيات القديمة
  const td=todayC(),old=D.inv.filter(x=>inB(x)&&(Date.parse(td)-Date.parse(x.d))/864e5>90).reduce((s,x)=>s+Math.max(0,x.total-x.disc-x.paid),0);
  if(M&&old>0.1*M.net)add('warn','مديونيات قديمة كتير',`${fm(old)} جنيه على فواتير عدّى عليها أكتر من 90 يوم (${pc(old/M.net)} من إيراد شهر). كل ما الدين يقدم بيبقى أصعب يتحصّل.`,'debt','',{t:'debt'});
  // ---- المرضى (المركز) ----
  if(typeof cenBuild==='function'){const {pts}=cenBuild(),PT=Object.values(pts).filter(p=>!p.early);
    const win=PT.filter(p=>nIn(p.k0,shiftK(k,-12),shiftK(k,-2)));
    const nwc=m=>PT.filter(p=>p.k0===m).length,n3=avgOf(monthsList(shiftK(k,-2),k).map(nwc)),n6=avgOf(monthsList(shiftK(k,-5),shiftK(k,-3)).map(nwc));
    if(n3!=null&&n6&&n3<0.9*n6)add('warn','المرضى الجداد قلّوا',`متوسط ${fm(n3)} مريض جديد في الشهر آخر 3 شهور مقابل ${fm(n6)} قبلهم. ده بيبان في الإيراد بعد شهرين.`,'pts');
    const m1=monthsList(shiftK(k,-4),shiftK(k,-2)).map(m=>{const a=PT.filter(p=>p.k0===m);return a.length?a.filter(p=>p.months.has(shiftK(m,1))).length/a.length:null}),r1=avgOf(m1);
    if(r1!=null&&r1<0.6)add('warn','نص المرضى الجداد تقريباً ما بيرجعوش',`${pc(1-r1)} من المرضى الجداد آخر شهور ما كانش ليهم جلسة الشهر التاني. مكالمة خلال أسبوع لكل مريض ما حجزش هي أكبر فرصة.`,'cen','pts');const avgL=avgOf(win.map(p=>p.paid));
    // مصادر الإحالة
    const sg={};win.forEach(p=>{(sg[p.src]=sg[p.src]||[]).push(p)});const ads=D.exp.filter(e=>expIn(e)&&nIn(e.k,shiftK(k,-12),k)&&/دعاي|اعلان|إعلان|ماركت|marketing|ads|سوشيال/i.test(e.type+' '+e.info)).reduce((s,e)=>s+e.amt,0);
    for(const s in sg){if(s==='مش متسجل'||sg[s].length<8||!avgL)continue;const v=avgOf(sg[s].map(p=>p.paid));if(v>=1.3*avgL)add('good',`مصدر «${s}» بيجيب مرضى قيمتهم عالية`,`متوسط اللي بيدفعه المريض ${fm(v)} مقابل ${fm(avgL)} للمركز (${sg[s].length} مريض). يستاهل دعاية أو اهتمام أكتر.`,'cen','pts',{t:'src',src:s});
      else if(v<=0.6*avgL)add('info',`مرضى «${s}» قيمتهم أقل`,`متوسط ${fm(v)} مقابل ${fm(avgL)} — شوف هل بيوقفوا بدري.`,'cen','pts',{t:'src',src:s})}
    const unk=(sg['مش متسجل']||[]).length;if(win.length>20&&unk/win.length>0.3)add('info','مصدر الإحالة مش متسجل لكتير من المرضى',`${pc(unk/win.length)} من المرضى الجداد من غير مصدر — من غيره مش هتعرف الدعاية بتجيب إيه.`,'pts','',{t:'src',src:'مش متسجل'});
    if(ads&&win.length&&avgL){const cac=ads/win.length;if(avgL/cac<3)add('warn','الدعاية غالية مقارنة بقيمة المريض',`قيمة المريض ${fm(avgL)} وتكلفة جلبه حوالي ${fm(cac)} (${fm(avgL/cac,1)}×). المعقول 3× أو أكتر.`,'cen','pts',{t:'cac'})}
    // الدكاترة
    const dg={};win.forEach(p=>{(dg[p.doc0]=dg[p.doc0]||[]).push(p)});const six=a=>a.filter(p=>p.n>=6).length/a.length,base=win.length?six(win):null;
    const low=Object.entries(dg).filter(([d,a])=>d&&d!==PAST_DOC&&a.length>=10&&!ALAA.test(d)&&base&&six(a)<0.7*base).map(([d,a])=>`${d} (${pc(six(a))})`);
    if(low.length)add('warn','استمرار مرضى أقل من المتوسط عند بعض الدكاترة',`نسبة اللي كمّلوا 6 جلسات أو أكتر من المرضى اللي بدأوا معاهم: ${low.join('، ')} — والمتوسط ${pc(base)}.`,'cen','ops',{t:'docs'});
    // الأقسام
    const dm=monthsList(shiftK(k,-3),k).map(deptMonth);DEPTS.forEach(([d,t])=>{const v=dm.map(m=>m[d].rev);if(v.length===4&&v[0]>0&&v[1]<v[0]&&v[2]<v[1]&&v[3]<v[2])add('warn',`إيراد ${t} نازل 3 شهور ورا بعض`,`من ${fm(v[0])} لـ ${fm(v[3])}.`,'cen','trend',{t:'dept',d})});
    // تجديد الباقات
    const {byP}=cenBuild(),IV=D.inv.filter(x=>inB(x)&&x.pid&&x.total-x.disc>=1500).sort((a,b)=>a.d<b.d?-1:1),ib={};IV.forEach(x=>(ib[x.pid]=ib[x.pid]||[]).push(x));const rk2={};
    for(const pid in ib){const l=ib[pid],ap=(byP[pid]||[]).map(x=>x[0]);l.forEach((x,i)=>{const nx=l[i+1],la=ap.filter(d=>d>=x.d&&(!nx||d<nx.d)).pop()||x.d,ren=nx&&(Date.parse(nx.d)-Date.parse(la))/864e5<=60;if(!ren&&(Date.parse(td)-Date.parse(la))/864e5<=30)return;const g=rk2[la.slice(0,7)]=rk2[la.slice(0,7)]||{n:0,r:0};g.n++;if(ren)g.r++})}
    const rr=ms=>{const n=ms.reduce((s,m)=>s+(rk2[m]?.n||0),0);return n>=10?ms.reduce((s,m)=>s+(rk2[m]?.r||0),0)/n:null};const r3=rr(monthsList(shiftK(k,-3),shiftK(k,-1))),r6=rr(monthsList(shiftK(k,-9),shiftK(k,-4)));
    if(r3!=null&&r6!=null&&r3<r6-0.05)add('warn','تجديد الباقات نزل',`${pc(r3)} آخر 3 شهور مقابل ${pc(r6)} اللي قبلها. المريض اللي بيخلص باقة محتاج مكالمة قبل آخر جلسة.`,'cen','pts',{t:'renew'})}
  // الساعات الفاضية
  const AH=D.apt.filter(a=>inB(a)&&nIn(a.k,shiftK(k,-2),k)&&!/cancel/i.test(a.st)&&!/^Waiting/i.test(a.room||''));const g={};AH.forEach(a=>{if(a.w===5)return;const key=a.w+'|'+a.h;g[key]=(g[key]||0)+1});
  const vals=Object.entries(g);if(vals.length>10){const mx=Math.max(...vals.map(v=>v[1])),hrs=vals.map(v=>+v[0].split('|')[1]),hmin=Math.min(...hrs)+1,hmax=Math.max(...hrs)-1;
    const lowS=vals.filter(([key,v])=>{const h=+key.split('|')[1];return h>=hmin&&h<=hmax&&v<0.35*mx}).sort((a,b)=>a[1]-b[1]).slice(0,4).map(([key])=>{const [w,h]=key.split('|');return `${DAYS[w]} ${h}:00`});
    if(lowS.length)add('info','ساعات فاضية في الجدول',`أقل الساعات زحمة آخر 3 شهور: ${lowS.join('، ')}. ممكن تتملى بمتابعات أو عروض أو مرضى الويتنج.`,'cen','ops',{t:'slots'})}
  // ---- التغذية ----
  if((S.b==='haram'||S.b==='both')&&(RAW.kinds||{}).ops&&typeof nutMonth==='function'){const N=nutMonth(k),C=NUT.cfg;
    if(N.rev){const di=N.byC.inj,dd=N.byC.dev;
      if(di.tot&&di.disc/di.tot>C.alertInjDisc)add('warn','خصم الحقن عالي',`${pc(di.disc/di.tot)} في ${ml(k)} (${fm(di.disc)} جنيه). الخصم بيطلع من الربح بس، والحقن ${pc(N.injRev/N.rev)} من إيراد التغذية.`,'nut','rev',{t:'ndisc',cat:'inj'});
      if(dd.tot&&dd.disc/dd.tot>C.alertDevDisc)add('warn','خصم الأجهزة عالي',`${pc(dd.disc/dd.tot)} في ${ml(k)}. تكلفة الأجهزة ثابتة، فالمشكلة في الاستخدام مش السعر.`,'nut','dev',{t:'ndisc',cat:'dev'});
      if(N.injRev/N.rev>C.alertInjShare)add('warn','التغذية معتمدة على الحقن',`الحقن ${pc(N.injRev/N.rev)} من إيراد القسم. كبّر المتابعات وباقة الـ12.`,'nut','trend',{t:'nshare'});
      if(N.after!=null&&N.margin<0.1)add('warn','هامش التغذية رفيع',`صافي بعد راتب د. آلاء ${fm(N.after)} (${pc(N.margin)}).`,'nut','pl',{t:'nmargin'});
      const {ops}=nutBuild(),ex=m=>ops.filter(o=>o.k===m&&o.cat==='exam').length,e0=ex(k),eb=avgOf(monthsList(shiftK(k,-3),shiftK(k,-1)).map(ex));
      if(eb&&e0<0.75*eb)add('warn','كشوفات التغذية الجديدة قلّت',`${e0} كشف في ${ml(k)} والمتوسط ${fm(eb,0)}. ده بيبان في الإيراد بعد شهرين.`,'nut','pts',{t:'nexam'});
      if(N.sal.none)add('info','مرتبات التغذية مش مرفوعة','ارفع ملفات المرتبات من «التغذية ← الإعدادات» علشان ربح القسم يبقى حقيقي.','nut','cfg')}}
  }catch(e){console.error(e);add('info','ما قدرتش أحسب كل الترشيحات','فيه بيانات ناقصة — '+e.message)}
  return {k,list:out.sort((a,b)=>({warn:0,good:1,info:2}[a.lvl]-{warn:0,good:1,info:2}[b.lvl]))}}
let RECO_LAST=[];
function recoCard(){const {k,list}=recoList();RECO_LAST=list;const ic={warn:'⚠️',good:'✅',info:'💡'};
  return `<div class="card" style="margin-bottom:12px"><h3>💡 ترشيحات<small>${BRN[S.b]} — محسوبة على ${ml(k)}${k!==S.to?' (الشهر الحالي لسه ما خلصش)':''} — على جهازك بس</small></h3>
  ${list.length?`<div style="display:grid;gap:8px">${list.slice(0,12).map((r,i)=>`<div class="note" style="border-inline-start:4px solid var(${r.lvl==='warn'?'--warn':r.lvl==='good'?'--good':'--c1'});cursor:${r.tab?'pointer':'default'}" ${r.tab||r.drill?`data-ri="${i}"`:''}><b>${ic[r.lvl]} ${esc(r.title)}</b><br>${esc(r.detail)}${r.drill?' <span class="muted">← التفاصيل</span>':r.tab?' <span class="muted">← افتح</span>':''}</div>`).join('')}</div>${list.length>12?`<div class="muted">و${list.length-12} ملاحظة تانية أقل أهمية</div>`:''}`:'<div class="muted">مفيش ملاحظات مهمة الشهر ده ✓</div>'}</div>`}
const _vSum=VIEWS.sum[0],_cSum=VIEWS.sum[1];
function goTab(t,s){closeDrill();S.tab=t;if(t==='nut'&&s)NUT.sub=s;if(t==='cen'&&s)CEN.sub=s;render();window.scrollTo({top:0})}
VIEWS.sum=[()=>recoCard()+_vSum(),()=>{_cSum();document.querySelectorAll('[data-ri]').forEach(el=>el.onclick=()=>{const r=RECO_LAST[+el.dataset.ri];if(r.drill)openDrill(r);else goTab(r.tab,r.sub)})}];

// ================= التفاصيل لما تدوس على ملاحظة =================
function closeDrill(){const m=$('#drill');if(m)m.remove();if(CH.rdC){CH.rdC.destroy();delete CH.rdC}document.body.style.overflow=''}
const NMAP=()=>{const o={};D.inv.forEach(x=>{if(x.pid&&x.pn)o[x.pid]=x.pn});D.pay.forEach(x=>{if(x.pid&&x.pn&&!o[x.pid])o[x.pid]=x.pn});return o};
function openDrill(r){closeDrill();const d=r.drill,k=r.k,ks=monthsList(shiftK(k,-17),k).filter(m=>D.months.includes(m)),c=SER();let h='',cfg=null,note='';
  const rollAvg=(v,n)=>v.map((_,i)=>i<n?null:avgOf(v.slice(i-n,i)));
  if(d.t==='exp'||d.t==='refund'){const f=d.t==='exp'?(e=>e.type===d.type):(e=>REFUND_RX.test(e.type));const E=D.exp.filter(e=>expIn(e)&&f(e));const v=ks.map(m=>E.filter(e=>e.k===m).reduce((s,e)=>s+e.amt,0));
    cfg={data:{labels:ks.map(mls),datasets:[bar(d.t==='exp'?d.type:'المردودات',v,ks.map(m=>m===k?c[1]:c[0])),line('متوسط آخر 6 شهور',rollAvg(v,6),css('--t3'),{borderDash:[5,4],pointRadius:0})]}};
    const yr=E.filter(e=>nIn(e.k,ks[0],k)).sort((a,b)=>a.d<b.d?1:-1);
    h=tableHTML(['الشهر',{t:'المبلغ',n:1},{t:'عدد السطور',n:1},{t:'الفرق عن الشهر اللي قبله',n:1}],ks.slice().reverse().map((m,i,a)=>{const x=v[ks.indexOf(m)],p=ks.indexOf(m)>0?v[ks.indexOf(m)-1]:null;return [ml(m),x,E.filter(e=>e.k===m).length,p==null?'—':x-p]}),{h:260})+
      `<h4 style="margin:12px 0 6px">كل السطور</h4><input type="search" id="drQ" placeholder="دوّر في التفاصيل" style="width:100%;margin-bottom:6px"><div id="drT"></div>`;
    setTimeout(()=>{const dr=()=>{const q=($('#drQ').value||'').toLowerCase();$('#drT').innerHTML=tableHTML(['التاريخ','التفاصيل','طريقة الدفع','سجّلها',{t:'المبلغ',n:1}],yr.filter(e=>!q||(e.info+' '+e.by).toLowerCase().includes(q)).map(e=>[e.d,esc(e.info),esc(e.meth),esc(e.by),e.amt]),{h:340})};$('#drQ').oninput=dr;dr()},0)}
  else if(d.t==='rev'){const DM=ks.map(deptMonth);cfg={data:{labels:ks.map(mls),datasets:DEPTS.map(([x,t],i)=>bar(t,DM.map(m=>m[x].rev),c[i],{stack:'s',borderRadius:0}))},options:{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:v=>fm(v)}}}}};
    h=tableHTML(['الشهر',...DEPTS.map(x=>({t:x[1],n:1})),{t:'الإجمالي',n:1},{t:'مرضى دفعوا',n:1}],ks.slice().reverse().map(m=>{const x=DM[ks.indexOf(m)];return [ml(m),...DEPTS.map(([y])=>x[y].rev),DEPTS.reduce((s,[y])=>s+x[y].rev,0),new Set(DEPTS.flatMap(([y])=>[...x[y].pts])).size]}),{h:420})}
  else if(d.t==='dept'){const DM=ks.map(deptMonth);cfg={data:{labels:ks.map(mls),datasets:[bar('الإيراد',DM.map(m=>m[d.d].rev),c[0]),line('مرضى دفعوا',DM.map(m=>m[d.d].pts.size),c[1],{hidden:true})]}};
    h=tableHTML(['الشهر',{t:'الإيراد',n:1},{t:'مرضى',n:1},{t:'إيراد المريض',n:1}],ks.slice().reverse().map(m=>{const x=DM[ks.indexOf(m)][d.d];return [ml(m),x.rev,x.pts.size,x.pts.size?x.rev/x.pts.size:0]}),{h:420})}
  else if(d.t==='margin'||d.t==='be'){const R=ks.map(calcMonth);cfg=d.t==='margin'?{type:'line',data:{labels:ks.map(mls),datasets:[line('هامش الربح %',R.map(x=>x.margin==null?null:+(x.margin*100).toFixed(1)),c[0])]}}:{data:{labels:ks.map(mls),datasets:[bar('الجلسات',R.map(x=>x.sessions),c[0]),line('نقطة التعادل',R.map(x=>x.beS),c[7],{borderDash:[5,4]})]}};
    h=tableHTML(['الشهر',{t:'الإيرادات',n:1},{t:'المصروفات',n:1},{t:'المرتبات',n:1},{t:'الإيجار',n:1},{t:'تانية',n:1},{t:'صافي الربح',n:1},{t:'الهامش',n:1},{t:'الجلسات',n:1},{t:'التعادل',n:1}],R.slice().reverse().map(x=>[ml(x.k),x.net,x.opex,x.sal,x.rent,x.other,x.profit,pc(x.margin),x.sessions,x.beS??'—']),{h:420})}
  else if(d.t==='cancel'){const A=D.apt.filter(a=>inB(a)&&!/^Waiting/i.test(a.room||''));const rt=f=>ks.map(m=>{const x=A.filter(a=>a.k===m);return x.length?+(100*x.filter(f).length/x.length).toFixed(1):null});
    cfg={type:'line',data:{labels:ks.map(mls),datasets:[line('إلغاء %',rt(a=>/cancel/i.test(a.st)),c[1]),line('غياب %',rt(a=>/no ?show/i.test(a.st)),c[7])]}};const NM=NMAP();
    const L=A.filter(a=>a.k===k&&/cancel|no ?show/i.test(a.st)).sort((a,b)=>a.d<b.d?1:-1);const byDoc=groupSum(L,'doc',()=>1);
    h=`<h4 style="margin:6px 0">حسب الدكتور — ${ml(k)}</h4>`+tableHTML(['الدكتور',{t:'إلغاء/غياب',n:1}],byDoc,{h:200})+`<h4 style="margin:12px 0 6px">المواعيد — ${ml(k)}</h4>`+tableHTML(['اليوم','المريض','رقم','الدكتور','النوع','الحالة'],L.map(a=>[a.d,esc(NM[a.pid]||''),esc(a.pid),esc(a.doc),esc(tName(a.type)),a.st]),{h:340})}
  else if(d.t==='debt'){const td=todayC(),NM=NMAP();const I=D.inv.filter(x=>inB(x)).map(x=>Object.assign({},x,{rem:Math.max(0,x.total-x.disc-x.paid),age:(Date.parse(td)-Date.parse(x.d))/864e5})).filter(x=>x.rem>1);
    cfg={type:'bar',data:{labels:ks.map(mls),datasets:[bar('الباقي حسب شهر الفاتورة',ks.map(m=>I.filter(x=>x.k===m).reduce((s,x)=>s+x.rem,0)),c[7])]}};
    const O=I.filter(x=>x.age>90).sort((a,b)=>b.rem-a.rem);h=`<div class="note">فواتير عدّى عليها أكتر من 90 يوم: ${fm(O.length)} فاتورة — ${fm(O.reduce((s,x)=>s+x.rem,0))} جنيه.</div>`+tableHTML(['المريض','رقم','تاريخ الفاتورة',{t:'عمرها (يوم)',n:1},{t:'الإجمالي',n:1},{t:'المدفوع',n:1},{t:'الباقي',n:1}],O.slice(0,300).map(x=>[esc(x.pn||NM[x.pid]||''),esc(x.pid),x.d,Math.round(x.age),x.total,x.paid,x.rem]),{h:380})}
  else if(d.t==='src'||d.t==='cac'){const {pts}=cenBuild(),NM=NMAP(),PT=Object.values(pts).filter(p=>!p.early);
    if(d.t==='src'){const S2=PT.filter(p=>p.src===d.src);cfg={data:{labels:ks.map(mls),datasets:[bar('مرضى جداد من «'+d.src+'»',ks.map(m=>S2.filter(p=>p.k0===m).length),c[0])]}};
      h=tableHTML(['المريض','رقم','أول جلسة','أول قسم',{t:'جلسات',n:1},{t:'دفع',n:1}],S2.filter(p=>nIn(p.k0,ks[0],k)).sort((a,b)=>b.paid-a.paid).map(p=>[esc(NM[p.pid]||''),esc(p.pid),p.first,DEPN[p.entry],p.n,p.paid]),{h:380});if(d.src==='مش متسجل')note='اكتب مصدر الإحالة للمرضى دول في Medicolize — بيتحدث هنا لوحده.'}
    else{const ad=m=>D.exp.filter(e=>expIn(e)&&e.k===m&&/دعاي|اعلان|إعلان|ماركت|marketing|ads|سوشيال/i.test(e.type+' '+e.info)).reduce((s,e)=>s+e.amt,0),nw=m=>PT.filter(p=>p.k0===m).length;
      cfg={data:{labels:ks.map(mls),datasets:[bar('تكلفة المريض الجديد',ks.map(m=>nw(m)?Math.round(ad(m)/nw(m)):null),c[1])]}};h=tableHTML(['الشهر',{t:'دعاية',n:1},{t:'مرضى جداد',n:1},{t:'تكلفة المريض',n:1}],ks.slice().reverse().map(m=>[ml(m),ad(m),nw(m),nw(m)?ad(m)/nw(m):0]),{h:400})}}
  else if(d.t==='docs'){const {pts}=cenBuild(),NM=NMAP(),td=todayC();const W=Object.values(pts).filter(p=>!p.early&&nIn(p.k0,shiftK(k,-12),shiftK(k,-2)));const dg={};W.forEach(p=>(dg[p.doc0]=dg[p.doc0]||[]).push(p));
    const rows=Object.entries(dg).filter(([x,a])=>x&&x!==PAST_DOC&&a.length>=5).map(([x,a])=>[esc(x),a.length,fm(a.reduce((s,p)=>s+p.n,0)/a.length,1),a.filter(p=>p.n>=6).length/a.length]).sort((a,b)=>a[3]-b[3]);
    cfg={type:'bar',data:{labels:rows.map(r=>r[0]),datasets:[bar('كمّلوا 6+ %',rows.map(r=>Math.round(100*r[3])),c[0])]},options:{indexAxis:'y',plugins:{legend:{display:false}}}};
    h=tableHTML(['الدكتور',{t:'مرضى بدأوا معاه',n:1},{t:'متوسط جلساتهم',n:1},{t:'كمّلوا 6+',n:1}],rows.map(r=>[r[0],r[1],r[2],pc(r[3])]))+`<h4 style="margin:12px 0 6px">المرضى اللي وقفوا قبل 6 جلسات</h4><select id="drDoc">${rows.map(r=>`<option>${r[0]}</option>`).join('')}</select><div id="drT" style="margin-top:6px"></div>`;
    setTimeout(()=>{const dr=()=>{const x=$('#drDoc').value;$('#drT').innerHTML=tableHTML(['المريض','رقم','أول جلسة',{t:'جلسات',n:1},{t:'دفع',n:1}],(dg[x]||[]).filter(p=>p.n<6).sort((a,b)=>a.first<b.first?1:-1).map(p=>[esc(NM[p.pid]||''),esc(p.pid),p.first,p.n,p.paid]),{h:320})};const s2=$('#drDoc');if(s2){s2.onchange=dr;dr()}},0)}
  else if(d.t==='renew'){const {byP}=cenBuild(),td=todayC(),NM=NMAP();const IV=D.inv.filter(x=>inB(x)&&x.pid&&x.total-x.disc>=1500).sort((a,b)=>a.d<b.d?-1:1),ib={};IV.forEach(x=>(ib[x.pid]=ib[x.pid]||[]).push(x));const all=[];
    for(const pid in ib){const l=ib[pid],ap=(byP[pid]||[]).map(x=>x[0]);l.forEach((x,i)=>{const nx=l[i+1],la=ap.filter(z=>z>=x.d&&(!nx||z<nx.d)).pop()||x.d,ren=nx&&(Date.parse(nx.d)-Date.parse(la))/864e5<=60;if(!ren&&(Date.parse(td)-Date.parse(la))/864e5<=30)return;all.push({pid,inv:x,la,ren})})}
    cfg={type:'line',data:{labels:ks.map(mls),datasets:[line('% تجديد',ks.map(m=>{const f=all.filter(z=>z.la.slice(0,7)===m);return f.length?Math.round(100*f.filter(z=>z.ren).length/f.length):null}),c[0])]}};
    h=`<h4 style="margin:6px 0">باقات خلصت آخر 3 شهور وما اتجددتش</h4>`+tableHTML(['المريض','رقم','الباقة بدأت','آخر جلسة',{t:'قيمة الباقة',n:1}],all.filter(z=>!z.ren&&nIn(z.la.slice(0,7),shiftK(k,-2),k)).sort((a,b)=>a.la<b.la?1:-1).map(z=>[esc(z.inv.pn||NM[z.pid]||''),esc(z.pid),z.inv.d,z.la,z.inv.total-z.inv.disc]),{h:380});note='دول أولى ناس بمكالمة: خلصوا باقة وما رجعوش.'}
  else if(d.t==='slots'){const AH=D.apt.filter(a=>inB(a)&&nIn(a.k,shiftK(k,-2),k)&&!/cancel/i.test(a.st)&&!/^Waiting/i.test(a.room||''));const hrs=[...new Set(AH.map(a=>a.h))].sort((a,b)=>a-b),g={};AH.forEach(a=>{const x=a.w+'|'+a.h;g[x]=(g[x]||0)+1});const mx=Math.max(0,...Object.values(g));
    h=`<div class="tw"><table><thead><tr><th>اليوم</th>${hrs.map(x=>`<th class="n">${x}:00</th>`).join('')}</tr></thead><tbody>${[6,0,1,2,3,4].map(w=>`<tr><td>${DAYS[w]}</td>${hrs.map(x=>{const v=g[w+'|'+x]||0;return `<td class="n" style="${hm(v,mx)}">${v?(v/13).toFixed(1):''}</td>`}).join('')}</tr>`).join('')}</tbody></table></div>`;note='متوسط المواعيد في الأسبوع آخر 3 شهور. الفاتح = فاضي.'}
  else if(d.t==='ndisc'||d.t==='nshare'||d.t==='nmargin'||d.t==='nexam'){const {ops}=nutBuild(),R=ks.map(nutMonth);
    if(d.t==='ndisc'){cfg={type:'line',data:{labels:ks.map(mls),datasets:[line('نسبة الخصم %',R.map(x=>x.byC[d.cat].tot?+(100*x.byC[d.cat].disc/x.byC[d.cat].tot).toFixed(1):null),c[1])]}};
      const L=ops.filter(o=>o.k===k&&o.cat===d.cat&&o.disc>0.5).sort((a,b)=>b.disc-a.disc);h=`<h4 style="margin:6px 0">الخطوات اللي عليها خصم — ${ml(k)}</h4>`+tableHTML(['اليوم','المريض','الخدمة',{t:'السعر',n:1},{t:'المدفوع',n:1},{t:'الخصم',n:1}],L.map(o=>[o.d,esc(o.pn),esc(o.name),o.tot,o.paid,o.disc]),{h:380})}
    else if(d.t==='nshare'){cfg={type:'line',data:{labels:ks.map(mls),datasets:[line('الحقن % من الإيراد',R.map(x=>x.rev?+(100*x.injRev/x.rev).toFixed(1):null),c[1]),line('باقي القسم (جنيه ÷ 1000)',R.map(x=>Math.round((x.rev-x.injRev)/1000)),c[0])]}};
      h=tableHTML(['الشهر',{t:'الإيراد',n:1},{t:'الحقن',n:1},{t:'الباقي',n:1},{t:'نسبة الحقن',n:1}],R.slice().reverse().map(x=>[ml(x.k),x.rev,x.injRev,x.rev-x.injRev,pc(x.rev?x.injRev/x.rev:null)]),{h:400})}
    else if(d.t==='nmargin'){cfg={data:{labels:ks.map(mls),datasets:[bar('صافي قبل د. آلاء',R.map(x=>x.before),c[0]),bar('صافي بعد',R.map(x=>x.after),c[2])]}};
      h=tableHTML(['الشهر',{t:'الإيراد',n:1},{t:'تكلفة الحقن',n:1},{t:'خاص',n:1},{t:'رواتب',n:1},{t:'نصيب العام',n:1},{t:'صافي قبل',n:1},{t:'صافي بعد',n:1}],R.slice().reverse().map(x=>[ml(x.k),x.rev,x.injCost,x.special+x.adv+x.devDep,x.sal.tot,x.general,x.before,x.after??'—']),{h:400})}
    else{cfg={data:{labels:ks.map(mls),datasets:[bar('كشوفات تغذية',ks.map(m=>ops.filter(o=>o.k===m&&o.cat==='exam').length),ks.map(m=>m===k?c[1]:c[0]))]}};
      h=`<h4 style="margin:6px 0">كشوفات ${ml(k)}</h4>`+tableHTML(['اليوم','المريض','رقم'],ops.filter(o=>o.k===k&&o.cat==='exam').sort((a,b)=>a.d<b.d?1:-1).map(o=>[o.d,esc(o.pn),esc(o.pid)]),{h:360})}}
  const tab=r.tab?`<button id="drGo">افتح تاب ${esc(({sum:'الملخص',pl:'الأرباح والخسائر',exp:'المصروفات',apt:'المواعيد',debt:'المديونيات',pts:'المرضى',cen:'تحليلات المركز',nut:'التغذية'})[r.tab]||'')}</button>`:'';
  document.body.insertAdjacentHTML('beforeend',`<div id="drill" style="position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:50;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:16px">
   <div class="card" style="width:min(1100px,100%);margin:auto 0"><div style="display:flex;gap:8px;align-items:flex-start"><h3 style="flex:1;margin:0">${esc(r.title)}<br><small style="margin:0">${esc(r.detail)}</small></h3>${tab}<button id="drX" aria-label="اقفل">✕</button></div>
   ${note?`<div class="note" style="margin-top:8px">${esc(note)}</div>`:''}${cfg?'<div class="ch" style="margin-top:10px"><canvas id="rdC"></canvas></div>':''}<div style="margin-top:10px">${h}</div></div></div>`);
  document.body.style.overflow='hidden';$('#drX').onclick=closeDrill;$('#drill').onclick=e=>{if(e.target.id==='drill')closeDrill()};if($('#drGo'))$('#drGo').onclick=()=>goTab(r.tab,r.sub);
  if(cfg)chart('rdC',cfg)}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrill()});
