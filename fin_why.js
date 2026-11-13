// BODYFIX — «🔍 ليه رجوع المرضى الجداد نزل؟»: بيقارن المرضى الجداد قبل شهر التغيير وبعده في كل حاجة ممكن تكون اتغيرت، ويحسب أنهي واحدة بتفسر النزول.
'use strict';
try{CEN.split=localStorage.getItem('fin_split')||'2025-08';CEN.wm=localStorage.getItem('fin_wm')||'cont'}catch(e){CEN.split='2025-08';CEN.wm='cont'}
const WM={cont:'لسه مكمّل بعد أول شهر (جلسة بين يوم 31 و60)',ret30:'رجع خلال 30 يوم'};
function whyData(){const split=CEN.split,dept=CEN.dept,td=todayC();
  const A=D.apt.filter(a=>inB(a)&&a.pid&&!/^Waiting/i.test(a.room||''));const byP={};A.forEach(a=>(byP[a.pid]=byP[a.pid]||[]).push(a));
  const inv={};D.inv.filter(x=>inB(x)&&x.pid).forEach(x=>(inv[x.pid]=inv[x.pid]||[]).push(x));
  const pay={};D.pay.filter(p=>inB(p)&&p.pid&&!p.bal).forEach(p=>(pay[p.pid]=pay[p.pid]||[]).push(p));
  const {pts}=cenBuild();const first=D.months[0];const out=[];
  for(const pid in byP){const l=byP[pid].slice().sort((a,b)=>a.d<b.d?-1:a.d>b.d?1:a.h-b.h);const done=l.filter(a=>a.st==='Completed');if(!done.length)continue;
    const f=done[0];if(f.k===first)continue;const fd=deptOfType(f.type);if(dept&&fd!==dept)continue;
    if((Date.parse(td)-Date.parse(f.d))/864e5<65)continue;           // لسه ما عدّاش شهرين على أول زيارة
    const sameDept=a=>!dept||deptOfType(a.type)===dept;
    const next=done.find(a=>a.d>f.d&&sameDept(a));const ret30=!!(next&&(Date.parse(next.d)-Date.parse(f.d))/864e5<=30);const dd=a=>(Date.parse(a.d)-Date.parse(f.d))/864e5;
    const cont=done.some(a=>sameDept(a)&&dd(a)>30&&dd(a)<=60);const s30=done.filter(a=>sameDept(a)&&dd(a)<=30).length;
    const booked=l.filter(a=>a.d>f.d&&a.cr&&a.cr<=f.d&&sameDept(a));  // اتحجزله قبل ما يمشي (يوم أول زيارة أو قبله)
    const bk=booked.length>0,bkLost=bk&&booked.every(a=>isLost(a));
    const pk=(inv[pid]||[]).some(x=>x.total-x.disc>=1500&&Math.abs(Date.parse(x.d)-Date.parse(f.d))/864e5<=14);
    const paid0=(pay[pid]||[]).filter(p=>p.d===f.d).reduce((s,p)=>s+p.amt,0);
    const p=pts[pid]||{};const gap=next?Math.round((Date.parse(next.d)-Date.parse(f.d))/864e5):null;
    out.push({pid,k:f.k,per:f.k<split?'A':'B',ret30,cont,s30,doc:f.doc===PAST_DOC?'دكاترة سابقين':f.doc,type:tName(f.type),w:DAYS[f.w],h:f.h,bk,bkLost,pk,paid0,src:p.src||'مش متسجل',gap,
      sess90:done.filter(a=>sameDept(a)&&(Date.parse(a.d)-Date.parse(f.d))/864e5<=90).length})}
  const ks=[...new Set(out.map(o=>o.k))].sort();const B=ks.filter(k=>k>=split),Ak=ks.filter(k=>k<split).slice(-6);
  const A6=out.filter(o=>Ak.includes(o.k)),B6=out.filter(o=>B.includes(o.k));return {all:out,A:A6,B:B6,Ak,Bk:B,split}}
