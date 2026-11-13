// BODYFIX — «⚖️ الهرم والدقي»: مقارنة كفاءة الفرعين في كل حاجة + قراءة وترشيحات (الدقي بيتدار عن بعد: زيارة أسبوعية، والنائب د. محمود الكاشف).
'use strict';
function withB(b,fn){const o=S.b;S.b=b;try{return fn()}finally{S.b=o}}
const ADRX=/دعاي|اعلان|إعلان|ماركت|marketing|ads|سوشيال/i;
function cmpMetrics(b){return withB(b,()=>{const ks=ksDone(),n=ks.length||1,R=ks.map(calcMonth),T=sumR(R);const o={ks};
  o.rev=T.net/n;o.exp=T.opex/n;o.profit=T.profit/n;o.margin=T.margin;o.sess=T.sessions/n;o.revS=T.sessions?T.net/T.sessions:null;o.costS=T.sessions?T.opex/T.sessions:null;o.profS=T.sessions?T.profit/T.sessions:null;
  o.salP=T.net?T.sal/T.net:null;o.rentP=T.net?T.rent/T.net:null;o.rent=T.rent;
  const E=D.exp.filter(e=>expIn(e)&&ks.includes(e.k));const ad=E.filter(e=>ADRX.test(e.type+' '+e.info)).reduce((s,e)=>s+e.amt,0);o.adP=T.net?ad/T.net:null;
  const A=D.apt.filter(a=>inB(a)&&ks.includes(a.k)&&!/^Waiting/i.test(a.room||''));const done=A.filter(a=>a.st==='Completed');
  o.can=A.length?A.filter(isCan).length/A.length:null;o.ns=A.length?A.filter(isNS).length/A.length:null;
  const cu=A.filter(a=>isCan(a)&&a.up);o.sameDay=cu.length?cu.filter(a=>Date.parse(a.d)<=Date.parse(a.up)).length/cu.length:null;
  const dm={};done.forEach(a=>{if(a.doc===PAST_DOC||a.doc==='—')return;const k=a.doc+'|'+a.k;dm[k]=(dm[k]||0)+1});const dmv=Object.values(dm).filter(x=>x>=20);o.docs=dmv.length/n;o.sessDoc=dmv.length?dmv.reduce((s,x)=>s+x,0)/dmv.length:null;
  const {P,pts}=cenBuild();const PP=P.filter(p=>ks.includes(p.k));o.payers=ks.reduce((s,k)=>s+new Set(PP.filter(p=>p.k===k).map(p=>p.pid)).size,0)/n;o.revPt=o.payers?o.rev/o.payers:null;o.revDoc=o.docs?o.rev/o.docs:null;
  const PT=Object.values(pts).filter(p=>!p.early);const nw=PT.filter(p=>ks.includes(p.k0));o.newPts=nw.length/n;o.cac=nw.length?ad/nw.length:null;
  const c1=PT.filter(p=>ks.includes(p.k0)&&p.k0<=shiftK(recoMonth(),-1));o.ret1=c1.length?c1.filter(p=>p.months.has(shiftK(p.k0,1))).length/c1.length:null;
  const c3=PT.filter(p=>ks.includes(p.k0)&&p.k0<=shiftK(recoMonth(),-3));o.six=c3.length?c3.filter(p=>p.n>=6).length/c3.length:null;o.avgSess=c3.length?c3.reduce((s,p)=>s+p.n,0)/c3.length:null;o.ltv=c3.length?c3.reduce((s,p)=>s+p.paid,0)/c3.length:null;
  const I=D.inv.filter(x=>inB(x)&&ks.includes(x.k)),tt=I.reduce((s,x)=>s+x.total,0),net=I.reduce((s,x)=>s+x.total-x.disc,0);o.disc=tt?I.reduce((s,x)=>s+x.disc,0)/tt:null;o.coll=net?I.reduce((s,x)=>s+x.paid,0)/net:null;
  const td=todayC(),old=D.inv.filter(x=>inB(x)&&(Date.parse(td)-Date.parse(x.d))/864e5>90).reduce((s,x)=>s+Math.max(0,x.total-x.disc-x.paid),0);o.oldDebtM=o.rev?old/o.rev:null;
  const L=R[R.length-1];o.be=L&&L.beS?L.sessions/L.beS:null;
  const lead=A.filter(a=>a.cr).map(a=>(Date.parse(a.d)-Date.parse(a.cr))/864e5).filter(x=>x>=0);o.far=lead.length?lead.filter(x=>x>14).length/lead.length:null;
  o.monthly=R;return o})}
