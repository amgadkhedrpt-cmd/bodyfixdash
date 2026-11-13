// BODYFIX — «🔍 ليه الإلغاء زاد؟»: بيقارن أول 6 شهور في الفترة بآخر 6 شهور كاملة ويفصّل السبب.
'use strict';
const isCan=a=>/cancel/i.test(a.st),isNS=a=>/no ?show/i.test(a.st),isLost=a=>isCan(a)||isNS(a);
function cxData(){const ks=ksDone();if(ks.length<9)return null;const A6=ks.slice(0,6),B6=ks.slice(-6);
  const AP=D.apt.filter(a=>inB(a)&&!/^Waiting/i.test(a.room||''));const inA=a=>A6.includes(a.k),inB2=a=>B6.includes(a.k);
  const byP={};AP.forEach(a=>{if(a.pid)(byP[a.pid]=byP[a.pid]||[]).push(a)});Object.values(byP).forEach(l=>l.sort((x,y)=>x.d<y.d?-1:1));
  const firstD={};for(const pid in byP){const f=byP[pid].find(a=>a.st==='Completed');if(f)firstD[pid]=f.d}
  // reschedule: same patient has another non-cancelled appointment from the same day to 14 days later
  const resch=a=>{const l=byP[a.pid]||[],t=Date.parse(a.d);return l.some(x=>x!==a&&!isLost(x)&&(Date.parse(x.d)-t)/864e5>=0&&(Date.parse(x.d)-t)/864e5<=14)};
  const lead=a=>a.cr?Math.round((Date.parse(a.d)-Date.parse(a.cr))/864e5):null;const LB=[['نفس اليوم',0,0],['1–3 أيام',1,3],['4–14 يوم',4,14],['15–30 يوم',15,30],['أكتر من شهر',31,1e9]];
  const lb=a=>{const l=lead(a);if(l==null||l<0)return null;return (LB.find(b=>l>=b[1]&&l<=b[2])||[null])[0]};
  return {ks,A6,B6,AP,A:AP.filter(inA),B:AP.filter(inB2),byP,firstD,resch,lead,lb,LB}}
const rate=(arr,f)=>arr.length?arr.filter(f).length/arr.length:null;
function segTable(X,key,f,minN){const {A,B}=X;const g=(arr)=>{const o={};arr.forEach(a=>{const k=key(a);if(k==null||k==='')return;const z=o[k]=o[k]||{n:0,c:0};z.n++;if(f(a))z.c++});return o};
  const ga=g(A),gb=g(B),rows=[];for(const k in gb){const b=gb[k],a=ga[k]||{n:0,c:0};if(b.n<(minN||60))continue;const ra=a.n?a.c/a.n:null,rb=b.c/b.n;rows.push({k,na:a.n,nb:b.n,ra,rb,shA:a.n/A.length,shB:b.n/B.length,excess:ra==null?null:(rb-ra)*b.n})}
  return rows}
