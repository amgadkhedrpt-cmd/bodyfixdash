// BODYFIX — «💼 المرتبات»: (1) أخطاء الكومبليت المتجمعة كل ليلة → ملف لأداة المرتبات، (2) نتيجة المرتبات → تكلفة كل دكتور وكل فرع.
// أداة المرتبات نفسها ما بتتلمسش. نتيجة المرتبات بتتحفظ مشفّرة مع إعدادات التغذية (نفس الباسورد).
'use strict';
const PAY={ym:'',cache:null};
const payMonths=()=>{const C=NUT.cfg||{};return Object.keys(C.payout||{}).sort()};
function defYm(){const c=curK(),d=+todayC().slice(8,10);return d<=10?shiftK(c,-1):c}
// ---------- (1) complete errors ----------
function errRows(ym){const t=((RAW.kinds||{}).docerr||{}).all?.[ym];if(!t||!t.rows)return [];const c=t.cols;const ix=n=>c.indexOf(n);
  return t.rows.map(r=>({date:r[ix('التاريخ')],pat:r[ix('اسم المريض')],doc:r[ix('اسم الدكتور')],svc:r[ix('الخدمة')],a:r[ix('عدد المواعيد')],o:r[ix('عدد العمليات')],note:r[ix('الملحوظة')],br:r[ix('الفرع')],seen:r[ix('أول ما ظهر')]}))}
const errDoc=d=>{const m=String(d||'').match(/المواعيد:\s*([^/)]+)/);return (m?m[1]:d||'').trim()};
function vErr(){const ym=PAY.ym||defYm();const E=errRows(ym);const months=Object.keys(((RAW.kinds||{}).docerr||{}).all||{}).sort().reverse();
  const opts=[...new Set([ym,...months])].sort().reverse().map(m=>`<option value="${m}"${m===ym?' selected':''}>${ml(m)}</option>`).join('');
  const bn=groupSum(E,'note',()=>1),bd=groupSum(E,e=>errDoc(e.doc),()=>1);const days=[...new Set(E.map(e=>e.seen))].sort();
  return `<div class="card"><h3>📋 أخطاء الكومبليت للمرتبات<small>بتتسجل لوحدها كل ليلة الساعة 11 — الخطأ اللي اتصلّح بعد كده بيفضل محسوب</small></h3>
   <div class="bar"><label class="sub">الشهر <select id="peM">${opts}</select></label><button class="pri" id="peX"${E.length?'':' disabled'}>📥 نزّل ملف الأخطاء لأداة المرتبات</button></div>
   ${E.length?`<div class="grid g4">${kpi('أخطاء الشهر',fm(E.length),days.length?`من ${days.length} لقطة ليلية (${days[0]} لـ ${days[days.length-1]})`:'')}${bn.slice(0,3).map(([k,v])=>kpi(esc(k),fm(v))).join('')}</div>
   <div class="grid g2" style="margin-top:12px"><div class="card"><h3>حسب الدكتور</h3>${tableHTML(['الدكتور',{t:'أخطاء',n:1}],bd.map(([k,v])=>[esc(k),v]),{h:320})}</div>
    <div class="card"><h3>كل الأخطاء</h3><input type="search" id="peQ" placeholder="دوّر بالمريض أو الدكتور" style="width:100%;margin-bottom:6px"><div id="peT"></div></div></div>`
   :`<div class="note">مفيش لقطات للشهر ده لسه. أول لقطة بتتسجل الليلة الساعة 11، وبتشمل كل الأخطاء المفتوحة وقتها من آخر 35 يوم.</div>`}
   <div class="note" style="margin-top:10px">الملف نفس شكل «تقرير الاختلافات» اللي بيطلع من تاب مراجعة الكومبليت (نفس المقارنة ونفس جدول الخدمات)، فارفعه في أداة المرتبات في خانة «أخطاء الكومبليت» زي ما بتعمل. فيه عمودين زيادة (الفرع وأول ليلة ظهر فيها الخطأ) والأداة بتتجاهلهم. اللي في نفس اليوم واتصلّح قبل الساعة 11 بالليل مش بيتحسب.</div></div>`}
