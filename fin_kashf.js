// BODYFIX — «🩺 الكشوفات: اتحجزله قبل ما يمشي؟»
// رقم ١: من الكشوفات المكتملة، كام واحد خرج ومعاه موعد جاي متسجل يوم الكشف (أو قبله).
// رقم ٢: من اللي خرجوا من غير حجز، كام واحد اتحجزله في خلال ٣ أيام (مكالمة المتابعة جابت نتيجة).
'use strict';
try{CEN.kd=localStorage.getItem('fin_kd')||'phy'}catch(e){CEN.kd='phy'}
const KD={phy:'كشف علاج طبيعي',nut:'كشف تغذية',all:'كل الكشوفات'};
const kDay=(d,n)=>new Date(Date.parse(d)+n*864e5).toISOString().slice(0,10);
const kWeek=d=>{const t=new Date(d+'T00:00:00Z'),w=(t.getUTCDay()+1)%7;return kDay(d,-w)};   // الأسبوع بيبدأ السبت
const kShift=h=>h<15?'صباحي (قبل 3)':'مسائي (3 وبعدها)';
function kashfData(){const dep=CEN.kd,td=todayC();
  const A=D.apt.filter(a=>inB(a)&&a.pid);const byP={};A.forEach(a=>(byP[a.pid]=byP[a.pid]||[]).push(a));
  const sameD=t=>dep==='all'||deptOfType(t)===(dep==='nut'?'nut':'phy');
  const out=[];
  for(const pid in byP){const l=byP[pid];
    l.filter(a=>a.st==='Completed'&&/كشف/.test(tName(a.type)+' '+a.type)&&sameD(a.type)).forEach(k=>{
      const fut=l.filter(a=>a!==k&&(a.d>k.d||(a.d===k.d&&a.h>k.h))&&sameD(a.type)&&!/كشف/.test(tName(a.type)));
      const same=fut.filter(a=>a.cr&&a.cr<=k.d).sort((a,b)=>a.cr<b.cr?-1:1);
      const bk=same.length>0;
      const later=bk?[]:fut.filter(a=>a.cr&&a.cr>k.d).sort((a,b)=>a.cr<b.cr?-1:a.cr>b.cr?1:0);
      const r=later[0];const rd=r?Math.round((Date.parse(r.cr)-Date.parse(k.d))/864e5):null;
      const age=Math.round((Date.parse(td)-Date.parse(k.d))/864e5);
      out.push({pid,pn:k.pn,d:k.d,k:k.k,w:kWeek(k.d),h:k.h,doc:k.doc===PAST_DOC?'دكاترة سابقين':k.doc,shift:kShift(k.h),
        bk,byS:bk?(same.find(a=>a.cr===k.d)||same[0]).by||'—':null,
        r3:!bk&&rd!=null&&rd<=3,byR:!bk&&rd!=null&&rd<=3?r.by||'—':null,r7:!bk&&rd!=null&&rd<=7,
        done3:age>=4,age,next:fut.length?fut.slice().sort((a,b)=>a.d<b.d?-1:1)[0].d:null})})}
  return out.sort((a,b)=>a.d<b.d?1:-1)}
