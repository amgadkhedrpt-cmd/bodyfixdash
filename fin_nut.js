// BODYFIX — قسم التغذية (فرع الهرم) داخل صفحة التحليلات المالية.
// القواعد من nutrition_section_spec.md. الإعدادات والمرتبات بتتحفظ مشفّرة بنفس الباسورد في شيت الطلبات (نص مشفّر بس).
'use strict';
const NUT={sub:'sum',cfg:null,cfgKey:null,cfgSalt:null,cfgState:'',data:null,dirty:false};
const REQ_URL='https://script.google.com/macros/s/AKfycbzy1UbUmQmVOLnrgP69vALV_RH8VlejQ5Npo9a9xS1u9Hhz5oRiPKF7GIgSVYAxCp_m/exec';
const nAr=t=>String(t??'').replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْـ]/g,'').replace(/\s+/g,' ').trim().toLowerCase();

// ---------------- defaults (no amounts here: amounts live only in the encrypted settings) ----------------
const NUT_DEF={v:1,shareAide:0.5,shareGen:0.25,sharedPct:0.25,deviceDep:5000,deviceDepFrom:'2024-06',assetLife:60,assetShare:0.25,
  injMode:'r12',injManual:0.5,alaaFrom:'2026-10',alaaRate:0.10,alaaArchive:{due:'',paid:'',bal:'',extra:'',note:'رصيد نظام الـ50% (يونيو 2024 – سبتمبر 2026)'},
  priceDate:'',alertInjShare:0.75,alertInjDisc:0.10,alertDevDisc:0.15,
  staff:[
    {ar:'ملك',en:'Malak Ashour',role:'مساعدة التخسيس',share:0.5,from:'2026-08',to:''},
    {ar:'شروق',en:'Shorouk',role:'مساعدة التخسيس',share:0.5,from:'',to:'2026-07'},
    {ar:'شروق',en:'Shorouk',role:'مساعد علاج طبيعي',share:0.25,from:'2026-08',to:''},
    {ar:'بسمله',en:'Basmala',role:'مساعد علاج طبيعي',share:0.25,from:'',to:''},
    {ar:'داليا',en:'Dalia',role:'سكرتارية الهرم',share:0.25,from:'',to:''},
    {ar:'انجي',en:'Engy Mamdouh',role:'سكرتارية الهرم',share:0.25,from:'',to:''},
    {ar:'ندي',en:'Nada Abdel Razik',role:'سكرتارية الهرم',share:0.25,from:'',to:''},
    {ar:'مريم',en:'Mariam Saad',role:'سكرتارية الهرم',share:0.25,from:'',to:''},
    {ar:'ولاء',en:'Walaa Ibrahim Semedah',role:'النظافة',share:0.25,from:'',to:''},
    {ar:'بسنت',en:'Bassant',role:'سكرتارية الدقي',share:0,from:'',to:''},
    {ar:'جورجينا',en:'Georgina',role:'سكرتارية الدقي',share:0,from:'',to:''}],
  payroll:{},overrides:{}};

// ---------------- encrypted settings in the requests sheet (chunks, two slots) ----------------
function jsonp(params,timeout){return new Promise((res,rej)=>{const cb='_fn'+Date.now()+Math.floor(Math.random()*1e6),sc=document.createElement('script');let done=false;
  const end=(ok,v)=>{if(done)return;done=true;clearTimeout(t);try{sc.remove()}catch(e){}delete window[cb];ok?res(v):rej(v)};
  const t=setTimeout(()=>end(false,new Error('timeout')),timeout||20000);window[cb]=d=>end(true,d);sc.onerror=()=>end(false,new Error('net'));
  sc.src=REQ_URL+'?'+Object.entries(Object.assign({},params,{callback:cb})).map(([k,v])=>k+'='+encodeURIComponent(v)).join('&');document.head.appendChild(sc)})}
const u8b64=u=>{let s='';for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s)};
async function cfgKeyFrom(pw,salt){const base=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:b64(salt),iterations:250000},base,{name:'AES-GCM',length:256},true,['encrypt','decrypt'])}
async function gz(str){const s=new Blob([new TextEncoder().encode(str)]).stream().pipeThrough(new CompressionStream('gzip'));return new Uint8Array(await new Response(s).arrayBuffer())}
async function ungz(u){const s=new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));return await new Response(s).text()}
function nutMerge(c){const o=JSON.parse(JSON.stringify(NUT_DEF));for(const k in c||{})o[k]=c[k];o.alaaArchive=Object.assign({},NUT_DEF.alaaArchive,(c||{}).alaaArchive||{});return o}
async function nutCfgInit(pw,saved){
  NUT.cfgState='بيحمّل الإعدادات…';NUT.cfg=nutMerge(null);
  try{const d=await jsonp({action:'getAll'},25000);const r=(d&&d.reasons)||{};
    let meta=null;try{meta=JSON.parse(r['FINCFG|meta']||'null')}catch(e){}
    if(meta&&meta.salt){NUT.cfgSalt=meta.salt;
      if(saved&&saved['cfg:'+meta.salt])NUT.cfgKey=await crypto.subtle.importKey('raw',b64(saved['cfg:'+meta.salt]),{name:'AES-GCM'},true,['encrypt','decrypt']);
      else if(pw)NUT.cfgKey=await cfgKeyFrom(pw,meta.salt);
      if(NUT.cfgKey){let ct='';for(let i=0;i<meta.n;i++)ct+=r['FINCFG|'+meta.slot+'|'+i]||'';
        const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(meta.iv)},NUT.cfgKey,b64(ct));NUT.cfg=nutMerge(JSON.parse(await ungz(new Uint8Array(pt))));NUT.slot=meta.slot;NUT.cfgState=''}
      else NUT.cfgState='الإعدادات مقفولة: اقفل الصفحة (🔒) وافتحها بالباسورد تاني علشان تشوف المرتبات وتعدّل.'}
    else{const salt=u8b64(crypto.getRandomValues(new Uint8Array(16)));NUT.cfgSalt=salt;if(pw)NUT.cfgKey=await cfgKeyFrom(pw,salt);
      NUT.cfgState=pw?'':'اقفل الصفحة وافتحها بالباسورد علشان تحفظ الإعدادات.'}
    if(NUT.cfgKey){try{const k=JSON.parse(sessionStorage.getItem('fin_k')||'null');if(k){k['cfg:'+NUT.cfgSalt]=u8b64(new Uint8Array(await crypto.subtle.exportKey('raw',NUT.cfgKey)));sessionStorage.setItem('fin_k',JSON.stringify(k))}}catch(e){}}
  }catch(e){NUT.cfgState='ما قدرتش أوصل لمكان حفظ الإعدادات — بيستخدم الافتراضي (الحفظ مش هيشتغل دلوقتي).'}
  NUT.data=null;if(S.tab==='nut')render();
}
async function nutCfgSave(btn){
  if(!NUT.cfgKey){alert(NUT.cfgState||'افتح الصفحة بالباسورد الأول');return}
  const old=btn?btn.textContent:'';if(btn){btn.disabled=true;btn.textContent='بيحفظ…'}
  try{const iv=crypto.getRandomValues(new Uint8Array(12));const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},NUT.cfgKey,await gz(JSON.stringify(NUT.cfg))));
    const s=u8b64(ct),slot=NUT.slot==='A'?'B':'A',CH=1500,n=Math.ceil(s.length/CH);
    for(let i=0;i<n;i++){if(btn)btn.textContent=`بيحفظ… ${i+1}/${n+1}`;await jsonp({action:'saveAction',reqId:'FINCFG|'+slot+'|'+i,decision:'config',reason:s.slice(i*CH,(i+1)*CH)})}
    await jsonp({action:'saveAction',reqId:'FINCFG|meta',decision:'config',reason:JSON.stringify({v:1,slot,n,salt:NUT.cfgSalt,iv:u8b64(iv),at:new Date().toISOString()})});
    NUT.slot=slot;NUT.dirty=false;NUT.data=null;if(btn)btn.textContent='✓ اتحفظ';setTimeout(()=>{if(btn){btn.disabled=false;btn.textContent=old}},1500);render()}
  catch(e){alert('ما اتحفظش — جرّب تاني');if(btn){btn.disabled=false;btn.textContent=old}}
}

// ---------------- classification ----------------
const NCAT=[['inj','حقن تخسيس',/مونجار|ويجوفي|ريتا|تيرز|mounjaro|wegovy/],['mezo','حقن ميزوثيرابي',/ميزو/],['exam','كشف تغذية',/^كشف (ال)?تغذيه/],
  ['fu','متابعة تغذية',/^م تغذيه|^م ت \d|^متابعه (ال)?تغذيه|^متابعه ت/],['dev','أجهزة تخسيس وبشرة',/راديوفريكونسي|كرايو|كافيتيشن|اكسيليس|excilis|بشره|اسكن|\bdo\b|كومبريشن|cryo|cavitation|\brf\b/],
  ['inbody','إنبدي',/انبدي|inbody/]];
