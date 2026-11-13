// BODYFIX — «📈 النمو»: كل ربع وكل سنة مقارنة بنفس الفترة السنة اللي فاتت (والفترة الحالية بتتقارن لحد نفس اليوم).
'use strict';
const GR={};
// نفس حسبة calcMonth بس على مدى أيام — متجمّعة باليوم مرة واحدة (سريعة)
try{GR.dept=localStorage.getItem('fin_grdept')||'';GR.met=localStorage.getItem('fin_grmet')||'net'}catch(e){GR.dept='';GR.met='net'}
function grDaily(){const dep=GR.dept,key='d'+S.b+'|'+dep;if(GR[key])return GR[key];const Dd={};const z=d=>Dd[d]=Dd[d]||{rev:0,ref:0,opex:0,ses:0,lost:0,all:0,np:0,ex:0};
  if(dep)cenBuild();                                   // بيحط قسم كل دفعة (p.dept)
  D.pay.forEach(p=>{if(inB(p)&&!p.bal&&(!dep||p.dept===dep))z(p.d).rev+=p.amt});
  if(!dep)D.exp.forEach(e=>{if(!expIn(e))return;const o=z(e.d);o.ex++;if(REFUND_RX.test(e.type))o.ref+=e.amt;else o.opex+=e.amt});
  const td=todayC();D.apt.forEach(a=>{if(!inB(a)||(dep&&deptOfType(a.type)!==dep))return;const o=z(a.d);if(a.st==='Completed')o.ses++;if(a.d<=td){o.all++;if(/cancel|no ?show/i.test(a.st))o.lost++}});
  if(dep){const pts=cenBuild().pts;for(const id in pts){const p=pts[id];if(p.entry===dep&&!p.early)z(p.first).np++}}
  else{const P=ptIndex();for(const id in P){const p=P[id];if(p.first&&!p.early)z(p.first).np++}}
  const days=Object.keys(Dd).sort();return GR[key]={Dd,days}}
function grAgg(d1,d2){const {Dd,days}=grDaily();const o={rev:0,ref:0,opex:0,ses:0,lost:0,all:0,np:0,ex:0};
  for(const d of days){if(d<d1)continue;if(d>d2)break;const x=Dd[d];for(const k in o)o[k]+=x[k]}
  const net=o.rev-o.ref,profit=GR.dept?null:net-o.opex;return {net,opex:o.opex,profit,margin:GR.dept||!net?null:profit/net,sessions:o.ses,np:o.np,avgS:o.ses?net/o.ses:null,canc:o.all?o.lost/o.all:null,hasExp:o.ex>0}}
const grD=(y,m,d)=>new Date(Date.UTC(y,m,d)).toISOString().slice(0,10);
const grEnd=(y,m)=>grD(y,m+1,0);
function grPeriods(){const t=todayC(),ty=+t.slice(0,4),tm=+t.slice(5,7)-1,td=+t.slice(8,10),f=D.months[0]||'2024-06',fy=+f.slice(0,4),fm0=+f.slice(5,7)-1;
  const Q=[];for(let y=fy;y<=ty;y++)for(let q=0;q<4;q++){const m0=q*3;if(y===fy&&m0+2<fm0)continue;if(y===ty&&m0>tm)continue;
    const cur=y===ty&&tm>=m0&&tm<=m0+2,start=grD(y,Math.max(m0,y===fy?fm0:m0),1);
    // الربع الحالي: لحد النهارده — ونفس الأيام من السنة اللي فاتت
    const end=cur?t:grEnd(y,m0+2),cut=cur?(tm-m0)*100+td:null;
    const ly=d=>String(+d.slice(0,4)-1)+d.slice(4);const lyEnd=cur?grD(y-1,tm,Math.min(td,new Date(Date.UTC(y-1,tm+1,0)).getUTCDate())):grEnd(y-1,m0+2);
    Q.push({lbl:`Q${q+1} ${y}`,y,q,start,end,cur,part:y===fy&&m0<fm0,lyStart:ly(start),lyEnd,pqKey:q?`Q${q} ${y}`:`Q4 ${y-1}`})}
  const Y=[];for(let y=fy;y<=ty;y++){const cur=y===ty,start=grD(y,y===fy?fm0:0,1),end=cur?t:grEnd(y,11);Y.push({lbl:String(y),y,start,end,cur,part:y===fy&&fm0>0,lyStart:String(y-1)+start.slice(4),lyEnd:cur?grD(y-1,tm,Math.min(td,new Date(Date.UTC(y-1,tm+1,0)).getUTCDate())):String(y-1)+end.slice(4)})}
  return {Q,Y,t,f}}
