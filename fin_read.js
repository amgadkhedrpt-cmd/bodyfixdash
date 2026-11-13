// BODYFIX — «📖 القراءة والترشيحات» فوق كل تاب: قراءة للأرقام اللي في التاب + ترشيحات خاصة بيه. كله بيتحسب على الجهاز.
'use strict';
const RD={};
const ksDone=()=>{const e=recoMonth();return monthsList(S.from,e<S.from?S.from:(e>S.to?S.to:e)).filter(m=>D.months.includes(m))};
function cmp3(v){const n=v.length;if(n<6)return null;const a=avgOf(v.slice(n-3)),b=avgOf(v.slice(n-6,n-3));return b?{a,b,ch:(a-b)/Math.abs(b)}:null}
const arrow=ch=>ch==null?'':`<b class="${ch>=0?'up':'down'}">${ch>=0?'▲':'▼'} ${pc(Math.abs(ch))}</b>`;
const arrowBad=ch=>ch==null?'':`<b class="${ch>0?'down':'up'}">${ch>=0?'▲':'▼'} ${pc(Math.abs(ch))}</b>`;   // زيادة = وحش (مصروفات، إلغاء…)
function trendLine(name,ks,v,f,bad){f=f||fm;const c=cmp3(v);if(!c)return '';let mx=-1,mn=-1;v.forEach((x,i)=>{if(x==null||!isFinite(x))return;if(mx<0||x>v[mx])mx=i;if(mn<0||x<v[mn])mn=i});if(mx<0)return '';
  return `<b>${name}:</b> آخر 3 شهور متوسطه ${f(c.a)} مقابل ${f(c.b)} في التلاتة اللي قبلهم ${bad?arrowBad(c.ch):arrow(c.ch)}. أعلى شهر ${mls(ks[mx])} (${f(v[mx])}) وأقل شهر ${mls(ks[mn])} (${f(v[mn])}).`}
const pcf=x=>pc(x);
let RD_RAW=false;
function rcard(r,t){r=r.filter(Boolean);t=t.filter(Boolean);if(RD_RAW)return {r,t};if(!r.length&&!t.length)return '';
  return `<div class="card" style="margin-bottom:12px;border-inline-start:4px solid var(--c1)"><h3>📖 القراءة<small>${ml(ksDone()[0]||S.from)} لـ ${ml(ksDone().slice(-1)[0]||S.to)} — الشهر الحالي مش داخل لو لسه ما خلصش</small></h3>
   <ul class="ins" style="margin:0;padding-inline-start:18px">${r.map(x=>`<li>${x}</li>`).join('')}</ul>
   ${t.length?`<h3 style="margin-top:12px">🎯 الترشيحات</h3><ul class="ins" style="margin:0;padding-inline-start:18px">${t.map(x=>`<li>${x}</li>`).join('')}</ul>`:''}</div>`}

// ---------- الملخص ----------
RD.sum=()=>{const ks=ksDone(),R=ks.map(calcMonth),r=[],t=[];if(R.length<6)return '';
  const rev=R.map(x=>x.net),ex=R.map(x=>x.opex),ses=R.map(x=>x.sessions),avg=R.map(x=>x.avgS),mg=R.map(x=>x.margin);
  r.push(trendLine('الإيراد',ks,rev),trendLine('المصروفات',ks,ex,fm,true),trendLine('الجلسات المكتملة',ks,ses),trendLine('متوسط إيراد الجلسة',ks,avg),trendLine('هامش الربح',ks,mg,pcf));
  const cr=cmp3(rev),ce=cmp3(ex),ca=cmp3(avg),cs=cmp3(ses);
  if(cr&&ce&&ce.ch>cr.ch+0.05)t.push(`المصروفات بتزيد أسرع من الإيراد (${pc(ce.ch)} مقابل ${pc(cr.ch)}). راجع تاب «المصروفات» — البنود اللي زادت أكتر متعلّمة هناك.`);
  if(ca&&ca.ch<-0.05)t.push(`متوسط إيراد الجلسة نازل ${pc(-ca.ch)}: يا خصومات زادت، يا باقات أرخص، يا جلسات بتتعمل من غير ما تتحاسب. قارنه بنسبة الخصم في «الإيرادات» وبمراجعة الكومبليت.`);
  if(cs&&cr&&cs.ch>0.05&&cr.ch<0)t.push('الجلسات زادت والإيراد قل — شغل أكتر بفلوس أقل. ده غالباً خصومات أو مديونيات بتتراكم.');
  const bal=R.reduce((s,x)=>s+x.bal,0),all=R.reduce((s,x)=>s+x.rev+x.bal,0);if(all)r.push(`<b>الدفع من الرصيد:</b> ${pc(bal/all)} من كل المدفوعات — فلوس اتحصّلت قبل كده (باقات مدفوعة مقدم).`);
  const L=R[R.length-1];if(L.beS)r.push(`<b>نقطة التعادل:</b> ${fm(L.beS)} جلسة في الشهر، و${ml(L.k)} عمل ${fm(L.sessions)} — ${L.sessions>=L.beS?'فوقها بـ'+pc(L.sessions/L.beS-1):'<b class="down">تحتها</b>'}.`);
  return rcard(r,t)};