const NCATN=Object.fromEntries(NCAT.map(c=>[c[0],c[1]]));NCATN.other='غير مصنف';
const DEVT=[['كافيتيشن',/كافيتيشن|cavitation/],['RF',/راديوفريكونسي|\brf\b|ار اف/],['كرايو بليد',/كرايو بليد|cryo.?blade/],['كرايو اير',/كرايو اير|cryo.?air/],['كرايو',/كرايو|cryo/],
  ['إكسيليس',/اكسيليس|excilis/],['DO',/\bdo\b/],['عناية بالبشرة',/بشره|اسكن|skin/],['كومبريشن',/كومبريشن/]];
const INJT=[['مونجارو',/مونجار|mounjaro|تيرز/],['ويجوفي',/ويجوفي|wegovy/],['ريتا',/ريتا/]];
const ncat=n=>{for(const c of NCAT)if(c[2].test(n))return c[0];return 'other'};
const XCLS={excl:['مستبعد',0],refund_nut:['مرتجع تغذية',1],refund_pt:['مرتجع علاج طبيعي',0],salary_agg:['مرتبات مجمعة (من ملفات المرتبات)',0],physio:['علاج طبيعي',0],
  inj_buy:['حقن تخسيس (مشتريات)',null],special:['خاص بالتغذية',1],adv:['مرتب/سلفة بنسبة الموظف',null],asset:['أصل ثابت (إهلاك)',null],shared:['مشترك (عام)',null]};
const R_AGG=/اجمالي رواتب شهر|رواتب فرع الهرم|مرتبات الموظفين|رواتب الموظفين/,R_PHY=/physitrack|حجام|kinesio|برافين|تيكار|شوك ويف|التراسوند|الترا ساوند|كمادات|اربطه|مستهلكات العلاج الطبيعي/,
  R_INJB=/مونجارو|مانجارو|\bmpc\b|تيرز|t-?patide|ويجوفي|ريتا/,R_MEZO=/ميزو|لوستر|luster|metabolites|glutathione/,
  R_SUP=/شيماء|نيوتري|vitalita|فيتاليتا|trilosvit|كويك سليم|whey|protix|فات زورب|ليبو|اسكنيم|prakuten|تولانجو/,R_DEVS=/كرايو|ار اف|ديرما|اسكن كير|سيرم|ماسك|عنايه بالبشره/;
function staffAt(k){return (NUT.cfg.staff||[]).filter(s=>(!s.from||k>=s.from)&&(!s.to||k<=s.to))}
function classify(x,ctx){
  const d=nAr([x.desc,x.sup,x.user].filter(Boolean).join(' ')),t=nAr(x.type),k=x.k;
  if(x.refunded)return ['excl',0,'سطر مسترد (Refunded)'];
  if(/الدقي/.test(d))return ['excl',0,'فيه كلمة «الدقي»'];
  if(/مردود/.test(t)){const m=ctx.refundMatch(x);return m.ok?['refund_nut',1,m.why]:['refund_pt',0,m.why]}
  if(R_AGG.test(d))return ['salary_agg',0,'إجمالي رواتب — بتتحسب من ملفات المرتبات'];
  const sal=/مرتب|راتب|رواتب|سلف/.test(t)||x.salAdj;
  if(sal&&/(^|\s)د(\s|\.)|دكتور|^د\.?\s/.test(d))return ['physio',0,'مرتب دكتور'];
  if(R_PHY.test(d))return ['physio',0,'مستلزمات علاج طبيعي'];
  if(R_INJB.test(d)&&!/ميزو/.test(d))return ['inj_buy',1,'شراء حقن تخسيس'];
  if(R_MEZO.test(d))return ['special',1,'ميزوثيرابي'];
  if(R_SUP.test(d))return ['special',1,'مكملات / أدوية تخسيس'];
  if(R_DEVS.test(d))return ['special',1,'مستلزمات أجهزة النحت والبشرة'];
  if(sal){const un=nAr(x.user||'');const st=staffAt(k).find(s=>(s.ar&&d.includes(nAr(s.ar)))||(un&&s.en&&un.includes(nAr(s.en).split(' ')[0])));if(st)return ['adv',+st.share||0,`مرتب/سلفة ${st.ar} (${st.role}) × ${pc(+st.share||0)}`];
    return ['adv',NUT.cfg.shareGen,'مرتب/سلفة موظف تاني × '+pc(NUT.cfg.shareGen)]}
  if(/اصول ثابت|أصول ثابت|اصل ثابت/.test(t))return ['asset',NUT.cfg.assetShare,'أصل ثابت — إهلاك على '+NUT.cfg.assetLife+' شهر'];
  return ['shared',NUT.cfg.sharedPct,'مصروف مشترك × '+pc(NUT.cfg.sharedPct)];
}

// ---------------- build ----------------
function nutBuild(){
  if(NUT.data)return NUT.data;const C=NUT.cfg||nutMerge(null);NUT.cfg=C;
  const K=RAW.kinds||{},ops=[],dokki=[],oth=[];
  for(const m in (K.ops&&K.ops.all)||{}){const t=K.ops.all[m];if(!t||!t.cols)continue;
    const c=pick(t.cols,{name:['name'],end:['end'],cr:['createdAt'],st:['status'],tot:['total'],paid:['paid'],disc:['discount'],op:['operation.name'],doc:['doctor.name'],pid:['patient.referenceId'],fn:['patient.firstName'],ln:['patient.lastName'],br:['branch.name']});
    const rows=t.rows.map(r=>({r,paid:num(r,c.paid),tot:num(r,c.tot),disc:num(r,c.disc)}));
    const rat=rows.filter(x=>x.paid>0&&x.tot-x.disc>0).map(x=>(x.tot-x.disc)/x.paid).sort((a,b)=>a-b);const med=rat.length?rat[rat.length>>1]:1;const sc=med>=50&&med<=200?100:1;
    for(const x of rows){const r=x.r;const ce=cairo(c.end>=0?r[c.end]:null);if(!ce)continue;const name=nm(r,c.name),n=nAr(name);
      const o={k:ce[0].slice(0,7),d:ce[0],cr:(cairo(c.cr>=0?r[c.cr]:null)||[''])[0],name,n,op:nAr(nm(r,c.op)),st:nm(r,c.st),paid:x.paid,tot:x.tot/sc,doc:nm(r,c.doc),pid:nm(r,c.pid),pn:(nm(r,c.fn)+' '+nm(r,c.ln)).trim()};
      o.disc=Math.max(0,o.tot-o.paid);o.cat=ncat(n);
      if(o.cat==='dev')o.dev=(DEVT.find(z=>z[1].test(n))||['أخرى'])[0];
      if(o.cat==='inj')o.inj=(INJT.find(z=>z[1].test(n))||['أخرى'])[0];
      if(/REJECT|CANCEL/i.test(o.st))continue;
      if(/FIX ?ZONE/i.test(nm(r,c.br)))dokki.push(o);else if(o.cat==='other')oth.push(o);else ops.push(o)}}
  // expenses (accrued "Expenses"; falls back to expense payments for months without it)
  const xs=[],xpH=(K.xp&&K.xp.haram)||{};
  for(const m in xpH){const t=xpH[m];if(!t||!t.cols||!t.rows.length)continue;
    const c=pick(t.cols,{desc:['name','description'],det:['details'],type:['type','expenseType','type.name'],amt:['amount'],paid:['paid'],date:['date','createdAt'],ref:['refunded'],br:['branch.name'],user:['user.name'],sup:['supplier.name'],sal:['salaryAdjustment.id']});
    for(const r of t.rows){const cd=cairo(c.date>=0?r[c.date]:null);if(!cd)continue;
      xs.push({k:cd[0].slice(0,7),d:cd[0],desc:[nm(r,c.desc),nm(r,c.det)].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' — '),user:nm(r,c.user),sup:nm(r,c.sup),salAdj:!!nm(r,c.sal),type:eName(nm(r,c.type)),amt:num(r,c.amt),paid:c.paid>=0?num(r,c.paid):num(r,c.amt),refunded:truthy(r[c.ref]),src:'Expenses'})}}
  const xpMonths=new Set(xs.map(x=>x.k));
  for(const e of D.exp)if(e.b==='haram'&&!xpMonths.has(e.k))xs.push({k:e.k,d:e.d,desc:e.info,type:e.type,amt:e.amt,paid:e.amt,refunded:false,src:'Expense payments'});
  // refund rule 4.1
  const byName={};for(const o of ops){if(!o.pn)continue;const key=nAr(o.pn).split(' ').slice(0,2).join(' ');(byName[key]=byName[key]||{pid:o.pid,days:[]}).days.push(o.d)}
  const PHY=new Set(['Enum1','Enum5','Enum13','Enum12','Enum40','Enum11','Enum14','Enum29','Enum10','Enum37','Enum38','Enum32','Enum17','Enum41','Enum42','Enum8','Enum15']);
  const phyPids=new Set(D.apt.filter(a=>a.b==='haram'&&a.st==='Completed'&&PHY.has(a.type)).map(a=>a.pid));
  const ctx={refundMatch(x){const d=nAr(x.desc);const hit=Object.keys(byName).find(n=>n.length>4&&d.includes(n));
    if(!hit)return {ok:false,why:'المريض مش في عمليات التغذية'};const p=byName[hit],t0=Date.parse(x.d);
    if(!p.days.some(z=>{const dd=(Date.parse(z)-t0)/864e5;return dd>=-60&&dd<=30}))return {ok:false,why:hit+': مالوش جلسة تغذية من 60 يوم قبل لـ 30 يوم بعد'};
    if(phyPids.has(p.pid))return {ok:false,why:hit+': مريض علاج طبيعي كمان'};return {ok:true,why:hit+': مريض تغذية بس وله جلسة قريبة'}}};
  for(const x of xs){x.key=(x.d+'|'+Math.round(x.amt)+'|'+nAr(x.desc).slice(0,40));const [cl,sh,why]=classify(x,ctx);x.cls=cl;x.share=sh;x.why=why;
    const ov=C.overrides[x.key];if(ov){x.cls=ov.cls;x.share=+ov.share;x.why='تعديل يدوي'+(ov.note?' — '+ov.note:'');x.ov=1}}
  NUT.data={ops,dokki,oth,xs,phyPids};return NUT.data;
}
const nIn=(k,a,b)=>k>=a&&k<=b;
function payrollAt(k){const C=NUT.cfg,P=C.payroll||{};const have=Object.keys(P).filter(m=>P[m]&&Object.keys(P[m]).length).sort();
  if(P[k]&&Object.keys(P[k]).length)return {map:P[k],est:false};if(!have.length)return {map:{},est:true,none:true};
  const sum={},cnt={};have.forEach(m=>{for(const n in P[m]){sum[n]=(sum[n]||0)+(+P[m][n]||0);cnt[n]=(cnt[n]||0)+1}});const avg={};for(const n in sum)avg[n]=sum[n]/cnt[n];return {map:avg,est:true}}