const grG=(a,b)=>b&&a!=null&&isFinite(a)&&b!==0?(a-b)/Math.abs(b):null;
const grCell=g=>g==null?'—':`<span class="${g>=0?'up':'down'}">${g>=0?'▲':'▼'} ${pc(Math.abs(g))}</span>`;
function grBuild(){const key=S.b+'|'+GR.dept;if(GR[key])return GR[key];const {Q,Y,t,f}=grPeriods();const has=d=>d>=f+'-01';
  Q.forEach(p=>{p.m=grAgg(p.start,p.end);p.ly=has(p.lyStart)||has(p.lyEnd)&&p.lyStart<f+'-01'?(has(p.lyStart)?grAgg(p.lyStart,p.lyEnd):null):null});
  Q.forEach(p=>{const pq=Q.find(x=>x.lbl===p.pqKey);p.pq=pq&&!pq.cur&&!p.cur&&!pq.part?pq.m:null});
  Y.forEach(p=>{p.m=grAgg(p.start,p.end);p.ly=has(p.lyStart)?grAgg(p.lyStart,p.lyEnd):null});
  // أول سنة ناقصة (البيانات من نصها): نقارن نفس الشهور في السنة اللي بعدها
  if(Y.length>1&&Y[0].part){const y0=Y[0],y1=Y[1],e1=String(y1.y)+y0.end.slice(4),end=e1>t?t:e1;const lyEnd=end===t?String(y0.y)+t.slice(4):y0.end;
    Y.splice(2,0,{lbl:`${ml(y0.start.slice(0,7)).split(' ')[0]}–${ml(end.slice(0,7)).split(' ')[0]} ${y1.y} <span class="sub">(نفس شهور ${y0.y})</span>`,y:y1.y,m:grAgg(String(y1.y)+y0.start.slice(4),end),ly:grAgg(y0.start,lyEnd),cmp:true})}
  // آخر 12 شهر مقابل الـ 12 اللي قبلهم
  const ttm1=[grD(+t.slice(0,4)-1,+t.slice(5,7)-1,+t.slice(8,10)+1),t],ttm0=[grD(+t.slice(0,4)-2,+t.slice(5,7)-1,+t.slice(8,10)+1),grD(+t.slice(0,4)-1,+t.slice(5,7)-1,+t.slice(8,10))];
  const T1=grAgg(...ttm1),T0=has(ttm0[0])?grAgg(...ttm0):null;
  return GR[key]={Q,Y,T1,T0,ttm1,ttm0,t}}
