# فحص مؤقت: مهام داليا يوم 26/11 متقسمة إزاي (أعداد بس)
import json, digest, os
from playwright.sync_api import sync_playwright
root=os.path.abspath(".")
with sync_playwright() as p:
    b=p.chromium.launch(channel="chrome"); pg=b.new_page()
    if os.environ.get("SHEET_URL") and os.environ.get("SHEET_KEY"):
        cfg=json.dumps({"url":os.environ["SHEET_URL"],"key":os.environ["SHEET_KEY"]}); pg.add_init_script("try{localStorage.setItem('bf_sheet_cfg', %s)}catch(e){}" % json.dumps(cfg))
    def route(r):
        u=r.request.url
        if "raw.githubusercontent.com" in u and "alerts.json" in u: return r.fulfill(path=os.path.join(root,"alerts10.json"),content_type="application/json")
        return r.continue_()
    pg.route("**/*",route); pg.goto("file://"+os.path.join(root,"idx10.html"),wait_until="domcontentloaded",timeout=60000); pg.wait_for_timeout(6000)
    pg.evaluate("()=>{ try{ sw('plan', document.querySelector('.tab[onclick*=plan]')); }catch(e){ try{ planOpen(); }catch(_){} } }")
    for _ in range(30):
        if pg.evaluate("()=> !!(window.PLAN_LOADED && window.ALERTS_DATA && (typeof AUD_DATA==='undefined' || AUD_DATA))"): break
        pg.wait_for_timeout(2000)
    pg.wait_for_timeout(8000)
    print(pg.evaluate("""()=>{
      var cut='2026-11-26T20:00:00Z', rm=0; Object.keys(PLAN_ST).forEach(function(k){ var o=PLAN_ST[k]||{}, ts=o.ts||o.nts||''; if(ts&&ts>cut){ delete PLAN_ST[k]; rm++; } });
      PLAN_CMAP=null; var T=planTasks(true), sec={}, dal={};
      ['mgr','morning','rec','office','evening'].forEach(function(s2){ T[s2].forEach(function(t){ var st=planState(t); if(st==='snz') return; var g=(t.grp&&t.grp[0])||'other';
        var o=planNormName(planOwner(t,g)||''); if(!o) return; var x=sec[o]||(sec[o]={tot:0,done:0}); x.tot++; if(st==='done') x.done++;
        if(o==='Dalia'){ var b=''; try{ PLAN_DAY_SKIP=true; b=planNormName(planOwner0(t,g)||''); }finally{ PLAN_DAY_SKIP=false; } var k=g+(t.past?'(past)':'')+(b&&b!=='Dalia'?' ← '+b:''); var y=dal[k]||(dal[k]={tot:0,done:0}); y.tot++; if(st==='done') y.done++; }
      }); });
      return JSON.stringify({today:ALERTS_DATA.today, upd:ALERTS_DATA.last_updated, rm:rm, n:Object.keys(PLAN_ST).length, sec:sec, groups:dal}); }"""))
    b.close()