// [key, label, format, higher is better?, group]
const CMPM=[['rev','متوسط الإيراد في الشهر',fm,1,'الحجم'],['profit','متوسط صافي الربح في الشهر',fm,1,'الحجم'],['sess','جلسات مكتملة في الشهر',fm,1,'الحجم'],['newPts','مرضى جداد في الشهر',x=>fm(x,1),1,'الحجم'],['payers','مرضى دفعوا في الشهر',fm,1,'الحجم'],
  ['margin','هامش الربح',pc,1,'الربحية'],['revS','إيراد الجلسة',fm,1,'الربحية'],['costS','تكلفة الجلسة',fm,0,'الربحية'],['profS','ربح الجلسة',fm,1,'الربحية'],['be','الجلسات ÷ نقطة التعادل (آخر شهر)',x=>x==null?'—':fm(x,2)+'×',1,'الربحية'],
  ['salP','المرتبات من الإيراد',pc,0,'المصروفات'],['rentP','الإيجار من الإيراد',pc,0,'المصروفات'],['adP','الدعاية من الإيراد',pc,0,'المصروفات'],
  ['sessDoc','جلسات الدكتور في الشهر',x=>fm(x,0),1,'إنتاجية الدكاترة'],['revDoc','إيراد الدكتور في الشهر',fm,1,'إنتاجية الدكاترة'],['docs','دكاترة شغالين (20+ جلسة/شهر)',x=>fm(x,1),null,'إنتاجية الدكاترة'],
  ['can','نسبة الإلغاء',pc,0,'المواعيد'],['ns','نسبة الغياب',pc,0,'المواعيد'],['sameDay','الإلغاء في نفس اليوم (من الإلغاء)',pc,0,'المواعيد'],['far','مواعيد محجوزة قبلها بأكتر من أسبوعين',pc,null,'المواعيد'],
  ['ret1','مرضى جداد رجعوا الشهر التاني',pc,1,'المرضى'],['six','مرضى جداد كمّلوا 6+ جلسات',pc,1,'المرضى'],['avgSess','متوسط جلسات المريض الجديد',x=>fm(x,1),1,'المرضى'],['ltv','قيمة المريض الجديد (اللي دفعه)',fm,1,'المرضى'],['revPt','إيراد المريض في الشهر',fm,1,'المرضى'],['cac','تكلفة جلب المريض (دعاية ÷ جداد)',fm,0,'المرضى'],
  ['disc','الخصم من الفواتير',pc,0,'التحصيل'],['coll','المتحصّل من صافي الفواتير',pc,1,'التحصيل'],['oldDebtM','ديون +90 يوم ÷ إيراد شهر',x=>x==null?'—':fm(x,1)+' شهر',0,'التحصيل']];
const CMPTIP={margin:'هامش الربح',revS:'إيراد الجلسة: راجع الأسعار والخصومات وإن كل جلسة بتتحاسب (مراجعة الكومبليت).',costS:'تكلفة الجلسة: المصروفات الثابتة متوزعة على جلسات قليلة — الحل جلسات أكتر بنفس الفريق مش تقليل مصروفات بس.',
  salP:'المرتبات من الإيراد عالية: الفريق أكبر من الشغل. الأول املى الجدول، وبعدين راجع الشيفتات.',can:'الإلغاء: تأكيدات بكرة كاملة كل يوم، وإعادة حجز فورية لأي إلغاء.',ns:'الغياب: تأكيد صباحي، ومتابعة خاصة للي غاب قبل كده.',
  ret1:'رجوع المريض الجديد: مكالمة خلال أسبوع لكل مريض ما حجزش الجلسة التانية، وشرح الخطة والباقة في الكشف.',six:'إكمال الخطة: الباقة بتتشرح وبتتعرض في أول زيارة، ومتابعة اللي وقف في النص.',
  sessDoc:'إنتاجية الدكتور: ساعات فاضية كتير — املاها بمرضى الويتنج والمتابعات قبل ما تعيّن حد جديد.',disc:'الخصم: سقف للخصم بيحتاج موافقة، وتسجيل سبب كل خصم.',coll:'التحصيل: الجلسة ما تتعملش إلا والباقة مدفوعة أو متقسطة بميعاد، ومتابعة التحصيل بالتليفون.',
  oldDebtM:'الديون القديمة: مراجعة فواتير الأول، وبعدين حملة تحصيل للي عمره 30–90 يوم.',adP:'الدعاية: قيس كل حملة بعدد المرضى الجداد اللي جابتهم (مصدر الإحالة لازم يتسجل).',cac:'تكلفة جلب المريض: ركّز الدعاية على المصادر اللي بتجيب مريض قيمته أعلى (تاب المرضى).',
  revDoc:'إيراد الدكتور: مزيج الخدمات وعدد الجلسات — الدكتور اللي إيراده قليل محتاج جدول أملى أو خدمات أعلى.',ltv:'قيمة المريض: الاستمرار والتحويل بين الأقسام (تغذية/أجهزة) بيرفعوها.',sameDay:'الإلغاء في نفس اليوم بيسيب ساعة فاضية: تأكيد الصبح لمواعيد اليوم، ولستة ويتنج جاهزة.'};