const GRM=[['net','صافي الإيراد','n'],['sessions','الجلسات','n'],['np','المرضى الجداد','n'],['avgS','متوسط سعر الجلسة','n'],['profit','الربح','n'],['margin','هامش الربح','r'],['canc','الإلغاء والغياب','r']];
const grMv=(m,k)=>m?m[k]:null;
function grGm(a,b,type){if(a==null||b==null)return null;return type==='r'?a-b:grG(a,b)}
const grCellM=(g,type,inv)=>g==null?'—':type==='r'?`<span class="${(g>=0)!==!!inv?'up':'down'}">${g>=0?'▲':'▼'} ${(Math.abs(g)*100).toFixed(1)} نقطة</span>`:grCell(g);
function vGrowth(){const B=grBuild(),{Q,Y,T1,T0}=B;const yc=Y[Y.length-1];
  const L=[],g=grG;
  if(yc.ly)L.push(`<b>${yc.lbl} لحد النهارده</b> مقارنة بنفس الفترة من ${yc.y-1}: صافي الإيراد ${grCell(g(yc.m.net,yc.ly.net))} (${fm(yc.ly.net)} ← ${fm(yc.m.net)}) · الربح ${grCell(g(yc.m.profit,yc.ly.profit))} · الجلسات ${grCell(g(yc.m.sessions,yc.ly.sessions))} · المرضى الجداد ${grCell(g(yc.m.np,yc.ly.np))}.`);
  if(T0)L.push(`<b>آخر 12 شهر</b> مقابل الـ 12 اللي قبلهم: صافي الإيراد ${grCell(g(T1.net,T0.net))} · الربح ${grCell(g(T1.profit,T0.profit))}.`);
  // النمو جاي منين: عدد جلسات ولا سعر الجلسة
  if(yc.ly&&yc.ly.sessions&&yc.m.sessions){const vol=(yc.m.sessions-yc.ly.sessions)*yc.ly.avgS,price=(yc.m.avgS-yc.ly.avgS)*yc.m.sessions,tot=yc.m.net-yc.ly.net;
    L.push(`<b>التغيّر في الإيراد (${fm(tot)}) جاي منين:</b> عدد الجلسات ${fm(vol)} · متوسط سعر الجلسة ${fm(price)} (${fm(yc.ly.avgS)} ← ${fm(yc.m.avgS)} جنيه). ${Math.abs(vol)>Math.abs(price)?'يعني الفرق أساساً في <b>عدد الجلسات</b>.':'يعني الفرق أساساً في <b>سعر الجلسة</b> (أسعار/خصومات/نوع الخدمات).'}`)}
  const qy=Q.filter(p=>p.ly&&!p.part&&!p.cur).map(p=>({p,gr:g(p.m.net,p.ly.net)})).filter(x=>x.gr!=null);
  if(qy.length>=2){const s=qy.slice().sort((a,b)=>b.gr-a.gr);L.push(`أحسن ربع نمو: <b>${s[0].p.lbl}</b> ${grCell(s[0].gr)} · أضعف ربع: <b>${s[s.length-1].p.lbl}</b> ${grCell(s[s.length-1].gr)}.`);
    const l2=qy.slice(-2);if(l2.length===2&&l2[1].gr<l2[0].gr-0.1)L.push(`<b class="down">النمو بيبطّأ:</b> ${l2[0].p.lbl} ${grCell(l2[0].gr)} ← ${l2[1].p.lbl} ${grCell(l2[1].gr)}.`)}
  const qc=Q[Q.length-1];if(qc.cur&&qc.ly)L.push(`<b>${qc.lbl} (لحد النهارده)</b> مقارنة بنفس الأيام من ${qc.y-1}: صافي الإيراد ${grCell(g(qc.m.net,qc.ly.net))} · الجلسات ${grCell(g(qc.m.sessions,qc.ly.sessions))}.`);
  if(Y[0].part)L.push(`<span class="sub">${Y[0].lbl} في البيانات من ${ml(B.Q[0].start.slice(0,7))} بس، فمقارنتها بالسنة اللي بعدها بتتعمل على نفس الشهور.</span>`);
  const row=(p,full)=>{const m=p.m,ly=p.ly;return [p.lbl+(p.cur?' <span class="sub">(لحد النهارده)</span>':p.part?' <span class="sub">(جزء)</span>':''),fm(m.net),grCell(ly&&g(m.net,ly.net)),full?grCell(p.pq&&g(m.net,p.pq.net)):null,fm(m.profit),grCell(ly&&ly.profit>0?g(m.profit,ly.profit):null),m.margin==null?'—':pc(m.margin),fm(m.sessions),grCell(ly&&g(m.sessions,ly.sessions)),fm(m.np),grCell(ly&&g(m.np,ly.np)),fm(m.avgS),m.canc==null?'—':pc(m.canc)].filter(x=>x!==null)};
  const qRows=Q.slice().reverse().map(p=>row(p,true)),yRows=Y.slice().reverse().map(p=>row(p,false));
  const H=(full)=>['',{t:'صافي الإيراد',n:1},{t:'نمو سنوي',n:1}].concat(full?[{t:'عن الربع اللي قبله',n:1}]:[]).concat([{t:'الربح',n:1},{t:'نمو سنوي',n:1},{t:'الهامش',n:1},{t:'جلسات',n:1},{t:'نمو',n:1},{t:'مرضى جداد',n:1},{t:'نمو',n:1},{t:'متوسط الجلسة',n:1},{t:'إلغاء/غياب',n:1}]);
  // كل شهر مقابل نفس الشهر السنة اللي فاتت
  const ks=D.months.filter(k=>k<=curK());const mRows=ks.slice().reverse().map(k=>{const lk=shiftK(k,-12),me=k=>grAgg(k+'-01',k+'-31'),a=me(k),b=ks.includes(lk)?me(lk):null;const cur=k===curK();
    const a2=cur?grAgg(k+'-01',todayC()):null,b2=cur&&b?grAgg(lk+'-01',lk+todayC().slice(7)):null;
    return [ml(k)+(cur?' <span class="sub">(لحد النهارده)</span>':''),fm(a.net),b?fm(b.net):'—',grCell(cur?(b2&&g(a2.net,b2.net)):(b&&g(a.net,b.net))),fm(a.profit),b?grCell(b.profit>0?g(a.profit,b.profit):null):'—',fm(a.sessions),b?grCell(cur?g(a2.sessions,b2.sessions):g(a.sessions,b.sessions)):'—']});
  const mets=GRM.filter(m=>!GR.dept||(m[0]!=='profit'&&m[0]!=='margin'));if(!mets.find(m=>m[0]===GR.met))GR.met='net';
  const bar_=`<div class="bar" style="margin-bottom:8px"><label class="sub">القسم <select id="grDep"><option value="">المركز كله</option>${DEPTS.map(([d,t])=>`<option value="${d}"${GR.dept===d?' selected':''}>${t}</option>`).join('')}</select></label>
   <span class="sub">قارن:</span>${mets.map(([k,t])=>`<button class="${GR.met===k?'pri':''}" data-grm="${k}" style="padding:4px 10px">${t}</button>`).join('')}</div>
   ${GR.dept?`<div class="note" style="margin-bottom:8px">قسم ${DEPN[GR.dept]}: الإيراد = الدفعات اللي اتنسبت للقسم (حسب موعد المريض في نفس اليوم)، الجلسات = مواعيد القسم المكتملة، المرضى الجداد = اللي أول زيارة ليهم كانت في القسم. المصروفات مش متقسمة على الأقسام، فالربح والهامش بيظهروا للمركز كله بس.</div>`:''}`;
  return bar_+`<div class="card"><h3>📈 النمو السنوي والربع سنوي<small>${BRN[S.b]}${GR.dept?' · '+DEPN[GR.dept]:''} · من ${ml(D.months[0])} لحد النهارده · الفترة الحالية بتتقارن بنفس الأيام من السنة اللي فاتت</small></h3>
   <div class="grid g4">${kpi(yc.lbl+' لحد النهارده — صافي الإيراد',fm(yc.m.net),yc.ly?'مقارنة بنفس الفترة '+(yc.y-1)+' '+grCell(g(yc.m.net,yc.ly.net)):'')}${kpi('الربح',fm(yc.m.profit),yc.ly?grCell(yc.ly.profit>0?g(yc.m.profit,yc.ly.profit):null):'')}${kpi('آخر 12 شهر — صافي الإيراد',fm(T1.net),T0?'مقارنة بالـ 12 اللي قبلهم '+grCell(g(T1.net,T0.net)):'')}${kpi('مرضى جداد '+yc.lbl,fm(yc.m.np),yc.ly?grCell(g(yc.m.np,yc.ly.np)):'')}</div>
   <h3 style="margin-top:12px">📖 القراية</h3><ul class="ins">${L.map(x=>`<li>${x}</li>`).join('')}</ul>
   <div class="grid g2" style="margin-top:10px"><div class="card"><h3>${(GRM.find(m=>m[0]===GR.met)||GRM[0])[1]} كل شهر — سنة قصاد سنة<small>الشهر الحالي مش في الرسم لأنه لسه ما خلصش (مقارنته بنفس الأيام في الجداول)</small></h3><div class="ch"><canvas id="gr1"></canvas></div></div>
    <div class="card"><h3>${(GRM.find(m=>m[0]===GR.met)||GRM[0])[1]} — كل ربع عن نفس الربع السنة اللي فاتت<small>* = الربع الحالي لحد النهارده مقابل نفس الأيام</small></h3><div class="ch"><canvas id="gr2"></canvas></div></div>
    <div class="card" style="grid-column:1/-1"><h3>${(GRM.find(m=>m[0]===GR.met)||GRM[0])[1]} — كل ربع (القيمة)<small>كل سنة لون</small></h3><div class="ch"><canvas id="gr3"></canvas></div></div></div></div>
  <div class="card" style="margin-top:12px"><h3>كل ربع<small>«نمو سنوي» = مقارنة بنفس الربع السنة اللي فاتت · «عن الربع اللي قبله» = الربع اللي قبله مباشرة (فيه موسمية)</small></h3>${tableHTML(H(true),qRows,{h:440})}</div>
  <div class="card" style="margin-top:12px"><h3>كل سنة</h3>${tableHTML(H(false),yRows,{h:240})}</div>
  <div class="card" style="margin-top:12px"><h3>كل شهر مقابل نفس الشهر السنة اللي فاتت</h3>${tableHTML(['الشهر',{t:'صافي الإيراد',n:1},{t:'السنة اللي فاتت',n:1},{t:'نمو',n:1},{t:'الربح',n:1},{t:'نمو الربح',n:1},{t:'جلسات',n:1},{t:'نمو الجلسات',n:1}],mRows,{h:440})}</div>`}