function cErr(){const s=$('#peM');if(s)s.onchange=()=>{PAY.ym=s.value;render()};const ym=PAY.ym||defYm(),E=errRows(ym);
  const dr=()=>{const q=($('#peQ')?.value||'').trim();$('#peT')&&($('#peT').innerHTML=tableHTML(['التاريخ','المريض','الدكتور','الخدمة','الملحوظة','ظهر أول مرة'],E.filter(e=>!q||(e.pat+' '+e.doc).includes(q)).map(e=>[e.date,esc(e.pat),esc(e.doc),esc(e.svc),esc(e.note),e.seen]),{h:320}))};if($('#peQ')){$('#peQ').oninput=dr;dr()}
  const x=$('#peX');if(x)x.onclick=async()=>{if(!window.XLSX&&!(await loadLib('XLSX'))){alert('مكتبة Excel ما اتحملتش');return}const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([['التاريخ','اسم المريض','اسم الدكتور','الخدمة','عدد المواعيد','عدد العمليات','الملحوظة','الفرع','أول ما ظهر'],...E.map(e=>[e.date,e.pat,e.doc,e.svc,e.a,e.o,e.note,e.br,e.seen])]);
    ws['!cols']=[14,32,45,25,12,12,32,16,14].map(w=>({wch:w}));XLSX.utils.book_append_sheet(wb,ws,'تقرير الاختلافات');XLSX.writeFile(wb,`أخطاء الكومبليت ${ml(ym)} (كل اللقطات).xlsx`)}}

// ---------- (2) payroll result ----------
const MNA={'يناير':1,'فبراير':2,'مارس':3,'أبريل':4,'ابريل':4,'مايو':5,'يونيو':6,'يوليو':7,'أغسطس':8,'اغسطس':8,'سبتمبر':9,'أكتوبر':10,'اكتوبر':10,'نوفمبر':11,'ديسمبر':12};
function ymFromText(t){t=String(t||'');for(const [n,m] of Object.entries(MNA)){const r=new RegExp(n+'\\s*(20\\d\\d)');const x=t.match(r);if(x)return x[1]+'-'+pad(m)}const y=t.match(/(20\d\d)[-_ .](\d{1,2})/);return y?y[1]+'-'+pad(+y[2]):''}
function parsePayout(wb,fname){const out=[];let ym=ymFromText(fname);
  for(const sn of wb.SheetNames){const a=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true});
    for(let r=0;r<Math.min(a.length,8);r++){const h=a[r].map(x=>String(x).trim());const ni=h.indexOf('الموظف'),gi=h.indexOf('الصافي');if(ni<0||gi<0)continue;
      if(!ym)ym=ymFromText(a.slice(0,r).flat().join(' '));if(out.length&&sn!=='كل البنود')break;
      const ix=n=>h.indexOf(n);const li=ix('سلف'),ji=ix('الوظيفة'),bi=ix('الفرع'),fi=ix('إجمالي الثابت'),si=ix('جلسات/تارجت'),ki=ix('KPIs');
      for(let j=r+1;j<a.length;j++){const n=String(a[j][ni]||'').trim();if(!n||/^الإجمالي|^اجمالي/.test(n)||typeof a[j][gi]!=='number')continue;
        out.push({n,job:ji>=0?String(a[j][ji]||''):'',br:bi>=0?String(a[j][bi]||''):'',net:+a[j][gi]||0,loan:li>=0?+a[j][li]||0:0,fixed:fi>=0?+a[j][fi]||0:0,sess:si>=0?+a[j][si]||0:0,kpi:ki>=0?+a[j][ki]||0:0})}
      break}
    if(out.length&&sn==='كل البنود')break}
  const seen=new Set();return {ym,rows:out.filter(x=>!seen.has(x.n)&&seen.add(x.n))}}
