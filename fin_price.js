// BODYFIX — «💲 الأسعار»: بيكتشف أي زيادة سعر لوحده (من الفواتير وأسعار خدمات التغذية) + زيادات بتسجلها إنت،
// وبيقيس أثر كل زيادة: قبل/بعد بنفس عدد الأيام، ومصحّح بنفس الفترة من السنة اللي فاتت (الموسمية).
'use strict';
const PRC={};try{PRC.N=+(localStorage.getItem('fin_pr_n')||60)||60;PRC.dept=''}catch(e){PRC.N=60;PRC.dept=''}
const prDay=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const prDays=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5)+1;
// ---------- اكتشاف تغيّر الأسعار من الترند ----------
// لكل قسم ولكل نوع فاتورة (كشف/جلسة أقل من 900 — باقة 900+): المستوى العادي للفاتورة كل شهر (الوسيط).
// زيادة = المستوى نط مرة واحدة وفضل فوق (وسيط الـ 3 شهور بعد ÷ وسيط الـ 3 قبل ≥ 4%). النسبة = قد إيه المستوى اتنقل.
// التغذية كمان: سعر كل خدمة في القايمة — الزيادات في نفس الشهر بتتجمع في زيادة واحدة.
const PR_BAND=[['s','كشف / جلسة',0,900],['p','باقة',900,1e9]];
const prMed=a=>{if(!a.length)return null;const b=a.slice().sort((x,y)=>x-y),m=b.length>>1;return b.length%2?b[m]:(b[m-1]+b[m])/2};
function prDetect(){const key=S.b;PRC.det=PRC.det||{};if(PRC.det[key])return PRC.det[key];const ev=[];
  const byP=cenBuild().byP,dOf=x=>{const l=byP[x.pid];if(l){const t=Date.parse(x.d);let best=null,bd=1e9;for(const a of l){const dd=(t-Date.parse(a[0]))/864e5;if(dd>=-7&&dd<=30&&Math.abs(dd)<bd){bd=Math.abs(dd);best=a}}if(best)return best[1]}return ALAA.test(x.doc||'')?'nut':'phy'};
  const I=D.inv.filter(x=>inB(x)&&x.total>=100).map(x=>({d:x.d,k:x.k,t:x.total,dp:dOf(x)}));const ks=D.months.filter(k=>k<=curK()),cur=curK();
  PRC.series={};
  for(const [dp] of DEPTS)for(const [bk,bn,lo,hi] of PR_BAND){const L=I.filter(x=>x.dp===dp&&x.t>=lo&&x.t<hi);if(L.length<60)continue;
    const M=ks.map(k=>{const a=L.filter(x=>x.k===k).map(x=>x.t);return {k,n:a.length,m:a.length>=8?prMed(a):null}});PRC.series[dp+'|'+bk]={dp,bk,bn,M};
    for(let i=3;i<M.length;i++){if(M[i].m==null)continue;const pre=prMed(M.slice(i-3,i).map(x=>x.m).filter(v=>v!=null)),postA=M.slice(i,i+3).filter(x=>x.m!=null),post=prMed(postA.map(x=>x.m));
      if(pre==null||post==null||!(M[i-1].m!=null))continue;const r=post/pre;
      if(r<1.04||M[i].m<M[i-1].m*1.03||postA.some(x=>x.m<pre*1.02))continue;
      // نفس الزيادة متتكررش في الشهر اللي بعده
      if(ev.some(e=>e.dept===dp&&e.band===bk&&e.k===shiftK(M[i].k,-1)&&e.r>=r))continue;const prev=ev.findIndex(e=>e.dept===dp&&e.band===bk&&e.k===shiftK(M[i].k,-1));if(prev>=0)ev.splice(prev,1);
      const mid=(pre+post)/2,d0=L.filter(x=>x.k===M[i].k&&x.t>=mid).map(x=>x.d).sort()[0]||M[i].k+'-01';
      // الأسعار اللي ظهرت (دليل): أكتر قيم متكررة بعد ومش قبل
      const cnt=(ms)=>{const c={};L.filter(x=>ms.includes(x.k)).forEach(x=>{const v=Math.round(x.t/10)*10;c[v]=(c[v]||0)+1});return c};
      const cb=cnt(M.slice(Math.max(0,i-3),i).map(x=>x.k)),ca=cnt(postA.map(x=>x.k));const nw=Object.entries(ca).filter(([v,n])=>n>=4&&!(cb[v]>=3)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([v])=>fm(+v));
      const gone=Object.entries(cb).filter(([v,n])=>n>=4&&!(ca[v]>=3)).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([v])=>fm(+v));
      ev.push({d:d0,k:M[i].k,dept:dp,band:bk,r,pct:r-1,auto:'trend',prelim:postA.length<2||postA.some(x=>x.k===cur),
        label:`${DEPN[dp]} — ${bn}: الفاتورة العادية ${fm(pre)} ← ${fm(post)}`,ev:(gone.length||nw.length)?`أسعار اختفت: ${gone.join('، ')||'—'} · أسعار ظهرت: ${nw.join('، ')||'—'}`:''})}}
  // التغذية: سعر القايمة لكل خدمة — نجمّع زيادات نفس الشهر
  try{if(typeof nutBuild==='function'&&(S.b==='haram'||S.b==='both')){const {ops}=nutBuild();const g={};ops.forEach(o=>{if(!(o.tot>0))return;const nmx=o.op||o.n;const z=(g[nmx]=g[nmx]||{});const zz=(z[o.k]=z[o.k]||{});const v=Math.round(o.tot/10)*10;zz[v]=(zz[v]||0)+1});
    const byM={};for(const nmx in g){const ms=Object.keys(g[nmx]).sort();let prev=null;for(let mi=0;mi<ms.length;mi++){const m=ms[mi],c=g[nmx][m],tot=Object.values(c).reduce((a,b)=>a+b,0);if(tot<3)continue;const mode=+Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
      if(prev&&mode>=prev*1.03&&mode<=prev*2){const nx=ms[mi+1];const keep=!nx||(()=>{const c2=g[nmx][nx];return +Object.entries(c2).sort((a,b)=>b[1]-a[1])[0][0]>=mode*0.97})();
        if(keep){const d0=ops.filter(o=>(o.op||o.n)===nmx&&o.k===m&&Math.round(o.tot/10)*10===mode).map(o=>o.d).sort()[0]||m+'-01';(byM[m]=byM[m]||[]).push({nmx,prev,mode,n:tot,d0})}}
      prev=mode}}
    for(const m in byM){const L=byM[m].sort((a,b)=>b.n-a.n),w=L.reduce((s,x)=>s+x.n,0),pct=L.reduce((s,x)=>s+(x.mode/x.prev-1)*x.n,0)/w;
      ev.push({d:L.map(x=>x.d0).sort()[0],k:m,dept:'nut',band:'svc',pct,auto:'nut',prelim:m===cur,label:`تغذية — أسعار الخدمات: ${L.length} خدمة زادت (متوسط +${pc(pct)})`,ev:L.slice(0,5).map(x=>`${x.nmx} ${fm(x.prev)}←${fm(x.mode)}`).join(' · ')})}}}catch(e){console.error(e)}
  ev.sort((a,b)=>a.d<b.d?1:-1);return PRC.det[key]=ev}