function cGrowth(){const B=grBuild(),c=SER(),M=GRM.find(m=>m[0]===GR.met)||GRM[0],[mk,mt,ty]=M;
  const ds=$('#grDep');if(ds)ds.onchange=()=>{GR.dept=ds.value;try{localStorage.setItem('fin_grdept',GR.dept)}catch(e){}render()};
  document.querySelectorAll('[data-grm]').forEach(b=>b.onclick=()=>{GR.met=b.dataset.grm;try{localStorage.setItem('fin_grmet',GR.met)}catch(e){}render()});
  const fmt=v=>v==null?'—':ty==='r'?(v*100).toFixed(1)+'%':fm(v);const plot=v=>v==null?null:ty==='r'?+(v*100).toFixed(1):Math.round(v);
  const yrs=[...new Set(D.months.map(k=>k.slice(0,4)))];const MN=['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  chart('gr1',{type:'line',data:{labels:MN,datasets:yrs.map((y,i)=>line(y,MN.map((_,m)=>{const k=y+'-'+String(m+1).padStart(2,'0');return D.months.includes(k)&&k<curK()?plot(grAgg(k+'-01',k+'-31')[mk]):null}),c[i%c.length]))},
    options:{plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+(ty==='r'?x.parsed.y+'%':fm(x.parsed.y))}}},scales:{y:{ticks:{callback:v=>ty==='r'?v+'%':fm(v)}}}}});
  const q=B.Q.filter(p=>p.ly&&!p.part);chart('gr2',{data:{labels:q.map(p=>p.lbl+(p.cur?'*':'')),datasets:[bar(ty==='r'?'الفرق (نقطة)':'النمو %',q.map(p=>{const v=grGm(p.m[mk],p.ly[mk],ty);return v==null?null:+(v*100).toFixed(1)}),c[0])]},
    options:{plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>{const p=q[x.dataIndex];return ' '+x.parsed.y+(ty==='r'?' نقطة':'%')+' — '+fmt(p.ly[mk])+' ← '+fmt(p.m[mk])}}}},scales:{y:{ticks:{callback:v=>v+(ty==='r'?'':'%')}}}}});
  const QL=['Q1','Q2','Q3','Q4'];chart('gr3',{data:{labels:QL,datasets:yrs.map((y,i)=>bar(y,QL.map((_,qi)=>{const p=B.Q.find(x=>x.y===+y&&x.q===qi);return p&&!p.part&&!p.cur?plot(p.m[mk]):null}),c[i%c.length]))},
    options:{plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+(ty==='r'?x.parsed.y+'%':fm(x.parsed.y))}}},scales:{y:{ticks:{callback:v=>ty==='r'?v+'%':fm(v)}}}}})}
VIEWS.gr=[vGrowth,cGrowth];