// ---------- الأرباح والخسائر ----------
RD.pl=()=>{const ks=ksDone(),R=ks.map(calcMonth),r=[],t=[];if(R.length<3)return '';
  const loss=R.filter(x=>x.profit<0);r.push(`<b>شهور بخسارة:</b> ${loss.length?loss.map(x=>mls(x.k)).join('، '):'مفيش'}.`);
  const sal=R.map(x=>x.net?x.sal/x.net:null),rent=R.map(x=>x.net?x.rent/x.net:null);r.push(trendLine('المرتبات من الإيراد',ks,sal,pcf,true),trendLine('الإيجار من الإيراد',ks,rent,pcf,true));
  const s3=avgOf(sal.slice(-3));if(s3>0.4)t.push(`المرتبات ${pc(s3)} من الإيراد آخر 3 شهور — أعلى من 40%. يا الإيراد لكل موظف محتاج يزيد، يا فيه وقت فاضي في الجدول (شوف «تحليلات المركز ← الزحمة»).`);
  const pr=R.map(x=>x.profit),sd=Math.sqrt(avgOf(pr.map(x=>(x-avgOf(pr))**2))),mu=avgOf(pr);if(mu>0&&sd/mu>0.6)t.push('الربح متذبذب جامد من شهر لشهر — حط احتياطي نقدي يغطي على الأقل شهرين مصروفات.');
  return rcard(r,t)};
// ---------- الإيرادات ----------
RD.rev=()=>{const ks=ksDone(),r=[],t=[];if(ks.length<6)return '';const P=D.pay.filter(p=>inB(p)&&!p.bal),I=D.inv.filter(x=>inB(x));
  const cash=ks.map(k=>{const x=P.filter(p=>p.k===k),a=x.reduce((s,p)=>s+p.amt,0);return a?x.filter(p=>p.meth==='كاش').reduce((s,p)=>s+p.amt,0)/a:null});r.push(trendLine('نسبة الكاش',ks,cash,pcf));
  const disc=ks.map(k=>{const x=I.filter(i=>i.k===k),tt=x.reduce((s,i)=>s+i.total,0);return tt?x.reduce((s,i)=>s+i.disc,0)/tt:null});r.push(trendLine('الخصم من الفواتير',ks,disc,pcf,true));
  const col=ks.map(k=>{const x=I.filter(i=>i.k===k),n=x.reduce((s,i)=>s+i.total-i.disc,0);return n?x.reduce((s,i)=>s+Math.min(Math.max(0,i.total-i.disc),i.paid),0)/n:null});r.push(trendLine('المتحصّل من صافي الفواتير',ks,col,pcf));
  const PR=P.filter(p=>inR(p)),tot=PR.reduce((s,p)=>s+p.amt,0);const wd=[0,1,2,3,4,5,6].map(i=>PR.filter(p=>p.w===i).reduce((s,p)=>s+p.amt,0));const bi=wd.indexOf(Math.max(...wd));if(tot)r.push(`<b>أقوى يوم:</b> ${DAYS[bi]} (${pc(wd[bi]/tot)} من الإيراد).`);
  const bp={};PR.forEach(p=>{if(p.pid)bp[p.pid]=(bp[p.pid]||0)+p.amt});const top=Object.values(bp).sort((a,b)=>b-a);const t25=top.slice(0,25).reduce((s,x)=>s+x,0);if(tot)r.push(`<b>تركيز الإيراد:</b> أعلى 25 مريض = ${pc(t25/tot)} من الإيراد، وأعلى 10% من المرضى = ${pc(top.slice(0,Math.ceil(top.length/10)).reduce((s,x)=>s+x,0)/tot)}.`);
  const cd=cmp3(disc),cc=cmp3(col);if(cd&&cd.ch>0.15)t.push(`الخصومات زادت ${pc(cd.ch)} — حط حد أقصى للخصم بيحتاج موافقتك، وتابع مين بيدّيه («المواعيد» و«مين سجّل الدفع»).`);
  if(cc&&cc.a<0.85)t.push(`المتحصّل من الفواتير ${pc(cc.a)} بس آخر 3 شهور — فيه فلوس بتتأخر. مهمة التحصيل بالتليفون في خطة اليوم بتمسك دول.`);
  return rcard(r,t)};