function salaryShare(k){const pr=payrollAt(k),rows=[];let tot=0;
  for(const s of staffAt(k)){const en=nAr(s.en),ar=nAr(s.ar);const key=Object.keys(pr.map).find(n=>{const x=nAr(n);return (en&&(x===en||x.startsWith(en.split(' ')[0]+' ')&&en.split(' ').length===1||x.includes(en)))||(ar&&x.includes(ar))});
    const g=key?+pr.map[key]||0:0;const v=g*(+s.share||0);tot+=v;rows.push({n:s.ar,en:s.en,role:s.role,share:+s.share||0,gross:g,v,found:!!key})}
  return {tot,rows,est:pr.est,none:pr.none}}
function injRatio(k){const C=NUT.cfg,{ops,xs}=nutBuild();
  const buy=f=>xs.filter(x=>x.cls==='inj_buy'&&f(x.k)).reduce((s,x)=>s+x.amt,0),rev=f=>ops.filter(o=>o.cat==='inj'&&f(o.k)).reduce((s,o)=>s+o.paid,0);
  if(C.injMode==='manual')return +C.injManual||0;
  if(C.injMode==='all'){const r=rev(()=>true);return r?buy(()=>true)/r:0}
  const a=shiftK(k,-11),r=rev(m=>m>=a&&m<=k);return r?buy(m=>m>=a&&m<=k)/r:0}
function nutMonth(k){const C=NUT.cfg,{ops,xs}=nutBuild();
  const O=ops.filter(o=>o.k===k),X=xs.filter(x=>x.k===k);
  const byC={};NCAT.forEach(c=>byC[c[0]]={n:0,paid:0,tot:0,disc:0});O.forEach(o=>{const b=byC[o.cat];b.n++;b.paid+=o.paid;b.tot+=o.tot;b.disc+=o.disc});
  const rev=O.reduce((s,o)=>s+o.paid,0),injRev=byC.inj.paid;
  const injBuy=X.filter(x=>x.cls==='inj_buy').reduce((s,x)=>s+x.amt,0);
  const ratio=C.injMode==='purchase'?null:injRatio(k);const injCost=C.injMode==='purchase'?injBuy:ratio*injRev;
  const special=X.filter(x=>x.cls==='special'||x.cls==='refund_nut').reduce((s,x)=>s+x.amt*(x.share??1),0);
  const adv=X.filter(x=>x.cls==='adv').reduce((s,x)=>s+x.amt*x.share,0);
  const sal=salaryShare(k);const devDep=k>=(C.deviceDepFrom||'0')?+C.deviceDep||0:0;
  const life=+C.assetLife||60;const genDep=xs.filter(x=>x.cls==='asset'&&x.k<=k&&k<shiftK(x.k,life)).reduce((s,x)=>s+x.amt/life,0);
  const sharedBase=X.filter(x=>x.cls==='shared').reduce((s,x)=>s+x.amt,0);
  const specTot=injCost+special+adv+sal.tot+devDep;const general=(+C.sharedPct||0)*sharedBase+(+C.assetShare||0)*genDep;
  const before=rev-specTot-general;const alaa=k>=C.alaaFrom?(+C.alaaRate||0)*rev:null;const after=alaa==null?null:before-alaa;
  const pts=new Set(O.map(o=>o.pid).filter(Boolean)).size;
  return {k,byC,rev,injRev,injBuy,ratio,injCost,special,adv,sal,devDep,genDep,sharedBase,specTot,general,before,alaa,after,margin:rev&&after!=null?after/rev:(rev?before/rev:null),
    pts,noX:!X.length,disc:O.reduce((s,o)=>s+o.disc,0),tot:O.reduce((s,o)=>s+o.tot,0),X}}

// ---------------- views ----------------
const NSUB=[['sum','ملخص الشهر'],['rev','الإيراد'],['exp','المصروفات'],['pl','الربح'],['inj','الحقن'],['pts','المرضى والمتابعات'],['dev','الأجهزة'],['alaa','مستحقات د. آلاء'],['price','أثر الأسعار'],['cfg','الإعدادات']];
function vNut(){if(!(RAW.kinds||{}).ops)return '<div class="card">بيانات عمليات التغذية لسه بتتسحب — جرّب كمان شوية.</div>';
  const top=`<div class="tabs" id="nsub" style="border:0;margin-bottom:8px">${NSUB.map(([k,t])=>`<button data-n="${k}" class="${NUT.sub===k?'on':''}">${t}</button>`).join('')}</div>
   <div class="note" style="margin-bottom:10px">🥗 قسم التغذية — <b>فرع الهرم بس</b>. ${NUT.sub==='sum'||NUT.sub==='alaa'?'الشهر = «لحد» اللي فوق':'الفترة = «من» و«لحد» اللي فوق'}. ${NUT.cfgState?'<span class="chip w">'+esc(NUT.cfgState)+'</span>':''}</div>`;
  const f={sum:nSum,rev:nRev,exp:nExp,pl:nPL,inj:nInj,pts:nPts,dev:nDev,alaa:nAlaa,price:nPrice,cfg:nCfg}[NUT.sub]||nSum;return top+f()}
function cNut(){document.querySelectorAll('#nsub button').forEach(b=>b.onclick=()=>{NUT.sub=b.dataset.n;try{localStorage.setItem('fin_nsub',NUT.sub)}catch(e){}render()});
  const f={sum:cnSum,rev:cnRev,exp:cnExp,pl:cnPL,inj:cnInj,pts:cnPts,dev:cnDev,alaa:cnAlaa,price:null,cfg:cnCfg}[NUT.sub];if(f)f()}
try{const s=localStorage.getItem('fin_nsub');if(s)NUT.sub=s}catch(e){}
const nMonths=()=>monthsList(S.from,S.to);
function nAlerts(M){const C=NUT.cfg,a=[];if(M.rev&&M.injRev/M.rev>C.alertInjShare)a.push(`الحقن ${pc(M.injRev/M.rev)} من الإيراد — أعلى من ${pc(C.alertInjShare)}`);
  const di=M.byC.inj,dd=M.byC.dev;if(di.tot&&di.disc/di.tot>C.alertInjDisc)a.push(`خصم الحقن ${pc(di.disc/di.tot)} — أعلى من ${pc(C.alertInjDisc)}`);
  if(dd.tot&&dd.disc/dd.tot>C.alertDevDisc)a.push(`خصم الأجهزة ${pc(dd.disc/dd.tot)} — أعلى من ${pc(C.alertDevDisc)}`);
  if(M.noX)a.push('مصروفات الشهر لسه مش موجودة — الربح «غير مكتمل»');if(M.sal.none)a.push('مفيش ملفات مرتبات مرفوعة — نصيب الرواتب = صفر لحد ما ترفعها من الإعدادات');else if(M.sal.est)a.push('ملف مرتبات الشهر مش مرفوع — الرواتب «تقديري» (متوسط الشهور المرفوعة)');
  return a}