const prKey=x=>x.d+'|'+x.label;
function prEvents(){const ign=new Set((NUT.cfg||{}).priceIgnore||[]);const man=((NUT.cfg||{}).priceEvents||[]).map((e,i)=>Object.assign({i,man:true},e));const auto=prDetect().filter(a=>!ign.has(prKey(a))&&!man.some(m=>Math.abs(Date.parse(m.d)-Date.parse(a.d))<10*864e5&&(m.dept||'')===(a.dept||'')));
  return man.concat(auto).sort((a,b)=>a.d<b.d?1:-1)}
// ---------- الأثر ----------
function prWin(d1,d2,dept){const sv=GR.dept;GR.dept=dept;let a;try{a=grAgg(d1,d2)}finally{GR.dept=sv}
  const C0=cenBuild(),pts=Object.values(C0.pts),td=todayC();const inv={};D.inv.forEach(x=>{if(inB(x))(inv[x.pid]=inv[x.pid]||[]).push(x)});
  const np=pts.filter(p=>!p.early&&p.first>=d1&&p.first<=d2&&(!dept||p.entry===dept));
  const n14=np.filter(p=>prDays(p.first,td)>14),conv=n14.length?n14.filter(p=>(inv[p.pid]||[]).some(x=>x.total-x.disc>=1500&&Math.abs(Date.parse(x.d)-Date.parse(p.first))/864e5<=14)).length/n14.length:null;
  const n30=np.filter(p=>prDays(p.first,td)>31),ret=n30.length?n30.filter(p=>{const l=C0.byP[p.pid]||[];return l.some(x=>x[0]>p.first&&(!dept||x[1]===dept)&&(Date.parse(x[0])-Date.parse(p.first))/864e5<=30)}).length/n30.length:null;
  const days=prDays(d1,d2);return {days,revPD:a.net/days,sesPD:a.sessions/days,npPD:a.np/days,avgS:a.avgS,perPt:np.length?null:null,conv,ret,canc:a.canc,nConv:n14.length,nRet:n30.length}}