// ---------- المصروفات ----------
RD.exp=()=>{const ks=ksDone(),r=[],t=[];if(ks.length<6)return '';const E=D.exp.filter(e=>expIn(e)&&!REFUND_RX.test(e.type));const tot=E.filter(e=>inR(e)).reduce((s,e)=>s+e.amt,0);
  const bt=groupSum(E.filter(e=>inR(e)),'type');if(tot)r.push(`<b>أكبر 3 بنود:</b> ${bt.slice(0,3).map(([k,v])=>`${esc(k)} ${pc(v/tot)}`).join('، ')} — مع بعض ${pc(bt.slice(0,3).reduce((s,x)=>s+x[1],0)/tot)} من المصروفات.`);
  const l3=ks.slice(-3),p3=ks.slice(-6,-3);const gr=bt.map(([k])=>{const a=E.filter(e=>e.type===k&&l3.includes(e.k)).reduce((s,e)=>s+e.amt,0)/3,b=E.filter(e=>e.type===k&&p3.includes(e.k)).reduce((s,e)=>s+e.amt,0)/3;return [k,a,b,a-b]}).filter(x=>Math.abs(x[3])>500);
  const up=gr.filter(x=>x[3]>0).sort((a,b)=>b[3]-a[3]).slice(0,3),dn=gr.filter(x=>x[3]<0).sort((a,b)=>a[3]-b[3]).slice(0,2);
  if(up.length)r.push(`<b>أكتر بنود زادت</b> (متوسط شهري آخر 3 شهور مقابل اللي قبلهم): ${up.map(x=>`${esc(x[0])} +${fm(x[3])} (${fm(x[2])} ← ${fm(x[1])})`).join('، ')}.`);
  if(dn.length)r.push(`<b>بنود قلّت:</b> ${dn.map(x=>`${esc(x[0])} ${fm(x[3])}`).join('، ')}.`);
  const newT=bt.filter(([k])=>!E.some(e=>e.type===k&&e.k<shiftK(ks[ks.length-1],-5))).map(x=>x[0]);if(newT.length)r.push(`<b>بنود جديدة ظهرت آخر 6 شهور:</b> ${newT.slice(0,5).map(esc).join('، ')}.`);
  up.forEach(x=>{if(x[2]&&x[1]/x[2]>1.3)t.push(`«${esc(x[0])}» زاد ${pc(x[1]/x[2]-1)} — اعرف السبب (سعر اتغير؟ استهلاك زاد؟ مورد جديد؟). دوس عليه في الترشيحات تحت الملخص يطلعلك سطوره.`)});
  const un=E.filter(e=>inR(e)&&e.type==='غير مصنف').reduce((s,e)=>s+e.amt,0);if(tot&&un/tot>0.03)t.push(`${pc(un/tot)} من المصروفات «غير مصنف» (${fm(un)} جنيه) — صنّفها في Medicolize علشان التحليل يبقى صح.`);
  return rcard(r,t)};