function vCmp(){if(!D.apt.some(a=>a.b==='dokki')||!D.pay.some(p=>p.b==='dokki'))return '<div class="card">مفيش بيانات كفاية للدقي.</div>';
  const H=cmpMetrics('haram'),K=cmpMetrics('dokki');const ks=H.ks;if(ks.length<3)return '<div class="card">اختار فترة 3 شهور على الأقل.</div>';
  const win=(m,h,k)=>{if(m[3]==null||h==null||k==null)return ['',''];const hb=m[3]?h>k:h<k;if(Math.abs(h-k)<1e-9)return ['',''];return hb?['✓','']:['','✓']};
  let g='',rows=[];for(const m of CMPM){const h=H[m[0]],k=K[m[0]];const [wh,wk]=win(m,h,k);if(m[4]!==g){g=m[4];rows.push(Object.assign([`<b>${g}</b>`,'','',''],{_c:'tot'}))}
    const rel=h!=null&&k!=null&&h&&m[3]!=null?(k-h)/Math.abs(h):null;rows.push([m[1],`${m[2](h)} <span class="up">${wh}</span>`,`${m[2](k)} <span class="up">${wk}</span>`,rel==null?'':`<span class="${(m[3]?rel>=0:rel<=0)?'up':'down'}">${rel>=0?'+':''}${pc(rel)}</span>`])}
  // gaps where Dokki is clearly worse / better (relative, size-independent metrics only)
  const eff=CMPM.filter(m=>m[3]!=null&&m[4]!=='الحجم');const gaps=eff.map(m=>{const h=H[m[0]],k=K[m[0]];if(h==null||k==null||!h)return null;const d=(k-h)/Math.abs(h);return {m,h,k,bad:m[3]?-d:d}}).filter(x=>x&&Math.abs(x.bad)>0.1);
  const worse=gaps.filter(x=>x.bad>0).sort((a,b)=>b.bad-a.bad),better=gaps.filter(x=>x.bad<0).sort((a,b)=>a.bad-b.bad);
  const rd=[],tp=[];
  rd.push(`<b>الحجم:</b> الدقي بيعمل ${pc(K.rev/(H.rev||1))} من إيراد الهرم و${pc(K.sess/(H.sess||1))} من جلساته — فالمقارنة الحقيقية في النسب والمعدلات تحت مش في الأرقام الكبيرة.`);
  if(worse.length)rd.push(`<b>الدقي أضعف في:</b> ${worse.slice(0,5).map(x=>`${x.m[1]} (${x.m[2](x.k)} مقابل ${x.m[2](x.h)})`).join('، ')}.`);
  if(better.length)rd.push(`<b>الدقي أحسن في:</b> ${better.slice(0,4).map(x=>`${x.m[1]} (${x.m[2](x.k)} مقابل ${x.m[2](x.h)})`).join('، ')}.`);
  if(!K.rent)rd.push('<b class="down">تنبيه:</b> مفيش إيجار متسجل للدقي في Medicolize في الفترة دي — لو الإيجار بيتدفع برة السيستم، ربح الدقي هنا أعلى من الحقيقي. سجّله أو قارن بأداة حسابات FIX ZONE.');
  rd.push('<i>الأرقام هنا من غير نسبة الإدارة ولا حسابات الشركاء.</i>');
  worse.slice(0,4).forEach(x=>{const t=CMPTIP[x.m[0]];if(t)tp.push(`<b>${x.m[1]}:</b> ${t}`)});
  // remote management
  const rm=[`<b>اجتماع أسبوعي ثابت مع د. محمود (15 دقيقة) على 5 أرقام بس:</b> الجلسات المكتملة، المرضى الجداد، نسبة الإلغاء، المرضى الجداد اللي ما حجزوش التانية، والمتحصّل مقابل المستحق. كلهم موجودين هنا لو اخترت «الدقي» و«الشهر ده».`,
    `<b>يوم الزيارة:</b> ابدأ بأكبر فجوة في الجدول ده${worse[0]?` (دلوقتي: ${worse[0].m[1]})`:''}، واقعد مع السكرتارية على لستة اللي لغوا وما اتحجزلهمش تاني، ولستة الديون 30–90 يوم، وراجع عينة من الكومبليت.`,
    `<b>أهداف شهرية مكتوبة لد. محمود</b> مربوطة بالفجوات: مثلاً ${worse.slice(0,2).map(x=>`${x.m[1]} من ${x.m[2](x.k)} لـ ${x.m[2](x.h)} زي الهرم`).join('، ')||'نسبة الإلغاء ورجوع المريض الجديد'}، ومتابعتها هنا كل أسبوع.`,
    'خطة اليوم (مهام السكرتارية) شغالة للفرعين — راجع نسبة المهام اللي اتقفلت في الدقي كل أسبوع، دي أسرع طريقة تعرف الشغل ماشي ولا لأ وإنت مش موجود.'];
  return `<div class="card" style="margin-bottom:12px;border-inline-start:4px solid var(--c1)"><h3>📖 القراءة<small>${ml(ks[0])} لـ ${ml(ks[ks.length-1])} — شهور كاملة بس</small></h3><ul class="ins">${rd.map(x=>`<li>${x}</li>`).join('')}</ul>
   ${tp.length?`<h3>🎯 ترشيحات للدقي</h3><ul class="ins">${tp.map(x=>`<li>${x}</li>`).join('')}</ul>`:''}
   <h3>🛰️ إدارة الدقي عن بعد</h3><ul class="ins">${rm.map(x=>`<li>${x}</li>`).join('')}</ul></div>
  <div class="card"><h3>المقارنة<small>✓ = الأحسن · الفرق = الدقي مقارنة بالهرم</small></h3>${tableHTML(['المؤشر','الهرم','الدقي','الفرق'],rows,{h:900})}</div>
  <div class="grid g2" style="margin-top:12px">${[['cm1','هامش الربح %'],['cm2','إيراد الجلسة'],['cm3','نسبة الإلغاء %'],['cm4','جلسات مكتملة'],['cm5','مرضى جداد'],['cm6','المتحصّل من الفواتير %']].map(([id,t])=>`<div class="card"><h3>${t}<small>شهري — الفرعين</small></h3><div class="ch sm"><canvas id="${id}"></canvas></div></div>`).join('')}</div>`}