const kRate=(a,f)=>a.length?a.filter(f).length/a.length:null;
function kGroup(X,key){const g={};X.forEach(x=>{const k=key(x);const z=g[k]=g[k]||{n:0,bk:0,nb:0,r3:0,nb3:0};z.n++;if(x.bk)z.bk++;else{z.nb++;if(x.done3){z.nb3++;if(x.r3)z.r3++}}});return g}
function vKashf(){const all=kashfData();if(all.length<10)return `<div class="card" style="margin-top:12px">🩺 مفيش كشوفات كفاية (${all.length}).</div>`;
  const X=all.filter(inR);const nb=X.filter(x=>!x.bk),nb3=nb.filter(x=>x.done3);
  const r1=kRate(X,x=>x.bk),r2=kRate(nb3,x=>x.r3),r7=kRate(nb.filter(x=>x.age>=8),x=>x.r7);
  // آخر 12 أسبوع (بغض النظر عن فترة الفلتر)
  const wk=[...new Set(all.map(x=>x.w))].sort().slice(-12).reverse();const W=kGroup(all.filter(x=>wk.includes(x.w)),x=>x.w);
  const wRows=wk.map(w=>{const z=W[w];return [w.slice(8,10)+'/'+w.slice(5,7),z.n,z.bk,pc(z.bk/z.n),z.nb,z.nb3?pc(z.r3/z.nb3):'لسه',z.nb-z.r3]});
  // حسب الدكتور اللي عمل الكشف
  const G=kGroup(X,x=>x.doc);const dRows=Object.entries(G).filter(([k,z])=>z.n>=5).sort((a,b)=>a[1].bk/a[1].n-b[1].bk/b[1].n).map(([k,z])=>[esc(k),z.n,pc(z.bk/z.n),z.nb,z.nb3?pc(z.r3/z.nb3):'—']);
  // الشيفت
  const Sh=kGroup(X,x=>x.shift);const sRows=Object.entries(Sh).map(([k,z])=>[k,z.n,pc(z.bk/z.n),z.nb,z.nb3?pc(z.r3/z.nb3):'—']);
  // مين حجز
  const cnt=(arr,f)=>{const o={};arr.forEach(x=>{const k=f(x);if(k)o[k]=(o[k]||0)+1});return o};
  const cS=cnt(X.filter(x=>x.bk),x=>x.byS),cR=cnt(nb3.filter(x=>x.r3),x=>x.byR);
  const who=[...new Set([...Object.keys(cS),...Object.keys(cR)])].map(k=>[esc(k),cS[k]||0,cR[k]||0]).sort((a,b)=>(b[1]+b[2])-(a[1]+a[2])).slice(0,12);
  // قراية
  const ks=[...new Set(all.map(x=>x.k))].sort();const mR=ks.map(k=>{const a=all.filter(x=>x.k===k);return {k,n:a.length,r:kRate(a,x=>x.bk)}}).filter(m=>m.n>=8);
  const l3=mR.slice(-3),p3=mR.slice(-6,-3);const av=a=>a.length?a.reduce((s,m)=>s+m.r*m.n,0)/a.reduce((s,m)=>s+m.n,0):null;
  const L=[];
  L.push(`<b>رقم ١ — اتحجزله قبل ما يمشي:</b> ${pc(r1)} من ${X.length} كشف في الفترة. ${l3.length&&p3.length?`آخر 3 شهور ${pc(av(l3))} مقابل ${pc(av(p3))} في الـ3 اللي قبلهم.`:''}`);
  L.push(`<b>رقم ٢ — المكالمة جابت حجز:</b> من ${nb3.length} مريض خرجوا من غير حجز (وعدّى عليهم 3 أيام)، ${nb3.filter(x=>x.r3).length} اتحجزلهم في خلال 3 أيام = ${pc(r2)}.${r7!=null?` ولو 7 أيام: ${pc(r7)}.`:''}`);
  if(r1!=null&&r1<0.8)L.push(`<b class="down">كل 10 كشوفات، حوالي ${Math.round((1-r1)*10)} بيمشوا من غير موعد.</b> الهدف 85% أو أكتر.`);
  if(r2!=null&&r2<0.4)L.push(`<b class="down">مكالمة المتابعة بترجّع أقل من نص اللي فلتوا</b> — راجع هل بتتعمل فعلاً ولا المهمة بتتقفل وخلاص (ملحوظات المكالمات في الداشبورد).`);
  const dd=dRows.length>1?dRows[0]:null;if(dd)L.push(`<b>أقل دكتور مرضاه بيتحجزلهم بعد الكشف:</b> ${dd[0]} (${dd[2]} من ${dd[1]} كشف). الحجز بيبدأ من كلام الدكتور للمريض عن خطة العلاج.`);
  const sh=Object.entries(Sh).filter(([k,z])=>z.n>=10);if(sh.length===2){const [a,b]=sh.map(([k,z])=>[k,z.bk/z.n]).sort((x,y)=>x[1]-y[1]);if(b[1]-a[1]>0.08)L.push(`<b>الشيفت:</b> ${a[0]} بيحجز ${pc(a[1])} بس مقابل ${pc(b[1])} في ${b[0]}.`)}
  const miss=nb.filter(x=>!x.next&&x.age<=30).slice(0,40).map(x=>[x.d.slice(8,10)+'/'+x.d.slice(5,7),esc(x.pn||x.pid),esc(x.doc),x.age+' يوم']);
  return `<div class="card" style="margin-top:12px;border-inline-start:4px solid var(--warn)"><h3>🩺 الكشوفات: اتحجزله قبل ما يمشي؟<small>${BRN[S.b]} · ${ml(S.from)}–${ml(S.to)}</small></h3>
   <div class="bar"><label class="sub">النوع <select id="kdS">${Object.entries(KD).map(([k,t])=>`<option value="${k}"${k===CEN.kd?' selected':''}>${t}</option>`).join('')}</select></label>
   <span class="sub">«اتحجزله» = موعد جاي متسجل على السيستم يوم الكشف أو قبله · «المكالمة جابت حجز» = موعد اتسجل في خلال 3 أيام بعد الكشف</span></div>
   <div class="grid g4">${kpi('كشوفات مكتملة',X.length)}${kpi('١ — اتحجزله قبل ما يمشي',pc(r1),'الهدف 85%+',r1!=null&&r1<0.8?'down':'')}${kpi('خرجوا من غير حجز',nb.length)}${kpi('٢ — المكالمة جابت حجز (3 أيام)',pc(r2),nb3.length+' مريض',r2!=null&&r2<0.4?'down':'')}</div>
   <h3 style="margin-top:12px">📖 القراية</h3><ul class="ins">${L.map(x=>`<li>${x}</li>`).join('')}</ul>
   <div class="card" style="margin-top:10px"><h3>الشهور<small>نسبة اللي اتحجزلهم قبل ما يمشوا · ونسبة اللي المكالمة جابتهم</small></h3><div class="ch"><canvas id="kd1"></canvas></div></div></div>
  <div class="grid g2" style="margin-top:12px">
   <div class="card"><h3>كل أسبوع (آخر 12 أسبوع)<small>الأسبوع من السبت</small></h3>${tableHTML(['أسبوع',{t:'كشوفات',n:1},{t:'اتحجزلهم',n:1},{t:'١ — النسبة',n:1},{t:'من غير حجز',n:1},{t:'٢ — المكالمة جابت',n:1},{t:'لسه من غير حجز',n:1}],wRows,{h:380})}</div>
   <div class="card"><h3>حسب الدكتور اللي عمل الكشف</h3>${tableHTML(['',{t:'كشوفات',n:1},{t:'١ — اتحجزله',n:1},{t:'من غير حجز',n:1},{t:'٢ — المكالمة جابت',n:1}],dRows,{h:380})}</div>
   <div class="card"><h3>حسب الشيفت (ساعة الكشف)</h3>${tableHTML(['',{t:'كشوفات',n:1},{t:'١ — اتحجزله',n:1},{t:'من غير حجز',n:1},{t:'٢ — المكالمة جابت',n:1}],sRows,{h:200})}
     <div class="note">السكرتيرة اللي في الشيفت هي المسؤولة عن حجز المريض قبل ما يمشي.</div></div>
   <div class="card"><h3>مين سجّل الحجز على السيستم</h3>${tableHTML(['',{t:'حجز يوم الكشف',n:1},{t:'حجز بعد المكالمة',n:1}],who,{h:300})}
     <div class="note">حسب اسم اليوزر اللي عمل الموعد على Medicolize.</div></div>
   <div class="card" style="grid-column:1/-1"><h3>كشوفات آخر 30 يوم ولسه مالهمش أي موعد جاي<small>${miss.length} مريض</small></h3>${tableHTML(['الكشف','المريض','الدكتور',{t:'من',n:1}],miss,{h:360})}</div>
  </div>`}
