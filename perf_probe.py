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
        if(planNormName(planOwner(t,g)||'')!=='Dalia') return; L.push({k:t.key,g:g+(t.past?'(past)':''),s10:st}); }); }); return L; }""")
    A.close()
    B=open_page(b,"index.html","alerts.json")
    res=B.evaluate("""(L)=>{ PLAN_CMAP=null; var T=planTasks(true), F={};
      ['mgr','morning','rec','office','evening'].forEach(function(s2){ T[s2].forEach(function(t){ F[t.key]=planState(t); }); });
      var G={}; L.forEach(function(x){ var y=G[x.g]||(G[x.g]={tot:0,d10:0,done:0,gone:0,gone_mark:0,open:0}); y.tot++; if(x.s10==='done') y.d10++;
        var f=F[x.k], s=PLAN_ST[x.k]||{};
        if(f===undefined){ y.gone++; if(s.s==='done'||s.s==='ref') y.gone_mark++; } else if(f==='done') y.done++; else y.open++; });
      return JSON.stringify(G); }""", keys)
    print("RES", res)
    b.close()