const nmK=s=>nAr(String(s||'').replace(/^\s*dr\.?\s*/i,'')).replace(/[^a-z؀-ۿ ]/g,' ').replace(/\s+/g,' ').trim();
function autoDoc(emp,docs){const e=nmK(emp).split(' ');let best=null;for(const d of docs){const t=nmK(d).split(' ');if(!t[0])continue;
  const same=t.join(' ')===e.join(' ');const ok=same||(t[0]===e[0]&&(t.length===1||e.length===1||t[1]===e[1]||(t[1]&&e[1]&&(t[1].startsWith(e[1].slice(0,3))))));if(ok){if(same)return d;best=best||d}}return best}
function payData(ym){const C=NUT.cfg||{};const P=(C.payout||{})[ym];if(!P)return null;
  const docs=[...new Set(D.apt.filter(a=>a.k===ym&&a.st==='Completed'&&a.doc!==PAST_DOC&&a.doc!=='—').map(a=>a.doc))];
  const map=C.docMap||{};const rows=P.rows.map(r=>{const g=r.net+r.loan;const dm=r.n in map?map[r.n]:autoDoc(r.n,docs);
    const A=dm?D.apt.filter(a=>a.k===ym&&a.st==='Completed'&&a.doc===dm):[];const s=A.length,sh=A.filter(a=>a.b==='haram').length,sd=s-sh;
    const rev=dm?D.pay.filter(p=>p.k===ym&&!p.bal&&p.doc===dm).reduce((q,p)=>q+p.amt,0):0;
    const bk=/الهرم/.test(r.br)?'haram':/الدقي/.test(r.br)?'dokki':'';
    return Object.assign({},r,{g,dm,s,sh,sd,rev,bk,splitH:bk==='haram'?1:bk==='dokki'?0:(s?sh/s:0.5)})});
  return {P,rows,docs}}