function cKashf(){const s=$('#kdS');if(s)s.onchange=()=>{CEN.kd=s.value;try{localStorage.setItem('fin_kd',CEN.kd)}catch(e){}render()};
  const all=kashfData();const ks=[...new Set(all.map(x=>x.k))].sort().filter(k=>k>=S.from&&k<=S.to);if(!ks.length)return;const c=SER();
  const m=ks.map(k=>{const a=all.filter(x=>x.k===k),nb3=a.filter(x=>!x.bk&&x.done3);return [a.length?+(100*kRate(a,x=>x.bk)).toFixed(1):null,nb3.length?+(100*kRate(nb3,x=>x.r3)).toFixed(1):null]});
  chart('kd1',{type:'line',data:{labels:ks.map(mls),datasets:[line('١ — اتحجزله قبل ما يمشي %',m.map(x=>x[0]),c[0]),line('٢ — المكالمة جابت حجز %',m.map(x=>x[1]),c[2])]},options:{scales:{y:{min:0,max:100,ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+x.parsed.y+'%'}}}}})}
// inside المواعيد tab, before the cancellation analysis
{const v=VIEWS.apt,f=v[0],cb=v[1];VIEWS.apt=[()=>{const s=f();let h='';try{h=vKashf()}catch(e){console.error(e);h='<div class="card">خطأ في تحليل الكشوفات: '+esc(e.message)+'</div>'}let i=s.indexOf('🔍 ليه الإلغاء زاد؟');i=i>=0?s.lastIndexOf('<div class="card"',i):s.indexOf('<div class="grid g4">');return i>=0?s.slice(0,i)+h+s.slice(i):s+h},()=>{cb();try{cKashf()}catch(e){console.error(e)}}]}