// ---------- المرضى والتحويلات ----------
RD.pts=()=>{const ks=ksDone(),r=[],t=[];if(ks.length<6)return '';const P=Object.values(ptIndex()).filter(p=>!p.early);
  const nw=ks.map(k=>P.filter(p=>p.k===k).length);r.push(trendLine('المرضى الجداد',ks,nw,x=>fm(x)));
  const came=ks.map(k=>new Set(D.apt.filter(a=>inB(a)&&a.k===k&&a.st==='Completed').map(a=>a.pid)).size);r.push(trendLine('كل المرضى اللي جم',ks,came,x=>fm(x)));
  const N=P.filter(p=>nIn(p.k,S.from,S.to)),sg={};N.forEach(p=>{const s=p.src||'مش متسجل';(sg[s]=sg[s]||[]).push(p)});const ar=Object.entries(sg).sort((a,b)=>b[1].length-a[1].length);
  if(N.length&&ar.length){r.push(`<b>أكبر مصدر:</b> ${esc(ar[0][0])} — ${pc(ar[0][1].length/N.length)} من المرضى الجداد.`);
    const avgAll=avgOf(N.map(p=>p.paid||0));const best=ar.filter(x=>x[1].length>=15&&x[0]!=='مش متسجل').map(([k,a])=>[k,avgOf(a.map(p=>p.paid||0)),a.length]).sort((a,b)=>b[1]-a[1]);
    if(best.length){r.push(`<b>أعلى قيمة مريض:</b> ${esc(best[0][0])} (${fm(best[0][1])} مقابل متوسط ${fm(avgAll)}). <b>أقل قيمة:</b> ${esc(best[best.length-1][0])} (${fm(best[best.length-1][1])}).`);
      if(best[0][1]>1.2*avgAll)t.push(`«${esc(best[0][0])}» بيجيب أغلى مريض. لو ده دكتور محوّل، حافظ على العلاقة دي. لو مصدر دعاية، زوّد ميزانيته.`)}
    const pat=sg['مريض']||sg['مريض قديم']||null;if(pat&&pat.length/N.length>0.3)t.push(`${pc(pat.length/N.length)} من المرضى الجداد جم بترشيح مريض — ده أقوى مصدر عندك. برنامج «رشّح صاحبك» (خصم أو جلسة هدية للاتنين) هيكبّره.`);
    const unk=(sg['مش متسجل']||[]).length;if(unk/N.length>0.1)t.push(`${pc(unk/N.length)} من المرضى الجداد من غير مصدر — خلي السكرتارية تسأل وتكتب المصدر في أول زيارة.`)}
  const cn=cmp3(nw);if(cn&&cn.ch<-0.1)t.push(`المرضى الجداد قلّوا ${pc(-cn.ch)} آخر 3 شهور — الإيراد هيتأثر بعد شهرين. راجع الدعاية والمصادر اللي وقفت.`);
  return rcard(r,t)};
// ---------- استمرار المرضى ----------
RD.ret=()=>{const ks=ksDone().filter(k=>k<=shiftK(recoMonth(),-3)),r=[],t=[];if(ks.length<6)return '';const P=Object.values(ptIndex()).filter(p=>!p.early);
  const six=ks.map(k=>{const a=P.filter(p=>p.k===k);return a.length?a.filter(p=>p.sess>=6).length/a.length:null}),low=ks.map(k=>{const a=P.filter(p=>p.k===k);return a.length?a.filter(p=>p.sess<=2).length/a.length:null});
  r.push(trendLine('نسبة اللي كمّلوا 6 جلسات أو أكتر',ks,six,pcf),trendLine('نسبة اللي وقفوا بعد جلستين أو أقل',ks,low,pcf,true));
  const c6=cmp3(six),cl=cmp3(low);if(c6&&c6.ch<-0.1)t.push(`الاستمرار نازل (${pc(c6.a)} مقابل ${pc(c6.b)}). أكتر مرحلة بيقع فيها المريض أول أسبوعين — مكالمة بعد أول جلسة وبعد التالتة بتفرق.`);
  if(cl&&cl.a>0.3)t.push(`${pc(cl.a)} من المرضى الجداد بيوقفوا بعد جلستين أو أقل — راجع تجربة الكشف والجلسة الأولى، وإن الخطة والباقة بتتشرح للمريض قبل ما يمشي.`);
  r.push('<i>الشهور الأخيرة مش داخلة في القراءة دي لأن مرضاها لسه بيكملوا.</i>');return rcard(r,t)};
// ---------- المواعيد ----------
RD.apt=()=>{const ks=ksDone(),r=[],t=[];if(ks.length<6)return '';const A=D.apt.filter(a=>inB(a)&&!/^Waiting/i.test(a.room||''));
  const rate=f=>ks.map(k=>{const x=A.filter(a=>a.k===k);return x.length?x.filter(f).length/x.length:null});const ca=rate(a=>/cancel/i.test(a.st)),ns=rate(a=>/no ?show/i.test(a.st));
  r.push(trendLine('نسبة الإلغاء',ks,ca,pcf,true),trendLine('نسبة الغياب (No Show)',ks,ns,pcf,true),trendLine('الجلسات المكتملة',ks,ks.map(k=>A.filter(a=>a.k===k&&a.st==='Completed').length),x=>fm(x)));
  const c1=cmp3(ca),c2=cmp3(ns);const first=avgOf(ca.slice(0,3));if(c1&&first&&c1.a>first*1.3)r.push(`<b>الإلغاء اتضاعف تقريباً:</b> كان ${pc(first)} أول الفترة وبقى ${pc(c1.a)}.`);
  if(c1&&c1.a>0.18)t.push(`حوالي ${pc(c1.a)} من المواعيد بتتلغي — يعني تقريباً موعد من كل ${Math.round(1/c1.a)}. التلات حاجات اللي بتفرق: تأكيد قبلها بيوم (مهمة «تأكيدات بكرة» موجودة في خطة اليوم)، وإعادة حجز فورية لأي حد يلغي، وحجز زيادة في الساعات اللي الإلغاء فيها عالي.`);
  if(c2&&c2.a>0.07)t.push(`الغياب ${pc(c2.a)} — المريض اللي غاب مرتين يتحط عليه تأكيد مخصوص أو عربون للحجز الجاي.`);
  const AR=A.filter(a=>inR(a)),cd=groupSum(AR.filter(a=>/cancel|no ?show/i.test(a.st)),'doc',()=>1),td=groupSum(AR,'doc',()=>1);const tm=Object.fromEntries(td);
  const worst=cd.filter(([d])=>tm[d]>=200&&d!==PAST_DOC).map(([d,v])=>[d,v/tm[d]]).sort((a,b)=>b[1]-a[1]).slice(0,3);if(worst.length)r.push(`<b>أعلى إلغاء وغياب حسب الدكتور:</b> ${worst.map(([d,v])=>`${esc(d)} ${pc(v)}`).join('، ')}.`);
  return rcard(r,t)};