function prImpact(e,dept){const td=todayC(),N=PRC.N;const b1=e.d,b2=[prDay(e.d,N-1),prDay(td,-1)].sort()[0];if(b2<b1)return null;const L=prDays(b1,b2);const a1=prDay(e.d,-L),a2=prDay(e.d,-1);
  const f=D.months[0]+'-01';const B=prWin(b1,b2,dept),A=prWin(a1,a2,dept);const ly=x=>String(+x.slice(0,4)-1)+x.slice(4);
  const hasLY=ly(a1)>=f;const LB=hasLY?prWin(ly(b1),ly(b2),dept):null,LA=hasLY?prWin(ly(a1),ly(a2),dept):null;return {e,A,B,LA,LB,L,a1,a2,b1,b2}}
const prG=(b,a)=>a&&b!=null&&isFinite(b)&&a!==0?(b-a)/Math.abs(a):null;
const PRM=[['revPD','الإيراد في اليوم','n',1],['sesPD','الجلسات في اليوم','n',1],['npPD','مرضى جداد في اليوم','n',1],['avgS','متوسط سعر الجلسة','n',1],['conv','اشترى باقة خلال أسبوعين (من الجداد)','r',1],['ret','رجع خلال 30 يوم (من الجداد)','r',1],['canc','الإلغاء والغياب','r',-1]];
function prRows(I){return PRM.map(([k,t,ty,good])=>{const a=I.A[k],b=I.B[k],d=ty==='r'?(a!=null&&b!=null?b-a:null):prG(b,a);const dl=I.LA?(ty==='r'?(I.LA[k]!=null&&I.LB[k]!=null?I.LB[k]-I.LA[k]:null):prG(I.LB[k],I.LA[k])):null;const adj=d!=null&&dl!=null?d-dl:null;
  const f=v=>v==null?'—':ty==='r'?pc(v):fm(v,k==='npPD'?1:0);const c=v=>v==null?'—':`<span class="${(v>=0)===(good>0)?'up':'down'}">${v>=0?'▲':'▼'} ${ty==='r'?(Math.abs(v)*100).toFixed(1)+' نقطة':pc(Math.abs(v))}</span>`;
  return {k,t,ty,a,b,d,dl,adj,row:[t,f(a),f(b),c(d),I.LA?c(dl):'—',I.LA?c(adj):'—']}})}
