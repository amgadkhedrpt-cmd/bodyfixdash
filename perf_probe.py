# فحص مؤقت: مهام داليا اللي كانت ظاهرة الساعة 10 بالليل — اتعمل منها كام لحد آخر اليوم (أعداد بس)
import json, os
from playwright.sync_api import sync_playwright
root=os.path.abspath(".")
def open_page(b, html, alerts):
    pg=b.new_page()
    if os.environ.get("SHEET_URL") and os.environ.get("SHEET_KEY"):
        cfg=json.dumps({"url":os.environ["SHEET_URL"],"key":os.environ["SHEET_KEY"]}); pg.add_init_script("try{localStorage.setItem('bf_sheet_cfg', %s)}catch(e){}" % json.dumps(cfg))
    def route(r):
        u=r.request.url
        if "raw.githubusercontent.com" in u and "alerts.json" in u: return r.fulfill(path=os.path.join(root,alerts),content_type="application/json")
        return r.continue_()
    pg.route("**/*",route); pg.goto("file://"+os.path.join(root,html),wait_until="domcontentloaded",timeout=60000); pg.wait_for_timeout(6000)
    pg.evaluate("()=>{ try{ sw('plan', document.querySelector('.tab[onclick*=plan]')); }catch(e){ try{ planOpen(); }catch(_){} } }")
    for _ in range(30):
        if pg.evaluate("()=> !!(window.PLAN_LOADED && window.ALERTS_DATA && (typeof AUD_DATA==='undefined' || AUD_DATA))"): break
        pg.wait_for_timeout(2000)
    pg.wait_for_timeout(8000); return pg
with sync_playwright() as p:
    b=p.chromium.launch(channel="chrome")
    A=open_page(b,"idx10.html","alerts10.json")
    keys=A.evaluate("""()=>{ var cut='2026-11-26T20:00:00Z'; Object.keys(PLAN_ST).forEach(function(k){ var o=PLAN_ST[k]||{}, ts=o.ts||o.nts||''; if(ts&&ts>cut) delete PLAN_ST[k]; });
      PLAN_CMAP=null; var T=planTasks(true), L=[];
      ['mgr','morning','rec','office','evening'].forEach(function(s2){ T[s2].forEach(function(t){ var st=planState(t); if(st==='snz') return; var g=(t.grp&&t.grp[0])||'other';
        if(planNormName(planOwner(t,g)||'')!=='Dalia') return; L.push({k:t.key,g:g,sec:s2,s10:st,t:JSON.parse(JSON.stringify(t))}); }); }); return L; }""")
    A.close()
    B=open_page(b,"index.html","alerts.json")
    res=B.evaluate("""(L)=>{ PLAN_CMAP=null; var T=planTasks(true), F={};
      ['mgr','morning','rec','office','evening'].forEach(function(s2){ T[s2].forEach(function(t){ F[t.key]=t; }); });
      var toMin=function(hm){ var m=/^(\\d{1,2}):(\\d{2})/.exec(hm||''); return m?(+m[1])*60+(+m[2]):null; };
      var P={br:{}, g:{}}, tot=0, done=0, mg={tot:0,done:0};
      L.forEach(function(x){ var t=F[x.k], gone=!t; if(gone){ t=x.t; t.sys=t.sys||'اتحلّت على السيستم'; }
        var stt=gone?'done':planState(t); if(stt==='snz') return;
        if(x.sec==='mgr'){ mg.tot++; if(stt==='done') mg.done++; return; }
        var g=x.g; if(g==='risk') return; P.br[t.br]=1; tot++; if(stt==='done') done++;
        var b=''; try{ PLAN_DAY_SKIP=true; b=planNormName(planOwner0(t,g)||''); }finally{ PLAN_DAY_SKIP=false; }
        var y=P.g[g]||(P.g[g]={n:0,sys:0,btn:0,nr:0,open:0,timed:0,fast:0,moved:0}); y.n++; if(b&&b!=='Dalia') y.moved++;
        var st=PLAN_ST[x.k]||{};
        if(stt==='done'){ if(st.s==='done') y.btn++; else y.sys++; } else if(stt==='nr') y.nr++; else y.open++;
        var tm=gone?{}:planTaskTimes(t,g), dm=toMin(tm.done);
        if(stt==='done'&&dm!==null){ y.timed++; var dl=(x.sec==='rec'&&t.time)?toMin(planHM(t.time))+60:15*60; if(dl!==null&&dm<=Math.max(dl, toMin(tm.seen)!==null?toMin(tm.seen)+120:0)) y.fast++; } });
      return JSON.stringify({perf:P, tot:tot, done:done, mgr:mg}); }""", keys)
    r=json.loads(res); print("SAVE tot",r["tot"],"done",r["done"],"mgr",r["mgr"])
    import digest
    digest.perf_save("2026-11-26", {"Dalia": r["perf"]})
    b.close()