function nSum(){const k=S.to,M=nutMonth(k),P=nutMonth(shiftK(k,-1));const al=nAlerts(M);const est=M.sal.est?' <span class="chip w">تقديري</span>':'';
  return `${al.length?`<div class="note" style="margin-bottom:10px;border-inline-start:4px solid var(--warn)">${al.map(x=>'⚠️ '+esc(x)).join('<br>')}</div>`:''}
  <div class="grid g4">${kpi('إيراد القسم — '+ml(k),fm(M.rev),'مقارنة بـ'+ml(P.k)+' '+delta(M.rev,P.rev))}${kpi('المصروفات الخاصة',fm(M.specTot),'حقن '+fm(M.injCost)+' · رواتب '+fm(M.sal.tot)+est)}
   ${kpi('نصيب المصروفات العامة',fm(M.general))}${kpi('صافي قبل راتب د. آلاء',fm(M.before),M.noX?'<span class="chip w">غير مكتمل</span>':delta(M.before,P.before),M.before<0?'down':'')}
   ${kpi('راتب د. آلاء',M.alaa==null?'—':fm(M.alaa),M.alaa==null?'قبل '+ml(NUT.cfg.alaaFrom)+': نظام الـ50%':pc(NUT.cfg.alaaRate)+' من الإيراد')}${kpi('صافي بعد راتبها',M.after==null?'—':fm(M.after),'هامش '+pc(M.margin),M.after<0?'down':'')}
   ${kpi('مرضى نشطين',fm(M.pts),M.pts?'إيراد المريض '+fm(M.rev/M.pts):'')}${kpi('نسبة الحقن من الإيراد',pc(M.rev?M.injRev/M.rev:null),'تكلفتها '+pc(M.rev?M.injCost/M.rev:null)+' من الإيراد')}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>الإيراد حسب الفئة<small>${ml(k)}</small></h3><div class="ch sm"><canvas id="nS1"></canvas></div></div>
  <div class="card"><h3>صافي الربح شهري<small>قبل وبعد راتب د. آلاء</small></h3><div class="ch sm"><canvas id="nS2"></canvas></div></div></div>`}
function cnSum(){const M=nutMonth(S.to),c=SER(),cs=NCAT.map(x=>x[0]);
  chart('nS1',{type:'doughnut',data:{labels:cs.map(x=>NCATN[x]),datasets:[{data:cs.map(x=>M.byC[x].paid),backgroundColor:c.slice(0,cs.length),borderColor:css('--s1'),borderWidth:2}]},options:{plugins:{tooltip:{callbacks:{label:x=>' '+x.label+': '+fm(x.parsed)}}}}});
  const ks=monthsList(shiftK(S.to,-11),S.to),R=ks.map(nutMonth);chart('nS2',{data:{labels:ks.map(mls),datasets:[bar('قبل راتب د. آلاء',R.map(r=>r.before),c[0]),bar('بعد راتبها',R.map(r=>r.after),c[2])]}})}
function nRev(){const ks=nMonths(),R=ks.map(nutMonth);const T={};NCAT.forEach(c=>T[c[0]]={n:0,paid:0,tot:0,disc:0});R.forEach(r=>NCAT.forEach(c=>{for(const f in T[c[0]])T[c[0]][f]+=r.byC[c[0]][f]}));
  const tot=Object.values(T).reduce((s,x)=>s+x.paid,0);const {oth}=nutBuild();const O=oth.filter(o=>nIn(o.k,S.from,S.to));
  const og={};O.forEach(o=>{const g=og[o.name]=og[o.name]||{n:0,paid:0};g.n++;g.paid+=o.paid});
  return `<div class="card"><h3>الإيراد حسب الفئة شهري<small>المدفوع فعلاً</small></h3><div class="ch lg"><canvas id="nR1"></canvas></div></div>
  <div class="card" style="margin-top:12px"><h3>الفئات والخصومات<small>${ml(S.from)} لـ ${ml(S.to)}</small></h3>${tableHTML(['الفئة',{t:'عدد',n:1},{t:'قبل الخصم',n:1},{t:'المدفوع',n:1},{t:'النسبة من الإيراد',n:1},{t:'الخصم',n:1},{t:'نسبة الخصم',n:1}],
    NCAT.map(c=>{const x=T[c[0]];return [c[1],x.n,x.tot,x.paid,pc(tot?x.paid/tot:null),x.disc,pc(x.tot?x.disc/x.tot:null)]}).concat([Object.assign(['الإجمالي',Object.values(T).reduce((s,x)=>s+x.n,0),Object.values(T).reduce((s,x)=>s+x.tot,0),tot,'100%',Object.values(T).reduce((s,x)=>s+x.disc,0),''],{_c:'tot'})]))}</div>
  <div class="card" style="margin-top:12px"><h3>خدمات غير مصنفة<small>مش محسوبة في الإيراد — راجعها</small></h3>${O.length?tableHTML(['الخدمة',{t:'عدد',n:1},{t:'المدفوع',n:1}],Object.entries(og).sort((a,b)=>b[1].paid-a[1].paid).map(([n,g])=>[esc(n),g.n,g.paid]),{h:300}):'<span class="muted">مفيش ✓</span>'}</div>`}
function cnRev(){const ks=nMonths(),R=ks.map(nutMonth),c=SER();chart('nR1',{data:{labels:ks.map(mls),datasets:NCAT.map((x,i)=>bar(x[1],R.map(r=>r.byC[x[0]].paid),c[i],{stack:'s',borderRadius:0}))},options:{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true,ticks:{callback:v=>fm(v)}}}}})}
function nExp(){const {xs}=nutBuild();const X=xs.filter(x=>nIn(x.k,S.from,S.to)).sort((a,b)=>a.d<b.d?1:-1);
  const g={};X.forEach(x=>{const z=g[x.cls]=g[x.cls]||{n:0,amt:0,on:0};z.n++;z.amt+=x.amt;z.on+=x.cls==='inj_buy'?0:x.amt*(x.share||0)});
  return `<div class="card"><h3>المصروفات حسب التصنيف<small>${ml(S.from)} لـ ${ml(S.to)}</small></h3>${tableHTML(['التصنيف',{t:'سطور',n:1},{t:'المبلغ',n:1},{t:'على التغذية',n:1}],Object.entries(g).sort((a,b)=>b[1].amt-a[1].amt).map(([c,z])=>[esc(XCLS[c][0]),z.n,z.amt,c==='inj_buy'?'حسب طريقة تكلفة الحقن':c==='asset'?'إهلاك شهري':z.on]))}</div>
  <div class="card" style="margin-top:12px"><h3>كل السطور وتصنيفها<small>غيّر التصنيف من القايمة — ويتحفظ لما تدوس «احفظ»</small></h3>
   <div class="bar"><input type="search" id="nxQ" placeholder="دوّر" style="flex:1"><button class="pri" id="nxSave">💾 احفظ التعديلات</button></div><div id="nxT"></div></div>`}
function cnExp(){const draw=()=>{const q=nAr($('#nxQ').value);const {xs}=nutBuild();const X=xs.filter(x=>nIn(x.k,S.from,S.to)&&(!q||nAr(x.desc+' '+x.type+' '+XCLS[x.cls][0]).includes(q))).sort((a,b)=>a.d<b.d?1:-1).slice(0,600);
    $('#nxT').innerHTML=tableHTML(['التاريخ','الوصف','النوع',{t:'المبلغ',n:1},'','التصنيف',{t:'النسبة',n:1},'السبب'],X.map(x=>[x.d,esc(x.desc)+(x.user||x.sup?` <span class="muted">(${esc(x.user||x.sup)})</span>`:''),esc(x.type),x.amt,x.paid<x.amt-0.5?'<span class="chip w">غير مدفوع</span>':'',
      `<select data-xk="${esc(x.key)}" style="max-width:190px">${Object.entries(XCLS).map(([c,v])=>`<option value="${c}"${c===x.cls?' selected':''}>${v[0]}</option>`).join('')}</select>`,
      `<input data-xs="${esc(x.key)}" type="number" step="0.05" min="0" max="1" value="${x.share??''}" style="width:64px">`,(x.ov?'✏️ ':'')+esc(x.why)]),{h:560});
    document.querySelectorAll('[data-xk]').forEach(s=>s.onchange=()=>{const k=s.dataset.xk,d=XCLS[s.value][1];const inp=document.querySelector(`[data-xs="${CSS.escape(k)}"]`);if(d!=null&&inp)inp.value=d;nutOv(k,s.value,inp?inp.value:d)});
    document.querySelectorAll('[data-xs]').forEach(i=>i.onchange=()=>{const k=i.dataset.xs,s=document.querySelector(`[data-xk="${CSS.escape(k)}"]`);nutOv(k,s.value,i.value)})};
  $('#nxQ').oninput=draw;$('#nxSave').onclick=e=>nutCfgSave(e.currentTarget);draw()}