function cCmp(){const ks=ksDone(),c=SER();if(ks.length<3)return;const per=(b,f)=>withB(b,()=>ks.map(f));
  const two=(id,f,isPct)=>chart(id,{type:'line',data:{labels:ks.map(mls),datasets:[line('الهرم',per('haram',f),c[0]),line('الدقي',per('dokki',f),c[1])]},options:isPct?{scales:{y:{ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+x.parsed.y+'%'}}}}:{}});
  two('cm1',k=>{const r=calcMonth(k);return r.margin==null?null:+(100*r.margin).toFixed(1)},1);two('cm2',k=>{const r=calcMonth(k);return r.avgS?Math.round(r.avgS):null});
  two('cm3',k=>{const x=D.apt.filter(a=>inB(a)&&a.k===k&&!/^Waiting/i.test(a.room||''));return x.length?+(100*x.filter(isCan).length/x.length).toFixed(1):null},1);
  two('cm4',k=>D.apt.filter(a=>inB(a)&&a.k===k&&a.st==='Completed').length);two('cm5',k=>Object.values(cenBuild().pts).filter(p=>!p.early&&p.k0===k).length);
  two('cm6',k=>{const I=D.inv.filter(x=>inB(x)&&x.k===k),n=I.reduce((s,x)=>s+x.total-x.disc,0);return n?+(100*I.reduce((s,x)=>s+x.paid,0)/n).toFixed(1):null},1)}
VIEWS.cmp=[vCmp,cCmp];