function prVerdict(I,R){const g=k=>{const r=R.find(x=>x.k===k);return r.adj!=null?r.adj:r.d};const rev=g('revPD'),ses=g('sesPD'),np=g('npPD'),conv=g('conv'),ret=g('ret'),L=[];
  const pct=I.e.pct!=null?I.e.pct:R.find(x=>x.k==='avgS').d;
  L.push(`<b>${esc(I.e.label)}</b> — من ${I.b1}: قارنّا ${I.L} يوم بعدها بـ${I.L} يوم قبلها${I.LA?'، ومصحّح بنفس الأيام من السنة اللي فاتت (علشان الموسم)':' (مفيش سنة قبلها للتصحيح)'}.`);
  if(rev!=null)L.push(`الإيراد في اليوم ${rev>=0?'زاد':'قلّ'} <b class="${rev>=0?'up':'down'}">${pc(Math.abs(rev))}</b>، والجلسات ${ses>=0?'زادت':'قلّت'} <b class="${ses>=-0.03?'up':'down'}">${pc(Math.abs(ses||0))}</b>${np!=null?`، والمرضى الجداد ${np>=0?'زادوا':'قلّوا'} ${pc(Math.abs(np))}`:''}.`);
  if(pct&&ses!=null&&pct>0){const el=ses/pct;
    if(el>=0)L.push(`<b>حساسية المرضى للسعر:</b> الجلسات ما قلّتش بعد الزيادة (${ses>=0.005?'زادت '+pc(ses):'ثابتة'}) — يعني مفيش علامة إن المرضى بيسيبوا بسبب السعر.`);
    else L.push(`<b>حساسية المرضى للسعر:</b> كل 1% زيادة → الجلسات قلّت ${Math.abs(el).toFixed(2)}% ${-el<0.5?'(حساسية قليلة — الزيادة مستحملة)':-el<1?'(حساسية متوسطة — الإيراد لسه كسبان بس الحجم بيقل)':'(حساسية عالية — المرضى بيسيبوا أكتر من فرق السعر)'}.`)}
  if(conv!=null&&conv<-0.05)L.push(`<b class="down">الشراء من الكشف للباقة قلّ ${(Math.abs(conv)*100).toFixed(1)} نقطة</b> — المرضى الجداد بيترددوا في السعر الجديد.`);
  if(ret!=null&&ret<-0.05)L.push(`<b class="down">رجوع المرضى الجداد قلّ ${(Math.abs(ret)*100).toFixed(1)} نقطة.</b>`);
  let v='';if(rev!=null&&ses!=null){if(rev>0.02&&ses>-0.05&&!(conv<-0.05)&&!(ret<-0.05))v='✅ الزيادة ناجحة لحد دلوقتي: الإيراد زاد من غير ما المرضى يقلّوا بشكل واضح.';else if(rev>0.02)v='⚠️ الإيراد زاد بس فيه علامات تراجع في الحجم أو الرجوع — تابعها كمان كام أسبوع قبل أي زيادة تانية.';else v='🔴 الزيادة ما جابتش إيراد زيادة — المرضى اللي راحوا عوّضوا فرق السعر أو أكتر.'}
  const sesN=Math.round((I.B.sesPD||0)*I.L);
  if(I.L<28||sesN<150){v='⏳ لسه بدري على الحكم'+(v?' — المؤشرات لحد دلوقتي: '+v.replace(/^\S+\s/,''):'');L.push(`<span class="sub">لسه ${I.L} يوم بس بعد الزيادة (${fm(sesN)} جلسة) — الأرقام الصغيرة بتتحرك كتير بالصدفة. الحكم بيبقى أوضح بعد 4–8 أسابيع.</span>`)}
  return {L,v}}