function nutOv(k,cls,share){NUT.cfg.overrides[k]={cls,share:+share||0};NUT.dirty=true;NUT.data=null}
function nPL(){const ks=nMonths(),R=ks.map(nutMonth);const row=r=>[ml(r.k),r.rev,r.injCost,r.special,r.adv,fm(r.sal.tot)+(r.sal.est?' *':''),r.devDep,r.specTot,r.general,r.before,r.alaa==null?'—':r.alaa,r.after==null?'—':r.after,pc(r.margin)+(r.noX?' ⚠️':'')];
  const T=R.reduce((t,r)=>{['rev','injCost','special','adv','devDep','specTot','general','before'].forEach(f=>t[f]+=r[f]);t.sal+=r.sal.tot;t.alaa+=r.alaa||0;t.after+=r.after==null?r.before:r.after;return t},{rev:0,injCost:0,special:0,adv:0,devDep:0,specTot:0,general:0,before:0,sal:0,alaa:0,after:0});
  return `<div class="card"><h3>قائمة الدخل الشهرية — التغذية</h3>${tableHTML(['الشهر',{t:'الإيراد',n:1},{t:'تكلفة الحقن',n:1},{t:'خاص (ميزو/مكملات/مستلزمات/مرتجعات)',n:1},{t:'سلف بالنسب',n:1},{t:'نصيب الرواتب',n:1},{t:'إهلاك أجهزة',n:1},{t:'إجمالي الخاص',n:1},{t:'نصيب العام',n:1},{t:'صافي قبل د. آلاء',n:1},{t:'راتب د. آلاء',n:1},{t:'صافي بعد',n:1},{t:'الهامش',n:1}],
    R.map(row).concat([Object.assign(['الإجمالي',T.rev,T.injCost,T.special,T.adv,T.sal,T.devDep,T.specTot,T.general,T.before,T.alaa,T.after,pc(T.rev?T.after/T.rev:null)],{_c:'tot'})]))}
   <div class="note" style="margin-top:8px">* رواتب تقديرية (ملف الشهر مش مرفوع). ⚠️ مصروفات الشهر مش موجودة. «صافي بعد» في الإجمالي = قبل راتبها للشهور اللي قبل ${ml(NUT.cfg.alaaFrom)}.</div>
   <div class="bar" style="margin-top:8px"><button id="nplX">📗 نزّل Excel (قائمة الدخل + حساب د. آلاء + المصروفات)</button></div></div>
  <div class="card" style="margin-top:12px"><h3>ترند آخر 12 شهر</h3><div class="ch"><canvas id="nP1"></canvas></div></div>`}
function cnPL(){const ks=monthsList(shiftK(S.to,-11),S.to),R=ks.map(nutMonth),c=SER();
  chart('nP1',{data:{labels:ks.map(mls),datasets:[bar('الإيراد',R.map(r=>r.rev),c[0]),bar('إجمالي المصروفات',R.map(r=>r.specTot+r.general),c[1]),line('صافي قبل د. آلاء',R.map(r=>r.before),c[2])]}});
  $('#nplX').onclick=nutExcel}
function nInj(){const ks=nMonths(),R=ks.map(nutMonth);const {ops,xs}=nutBuild();const O=ops.filter(o=>(o.cat==='inj'||o.cat==='mezo')&&nIn(o.k,S.from,S.to));
  const ty={};O.forEach(o=>{const t=o.cat==='mezo'?'ميزوثيرابي':o.inj;const g=ty[t]=ty[t]||{n:0,paid:0,disc:0,tot:0};g.n++;g.paid+=o.paid;g.disc+=o.disc;g.tot+=o.tot});
  const buyAll=xs.filter(x=>x.cls==='inj_buy').reduce((s,x)=>s+x.amt,0),revAll=ops.filter(o=>o.cat==='inj').reduce((s,o)=>s+o.paid,0);
  const L=R[R.length-1];
  return `<div class="grid g4">${kpi('إيراد حقن التخسيس',fm(R.reduce((s,r)=>s+r.injRev,0)),fm(O.filter(o=>o.cat==='inj').length)+' حقنة')}${kpi('تكلفة الحقن (محسوبة)',fm(R.reduce((s,r)=>s+r.injCost,0)),'الطريقة: '+{r12:'آخر 12 شهر',all:'الفترة كلها',manual:'رقم يدوي',purchase:'حسب الشراء'}[NUT.cfg.injMode])}
   ${kpi('نسبة التكلفة — '+ml(L.k),pc(L.ratio),'الفترة كلها '+pc(revAll?buyAll/revAll:null))}${kpi('مشتريات الحقن في الفترة',fm(R.reduce((s,r)=>s+r.injBuy,0)))}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>حسب النوع</h3>${tableHTML(['النوع',{t:'عدد',n:1},{t:'المدفوع',n:1},{t:'الخصم',n:1},{t:'نسبة الخصم',n:1}],Object.entries(ty).sort((a,b)=>b[1].paid-a[1].paid).map(([t,g])=>[t,g.n,g.paid,g.disc,pc(g.tot?g.disc/g.tot:null)]))}</div>
  <div class="card"><h3>تكلفة الحقن ÷ إيرادها و÷ إجمالي الإيراد</h3><div class="ch sm"><canvas id="nI1"></canvas></div></div></div>
  <div class="card" style="margin-top:12px"><h3>شهري</h3>${tableHTML(['الشهر',{t:'إيراد الحقن',n:1},{t:'نسبتها من الإيراد',n:1},{t:'مشتريات',n:1},{t:'نسبة التكلفة',n:1},{t:'التكلفة',n:1},{t:'التكلفة ÷ إجمالي الإيراد',n:1}],R.map(r=>[ml(r.k),r.injRev,pc(r.rev?r.injRev/r.rev:null),r.injBuy,r.ratio==null?'—':pc(r.ratio),r.injCost,pc(r.rev?r.injCost/r.rev:null)]))}</div>`}
function cnInj(){const ks=nMonths(),R=ks.map(nutMonth),c=SER();chart('nI1',{type:'line',data:{labels:ks.map(mls),datasets:[line('÷ إيراد الحقن %',R.map(r=>r.injRev?+(100*r.injCost/r.injRev).toFixed(1):null),c[0]),line('÷ إجمالي الإيراد %',R.map(r=>r.rev?+(100*r.injCost/r.rev).toFixed(1):null),c[1])]},options:{scales:{y:{ticks:{callback:v=>v+'%'}}},plugins:{tooltip:{callbacks:{label:x=>' '+x.dataset.label+': '+x.parsed.y+'%'}}}}})}
function nPtsData(){const {ops}=nutBuild();const byP={};ops.forEach(o=>{if(!o.pid)return;(byP[o.pid]=byP[o.pid]||{pid:o.pid,n:o.pn,steps:[]}).steps.push(o)});
  for(const p of Object.values(byP)){p.steps.sort((a,b)=>a.d<b.d?-1:1);p.first=p.steps[0].d;p.last=p.steps[p.steps.length-1].d;p.months=new Set(p.steps.map(s=>s.k))}return byP}