const rt=(arr,f)=>arr.length?arr.filter(f).length/arr.length:null;
function decomp(X,key,minN){const g=arr=>{const o={};arr.forEach(x=>{const k=key(x);if(k==null||k==='')return;const z=o[k]=o[k]||{n:0,r:0};z.n++;if(x[CEN.wm])z.r++});return o};
  const a=g(X.A),b=g(X.B),rows=[];const keys=new Set([...Object.keys(a),...Object.keys(b)]);
  for(const k of keys){const A_=a[k]||{n:0,r:0},B_=b[k]||{n:0,r:0};if(A_.n+B_.n<(minN||15))continue;const ra=A_.n?A_.r/A_.n:null,rb=B_.n?B_.r/B_.n:null;
    rows.push({k,na:A_.n,nb:B_.n,ra,rb,shA:A_.n/(X.A.length||1),shB:B_.n/(X.B.length||1),rateFx:ra!=null&&rb!=null?(rb-ra)*B_.n/(X.B.length||1):null})}
  const rA=rt(X.A,x=>x[CEN.wm])||0;const mix=rows.reduce((s,r)=>s+(r.shB-r.shA)*((r.ra??rA)-rA),0);   // أثر تغيّر التركيبة
  return {rows,mix}}
const PR=[[0,0,'مدفعش'],[1,299,'أقل من 300'],[300,599,'300–599'],[600,1499,'600–1,499'],[1500,1e9,'1,500+ (باقة)']];
const prB=v=>(PR.find(p=>v>=p[0]&&v<=p[1])||PR[0])[2];
const hB=h=>h<13?'قبل 1 الضهر':h<17?'1–5':h<20?'5–8':'8 بالليل+';
function vWhy(){const X=whyData();if(X.A.length<20||X.B.length<20)return `<div class="card">🔍 محتاج مرضى جداد كفاية قبل ${ml(CEN.split)} وبعده علشان المقارنة (قبل: ${X.A.length} · بعد: ${X.B.length}).</div>`;
  const M=CEN.wm,rA=rt(X.A,x=>x[M]),rB=rt(X.B,x=>x[M]),d=rB-rA;const r30=[rt(X.A,x=>x.ret30),rt(X.B,x=>x.ret30)],rc=[rt(X.A,x=>x.cont),rt(X.B,x=>x.cont)];
  const av=(a,f)=>a.length?a.reduce((s,x)=>s+f(x),0)/a.length:null;const s30=[av(X.A,x=>x.s30),av(X.B,x=>x.s30)],s90=[av(X.A,x=>x.sess90),av(X.B,x=>x.sess90)];
  const SB=[[1,1,'جلسة واحدة'],[2,3,'2–3'],[4,6,'4–6'],[7,10,'7–10'],[11,15,'11–15'],[16,1e9,'16+']];const sbOf=v=>(SB.find(b=>v>=b[0]&&v<=b[1])||SB[0])[2];
  const dist=SB.map(b=>{const f=x=>x.sess90>=b[0]&&x.sess90<=b[1];return [b[2],X.A.filter(f).length,pc(rt(X.A,f)),X.B.filter(f).length,pc(rt(X.B,f))]});
  const dg={};X.all.filter(x=>X.Ak.includes(x.k)||X.Bk.includes(x.k)).forEach(x=>{const g=dg[x.doc]=dg[x.doc]||{A:[],B:[]};g[x.per==='A'?'A':'B'].push(x)});
  const docS=Object.entries(dg).filter(([k,g])=>g.A.length+g.B.length>=20).map(([k,g])=>[esc(k),g.A.length,g.A.length?av(g.A,x=>x.sess90).toFixed(1):'—',g.B.length,g.B.length?av(g.B,x=>x.sess90).toFixed(1):'—',g.A.length&&g.B.length?(av(g.B,x=>x.sess90)-av(g.A,x=>x.sess90)).toFixed(1):'جديد']).sort((a,b)=>(+a[5]||0)-(+b[5]||0));
  const D_={doc:decomp(X,x=>x.doc,20),type:decomp(X,x=>x.type,20),bk:decomp(X,x=>x.bk?'اتحجزله الجاية قبل ما يمشي':'ما اتحجزلوش حاجة قبل ما يمشي',10),pk:decomp(X,x=>x.pk?'اشترى باقة (فاتورة 1,500+ خلال أسبوعين)':'ما اشتراش باقة',10),
    pr:decomp(X,x=>prB(x.paid0),10),src:decomp(X,x=>x.src,20),w:decomp(X,x=>x.w,15),h:decomp(X,x=>hB(x.h),15)};
  const sh=(arr,f)=>rt(arr,f);
  const facts=[['اتحجزله الزيارة الجاية قبل ما يمشي',x=>x.bk],['الحجز الجاي اتلغى أو ما جاش',x=>x.bkLost],['اشترى باقة خلال أسبوعين',x=>x.pk],['أول زيارة كانت «كشف»',x=>/كشف/.test(x.type)]];
  const fr=facts.map(([t,f])=>[t,sh(X.A,f),sh(X.B,f)]);
  // ranking: which dimension's rate drops explain the most (inside the biggest groups)
  const ex=[];for(const [dim,lbl] of [['doc','الدكتور'],['type','نوع أول زيارة'],['bk','الحجز قبل ما يمشي'],['pk','الباقة'],['pr','المدفوع في أول زيارة'],['src','مصدر الإحالة'],['w','اليوم'],['h','الساعة']]){
    const R=D_[dim].rows.filter(r=>r.rateFx!=null);const worst=R.slice().sort((a,b)=>a.rateFx-b.rateFx)[0];ex.push({dim,lbl,mix:D_[dim].mix,worst})}
  const lines=[];const bkA=fr[0][1],bkB=fr[0][2],pkA=fr[2][1],pkB=fr[2][2];
  lines.push(`<b>رجع خلال 30 يوم:</b> ${pc(r30[0])} ← ${pc(r30[1])}. <b>لسه مكمّل بعد أول شهر (يوم 31–60):</b> ${pc(rc[0])} ← ${pc(rc[1])}. عدد المرضى: ${X.A.length} ← ${X.B.length}.`);
  lines.push(`<b>متوسط الجلسات:</b> أول 30 يوم ${s30[0]?.toFixed(1)} ← ${s30[1]?.toFixed(1)} جلسة · أول 90 يوم ${s90[0]?.toFixed(1)} ← ${s90[1]?.toFixed(1)} جلسة.`);
  if(r30[1]>=r30[0]-0.02&&rc[1]<rc[0]-0.04)lines.push(`<b class="down">الخلاصة: المريض الجديد لسه بيرجع زي زمان بعد أول زيارة، بس بيقف أسرع.</b> اللي نزل هو الاستمرار بعد أول شهر (${pc(rc[0])} ← ${pc(rc[1])})${s90[1]<s90[0]-0.5?`، والجلسات لكل مريض قلت من ${s90[0].toFixed(1)} لـ ${s90[1].toFixed(1)} في أول 90 يوم`:''}. يعني المشكلة مش في الاستقبال ولا في جذب المريض، المشكلة في <b>طول خطة العلاج وإقناع المريض يكمّلها</b>. ده اللي خريطة الاحتفاظ بتوريه في «شهر 1» و«شهر 2».`);
  lines.push(`<i>الجداول تحت محسوبة على: «${WM[M]}» (${pc(rA)} ← ${pc(rB)}). غيّر المقياس من القايمة فوق.</i>`);
  const R_bk=D_.bk.rows.find(r=>/اتحجزله/.test(r.k)),R_nb=D_.bk.rows.find(r=>/ما اتحجزلوش/.test(r.k));
  if(bkA!=null&&bkB!=null)lines.push(`<b>الحجز قبل ما يمشي:</b> ${pc(bkA)} ← ${pc(bkB)} من المرضى الجداد اتحجزلهم الزيارة الجاية في نفس يوم أول زيارة. اللي اتحجزله بيرجع ${R_bk?pc(R_bk.rb):'—'} واللي ما اتحجزلوش بيرجع ${R_nb?pc(R_nb.rb):'—'}.${bkB<bkA-0.05?' <b class="down">ده تغيّر في طريقة الشغل عند الاستقبال.</b>':''}`);
  if(pkA!=null&&pkB!=null)lines.push(`<b>الباقات:</b> ${pc(pkA)} ← ${pc(pkB)} اشتروا باقة خلال أسبوعين من أول زيارة.${pkB<pkA-0.05?' <b class="down">بيع الباقات قل.</b>':''}`);
  // mix effects
  const mixT=ex.filter(e=>Math.abs(e.mix)>0.01).sort((a,b)=>a.mix-b.mix);mixT.slice(0,2).forEach(e=>{if(e.mix<0)lines.push(`<b>تغيّر في التركيبة (${e.lbl}):</b> نسبة المرضى في الفئات اللي بترجع أقل زادت — ده لوحده مسؤول عن ${(Math.abs(e.mix)*100).toFixed(1)} نقطة من النزول.`)});
  // doctors
  const docs=D_.doc.rows.filter(r=>r.ra!=null&&r.rb!=null&&r.nb>=15).sort((a,b)=>a.rateFx-b.rateFx);if(docs.length&&docs[0].rateFx<-0.01)lines.push(`<b>الدكاترة:</b> أكبر نزول عند ${docs.slice(0,3).filter(r=>r.rateFx<0).map(r=>`${esc(r.k)} (${pc(r.ra)} ← ${pc(r.rb)}، ${r.nb} مريض)`).join('، ')}.`);
  const newDocs=D_.doc.rows.filter(r=>!r.na&&r.nb>=15).sort((a,b)=>b.nb-a.nb);if(newDocs.length)lines.push(`<b>دكاترة جداد بعد ${ml(X.split)}:</b> ${newDocs.slice(0,4).map(r=>`${esc(r.k)} (${r.nb} مريض، رجوع ${pc(r.rb)})`).join('، ')}. ولو رجوعهم أقل من ${pc(rA)} فده جزء من السبب.`);
  const goneDocs=D_.doc.rows.filter(r=>r.na>=15&&!r.nb).sort((a,b)=>b.na-a.na);if(goneDocs.length)lines.push(`<b>دكاترة مشيوا:</b> ${goneDocs.slice(0,4).map(r=>`${esc(r.k)} (كان رجوع مرضاه ${pc(r.ra)})`).join('، ')}.`);
  const tps=D_.type.rows.filter(r=>r.ra!=null&&r.rb!=null).sort((a,b)=>a.rateFx-b.rateFx);if(tps.length&&tps[0].rateFx<-0.01)lines.push(`<b>نوع أول زيارة:</b> أكبر نزول في «${esc(tps[0].k)}» (${pc(tps[0].ra)} ← ${pc(tps[0].rb)}).`);
  const prs=D_.pr.rows.filter(r=>r.ra!=null&&r.rb!=null);const pr0=prs.find(r=>r.k==='مدفعش');if(pr0&&pr0.shB>pr0.shA+0.05)lines.push(`<b>أول زيارة من غير دفع:</b> زادت من ${pc(pr0.shA)} لـ ${pc(pr0.shB)} — كشف مجاني أو متسجل من غير فلوس، وده غالباً بيجيب مرضى أقل التزام.`);
  const tbl=(t,r)=>`<div class="card"><h3>${t}</h3>${tableHTML(['',{t:'مرضى قبل',n:1},{t:'رجوع قبل',n:1},{t:'مرضى بعد',n:1},{t:'رجوع بعد',n:1},{t:'نصيبهم قبل ← بعد',n:1},{t:'أثرهم على النزول (نقطة)',n:1}],
    r.rows.sort((a,b)=>(a.rateFx??0)-(b.rateFx??0)).slice(0,12).map(x=>[esc(x.k),x.na,pc(x.ra),x.nb,pc(x.rb),pc(x.shA)+' ← '+pc(x.shB),x.rateFx==null?'جديد':(x.rateFx*100).toFixed(1)]),{h:340})}</div>`;
  const opts=X.Ak.concat(X.Bk).filter((v,i,a)=>a.indexOf(v)===i);const allK=[...new Set(X.all.map(o=>o.k))].sort();
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--warn)"><h3>🔍 ليه المرضى الجداد بقوا يقفوا أسرع؟<small>${CEN.dept?DEPN[CEN.dept]+' بس':'كل الأقسام'} · ${BRN[S.b]} · قبل: ${ml(X.Ak[0])}–${ml(X.Ak[X.Ak.length-1])} · بعد: ${ml(X.Bk[0])}–${ml(X.Bk[X.Bk.length-1])}</small></h3>
   <div class="bar"><label class="sub">شهر التغيير <select id="whyS">${allK.slice(3).map(k=>`<option value="${k}"${k===CEN.split?' selected':''}>${ml(k)}</option>`).join('')}</select></label><label class="sub">المقياس <select id="whyM">${Object.entries(WM).map(([k,t])=>`<option value="${k}"${k===M?' selected':''}>${t}</option>`).join('')}</select></label><span class="sub">الجلسات المكتملة${CEN.dept?' في نفس القسم':''} بس · المرضى اللي بدأوا من شهرين على الأقل</span></div>
   <div class="grid g4">${kpi('رجعوا خلال 30 يوم',pc(r30[0])+' ← '+pc(r30[1]))}${kpi('لسه مكمّل بعد أول شهر',pc(rc[0])+' ← '+pc(rc[1]))}${kpi('متوسط الجلسات أول 90 يوم',(s90[0]?.toFixed(1)??'—')+' ← '+(s90[1]?.toFixed(1)??'—'))}${fr.map(([t,a,b])=>kpi(t,pc(a)+' ← '+pc(b))).join('')}</div>
   <h3 style="margin-top:12px">📖 اللي الأرقام بتقوله</h3><ul class="ins">${lines.map(x=>`<li>${x}</li>`).join('')}</ul>
   <div class="note">«أثرهم على النزول» = قد إيه نزول رجوع المجموعة دي نزّل الرقم الكلي. السالب الكبير = المجموعة اللي فيها المشكلة. «نصيبهم» = لو مجموعة بترجع قليل كبرت، الرقم الكلي ينزل حتى لو مفيش حد اتغير.</div></div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>عدد جلسات المريض في أول 90 يوم<small>لو «جلسة واحدة» و«2–3» كبروا يبقى المرضى بيقفوا بدري</small></h3>${tableHTML(['جلسات',{t:'مرضى قبل',n:1},{t:'نصيبهم قبل',n:1},{t:'مرضى بعد',n:1},{t:'نصيبهم بعد',n:1}],dist,{h:340})}</div>
   <div class="card"><h3>متوسط جلسات المريض الجديد (أول 90 يوم) حسب الدكتور</h3>${tableHTML(['',{t:'مرضى قبل',n:1},{t:'جلسات قبل',n:1},{t:'مرضى بعد',n:1},{t:'جلسات بعد',n:1},{t:'الفرق',n:1}],docS,{h:340})}</div>
   ${tbl('حسب الدكتور (أول زيارة)',D_.doc)}${tbl('اتحجزله الجاية قبل ما يمشي؟',D_.bk)}${tbl('اشترى باقة؟',D_.pk)}${tbl('نوع أول زيارة',D_.type)}${tbl('المدفوع في أول زيارة',D_.pr)}${tbl('مصدر الإحالة',D_.src)}${tbl('يوم أول زيارة',D_.w)}${tbl('ساعة أول زيارة',D_.h)}</div>`}
function cWhy(){const m=$('#whyM');if(m)m.onchange=()=>{CEN.wm=m.value;try{localStorage.setItem('fin_wm',CEN.wm)}catch(e){}render()};const s=$('#whyS');if(s)s.onchange=()=>{CEN.split=s.value;try{localStorage.setItem('fin_split',CEN.split)}catch(e){}render()}}
{const v=VIEWS.cen,f=v[0],c=v[1];VIEWS.cen=[()=>{let s=f();if(CEN.sub!=='pts')return s;let h='';try{h=vWhy()}catch(e){console.error(e);h='<div class="card">خطأ في التحليل: '+esc(e.message)+'</div>'}
  const i=s.indexOf('<div class="grid g2"',s.indexOf('خريطة الاحتفاظ'));return i>0?s.slice(0,i)+h+s.slice(i):s+h},()=>{c();if(CEN.sub==='pts')try{cWhy()}catch(e){console.error(e)}}]}