function vPayout(){const ms=payMonths();const ym=PAY.pm&&ms.includes(PAY.pm)?PAY.pm:ms[ms.length-1];const X=ym?payData(ym):null;
  let h=`<div class="card" style="margin-top:12px"><h3>💼 نتيجة المرتبات<small>ارفع ملف «مرتبات BodyFix <الشهر>.xlsx» اللي بيطلع من أداة المرتبات بعد ما تقفل الشهر — بيتحفظ مشفّر</small></h3>
   <div class="bar"><label class="drop" style="padding:6px 12px;border:1px dashed var(--brd);border-radius:8px;cursor:pointer">📂 ارفع ملف المرتبات<input type="file" id="poF" accept=".xlsx,.xls" hidden multiple></label>
   ${ms.length?`<label class="sub">الشهر <select id="poM">${ms.slice().reverse().map(m=>`<option value="${m}"${m===ym?' selected':''}>${ml(m)}</option>`).join('')}</select></label>`:''}<span class="sub">${NUT.cfgState?esc(NUT.cfgState):''}</span></div><div id="poPrev"></div>`;
  if(!X){return h+'<div class="note">لسه ما اترفعش ملف مرتبات.</div></div>'}
  const R=X.rows,tot=R.reduce((s,r)=>s+r.g,0);const H=R.reduce((s,r)=>s+r.g*r.splitH,0),K=tot-H;
  const rv=b=>withB(b,()=>calcMonth(ym).net);const rH=rv('haram'),rK=rv('dokki');
  const byJob=groupSum(R,'job',r=>r.g);const docsR=R.filter(r=>r.dm).sort((a,b)=>b.g-a.g);
  h+=`<div class="grid g4">${kpi('إجمالي المرتبات (قبل السلف) — '+ml(ym),fm(tot),fm(R.length)+' موظف')}${kpi('الهرم',fm(H),rH?pc(H/rH)+' من إيراد الهرم':'')}${kpi('الدقي',fm(K),rK?pc(K/rK)+' من إيراد الدقي':'')}${kpi('السلف المخصومة',fm(R.reduce((s,r)=>s+r.loan,0)))}</div>
   <div class="grid g2" style="margin-top:12px"><div class="card"><h3>حسب الوظيفة</h3>${tableHTML(['الوظيفة',{t:'المرتبات',n:1},{t:'النسبة',n:1}],byJob.map(([k,v])=>[esc(k||'—'),v,pc(v/tot)]))}</div>
    <div class="card"><h3>المرتبات من الإيراد شهري</h3><div class="ch sm"><canvas id="po1"></canvas></div></div></div>
   <div class="card" style="margin-top:12px"><h3>تكلفة كل دكتور قصاد شغله<small>${ml(ym)} — الإيراد = المدفوعات المسجلة على الدكتور في Medicolize</small></h3>
    ${tableHTML(['الموظف','الدكتور في Medicolize',{t:'المرتب',n:1},{t:'جلسات مكتملة',n:1},{t:'هرم/دقي',n:1},{t:'الإيراد',n:1},{t:'الإيراد ÷ المرتب',n:1},{t:'تكلفة الجلسة',n:1},{t:'الإيراد − المرتب',n:1}],
      docsR.map(r=>[esc(r.n),`<select data-dm="${esc(r.n)}" style="max-width:170px"><option value="">—</option>${X.docs.map(d=>`<option${d===r.dm?' selected':''}>${esc(d)}</option>`).join('')}</select>`,r.g,r.s,`${r.sh}/${r.sd}`,r.rev,r.g?fm(r.rev/r.g,1)+'×':'—',r.s?fm(r.g/r.s):'—',r.rev-r.g]),{h:520})}
    <div class="note" style="margin-top:8px">الربط بين اسم الموظف واسم الدكتور في Medicolize بيتعمل لوحده بالاسم؛ لو غلط اختار الصح من القايمة ودوس «احفظ الإعدادات» في تاب التغذية ← الإعدادات (أو أي حفظ). الدكتور اللي فرعه مش مكتوب في ملف المرتبات بيتقسم مرتبه على الفرعين حسب جلساته.</div>
    ${R.filter(r=>!r.dm&&/علاج طبيعي|تغذية/.test(r.job)).length?`<div class="note" style="margin-top:6px">⚠️ دكاترة مش مربوطين: ${R.filter(r=>!r.dm&&/علاج طبيعي|تغذية/.test(r.job)).map(r=>`<button data-link="${esc(r.n)}" style="padding:1px 8px;font-size:.72rem">${esc(r.n)}</button>`).join(' ')}</div>`:''}</div>
   <div class="card" style="margin-top:12px"><h3>كل الموظفين</h3>${tableHTML(['الموظف','الوظيفة','الفرع',{t:'الثابت',n:1},{t:'جلسات/تارجت',n:1},{t:'KPIs',n:1},{t:'السلف',n:1},{t:'الصافي',n:1},{t:'قبل السلف',n:1}],R.map(r=>[esc(r.n),esc(r.job),esc(r.br),r.fixed,r.sess,r.kpi,r.loan,r.net,r.g]),{h:460})}</div>`;
  return h+'</div>'}