function nPts(){const ks=nMonths(),byP=nPtsData(),{ops}=nutBuild(),P=Object.values(byP);const today=new Date().toISOString().slice(0,10);
  const rows=ks.map(k=>{const act=P.filter(p=>p.months.has(k)),prev=P.filter(p=>p.months.has(shiftK(k,-1)));const ex=ops.filter(o=>o.k===k&&o.cat==='exam');
    const conv=ex.filter(e=>(byP[e.pid]?.steps||[]).some(s=>s!==e&&(s.cat==='fu'||s.cat==='inj')&&((s.cr&&s.cr>=e.d&&(Date.parse(s.cr)-Date.parse(e.d))/864e5<=7)||(s.d>=e.d&&(Date.parse(s.d)-Date.parse(e.d))/864e5<=7))));
    const ret=prev.length?prev.filter(p=>p.months.has(k)).length/prev.length:null;return [ml(k),ex.length,pc(ex.length?conv.length/ex.length:null),act.length,pc(ret)]});
  const pk={};ops.filter(o=>o.cat==='fu'&&nIn(o.k,S.from,S.to)).forEach(o=>{const id=o.pid+'|'+o.op+'|'+(o.cr||'').slice(0,10);if(pk[id])return;const m=(o.op.match(/(?<!\d)(4|8|12)(?!\d)/)||[])[1];pk[id]=m?'باقة '+m:'فردي'});
  const pd={};Object.values(pk).forEach(v=>pd[v]=(pd[v]||0)+1);
  const exP=P.filter(p=>p.steps.some(s=>s.cat==='exam'&&nIn(s.k,S.from,S.to)));const fuN=p=>p.steps.filter(s=>s.cat==='fu').length;
  const fun=[1,3,6].map(n=>exP.length?exP.filter(p=>fuN(p)>=n).length/exP.length:null);
  const done=P.filter(p=>(Date.parse(today)-Date.parse(p.last))/864e5>45);const dur=done.length?done.reduce((s,p)=>s+p.months.size,0)/done.length:null;
  const drop=P.filter(p=>{const g=(Date.parse(today)-Date.parse(p.last))/864e5;return g>=21&&g<=120}).sort((a,b)=>a.last<b.last?1:-1).slice(0,80);
  const src={};const firstInv={};D.inv.filter(x=>x.b==='haram'&&x.src).forEach(x=>{if(!firstInv[x.pid]||x.d<firstInv[x.pid].d)firstInv[x.pid]=x});exP.forEach(p=>{const s=(firstInv[p.pid]||{}).src||'مش متسجل';src[s]=(src[s]||0)+1});
  const AP=D.apt.filter(a=>a.b==='haram'&&inR(a)),on=AP.filter(a=>a.type==='Enum4'&&a.st==='Completed').length,off=AP.filter(a=>a.type==='Enum3'&&a.st==='Completed').length;
  const al=AP.filter(a=>/الاء|آلاء|alaa|حرفوش/i.test(a.doc)),alC=al.filter(a=>/cancel/i.test(a.st)).length,alN=al.filter(a=>/no ?show/i.test(a.st)).length;
  const nutP=new Set(P.filter(p=>p.steps.some(s=>nIn(s.k,S.from,S.to))).map(p=>p.pid));const phy=new Set(AP.filter(a=>a.st==='Completed'&&NUT.data.phyPids.has(a.pid)).map(a=>a.pid));
  const both=[...nutP].filter(x=>phy.has(x)).length;
  const debt=D.inv.filter(x=>x.b==='haram'&&/الاء|آلاء|alaa|حرفوش/i.test(x.doc)).map(x=>Object.assign({},x,{rem:x.total-x.disc-x.paid})).filter(x=>x.rem>1);
  return `<div class="grid g4">${kpi('رحلة المريض: كمّل متابعة واحدة',pc(fun[0]),'من '+fm(exP.length)+' مريض عمل كشف في الفترة')}${kpi('كمّل ٣ متابعات',pc(fun[1]))}${kpi('كمّل ٦ متابعات',pc(fun[2]))}${kpi('متوسط مدة الاستمرار',dur==null?'—':fm(dur,1)+' شهر','للي خلّصوا (آخر جلسة من +45 يوم)')}
   ${kpi('أونلاين / حضوري',fm(on)+' / '+fm(off),'متابعات مكتملة في الفترة')}${kpi('إلغاء / غياب مواعيد د. آلاء',pc(al.length?alC/al.length:null)+' / '+pc(al.length?alN/al.length:null),fm(al.length)+' موعد')}
   ${kpi('مرضى تغذية عملوا علاج طبيعي',pc(nutP.size?both/nutP.size:null),fm(both)+' من '+fm(nutP.size))}${kpi('باقي على مرضى د. آلاء',fm(debt.reduce((s,x)=>s+x.rem,0)),fm(debt.length)+' فاتورة')}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>الكشوفات والتحويل والاحتفاظ</h3>${tableHTML(['الشهر',{t:'كشوفات جديدة',n:1},{t:'اتحوّل لباقة/حقنة خلال ٧ أيام',n:1},{t:'مرضى نشطين',n:1},{t:'رجعوا من الشهر اللي فات',n:1}],rows,{h:420})}</div>
   <div class="card"><h3>المرضى النشطين والكشوفات</h3><div class="ch"><canvas id="nM1"></canvas></div></div>
   <div class="card"><h3>توزيع الباقات<small>الهدف: نزوّد باقة 12</small></h3>${tableHTML(['الباقة',{t:'عدد',n:1},{t:'النسبة',n:1}],Object.entries(pd).sort((a,b)=>b[1]-a[1]).map(([k,v])=>[k,v,pc(v/Object.values(pd).reduce((s,x)=>s+x,0))]))}<div class="muted" style="font-size:.75rem;margin-top:6px">من اسم العملية (4/8/12) — اللي مالوش رقم = فردي.</div></div>
   <div class="card"><h3>مصادر الإحالة<small>للي عملوا كشف في الفترة</small></h3>${tableHTML(['المصدر',{t:'مرضى',n:1}],Object.entries(src).sort((a,b)=>b[1]-a[1]))}</div></div>
  <div class="card" style="margin-top:12px"><h3>وقفوا ومحتاجين مكالمة<small>آخر جلسة من 21 لـ 120 يوم</small></h3>${tableHTML(['المريض','رقم','آخر خدمة','آخر جلسة',{t:'جلسات',n:1}],drop.map(p=>[esc(p.n),esc(p.pid),esc(p.steps[p.steps.length-1].name),p.last,p.steps.length]),{h:400})}</div>`}
function cnPts(){const ks=nMonths(),byP=nPtsData(),P=Object.values(byP),{ops}=nutBuild(),c=SER();
  chart('nM1',{data:{labels:ks.map(mls),datasets:[bar('كشوفات',ks.map(k=>ops.filter(o=>o.k===k&&o.cat==='exam').length),c[1]),line('مرضى نشطين',ks.map(k=>P.filter(p=>p.months.has(k)).length),c[0])]}})}
function nDev(){const ks=nMonths(),{ops}=nutBuild(),O=ops.filter(o=>o.cat==='dev');const DV=DEVT.map(d=>d[0]).concat(['أخرى']).filter(d=>O.some(o=>o.dev===d));
  const rows=ks.map(k=>{const x=O.filter(o=>o.k===k);return [ml(k),...DV.map(d=>x.filter(o=>o.dev===d).length),x.length,x.reduce((s,o)=>s+o.paid,0),x.reduce((s,o)=>s+o.disc,0)]});
  const M=ks.map(nutMonth);const L=M[M.length-1],Pv=M[M.length-2];
  const inR_=O.filter(o=>nIn(o.k,S.from,S.to)),mainP=new Set(ops.filter(o=>(o.cat==='inj'||o.cat==='fu')&&nIn(o.k,S.from,S.to)).map(o=>o.pid)),devP=new Set(inR_.map(o=>o.pid));
  const cnt=k=>O.filter(o=>o.k===k).length;
  return `<div class="grid g4">${kpi('جلسات الأجهزة — '+ml(S.to),fm(cnt(S.to)),'الشهر اللي فات '+delta(cnt(S.to),cnt(shiftK(S.to,-1))))}${kpi('إيراد الأجهزة — '+ml(S.to),fm(L.byC.dev.paid),Pv?delta(L.byC.dev.paid,Pv.byC.dev.paid):'')}
   ${kpi('نسبته من إيراد القسم',pc(L.rev?L.byC.dev.paid/L.rev:null))}${kpi('مرضى حقن/متابعة أخدوا أجهزة',pc(mainP.size?[...mainP].filter(p=>devP.has(p)).length/mainP.size:null),'في الفترة')}</div>
  <div class="card" style="margin-top:12px"><h3>جلسات كل جهاز شهري</h3><div class="ch"><canvas id="nD1"></canvas></div></div>
  <div class="card" style="margin-top:12px">${tableHTML(['الشهر',...DV.map(d=>({t:d,n:1})),{t:'إجمالي الجلسات',n:1},{t:'الإيراد',n:1},{t:'الخصم',n:1}],rows,{h:420})}</div>`}
function cnDev(){const ks=nMonths(),{ops}=nutBuild(),O=ops.filter(o=>o.cat==='dev'),c=SER();const DV=DEVT.map(d=>d[0]).concat(['أخرى']).filter(d=>O.some(o=>o.dev===d)).slice(0,8);
  chart('nD1',{data:{labels:ks.map(mls),datasets:DV.map((d,i)=>bar(d,ks.map(k=>O.filter(o=>o.k===k&&o.dev===d).length),c[i],{stack:'s',borderRadius:0}))},options:{scales:{x:{stacked:true,grid:{display:false}},y:{stacked:true}}}})}