// ---------- المديونيات ----------
RD.debt=()=>{const td=todayC(),r=[],t=[];const I=D.inv.filter(x=>inB(x)&&x.k<=S.to).map(x=>Object.assign({},x,{rem:Math.max(0,x.total-x.disc-x.paid),age:(Date.parse(td)-Date.parse(x.d))/864e5})).filter(x=>x.rem>1);
  const tot=I.reduce((s,x)=>s+x.rem,0);if(!tot)return '';const o180=I.filter(x=>x.age>180).reduce((s,x)=>s+x.rem,0),y30=I.filter(x=>x.age>30&&x.age<=90).reduce((s,x)=>s+x.rem,0);
  r.push(`<b>${pc(o180/tot)}</b> من المديونيات عدّى عليها أكتر من 6 شهور (${fm(o180)} جنيه)، و${pc(y30/tot)} عمرها من شهر لـ 3 شهور (${fm(y30)}).`);
  const ks=ksDone();const nd=ks.map(k=>I.filter(x=>x.k===k).reduce((s,x)=>s+x.rem,0));r.push(trendLine('الباقي من فواتير كل شهر',ks,nd,fm,true));
  const bp={};I.forEach(x=>{bp[x.pid]=(bp[x.pid]||0)+x.rem});const top=Object.values(bp).sort((a,b)=>b-a);r.push(`<b>التركيز:</b> أكبر 40 مريض عليهم ${pc(top.slice(0,40).reduce((s,x)=>s+x,0)/tot)} من المديونيات.`);
  r.push('<i>ملحوظة: لو الباقة اتدفعت على فاتورة والجلسات اتسجلت على فاتورة تانية، الفاتورة التانية بتطلع «عليها باقي» وهي مدفوعة. فالرقم القديم غالباً فيه جزء من ده.</i>');
  t.push(`ابدأ التحصيل بشريحة 30–90 يوم (${fm(y30)} جنيه) — دي أسهل فلوس ترجع. اللي فوق 6 شهور تتراجع فواتيرها الأول مع داليا (مهمة مراجعة الفواتير في خطة اليوم) قبل ما حد يتصل.`);
  const cn=cmp3(nd);if(cn&&cn.ch>0.2)t.push(`الديون الجديدة كل شهر بتزيد (${pc(cn.ch)}) — المشكلة بتبدأ عند الاستقبال: الجلسة ما تتعملش لو الباقة مش مدفوعة أو متقسطة بميعاد واضح.`);
  return rcard(r,t)};
// ---------- الخزنة ----------
RD.cash=()=>{const ks=ksDone(),r=[],t=[];if(ks.length<3)return '';const P=D.pay.filter(p=>inB(p)&&!p.bal);
  const sh=m=>ks.map(k=>{const x=P.filter(p=>p.k===k),a=x.reduce((s,p)=>s+p.amt,0);return a?x.filter(p=>p.meth===m).reduce((s,p)=>s+p.amt,0)/a:null});
  ['كاش','فيزا / كارت','محفظة / إنستاباي','تحويل بنكي'].forEach(m=>{const v=sh(m);if(avgOf(v)>0.02)r.push(trendLine('نسبة '+m,ks,v,pcf))});
  const c=cmp3(sh('كاش'));if(c&&c.a>0.6)t.push('أغلب الفلوس كاش — قفل خزنة يومي بتوقيع، ومطابقة الكاش مع مدفوعات Medicolize كل يوم، بتقلل أي فرق.');
  return rcard(r,t)};