// ---------- العرض ----------
function prWeeks(e,dept,mk){const sv=GR.dept;GR.dept=dept;try{const out=[],td=prDay(todayC(),-1);for(let w=-12;w<12;w++){const d1=prDay(e.d,w*7);if(d1>td)break;const d2=[prDay(d1,6),td].sort()[0],n=prDays(d1,d2);
  out.push({w,after:w>=0,lbl:(w===0?'أسبوع الزيادة ':'')+d1.slice(8,10)+'/'+d1.slice(5,7)+(n<7?` (${n} أيام)`:''),v:mk(grAgg(d1,d2))/n})}return out}finally{GR.dept=sv}}
function vPrice(){if(!NUT.cfg)NUT.cfg=nutMerge(null);const E=prEvents(),dept=PRC.dept;
  if(PRC.sel==null||!E[PRC.sel])PRC.sel=0;const e=E[PRC.sel];
  const evRows=E.map((x,i)=>[`<input type="radio" name="prE" value="${i}"${i===PRC.sel?' checked':''}>`,x.d,esc(x.label)+(x.ev?`<br><span class="sub">${esc(x.ev)}</span>`:'')+(x.prelim?' <span class="sub">(مبدئي — لسه شهر واحد بعدها)</span>':''),x.pct!=null?pc(x.pct):'—',x.dept?`<b>${DEPN[x.dept]}</b>`:'الكل',x.man?'مسجلة':'<span class="sub">اتكشفت لوحدها</span>',x.man?`<button data-prdel="${x.i}">حذف</button>`:`<button data-prok="${i}" title="تتحفظ دايماً حتى لو الاكتشاف اتغير">اعتمدها</button> <button data-prign="${i}" title="مش زيادة سعر (عرض/خصم/غلط) — اخفيها">✕ مش زيادة</button>`]);
  let h=`<div class="card"><h3>💲 الأسعار وأثر الزيادات<small>${BRN[S.b]}</small></h3>
   <div class="note" style="line-height:1.9">أي زيادة سعر بتتكشف لوحدها من <b>الترند</b>: لكل قسم ولكل نوع فاتورة (كشف/جلسة — باقة) بحسب «الفاتورة العادية» كل شهر، ولو نطّت مرة واحدة وفضلت فوق يبقى ده زيادة، ونسبتها = قد إيه المستوى اتنقل. وفي التغذية كمان بشوف سعر كل خدمة في القايمة. وتقدر تسجل أي زيادة بنفسك (تاريخها ونسبتها). لكل زيادة: الأرقام قبلها وبعدها بنفس عدد الأيام، ومصحّحة بنفس الأيام من السنة اللي فاتت — يعني لو الشهر ده كل سنة بيقل، ده مش هيتحسب على الزيادة.</div>
   <div class="bar" style="margin-top:8px"><label class="sub">القسم <select id="prDep"><option value="">قسم الزيادة نفسه</option><option value="all"${dept==='all'?' selected':''}>المركز كله</option>${DEPTS.map(([d,t])=>`<option value="${d}"${dept===d?' selected':''}>${t}</option>`).join('')}</select></label>
   <label class="sub">أيام قبل/بعد <select id="prN">${[30,45,60,90,120].map(n=>`<option${n===PRC.N?' selected':''}>${n}</option>`).join('')}</select></label></div>
   <div class="note" style="margin-top:8px">مش لازم تعتمد حاجة: أي زيادة اتكشفت لوحدها بتتحلل وبتتراقب وبتطلع في ترشيحات الملخص زي ما هي. «اعتمدها» = تتحفظ دايماً وبنسبتها حتى لو الاكتشاف اتغير بعدين. «✕ مش زيادة» = لو دي عرض أو خصم أو غلط، تختفي من هنا ومن الملخص.</div>
   ${E.length?tableHTML(['','التاريخ','الزيادة',{t:'النسبة',n:1},'القسم','',''],evRows,{h:260}):'<div class="note">مفيش زيادات اتكشفت أو اتسجلت لسه.</div>'}
   <div class="bar" style="margin-top:8px"><span class="sub">سجّل زيادة:</span><input type="date" id="prD"><input id="prL" placeholder="إيه اللي زاد (مثلاً: الكشف 400←500)" style="min-width:220px"><input id="prP" type="number" step="1" placeholder="النسبة %" style="width:90px">
    <select id="prDp"><option value="">الكل</option>${DEPTS.map(([d,t])=>`<option value="${d}">${t}</option>`).join('')}</select><button class="pri" id="prAdd">➕ ضيف واحفظ</button></div></div>
  <div class="card" style="margin-top:12px"><h3>مستوى الأسعار كل شهر<small>الفاتورة العادية (الوسيط) لكل قسم ونوع — النطّة اللي بتفضل = زيادة سعر</small></h3><div class="ch"><canvas id="pr0"></canvas></div></div>`;
  if(!e)return h;const deptX=dept==='all'?'':(dept||e.dept||'');const I=prImpact(e,deptX);if(!I)return h+`<div class="card" style="margin-top:12px">الزيادة دي لسه ما بدأتش.</div>`;
  const R=prRows(I),V=prVerdict(I,R);
  // مراقبة: آخر زيادة خلال 120 يوم
  const live=E.find(x=>prDays(x.d,todayC())<=120&&x.d<=todayC());
  h+=`<div class="card" style="margin-top:12px;border-inline-start:4px solid ${/^✅/.test(V.v)?'var(--good)':/^⚠️|^⏳/.test(V.v)?'var(--warn)':'var(--bad)'}"><h3>📊 أثر الزيادة${live&&live===e?' <span class="sub">— بتتراقب دلوقتي</span>':''}<small>${I.a1} → ${I.a2} مقابل ${I.b1} → ${I.b2}${deptX?' · '+DEPN[deptX]:' · المركز كله'}</small></h3>
   ${(e.dept||'')!==deptX?`<div class="note" style="margin-bottom:8px;border-inline-start:4px solid var(--warn)">⚠️ الزيادة دي في <b>${e.dept?DEPN[e.dept]:'المركز كله'}</b>، والأرقام هنا محسوبة على <b>${deptX?DEPN[deptX]:'المركز كله'}</b> (من قايمة «القسم» فوق) — يعني ده أثرها على قسم تاني. علشان أثرها على نفسها اختار «قسم الزيادة نفسه».</div>`:''}
   ${prHead(e,I,R,deptX)}
   ${V.v?`<div style="font-weight:700;margin:8px 0 6px">${V.v}</div>`:''}<details><summary class="sub" style="cursor:pointer">تفاصيل الحساب</summary><ul class="ins">${V.L.map(x=>`<li>${x}</li>`).join('')}</ul></details>
   ${tableHTML(['',{t:'قبل',n:1},{t:'بعد',n:1},{t:'التغيير',n:1},{t:'نفس الأيام السنة اللي فاتت',n:1},{t:'التغيير المصحّح',n:1}],R.map(r=>r.row),{h:340})}
   <div class="note">«التغيير المصحّح» = التغيير بعد الزيادة − التغيير اللي حصل في نفس الأيام السنة اللي فاتت (من غير زيادة). ده الأقرب لأثر السعر لوحده. الشراء والرجوع بيتحسبوا للمرضى اللي عدّى عليهم 14 / 30 يوم بس.</div></div>
  ${prCross(e)}
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>الإيراد في اليوم — كل أسبوع${deptX?' — '+DEPN[deptX]:''}<small>رمادي = قبل الزيادة · ملوّن = بعدها</small></h3><div class="ch"><canvas id="pr1"></canvas></div></div>
   <div class="card"><h3>الجلسات في اليوم — كل أسبوع<small>رمادي = قبل الزيادة · ملوّن = بعدها</small></h3><div class="ch"><canvas id="pr2"></canvas></div></div></div>`;
  return h}