function nAlaa(){const k=S.to,M=nutMonth(k),C=NUT.cfg,A=C.alaaArchive||{};const {ops,dokki}=nutBuild();
  const al=D.apt.filter(a=>a.b==='haram'&&a.k===k&&a.st==='Completed'&&/الاء|آلاء|alaa|حرفوش/i.test(a.doc));const O=ops.filter(o=>o.k===k&&!/PLANNED/i.test(o.st));
  const sk=new Set(O.map(o=>o.pid+'|'+o.d)),ak=new Set(al.map(a=>a.pid+'|'+a.d));const e1=al.filter(a=>!sk.has(a.pid+'|'+a.d)),e2=O.filter(o=>!ak.has(o.pid+'|'+o.d)&&(o.cat==='exam'||o.cat==='fu'));
  const NM={};D.inv.forEach(x=>{if(x.pid&&x.pn)NM[x.pid]=x.pn});
  const dk=monthsList(S.from,S.to).map(m=>[ml(m),dokki.filter(o=>o.k===m).length,dokki.filter(o=>o.k===m).reduce((s,o)=>s+o.paid,0)]).filter(r=>r[1]);
  return `<div class="grid g4">${kpi('إيراد القسم — '+ml(k),fm(M.rev))}${kpi('مرتب د. آلاء',M.alaa==null?'—':fm(M.alaa),M.alaa==null?'الشهر ده قبل نظام الـ'+pc(C.alaaRate):pc(C.alaaRate)+' من المدفوع فعلاً')}
   ${kpi('أرشيف نظام الـ50%: المستحق',A.due?fm(+A.due):'—',A.note||'')}${kpi('المدفوع منه',A.paid?fm(+A.paid):'—')}${kpi('الرصيد',A.bal?fm(+A.bal):'—',A.extra?'مع تقدير يونيو 2023 – مايو 2024: '+fm(+A.extra):'اكتبه من الإعدادات')}</div>
  <div class="card" style="margin-top:12px"><h3>حساب الشهر حسب الفئة<small>${ml(k)}</small></h3>${tableHTML(['الفئة',{t:'عدد',n:1},{t:'قبل الخصم',n:1},{t:'بعد الخصم (المدفوع)',n:1}],NCAT.map(c=>[c[1],M.byC[c[0]].n,M.byC[c[0]].tot,M.byC[c[0]].paid]).concat([Object.assign(['الإجمالي',NCAT.reduce((s,c)=>s+M.byC[c[0]].n,0),M.tot,M.rev],{_c:'tot'}),['المرتب',' ','',M.alaa==null?'—':M.alaa]]))}</div>
  <div class="grid g2" style="margin-top:12px"><div class="card"><h3>موعد مكتمل من غير خطوة عملية<small>${e1.length}</small></h3>${tableHTML(['المريض','رقم','اليوم'],e1.map(a=>[esc(NM[a.pid]||''),esc(a.pid),a.d]),{h:300})}</div>
   <div class="card"><h3>خطوة كشف/متابعة من غير موعد مكتمل<small>${e2.length}</small></h3>${tableHTML(['المريض','الخدمة','اليوم'],e2.map(o=>[esc(o.pn),esc(o.name),o.d]),{h:300})}</div></div>
  <div class="card" style="margin-top:12px"><h3>جلسات د. آلاء في الدقي<small>بتتعرض لوحدها ومش محسوبة في الهرم</small></h3>${dk.length?tableHTML(['الشهر',{t:'خطوات',n:1},{t:'المدفوع',n:1}],dk):'<span class="muted">مفيش في الفترة دي</span>'}</div>`}
function cnAlaa(){}
function nPrice(){const C=NUT.cfg;if(!C.priceDate)return `<div class="card">اكتب تاريخ تطبيق الأسعار الجديدة من «الإعدادات» علشان يظهر تقرير أثر الزيادة.</div>`;
  const {ops}=nutBuild(),d0=C.priceDate,t0=Date.parse(d0),days=Math.min(90,Math.floor((Date.now()-t0)/864e5));if(days<1)return '<div class="card">تاريخ التطبيق لسه ما جاش.</div>';
  const win=(a,b)=>ops.filter(o=>{const t=(Date.parse(o.d)-t0)/864e5;return t>=a&&t<b});const B=win(-days,0),A=win(0,days);
  const s=(X,c)=>{const x=X.filter(o=>o.cat===c);return {n:x.length,p:x.reduce((q,o)=>q+o.paid,0),pts:new Set(x.map(o=>o.pid)).size}};
  const r=['fu','inbody','exam'].map(c=>{const b=s(B,c),a=s(A,c);return [NCATN[c],b.n,b.p,a.n,a.p,delta(a.p,b.p),fm(b.n?b.p/b.n:null),fm(a.n?a.p/a.n:null)]});
  return `<div class="card"><h3>أثر زيادة الأسعار<small>${days} يوم قبل ${d0} مقابل ${days} يوم بعده</small></h3>${tableHTML(['الفئة',{t:'عدد قبل',n:1},{t:'إيراد قبل',n:1},{t:'عدد بعد',n:1},{t:'إيراد بعد',n:1},{t:'التغيير',n:1},{t:'متوسط قبل',n:1},{t:'متوسط بعد',n:1}],r)}
  <div class="note" style="margin-top:8px">المريض المستمر من غير انقطاع بيفضل بالسعر القديم، فالأثر بيبان بالتدريج مع المرضى الجداد واللي رجعوا بعد انقطاع.</div></div>`}

// ---------------- settings ----------------
function nCfg(){const C=NUT.cfg,inp=(k,v,t,st)=>`<input data-c="${k}" type="${t||'number'}" ${t?'':'step="any"'} value="${esc(v??'')}" style="width:${st||110}px">`;
  const months=Object.keys(C.payroll||{}).sort().reverse();
  return `<div class="card"><h3>النسب والقواعد</h3><div class="grid g4" style="gap:10px">
   <label class="sub">نصيب التغذية من المصروفات المشتركة<br>${inp('sharedPct',C.sharedPct)}</label><label class="sub">نسبة «أي موظف تاني» للسلف<br>${inp('shareGen',C.shareGen)}</label>
   <label class="sub">إهلاك أجهزة التخسيس شهرياً<br>${inp('deviceDep',C.deviceDep)}</label><label class="sub">الإهلاك من شهر<br>${inp('deviceDepFrom',C.deviceDepFrom,'month',150)}</label>
   <label class="sub">عمر الأصول بالشهور<br>${inp('assetLife',C.assetLife)}</label><label class="sub">نصيب التغذية من إهلاك الأصول العامة<br>${inp('assetShare',C.assetShare)}</label>
   <label class="sub">طريقة تكلفة الحقن<br><select data-c="injMode">${[['r12','حسب البيع — آخر 12 شهر'],['all','حسب البيع — الفترة كلها'],['manual','نسبة يدوية'],['purchase','حسب الشراء (شهر الفاتورة)']].map(([v,t])=>`<option value="${v}"${C.injMode===v?' selected':''}>${t}</option>`).join('')}</select></label>
   <label class="sub">النسبة اليدوية<br>${inp('injManual',C.injManual)}</label>
   <label class="sub">نظام د. آلاء الجديد من شهر<br>${inp('alaaFrom',C.alaaFrom,'month',150)}</label><label class="sub">نسبتها من المدفوع<br>${inp('alaaRate',C.alaaRate)}</label>
   <label class="sub">تاريخ الأسعار الجديدة<br>${inp('priceDate',C.priceDate,'date',150)}</label>
   <label class="sub">تنبيه: الحقن من الإيراد أكتر من<br>${inp('alertInjShare',C.alertInjShare)}</label><label class="sub">تنبيه: خصم الحقن أكتر من<br>${inp('alertInjDisc',C.alertInjDisc)}</label><label class="sub">تنبيه: خصم الأجهزة أكتر من<br>${inp('alertDevDisc',C.alertDevDisc)}</label></div>
   <h4>أرشيف د. آلاء (نظام الـ50%)</h4><div class="grid g4" style="gap:10px"><label class="sub">المستحق<br>${inp('a.due',C.alaaArchive.due)}</label><label class="sub">المدفوع<br>${inp('a.paid',C.alaaArchive.paid)}</label><label class="sub">الرصيد<br>${inp('a.bal',C.alaaArchive.bal)}</label><label class="sub">الإجمالي مع تقدير 2023/2024<br>${inp('a.extra',C.alaaArchive.extra)}</label></div></div>
  <div class="card" style="margin-top:12px"><h3>الموظفين ونسبهم<small>الاسم بالعربي زي المصروفات، وبالإنجليزي زي قسيمة المرتب</small></h3><div id="nStaff"></div><button id="nStAdd" style="margin-top:6px">+ موظف</button></div>
  <div class="card" style="margin-top:12px"><h3>المرتبات الشهرية<small>«الإجمالي قبل خصم السلفة» — بتتحفظ مشفّرة</small></h3>
   <div class="bar"><label class="sub">الشهر <input type="month" id="nPrM" value="${shiftK(curK(),-1)}"></label><label class="drop" style="padding:6px 12px;border:1px dashed var(--brd);border-radius:8px;cursor:pointer">📂 ارفع ملف المرتبات (Excel)<input type="file" id="nPrF" accept=".xlsx,.xls" hidden></label><button id="nPrMan">✍️ اكتب بإيدك</button></div>
   <div id="nPrPrev"></div>${tableHTML(['الشهر',{t:'موظفين',n:1},{t:'الإجمالي',n:1},''],months.map(m=>[ml(m),Object.keys(C.payroll[m]).length,Object.values(C.payroll[m]).reduce((s,v)=>s+(+v||0),0),`<button data-prd="${m}">✏️</button> <button data-prx="${m}">🗑</button>`]),{h:260})}</div>
  <div class="bar" style="margin-top:12px"><button class="pri" id="nCfgSave">💾 احفظ الإعدادات</button><span class="sub">${NUT.dirty?'فيه تعديلات لسه ما اتحفظتش':''}</span></div>`}