// ---------- تحليلات المركز ----------
RD.cen=()=>{const ks=ksDone(),r=[],t=[];if(ks.length<6)return '';
  if(CEN.sub==='trend'){const DM=ks.map(deptMonth),tot=DM.map(m=>DEPTS.reduce((s,[d])=>s+m[d].rev,0));DEPTS.forEach(([d,n])=>{const v=DM.map((m,i)=>tot[i]?m[d].rev/tot[i]:null);if(avgOf(v)>0.02)r.push(trendLine('نصيب '+n+' من الإيراد',ks,v,pcf))});
    const nut=DM.map((m,i)=>tot[i]?m.nut.rev/tot[i]:null),cn=cmp3(nut);if(cn&&cn.a>0.35)t.push(`التغذية بقت ${pc(cn.a)} من إيراد المركز — ومعظمها حقن. ده بيخلي المركز كله حساس لسعر وتوفر الحقن.`);
    const phy=DM.map(m=>m.phy.rev),cp=cmp3(phy);if(cp&&cp.ch<-0.05)t.push(`إيراد العلاج الطبيعي نازل ${pc(-cp.ch)} — ده قلب المركز. شوف «المرضى والاحتفاظ» هل المشكلة مرضى جداد أقل ولا استمرار أقل.`)}
  else if(CEN.sub==='pts'){const {pts}=cenBuild(),PT=ptsF(Object.values(pts).filter(p=>!p.early));const coh=ks.filter(k=>k<=shiftK(recoMonth(),-3));
    const m1=coh.map(k=>{const a=PT.filter(p=>p.k0===k);return a.length?a.filter(p=>p.months.has(shiftK(k,1))).length/a.length:null}),m3=coh.map(k=>{const a=PT.filter(p=>p.k0===k);return a.length?a.filter(p=>p.months.has(shiftK(k,3))).length/a.length:null});
    r.push(trendLine('رجعوا الشهر التاني',coh,m1,pcf),trendLine('لسه بيجوا بعد 3 شهور',coh,m3,pcf));
    const a=avgOf(m1.slice(-3));if(a!=null&&a<0.6)t.push(`حوالي ${pc(1-a)} من المرضى الجداد ما بيرجعوش الشهر التاني. أكبر فرصة في المركز: مكالمة متابعة خلال أسبوع من أول زيارة لكل مريض ما حجزش.`);
    const c3=cmp3(m3);if(c3&&c3.ch<-0.15)t.push(`الاستمرار لـ3 شهور نازل (${pc(c3.a)} مقابل ${pc(c3.b)}) — المرضى بيخلّصوا بدري أو مش بيجددوا. قارنه بتاب تجديد الباقات.`);
    const act=PT.filter(p=>[...p.months].some(m=>nIn(m,S.from,S.to))),mu=act.filter(p=>p.depts.size>1),si=act.filter(p=>p.depts.size===1);const am=avgOf(mu.map(p=>p.paid)),as=avgOf(si.map(p=>p.paid));
    if(am&&as){r.push(`<b>المريض اللي عمل أكتر من قسم</b> بيدفع ${fm(am)} في المتوسط مقابل ${fm(as)} للي عمل قسم واحد (${fm(am/as,1)}×). ${pc(mu.length/(act.length||1))} بس من المرضى عملوا أكتر من قسم.`);if(am>1.5*as)t.push('تحويل المرضى بين الأقسام بيضاعف قيمتهم — خلي الدكتور يقترح التغذية أو الأجهزة لما تكون مناسبة، وخلي ده جزء من تقييم الشهر.')}}
  else{const done=D.apt.filter(a=>inB(a)&&inR(a)&&a.st==='Completed'),{P}=cenBuild();const docs=groupSum(done,'doc',()=>1).filter(x=>x[1]>=100&&x[0]!==PAST_DOC);
    const rps=docs.map(([d,n])=>[d,P.filter(p=>inR(p)&&p.doc===d).reduce((s,p)=>s+p.amt,0)/n]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
    if(rps.length>1)r.push(`<b>إيراد الجلسة:</b> أعلى ${esc(rps[0][0])} (${fm(rps[0][1])}) وأقل ${esc(rps[rps.length-1][0])} (${fm(rps[rps.length-1][1])}). الفرق غالباً نوع الخدمة أو الخصم أو إن المدفوعات بتتسجل على دكتور غير اللي عمل الجلسة.`);
    const tot=done.length;if(tot&&docs.length)r.push(`<b>توزيع الشغل:</b> أكبر 3 دكاترة عاملين ${pc(docs.slice(0,3).reduce((s,x)=>s+x[1],0)/tot)} من الجلسات.`);
    t.push('استخدم خريطة الزحمة: الساعات الفاتحة دي فرص لمواعيد المتابعة ومرضى الويتنج، والساعات الغامقة محتاجة دكتور زيادة أو مواعيد أطول بينها.')}
  return rcard(r,t)};
// ---------- التغذية ----------
RD.nut=()=>{if(!(RAW.kinds||{}).ops||typeof nutMonth!=='function')return '';const ks=ksDone(),r=[],t=[];if(ks.length<6)return '';const R=ks.map(nutMonth),{ops}=nutBuild(),sub=NUT.sub;
  if(sub==='sum'||sub==='pl'||sub==='trend'){r.push(trendLine('إيراد التغذية',ks,R.map(x=>x.rev)),trendLine('صافي قبل راتب د. آلاء',ks,R.map(x=>x.before)),trendLine('نسبة الحقن من الإيراد',ks,R.map(x=>x.rev?(x.byC.inj.paid+x.byC.mezo.paid)/x.rev:null),pcf,true));
    const nonInj=R.map(x=>x.rev-x.byC.inj.paid-x.byC.mezo.paid),c=cmp3(nonInj);r.push(trendLine('الإيراد من غير الحقن',ks,nonInj));if(c&&c.ch<0.02)t.push('النمو كله جاي من الحقن، والمتابعات والأجهزة واقفين — الأولوية تكبير باقة الـ12 وبيع الأجهزة لمرضى الحقن.')}
  if(sub==='rev'||sub==='inj'||sub==='sum'){const di=R.map(x=>x.byC.inj.tot?x.byC.inj.disc/x.byC.inj.tot:null),dd=R.map(x=>x.byC.dev.tot?x.byC.dev.disc/x.byC.dev.tot:null);r.push(trendLine('خصم الحقن',ks,di,pcf,true),trendLine('خصم الأجهزة',ks,dd,pcf,true));
    const a=avgOf(di.slice(-3));if(a>NUT.cfg.alertInjDisc)t.push(`خصم الحقن ${pc(a)} آخر 3 شهور. كل 1% خصم على الحقن بيشيل حوالي ${pc(1/(1-(R[R.length-1].ratio||0.5))/100)} من ربحها — حط سقف ونظام موافقة.`)}
  if(sub==='pts'||sub==='deep'){const ex=ks.map(k=>ops.filter(o=>o.k===k&&o.cat==='exam').length),act=ks.map(k=>new Set(ops.filter(o=>o.k===k).map(o=>o.pid)).size);r.push(trendLine('كشوفات التغذية',ks,ex,x=>fm(x)),trendLine('مرضى التغذية النشطين',ks,act,x=>fm(x)));
    const c=cmp3(ex);if(c&&c.ch<-0.15)t.push(`الكشوفات قلّت ${pc(-c.ch)} — ده مدخل القسم كله. راجع مصادر الإحالة والدعاية الخاصة بالتخسيس.`)}
  if(sub==='dev'){const s=ks.map(k=>ops.filter(o=>o.k===k&&o.cat==='dev').length),sh=R.map(x=>x.rev?x.byC.dev.paid/x.rev:null);r.push(trendLine('جلسات الأجهزة',ks,s,x=>fm(x)),trendLine('نصيب الأجهزة من الإيراد',ks,sh,pcf));
    const c=cmp3(s);if(c&&c.ch<0.1)t.push('جلسات الأجهزة مش بتكبر. هدف شهري واضح لملك (عدد جلسات + نسبة مرضى الحقن اللي جرّبوا الأجهزة) مع حافز صغير هيحرّك الرقم.')}
  return rcard(r,t)};

// ---------- قراءة شاملة جوه الملخص ----------
function sumReading(){const secs=[['💰 الإيراد والمصروفات','sum',()=>RD.sum(),'pl'],['📈 الأرباح','pl',()=>RD.pl(),'pl'],['🧾 الإيرادات والتحصيل','rev',()=>RD.rev(),'rev'],['📉 المصروفات','exp',()=>RD.exp(),'exp'],
   ['📅 المواعيد والإلغاء','apt',()=>RD.apt(),'apt'],['🧑‍🤝‍🧑 المرضى الجداد والإحالة','pts',()=>RD.pts(),'pts'],['🔁 استمرار المرضى','ret',()=>RD.ret(),'ret'],
   ['🔁 الاحتفاظ لكل دفعة والتحويل بين الأقسام','cen',()=>{const o=CEN.sub;CEN.sub='pts';try{return RD.cen()}finally{CEN.sub=o}},'cen|pts'],
   ['🏥 الأقسام','cen',()=>{const o=CEN.sub;CEN.sub='trend';try{return RD.cen()}finally{CEN.sub=o}},'cen|trend'],['🩺 الدكاترة','cen',()=>{const o=CEN.sub;CEN.sub='ops';try{return RD.cen()}finally{CEN.sub=o}},'cen|ops'],
   ['💳 المديونيات','debt',()=>RD.debt(),'debt'],['🏦 الخزنة وطرق الدفع','cash',()=>RD.cash(),'cash']];
  if(S.b!=='dokki'&&(RAW.kinds||{}).ops&&typeof nutMonth==='function')['sum','rev','pts','dev'].forEach((sb,i)=>secs.push([['🥗 التغذية — الإيراد والربح','🥗 التغذية — الخصومات','🥗 التغذية — المرضى والكشوفات','🥗 التغذية — الأجهزة'][i],'nut',()=>{const o=NUT.sub;NUT.sub=sb;try{return RD.nut()}finally{NUT.sub=o}},'nut|'+sb]));
  RD_RAW=true;const out=[];for(const [title,,f,go] of secs){let x=null;try{x=f()}catch(e){console.error(e)}if(x&&typeof x==='object'&&(x.r.length||x.t.length))out.push({title,go,...x})}RD_RAW=false;
  if(!out.length)return '';const nt=out.reduce((s,x)=>s+x.t.length,0);
  return `<div class="card" style="margin-bottom:12px"><h3>📖 قراءة المركز والترشيحات<small>${BRN[S.b]} — ${ml(ksDone()[0]||S.from)} لـ ${ml(ksDone().slice(-1)[0]||S.to)} · ${nt} ترشيح · الشهر الحالي مش داخل لو لسه ما خلصش</small></h3>
   <div class="grid g2">${out.map(x=>`<div class="note" style="border-inline-start:4px solid ${x.t.length?'var(--warn)':'var(--c1)'}"><div style="display:flex;align-items:center;gap:6px"><b style="flex:1;font-size:.92rem;color:var(--t1)">${x.title}</b><button data-rgo="${x.go}" style="padding:2px 8px;font-size:.72rem">افتح ←</button></div>
     <ul class="ins" style="margin:6px 0 0;padding-inline-start:18px">${x.r.map(y=>`<li>${y}</li>`).join('')}</ul>
     ${x.t.length?`<div style="margin-top:6px;color:var(--t1)"><b>🎯 الترشيحات</b></div><ul class="ins" style="margin:2px 0 0;padding-inline-start:18px;color:var(--t1)">${x.t.map(y=>`<li>${y}</li>`).join('')}</ul>`:''}</div>`).join('')}</div></div>`}

// ---------- ربط القراءة بالتابات ----------
['pl','rev','exp','pts','ret','apt','debt','cash'].forEach(k=>{const v=VIEWS[k];if(!v)return;const f=v[0];VIEWS[k]=[()=>{let h='';try{h=RD[k]()}catch(e){console.error(e)}return h+f()},v[1]]});
{const v=VIEWS.sum,f=v[0],c=v[1];VIEWS.sum=[()=>{let h='';try{h=sumReading()}catch(e){console.error(e)}const s=f();const i=s.indexOf('<div class="grid g4">');return i>0?s.slice(0,i)+h+s.slice(i):h+s},
  ()=>{c();document.querySelectorAll('[data-rgo]').forEach(b=>b.onclick=()=>{const [t,sb]=b.dataset.rgo.split('|');goTab(t,sb)})}]}
{const v=VIEWS.cen,f=v[0];VIEWS.cen=[()=>{const s=f();let h='';try{h=RD.cen()}catch(e){console.error(e)}const i=s.indexOf('</div>',s.indexOf('class="note"'))+6;return s.slice(0,i)+h+s.slice(i)},v[1]]}
{const v=VIEWS.nut,f=v[0];VIEWS.nut=[()=>{const s=f();if(NUT.sub==='cfg'||NUT.sub==='exp'||NUT.sub==='alaa'||NUT.sub==='price')return s;let h='';try{h=RD.nut()}catch(e){console.error(e)}const i=s.indexOf('</div>',s.indexOf('class="note"'))+6;return s.slice(0,i)+h+s.slice(i)},v[1]]}
