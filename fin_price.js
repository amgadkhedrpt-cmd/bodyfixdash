// BODYFIX — «💲 الأسعار»: بيكتشف أي زيادة سعر لوحده (من الفواتير وأسعار خدمات التغذية) + زيادات بتسجلها إنت،
// وبيقيس أثر كل زيادة: قبل/بعد بنفس عدد الأيام، ومصحّح بنفس الفترة من السنة اللي فاتت (الموسمية).
'use strict';
const PRC={};try{PRC.N=+(localStorage.getItem('fin_pr_n')||60)||60;PRC.dept=localStorage.getItem('fin_pr_dept')||''}catch(e){PRC.N=60;PRC.dept=''}
const prDay=(d,n)=>new Date(Date.parse(d+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const prDays=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5)+1;
// ---------- اكتشاف تغيّر الأسعار ----------
function prDetect(){const key=S.b;PRC.det=PRC.det||{};if(PRC.det[key])return PRC.det[key];const ev=[];
  // 1) الفواتير: أسعار متكررة (الإجمالي قبل الخصم) لكل قسم — سعر جديد بيظهر وسعر قريب منه بيختفي
  // قسم الفاتورة = نوع موعد المريض الأقرب ليها (−7..+30 يوم)، زي توزيع الدفعات في تحليلات المركز
  const byP=cenBuild().byP,dOf=x=>{const l=byP[x.pid];if(l){const t=Date.parse(x.d);let best=null,bd=1e9;for(const a of l){const dd=(t-Date.parse(a[0]))/864e5;if(dd>=-7&&dd<=30&&Math.abs(dd)<bd){bd=Math.abs(dd);best=a}}if(best)return best[1]}return ALAA.test(x.doc||'')?'nut':'phy'};
  const I=D.inv.filter(x=>inB(x)&&x.total>0).map(x=>({x,dp:dOf(x),v:Math.round(x.total/10)*10})),cnt={},byM={};
  I.forEach(({x,dp,v})=>{const key=dp+'|'+v;cnt[key]=(cnt[key]||0)+1;const z=byM[key]=byM[key]||{};z[x.k]=(z[x.k]||0)+1});
  const freq=Object.keys(cnt).filter(k=>cnt[k]>=15&&+k.split('|')[1]>=100);const ks=D.months.filter(k=>k<=curK());
  const life={};freq.forEach(key=>{const ms=ks.filter(k=>(byM[key][k]||0)>=4);if(ms.length)life[key]={first:ms[0],last:ms[ms.length-1],n:cnt[key],dp:key.split('|')[0],v:+key.split('|')[1]}});
  const first=ks[0];
  Object.values(life).forEach(L=>{if(L.first<=shiftK(first,1))return;const nv=L.v;
    const old=Object.values(life).filter(O=>O.dp===L.dp&&nv>=O.v*1.03&&nv<=O.v*1.6&&O.first<L.first&&O.last>=shiftK(L.first,-1)&&O.last<=shiftK(L.first,2)).sort((a,b)=>b.n-a.n)[0];
    if(!old)return;const d0=I.filter(o=>o.dp===L.dp&&o.v===nv&&o.x.k===L.first).map(o=>o.x.d).sort()[0]||L.first+'-01';
    ev.push({d:d0,label:`${DEPN[L.dp]}: فاتورة ${fm(old.v)} ← ${fm(nv)}`,pct:(nv-old.v)/old.v,auto:'inv',dept:L.dp,n:L.n,nOld:old.n})});
  // 2) خدمات التغذية: سعر القايمة لكل خدمة كل شهر
  try{if(typeof nutBuild==='function'&&(S.b==='haram'||S.b==='both')){const {ops}=nutBuild();const g={};ops.forEach(o=>{if(!(o.tot>0))return;const nmx=o.op||o.n;const z=(g[nmx]=g[nmx]||{});const zz=(z[o.k]=z[o.k]||{});const v=Math.round(o.tot/10)*10;zz[v]=(zz[v]||0)+1});
    for(const nmx in g){const ms=Object.keys(g[nmx]).sort();let prev=null,pm=null;for(const m of ms){const c=g[nmx][m],tot=Object.values(c).reduce((a,b)=>a+b,0);if(tot<3)continue;const mode=+Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0];
      if(prev&&mode>=prev*1.03&&mode<=prev*2){const nx=ms[ms.indexOf(m)+1];const keep=!nx||(()=>{const c2=g[nmx][nx];return +Object.entries(c2).sort((a,b)=>b[1]-a[1])[0][0]>=mode*0.97})();
        if(keep){const d0=ops.filter(o=>(o.op||o.n)===nmx&&o.k===m&&Math.round(o.tot/10)*10===mode).map(o=>o.d).sort()[0]||m+'-01';ev.push({d:d0,label:`${nmx}: ${fm(prev)} ← ${fm(mode)}`,pct:(mode-prev)/prev,auto:'nut',dept:'nut',n:tot})}}
      prev=mode;pm=m}}}}catch(e){console.error(e)}
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
function prWeeks(e,dept,mk){const sv=GR.dept;GR.dept=dept;try{const out=[];for(let w=-12;w<12;w++){const d1=prDay(e.d,w*7),d2=prDay(d1,6);if(d1>todayC())break;out.push({w,lbl:(w===0?'◀ الزيادة ':'')+d1.slice(8,10)+'/'+d1.slice(5,7),v:mk(grAgg(d1,[d2,prDay(todayC(),-1)].sort()[0]))})}return out}finally{GR.dept=sv}}
function vPrice(){if(!NUT.cfg)NUT.cfg=nutMerge(null);const E=prEvents(),dept=PRC.dept;
  if(PRC.sel==null||!E[PRC.sel])PRC.sel=0;const e=E[PRC.sel];
  const evRows=E.map((x,i)=>[`<input type="radio" name="prE" value="${i}"${i===PRC.sel?' checked':''}>`,x.d,esc(x.label),x.pct!=null?pc(x.pct):'—',x.dept?`<b>${DEPN[x.dept]}</b>`:'الكل',x.man?'مسجلة':'<span class="sub">اتكشفت لوحدها</span>',x.man?`<button data-prdel="${x.i}">حذف</button>`:`<button data-prok="${i}" title="تتحفظ دايماً حتى لو الاكتشاف اتغير">اعتمدها</button> <button data-prign="${i}" title="مش زيادة سعر (عرض/خصم/غلط) — اخفيها">✕ مش زيادة</button>`]);
  let h=`<div class="card"><h3>💲 الأسعار وأثر الزيادات<small>${BRN[S.b]}</small></h3>
   <div class="note" style="line-height:1.9">أي زيادة سعر بتتكشف لوحدها: <b>فواتير</b> بسعر جديد متكرر حلّ مكان سعر أقل، أو <b>خدمة تغذية</b> سعرها في القايمة اتغير. وتقدر تسجل أي زيادة بنفسك (تاريخها ونسبتها). لكل زيادة: الأرقام قبلها وبعدها بنفس عدد الأيام، ومصحّحة بنفس الأيام من السنة اللي فاتت — يعني لو الشهر ده كل سنة بيقل، ده مش هيتحسب على الزيادة.</div>
   <div class="bar" style="margin-top:8px"><label class="sub">القسم <select id="prDep"><option value="">قسم الزيادة نفسه</option><option value="all"${dept==='all'?' selected':''}>المركز كله</option>${DEPTS.map(([d,t])=>`<option value="${d}"${dept===d?' selected':''}>${t}</option>`).join('')}</select></label>
   <label class="sub">أيام قبل/بعد <select id="prN">${[30,45,60,90,120].map(n=>`<option${n===PRC.N?' selected':''}>${n}</option>`).join('')}</select></label></div>
   <div class="note" style="margin-top:8px">مش لازم تعتمد حاجة: أي زيادة اتكشفت لوحدها بتتحلل وبتتراقب وبتطلع في ترشيحات الملخص زي ما هي. «اعتمدها» = تتحفظ دايماً وبنسبتها حتى لو الاكتشاف اتغير بعدين. «✕ مش زيادة» = لو دي عرض أو خصم أو غلط، تختفي من هنا ومن الملخص.</div>
   ${E.length?tableHTML(['','التاريخ','الزيادة',{t:'النسبة',n:1},'القسم','',''],evRows,{h:260}):'<div class="note">مفيش زيادات اتكشفت أو اتسجلت لسه.</div>'}
   <div class="bar" style="margin-top:8px"><span class="sub">سجّل زيادة:</span><input type="date" id="prD"><input id="prL" placeholder="إيه اللي زاد (مثلاً: الكشف 400←500)" style="min-width:220px"><input id="prP" type="number" step="1" placeholder="النسبة %" style="width:90px">
    <select id="prDp"><option value="">الكل</option>${DEPTS.map(([d,t])=>`<option value="${d}">${t}</option>`).join('')}</select><button class="pri" id="prAdd">➕ ضيف واحفظ</button></div></div>`;
  if(!e)return h;const deptX=dept==='all'?'':(dept||e.dept||'');const I=prImpact(e,deptX);if(!I)return h+`<div class="card" style="margin-top:12px">الزيادة دي لسه ما بدأتش.</div>`;
  const R=prRows(I),V=prVerdict(I,R);
  // مراقبة: آخر زيادة خلال 120 يوم
  const live=E.find(x=>prDays(x.d,todayC())<=120&&x.d<=todayC());
  h+=`<div class="card" style="margin-top:12px;border-inline-start:4px solid ${/^✅/.test(V.v)?'var(--good)':/^⚠️|^⏳/.test(V.v)?'var(--warn)':'var(--bad)'}"><h3>📊 أثر الزيادة${live&&live===e?' <span class="sub">— بتتراقب دلوقتي</span>':''}<small>${I.a1} → ${I.a2} مقابل ${I.b1} → ${I.b2}${deptX?' · '+DEPN[deptX]:' · المركز كله'}</small></h3>
   ${V.v?`<div style="font-weight:700;margin-bottom:6px">${V.v}</div>`:''}<ul class="ins">${V.L.map(x=>`<li>${x}</li>`).join('')}</ul>
   ${tableHTML(['',{t:'قبل',n:1},{t:'بعد',n:1},{t:'التغيير',n:1},{t:'نفس الأيام السنة اللي فاتت',n:1},{t:'التغيير المصحّح',n:1}],R.map(r=>r.row),{h:340})}
   <div class="note">«التغيير المصحّح» = التغيير بعد الزيادة − التغيير اللي حصل في نفس الأيام السنة اللي فاتت (من غير زيادة). ده الأقرب لأثر السعر لوحده. الشراء والرجوع بيتحسبوا للمرضى اللي عدّى عليهم 14 / 30 يوم بس.</div></div>
  ${prCross(e)}
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>الإيراد كل أسبوع حوالين الزيادة${deptX?' — '+DEPN[deptX]:''}</h3><div class="ch"><canvas id="pr1"></canvas></div></div>
   <div class="card"><h3>الجلسات كل أسبوع حوالين الزيادة</h3><div class="ch"><canvas id="pr2"></canvas></div></div></div>`;
  return h}
function prCross(e){const rows=[['',...DEPTS.map(d=>d)],].length&&DEPTS.concat([['','المركز كله']]).map(([d,t])=>{const I=prImpact(e,d);if(!I)return null;const R=prRows(I);const g=k=>{const r=R.find(x=>x.k===k);return r.adj!=null?r.adj:r.d};
    const c=v=>v==null?'—':`<span class="${v>=0?'up':'down'}">${v>=0?'▲':'▼'} ${pc(Math.abs(v))}</span>`;return [(d===(e.dept||'')?'<b>':'')+t+(d===(e.dept||'')?' (قسم الزيادة)</b>':''),c(g('revPD')),c(g('sesPD')),c(g('npPD')),c(g('avgS'))]}).filter(Boolean);
  return `<div class="card" style="margin-top:12px"><h3>الأثر على كل قسم<small>التغيير المصحّح بعد الزيادة — علشان تشوف لو زيادة قسم أثّرت على قسم تاني</small></h3>${tableHTML(['القسم',{t:'الإيراد/يوم',n:1},{t:'الجلسات/يوم',n:1},{t:'مرضى جداد/يوم',n:1},{t:'متوسط الجلسة',n:1}],rows,{h:240})}</div>`}
function cPrice(){const E=prEvents();document.querySelectorAll('input[name="prE"]').forEach(r=>r.onchange=()=>{PRC.sel=+r.value;render()});
  const dp=$('#prDep');if(dp)dp.onchange=()=>{PRC.dept=dp.value;try{localStorage.setItem('fin_pr_dept',PRC.dept)}catch(e){}render()};
  const n=$('#prN');if(n)n.onchange=()=>{PRC.N=+n.value;try{localStorage.setItem('fin_pr_n',PRC.N)}catch(e){}render()};
  const save=async(btn)=>{await nutCfgSave(btn);PRC.det=null};
  const add=$('#prAdd');if(add)add.onclick=async()=>{const d=$('#prD').value,l=$('#prL').value.trim(),p=$('#prP').value;if(!d){alert('اختار التاريخ');return}
    NUT.cfg.priceEvents=(NUT.cfg.priceEvents||[]).concat([{d,label:l||'زيادة سعر',pct:p===''?null:(+p)/100,dept:$('#prDp').value}]);await save(add)};
  document.querySelectorAll('[data-prdel]').forEach(b=>b.onclick=async()=>{if(!confirm('أحذف الزيادة دي؟'))return;NUT.cfg.priceEvents=(NUT.cfg.priceEvents||[]).filter((_,i)=>i!==+b.dataset.prdel);PRC.sel=0;await save(b)});
  document.querySelectorAll('[data-prign]').forEach(b=>b.onclick=async()=>{const x=E[+b.dataset.prign];NUT.cfg.priceIgnore=(NUT.cfg.priceIgnore||[]).concat([prKey(x)]);PRC.sel=0;await save(b)});
  document.querySelectorAll('[data-prok]').forEach(b=>b.onclick=async()=>{const x=E[+b.dataset.prok];NUT.cfg.priceEvents=(NUT.cfg.priceEvents||[]).concat([{d:x.d,label:x.label,pct:x.pct,dept:x.dept||''}]);await save(b)});
  const e=E[PRC.sel||0];if(!e)return;const dept=PRC.dept==='all'?'':(PRC.dept||e.dept||''),c=SER();
  const W1=prWeeks(e,dept,a=>Math.round(a.net)),W2=prWeeks(e,dept,a=>a.sessions);
  chart('pr1',{data:{labels:W1.map(x=>x.lbl),datasets:[bar('الإيراد',W1.map(x=>x.v),c[0])]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{maxRotation:60,minRotation:45}}}}});
  chart('pr2',{data:{labels:W2.map(x=>x.lbl),datasets:[bar('الجلسات',W2.map(x=>x.v),c[2])]},options:{plugins:{legend:{display:false}},scales:{x:{ticks:{maxRotation:60,minRotation:45}}}}})}
VIEWS.price=[vPrice,cPrice];