function cnCfg(){const C=NUT.cfg;
  document.querySelectorAll('[data-c]').forEach(i=>i.onchange=()=>{const k=i.dataset.c;let v=i.value;if(i.type==='number')v=v===''?'':+v;if(k.startsWith('a.'))C.alaaArchive[k.slice(2)]=v;else C[k]=v;NUT.dirty=true;NUT.data=null});
  const drawSt=()=>{$('#nStaff').innerHTML=tableHTML(['بالعربي','بالإنجليزي','الدور',{t:'النسبة',n:1},'من شهر','لحد شهر',''],C.staff.map((s,i)=>[`<input data-s="${i}|ar" value="${esc(s.ar)}" style="width:90px">`,`<input data-s="${i}|en" value="${esc(s.en)}" style="width:150px">`,`<input data-s="${i}|role" value="${esc(s.role)}" style="width:130px">`,
    `<input data-s="${i}|share" type="number" step="0.05" value="${s.share}" style="width:64px">`,`<input data-s="${i}|from" type="month" value="${esc(s.from)}">`,`<input data-s="${i}|to" type="month" value="${esc(s.to)}">`,`<button data-sd="${i}">🗑</button>`]),{h:420});
    document.querySelectorAll('[data-s]').forEach(i=>i.onchange=()=>{const [ix,f]=i.dataset.s.split('|');C.staff[ix][f]=f==='share'?+i.value:i.value;NUT.dirty=true;NUT.data=null});
    document.querySelectorAll('[data-sd]').forEach(b=>b.onclick=()=>{C.staff.splice(+b.dataset.sd,1);NUT.dirty=true;NUT.data=null;drawSt()})};drawSt();
  $('#nStAdd').onclick=()=>{C.staff.push({ar:'',en:'',role:'',share:0.25,from:'',to:''});drawSt()};
  $('#nCfgSave').onclick=e=>nutCfgSave(e.currentTarget);
  $('#nPrF').onchange=async e=>{const f=e.target.files[0];e.target.value='';if(!f)return;if(!window.XLSX&&!(await loadLib('XLSX'))){alert('مكتبة Excel ما اتحملتش');return}
    try{const wb=XLSX.read(await f.arrayBuffer(),{type:'array'});const got=parsePayroll(wb);const mm=(f.name.match(/(20\d\d)[-_ .]?(\d{1,2})/)||[]);if(mm[1])$('#nPrM').value=mm[1]+'-'+pad(+mm[2]);prPreview(got,f.name)}catch(err){alert('ما قدرتش أقرا الملف: '+err.message)}};
  $('#nPrMan').onclick=()=>{const m=$('#nPrM').value;const cur=C.payroll[m]||{};const got={};staffAt(m).forEach(s=>{if(s.en)got[s.en]=cur[s.en]??''});Object.assign(got,cur);prPreview(got,'يدوي')};
  document.querySelectorAll('[data-prd]').forEach(b=>b.onclick=()=>{$('#nPrM').value=b.dataset.prd;prPreview(Object.assign({},C.payroll[b.dataset.prd]),'تعديل')});
  document.querySelectorAll('[data-prx]').forEach(b=>b.onclick=()=>{if(!confirm('أمسح مرتبات '+ml(b.dataset.prx)+'؟'))return;delete C.payroll[b.dataset.prx];NUT.dirty=true;NUT.data=null;render()})}
function prPreview(got,src){const names=Object.keys(got);
  $('#nPrPrev').innerHTML=`<div class="note" style="margin:8px 0">${esc(src)}: ${names.length} موظف — راجع الأرقام واختار الشهر، وبعدين «اعتمد». الموظفين اللي مش في جدول النسب بيتحفظوا بس مش بيتحسبوا.</div>
   ${tableHTML(['الاسم',{t:'الإجمالي قبل خصم السلفة',n:1}],names.map((n,i)=>[`<input data-pn="${i}" value="${esc(n)}" style="width:200px">`,`<input data-pv="${i}" type="number" step="any" value="${esc(got[n])}" style="width:120px">`]),{h:320})}
   <div class="bar" style="margin-top:6px"><button class="pri" id="nPrOk">✓ اعتمد للشهر ده</button><button id="nPrAdd">+ اسم</button><button id="nPrNo">إلغاء</button></div>`;
  $('#nPrOk').onclick=()=>{const m=$('#nPrM').value;if(!m){alert('اختار الشهر');return}const o={};document.querySelectorAll('[data-pn]').forEach(i=>{const v=document.querySelector(`[data-pv="${i.dataset.pn}"]`).value;if(i.value.trim()&&v!=='')o[i.value.trim()]=+v});
    NUT.cfg.payroll[m]=o;NUT.dirty=true;NUT.data=null;render();setTimeout(()=>alert('اتضافت مرتبات '+ml(m)+' — دوس «احفظ الإعدادات» علشان تتحفظ'),50)};
  $('#nPrAdd').onclick=()=>{got['']='';prPreview(got,src)};$('#nPrNo').onclick=()=>{$('#nPrPrev').innerHTML=''}}
function parsePayroll(wb){const LBL=/الاجمالي قبل خصم السلف/,NAME=/^(الاسم|اسم الموظف|الموظف|name|employee|employee name)$/i,out={};
  const isNum=v=>typeof v==='number'||(/^\s*[\d,.]+\s*$/.test(String(v??''))&&String(v).trim()!=='');const toN=v=>+String(v).replace(/,/g,'');
  for(const sn of wb.SheetNames){const a=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true});
    // table layout: a header row with the total column and a name column
    let done=false;for(let r=0;r<Math.min(a.length,40)&&!done;r++){const row=a[r].map(x=>nAr(x));const ci=row.findIndex(x=>LBL.test(x));if(ci<0)continue;const ni=row.findIndex(x=>NAME.test(x));if(ni<0)continue;
      for(let j=r+1;j<a.length;j++){const n=String(a[j][ni]||'').trim(),v=a[j][ci];if(n&&isNum(v)&&!/اجمالي|total/i.test(n))out[n]=toN(v)}done=true}
    if(done)continue;
    // payslip layout: label cells next to their values
    let name='',val=null;for(const row of a)for(let c=0;c<row.length;c++){const x=nAr(row[c]);
      if(!name&&NAME.test(x)){const v=row.slice(c+1).concat(row.slice(0,c).reverse()).find(z=>String(z).trim()&&!isNum(z));if(v)name=String(v).trim()}
      if(val==null&&LBL.test(x)){const v=row.slice(c+1).concat(row.slice(0,c).reverse()).find(isNum);if(v!=null)val=toN(v)}}
    if(name&&val!=null)out[name]=val}
  return out}

// ---------------- Excel ----------------
function nutExcel(){const ks=nMonths(),R=ks.map(nutMonth),{xs}=nutBuild();
  const pl=[['الشهر','الإيراد','حقن تخسيس','ميزوثيرابي','كشوفات','متابعات','أجهزة','إنبدي','الخصومات','تكلفة الحقن','نسبة تكلفة الحقن','خاص (ميزو/مكملات/مستلزمات/مرتجعات)','سلف بالنسب','نصيب الرواتب','رواتب تقديرية؟','إهلاك أجهزة','إجمالي الخاص','نصيب العام','صافي قبل د. آلاء','راتب د. آلاء','صافي بعد','الهامش %']]
    .concat(R.map(r=>[r.k,r.rev,r.byC.inj.paid,r.byC.mezo.paid,r.byC.exam.paid,r.byC.fu.paid,r.byC.dev.paid,r.byC.inbody.paid,r.disc,r.injCost,r.ratio==null?'':+(r.ratio*100).toFixed(1),r.special,r.adv,r.sal.tot,r.sal.est?'نعم':'',r.devDep,r.specTot,r.general,r.before,r.alaa??'',r.after??'',r.margin==null?'':+(r.margin*100).toFixed(1)]));
  const al=[['الشهر','الفئة','عدد','قبل الخصم','المدفوع']];R.forEach(r=>{NCAT.forEach(c=>al.push([r.k,c[1],r.byC[c[0]].n,r.byC[c[0]].tot,r.byC[c[0]].paid]));al.push([r.k,'المرتب','','',r.alaa??'نظام الـ50%'])});
  const ex=[['التاريخ','الوصف','النوع','المبلغ','المدفوع','التصنيف','النسبة','السبب','المصدر']].concat(xs.filter(x=>nIn(x.k,S.from,S.to)).sort((a,b)=>a.d<b.d?-1:1).map(x=>[x.d,x.desc,x.type,x.amt,x.paid,XCLS[x.cls][0],x.share??'',x.why,x.src]));
  wbSave([['قائمة الدخل',pl],['حساب د. آلاء',al],['المصروفات المصنفة',ex]],`التغذية ${S.from} الى ${S.to}.xlsx`)}

VIEWS.nut=[vNut,cNut];