function vCancel(){const X=cxData();if(!X)return '<div class="card">محتاج 9 شهور على الأقل في الفترة علشان المقارنة.</div>';const {A,B,A6,B6,AP}=X;
  if(!AP.some(a=>a.cr))return '<div class="card">🔍 بيانات وقت الحجز لسه بتتسحب — افتح الصفحة تاني بعد المزامنة الجاية.</div>';
  const rA=rate(A,isCan),rB=rate(B,isCan),nA=rate(A,isNS),nB=rate(B,isNS);
  // 1) reschedule vs lost
  const cA=A.filter(isCan),cB=B.filter(isCan),rsA=rate(cA,X.resch),rsB=rate(cB,X.resch);const lostA=rA*(1-rsA),lostB=rB*(1-rsB);
  // 2) lead time mix
  const LT=X.LB.map(([n])=>{const a=A.filter(x=>X.lb(x)===n),b=B.filter(x=>X.lb(x)===n);return {n,shA:a.length/(A.filter(x=>X.lb(x)).length||1),shB:b.length/(B.filter(x=>X.lb(x)).length||1),ra:rate(a,isCan),rb:rate(b,isCan),nb:b.length}});
  const cf=LT.reduce((s,x)=>s+(x.shA*(x.rb??0)),0);const mixFx=rB-cf;
  // 3) cancel timing (last change vs appointment day)
  const tim=arr=>{const c=arr.filter(a=>isCan(a)&&a.up);if(!c.length)return null;const d=c.map(a=>(Date.parse(a.d)-Date.parse(a.up))/864e5);return {same:d.filter(x=>x<=0).length/c.length,day1:d.filter(x=>x>0&&x<=1).length/c.length,early:d.filter(x=>x>1).length/c.length}};const tA=tim(A),tB=tim(B);
  // 4) new vs returning
  const nv=a=>{const f=X.firstD[a.pid];return !f||a.d<=f?'مريض جديد (قبل/في أول جلسة)':'مريض مستمر'};
  // 5) repeat cancellers
  const cnt={};cB.forEach(a=>{cnt[a.pid]=(cnt[a.pid]||0)+1});const rep=Object.values(cnt).filter(x=>x>=3).reduce((s,x)=>s+x,0)/(cB.length||1);
  const seg=(title,key,minN)=>{const rows=segTable(X,key,isCan,minN).sort((a,b)=>(b.excess??-1e9)-(a.excess??-1e9));return `<div class="card"><h3>${title}<small>مرتب بالأكتر مساهمة في الزيادة</small></h3>${tableHTML(['',{t:'مواعيد قبل',n:1},{t:'إلغاء قبل',n:1},{t:'مواعيد دلوقتي',n:1},{t:'إلغاء دلوقتي',n:1},{t:'إلغاء زيادة',n:1}],rows.slice(0,12).map(r=>[esc(r.k),r.na,pc(r.ra),r.nb,pc(r.rb),r.excess==null?'جديد':Math.round(r.excess)]),{h:330})}</div>`};
  // conclusions
  const why=[];const dp=rB-rA;
  if(rsB!=null&&rsA!=null){const lostCh=lostB-lostA;why.push(`<b>تأجيل ولا إلغاء حقيقي؟</b> ${pc(rsB)} من الإلغاءات دلوقتي اتحجز للمريض موعد تاني خلال أسبوعين (كانت ${pc(rsA)}). الإلغاء «الضايع فعلاً» ${pc(lostA)} ← ${pc(lostB)} من المواعيد${dp>0?`، يعني ${pc(Math.max(0,Math.min(1,(dp-lostCh)/dp)))} من الزيادة تأجيلات مش مرضى ضايعين`:''}.`)}
  if(Math.abs(mixFx)>0.005)why.push(`<b>الحجز بدري:</b> نسبة المواعيد المحجوزة قبلها بأكتر من أسبوعين اتغيرت (${pc(LT.slice(3).reduce((s,x)=>s+x.shA,0))} ← ${pc(LT.slice(3).reduce((s,x)=>s+x.shB,0))}). لو نسبة الحجز البدري كانت زي الأول، الإلغاء كان هيبقى ${pc(cf)} بدل ${pc(rB)} — يعني الحجز البدري لوحده مسؤول عن ${(mixFx*100).toFixed(1)} نقطة من الزيادة.`);
  if(tA&&tB)why.push(`<b>توقيت الإلغاء:</b> ${pc(tB.same)} من الإلغاءات بتتعمل يوم الموعد نفسه (كانت ${pc(tA.same)})، و${pc(tB.day1)} قبلها بيوم.${tB.same>0.35?' الإلغاء في نفس اليوم بيسيب ساعة فاضية مش بتتملى.':''}`);
  if(rep>0.15)why.push(`<b>مرضى بيلغوا كتير:</b> ${pc(rep)} من الإلغاءات آخر 6 شهور جاية من مرضى لغوا 3 مرات أو أكتر.`);
  const dSeg=segTable(X,a=>a.doc,isCan,150).filter(r=>r.k!==PAST_DOC&&r.excess!=null).sort((a,b)=>b.excess-a.excess);const tSeg=segTable(X,a=>tName(a.type),isCan,150).filter(r=>r.excess!=null).sort((a,b)=>b.excess-a.excess);
  const totEx=dp*B.length;if(totEx>0&&dSeg.length)why.push(`<b>الدكاترة:</b> أكتر زيادة عند ${dSeg.slice(0,3).map(r=>`${esc(r.k)} (${pc(r.ra)} ← ${pc(r.rb)})`).join('، ')}.`);
  if(totEx>0&&tSeg.length)why.push(`<b>نوع الموعد:</b> أكتر زيادة في ${tSeg.slice(0,3).map(r=>`${esc(r.k)} (${pc(r.ra)} ← ${pc(r.rb)})`).join('، ')}.`);
  const bySeg=segTable(X,a=>a.by,isCan,150).filter(r=>r.excess!=null).sort((a,b)=>b.excess-a.excess);if(bySeg.length&&bySeg[0].excess>0)why.push(`<b>مين حجز:</b> أعلى زيادة في المواعيد اللي حجزها ${bySeg.slice(0,2).map(r=>`${esc(r.k)} (${pc(r.ra)} ← ${pc(r.rb)})`).join('، ')} — ممكن يكون أسلوب حجز (حجز باقة كاملة مقدم مثلاً) مش مشكلة في الشخص.`);
  const todo=[];if(rsB>0.4)todo.push('جزء كبير من الإلغاء تأجيل: الأهم إن الموعد الملغي يتملى بحد من الويتنج، مش إن المريض ما يأجلش.');
  if(tB&&tB.same>0.3)todo.push('تأكيد مواعيد بكرة بالكامل كل يوم (مهمة «تأكيدات بكرة») وتأكيد صباحي لمواعيد بعد الضهر.');
  if(mixFx>0.01)todo.push('المواعيد المحجوزة بدري بتتلغي أكتر: لو بتحجزوا الباقة كلها مقدم، أكّدوا كل موعد قبلها بيوم، أو احجزوا أسبوع بأسبوع.');
  if(rep>0.15)todo.push('المريض اللي لغى 3 مرات: تأكيد مخصوص أو عربون للحجز الجاي.');
  return `<div class="card" style="margin-bottom:12px;border-inline-start:4px solid var(--warn)"><h3>🔍 ليه الإلغاء زاد؟<small>${ml(A6[0])}–${ml(A6[5])} (قبل) مقابل ${ml(B6[0])}–${ml(B6[5])} (دلوقتي)</small></h3>
   <div class="grid g4">${kpi('الإلغاء',pc(rA)+' ← '+pc(rB),dp>0?'زاد '+(dp*100).toFixed(1)+' نقطة':'قل '+(-dp*100).toFixed(1)+' نقطة')}${kpi('الغياب',pc(nA)+' ← '+pc(nB))}${kpi('إلغاء اتأجل (اتحجز تاني خلال أسبوعين)',pc(rsA)+' ← '+pc(rsB))}${kpi('الإلغاء الضايع فعلاً',pc(lostA)+' ← '+pc(lostB),'من كل المواعيد')}</div>
   <h3 style="margin-top:12px">📖 اللي الأرقام بتقوله</h3><ul class="ins">${why.map(x=>`<li>${x}</li>`).join('')}</ul>${todo.length?`<h3>🎯 الترشيحات</h3><ul class="ins">${todo.map(x=>`<li>${x}</li>`).join('')}</ul>`:''}</div>
  <div class="grid g2"><div class="card"><h3>الإلغاء حسب الحجز قبلها بكام يوم</h3>${tableHTML(['اتحجز قبلها',{t:'من المواعيد قبل',n:1},{t:'من المواعيد دلوقتي',n:1},{t:'إلغاء قبل',n:1},{t:'إلغاء دلوقتي',n:1}],LT.map(x=>[x.n,pc(x.shA),pc(x.shB),pc(x.ra),pc(x.rb)]))}</div>
   <div class="card"><h3>نسبة الإلغاء شهري — اتأجل مقابل ضاع</h3><div class="ch"><canvas id="cx1"></canvas></div></div>
   ${seg('حسب الدكتور',a=>a.doc,100)}${seg('حسب نوع الموعد',a=>tName(a.type),100)}${seg('حسب اليوم',a=>DAYS[a.w],50)}${seg('حسب الساعة',a=>a.h+':00',50)}${seg('مريض جديد ولا مستمر',nv,50)}${seg('مين حجز الموعد',a=>a.by,100)}</div>`}
function cCancel(){const X=cxData();if(!X||!X.AP.some(a=>a.cr))return;const ks=X.ks,c=SER();
  const m=ks.map(k=>{const x=X.AP.filter(a=>a.k===k),cc=x.filter(isCan);return {n:x.length,rs:cc.filter(X.resch).length,lo:cc.length-cc.filter(X.resch).length}});
  chart('cx1',{data:{labels:ks.map(mls),datasets:[bar('اتأجل %',m.map(x=>x.n?+(100*x.rs/x.n).toFixed(1):null),c[0],{stack:'s',borderRadius:0}),bar('ضاع %',m.map(x=>x.n?+(100*x.lo/x.n).toFixed(1):null),c[7],{stack:'s',borderRadius:0})]},options:{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+x.parsed.y+'%'}}}}})}
// inside المواعيد tab, right after the reading card
{const v=VIEWS.apt,f=v[0],cb=v[1];VIEWS.apt=[()=>{const s=f();let h='';try{h=vCancel()}catch(e){console.error(e)}const i=s.indexOf('<div class="grid g4">');return i>=0?s.slice(0,i)+h+s.slice(i):s+h},()=>{cb();try{cCancel()}catch(e){console.error(e)}}]}