function prHead(e,I,R,deptX){const g=k=>R.find(x=>x.k===k);const ln=(k,unit,dec)=>{const r=g(k);if(!r||r.a==null||r.b==null)return '';const f=v=>r.ty==='r'?pc(v):fm(v,dec||0);
    const S_=v=>r.ty==='r'?(v>=0?'+':'−')+(Math.abs(v)*100).toFixed(1)+' نقطة':(v>=0?'+':'−')+pc(Math.abs(v));const cls=v=>((v>=0)!==(k==='canc'))?'up':'down';
    const eff=r.adj!=null?`<b class="${cls(r.adj)}">أثر الزيادة: ${S_(r.adj)}</b>${Math.abs(r.dl)>=0.02?` <span class="sub">(نفس الوقت السنة اللي فاتت اتغير ${S_(r.dl)} لوحده)</span>`:''}`:`<b class="${cls(r.d)}">${S_(r.d)}</b> <span class="sub">(مفيش سنة قبلها نصحّح بيها)</span>`;
    return `<li><b>${r.t}</b>: ${f(r.a)} ← ${f(r.b)} (${S_(r.d)}) · ${eff}</li>`};
  const dt=new Date(e.d+'T12:00:00Z').toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'});
  return `<div style="line-height:2">
    <div>📌 <b>الزيادة:</b> ${esc(e.label)}${e.pct!=null?` <b>(+${pc(e.pct)})</b>`:''}</div>${e.ev?`<div class="sub">${esc(e.ev)}</div>`:''}
    <div>📅 <b>بدأت:</b> ${dt} — عدّى عليها <b>${I.L} يوم</b></div>
    <div>📊 <b>أثرها على ${deptX?DEPN[deptX]:'المركز كله'}</b> (${I.L} يوم بعدها مقابل ${I.L} يوم قبلها):</div>
    <ul class="ins" style="margin-top:2px">${ln('revPD')}${ln('sesPD',0,1)}${ln('npPD',0,1)}${ln('avgS')}${ln('conv')}${ln('ret')}${ln('canc')}</ul></div>`}