function cPayout(){const ms=payMonths();const s=$('#poM');if(s)s.onchange=()=>{PAY.pm=s.value;render()};
  const f=$('#poF');if(f)f.onchange=async e=>{const fs=[...e.target.files];e.target.value='';if(!fs.length)return;if(!window.XLSX&&!(await loadLib('XLSX'))){alert('مكتبة Excel ما اتحملتش');return}
    let ym='',rows=[];for(const file of fs){const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const p=parsePayout(wb,file.name);if(p.ym&&!ym)ym=p.ym;
      p.rows.forEach(r=>{if(!r.br&&/FIX ?ZONE|الدقي/i.test(file.name))r.br='الدقي';const i=rows.findIndex(x=>x.n===r.n);if(i>=0)rows[i]=r;else rows.push(r)})}
    if(!rows.length){alert('ما لقيتش جدول فيه «الموظف» و«الصافي» — ارفع ملف «مرتبات BodyFix» اللي بيطلع من تاب التنزيل في أداة المرتبات');return}
    $('#poPrev').innerHTML=`<div class="note" style="margin:8px 0">${rows.length} موظف — إجمالي الصافي ${fm(rows.reduce((s,r)=>s+r.net,0))}. اختار الشهر وبعدين «اعتمد واحفظ».</div>
     <div class="bar"><input type="month" id="poYm" value="${ym||shiftK(curK(),-1)}"><button class="pri" id="poOk">✓ اعتمد واحفظ</button><button id="poNo">إلغاء</button></div>
     ${tableHTML(['الموظف','الوظيفة','الفرع',{t:'الصافي',n:1},{t:'السلف',n:1}],rows.map(r=>[esc(r.n),esc(r.job),esc(r.br),r.net,r.loan]),{h:260})}`;
    $('#poNo').onclick=()=>{$('#poPrev').innerHTML=''};
    $('#poOk').onclick=async ev=>{const m=$('#poYm').value;if(!m)return;const C=NUT.cfg;C.payout=C.payout||{};C.payout[m]={at:new Date().toISOString(),rows};
      C.payroll=C.payroll||{};C.payroll[m]=Object.fromEntries(rows.map(r=>[r.n,Math.round((r.net+r.loan)*100)/100]));   // nutrition section: salary before loans
      NUT.data=null;NUT.dirty=true;PAY.pm=m;await nutCfgSave(ev.currentTarget);render()}};
  document.querySelectorAll('[data-dm]').forEach(sl=>sl.onchange=()=>{const C=NUT.cfg;C.docMap=C.docMap||{};C.docMap[sl.dataset.dm]=sl.value;NUT.dirty=true;render()});
  document.querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>{const sl=document.querySelector(`[data-dm="${CSS.escape(b.dataset.link)}"]`);if(sl){sl.scrollIntoView({block:'center'});sl.focus()}else alert('الموظف ده مش في جدول الدكاترة — اربطه من القايمة لو ظهر')});
  if(ms.length&&$('#po1')){const c=SER();chart('po1',{type:'line',data:{labels:ms.map(mls),datasets:[line('الهرم %',ms.map(m=>{const X=payData(m),r=withB('haram',()=>calcMonth(m).net);return r?+(100*X.rows.reduce((s,x)=>s+x.g*x.splitH,0)/r).toFixed(1):null}),c[0]),line('الدقي %',ms.map(m=>{const X=payData(m),r=withB('dokki',()=>calcMonth(m).net);return r?+(100*X.rows.reduce((s,x)=>s+x.g*(1-x.splitH),0)/r).toFixed(1):null}),c[1])]},options:{scales:{y:{ticks:{callback:v=>v+'%'}}}}})}}
// docMap edits are saved with the encrypted settings
function vPayTab(){if(!NUT.cfg)NUT.cfg=nutMerge(null);return `<div class="note" style="margin-bottom:10px">أداة المرتبات هي اللي بتحسب المرتبات زي ما هي — التاب ده بيجهزلها ملف أخطاء الكومبليت، وبيقرا نتيجتها علشان تكلفة كل دكتور وكل فرع. ${NUT.dirty?'<button id="paySave" class="pri" style="margin-inline-start:8px">💾 احفظ التعديلات</button>':''}</div>`+vErr()+vPayout()}
function cPayTab(){cErr();cPayout();const b=$('#paySave');if(b)b.onclick=e=>nutCfgSave(e.currentTarget)}
VIEWS.pay=[vPayTab,cPayTab];