function prCross(e){const rows=[['',...DEPTS.map(d=>d)],].length&&DEPTS.concat([['','المركز كله']]).map(([d,t])=>{const I=prImpact(e,d);if(!I)return null;const R=prRows(I);const g=k=>{const r=R.find(x=>x.k===k);return r.adj!=null?r.adj:r.d};
    const small=(I.A.sesPD||0)*I.L<30||(I.B.sesPD||0)*I.L<30;const c=v=>v==null?'—':small?`<span class="sub">${v>=0?'▲':'▼'} ${pc(Math.abs(v))}</span>`:`<span class="${v>=0?'up':'down'}">${v>=0?'▲':'▼'} ${pc(Math.abs(v))}</span>`;return [(d===(e.dept||'')?'<b>':'')+t+(d===(e.dept||'')?' (قسم الزيادة)</b>':'')+(small?' <span class="sub">(عدد قليل — مش موثوق)</span>':''),c(g('revPD')),c(g('sesPD')),c(g('npPD')),c(g('avgS'))]}).filter(Boolean);
  return `<div class="card" style="margin-top:12px"><h3>الأثر على كل قسم<small>التغيير المصحّح بعد الزيادة — علشان تشوف لو زيادة قسم أثّرت على قسم تاني</small></h3>${tableHTML(['القسم',{t:'الإيراد/يوم',n:1},{t:'الجلسات/يوم',n:1},{t:'مرضى جداد/يوم',n:1},{t:'متوسط الجلسة',n:1}],rows,{h:240})}</div>`}
function cPrice(){const E=prEvents();document.querySelectorAll('input[name="prE"]').forEach(r=>r.onchange=()=>{PRC.sel=+r.value;PRC.dept='';render()});
  const dp=$('#prDep');if(dp)dp.onchange=()=>{PRC.dept=dp.value;render()};
  const n=$('#prN');if(n)n.onchange=()=>{PRC.N=+n.value;try{localStorage.setItem('fin_pr_n',PRC.N)}catch(e){}render()};
  const save=async(btn)=>{await nutCfgSave(btn);PRC.det=null};
  const add=$('#prAdd');if(add)add.onclick=async()=>{const d=$('#prD').value,l=$('#prL').value.trim(),p=$('#prP').value;if(!d){alert('اختار التاريخ');return}
    NUT.cfg.priceEvents=(NUT.cfg.priceEvents||[]).concat([{d,label:l||'زيادة سعر',pct:p===''?null:(+p)/100,dept:$('#prDp').value}]);await save(add)};
  document.querySelectorAll('[data-prdel]').forEach(b=>b.onclick=async()=>{if(!confirm('أحذف الزيادة دي؟'))return;NUT.cfg.priceEvents=(NUT.cfg.priceEvents||[]).filter((_,i)=>i!==+b.dataset.prdel);PRC.sel=0;await save(b)});
  document.querySelectorAll('[data-prign]').forEach(b=>b.onclick=async()=>{const x=E[+b.dataset.prign];NUT.cfg.priceIgnore=(NUT.cfg.priceIgnore||[]).concat([prKey(x)]);PRC.sel=0;await save(b)});
  document.querySelectorAll('[data-prok]').forEach(b=>b.onclick=async()=>{const x=E[+b.dataset.prok];NUT.cfg.priceEvents=(NUT.cfg.priceEvents||[]).concat([{d:x.d,label:x.label,pct:x.pct,dept:x.dept||''}]);await save(b)});
  {const SR=Object.values(PRC.series||{}).filter(x=>x.M.some(m=>m.m!=null)).slice(0,6);const ks=D.months.filter(k=>k<=curK()),c0=SER();
    if(SR.length)chart('pr0',{type:'line',data:{labels:ks.map(mls),datasets:SR.map((x,i)=>Object.assign(line(DEPN[x.dp]+' — '+x.bn,ks.map(k=>{const m=x.M.find(z=>z.k===k);return m&&m.m!=null?Math.round(m.m):null}),c0[i%c0.length]),{stepped:'middle',spanGaps:true}))},
      options:{plugins:{tooltip:{callbacks:{label:t=>' '+t.dataset.label+': '+fm(t.parsed.y)}}},scales:{y:{ticks:{callback:v=>fm(v)}}}}})}
  const e=E[PRC.sel||0];if(!e)return;const dept=PRC.dept==='all'?'':(PRC.dept||e.dept||''),c=SER();
  const W1=prWeeks(e,dept,a=>a.net),W2=prWeeks(e,dept,a=>a.sessions);const col=(W,c1)=>W.map(x=>x.after?c1:css('--t3'));
  chart('pr1',{data:{labels:W1.map(x=>x.lbl),datasets:[Object.assign(bar('الإيراد في اليوم',W1.map(x=>Math.round(x.v)),c[0]),{backgroundColor:col(W1,c[0])})]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:t=>' '+fm(t.parsed.y)+' في اليوم'+(W1[t.dataIndex].after?' — بعد الزيادة':' — قبل الزيادة')}}},scales:{x:{ticks:{maxRotation:60,minRotation:45}}}}});
  chart('pr2',{data:{labels:W2.map(x=>x.lbl),datasets:[Object.assign(bar('الجلسات في اليوم',W2.map(x=>+x.v.toFixed(1)),c[2]),{backgroundColor:col(W2,c[2])})]},options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:t=>' '+t.parsed.y+' جلسة في اليوم'+(W2[t.dataIndex].after?' — بعد الزيادة':' — قبل الزيادة')}}},scales:{x:{ticks:{maxRotation:60,minRotation:45}}}}})}
VIEWS.price=[vPrice,cPrice];
