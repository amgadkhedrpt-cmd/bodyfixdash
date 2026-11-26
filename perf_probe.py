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
        if "raw.githubusercontent.com" in u and "alerts.json" in u: return r.fulfill(path=os.path.join(root,"alerts.json"),content_type="application/json")
        return r.continue_()
    pg.route("**/*",route); pg.goto("file://"+os.path.join(root,"index.html"),wait_until="domcontentloaded",timeout=60000); pg.wait_for_timeout(6000)
    pg.evaluate("()=>{ try{ sw('plan', document.querySelector('.tab[onclick*=plan]')); }catch(e){ try{ planOpen(); }catch(_){} } }")
    for _ in range(30):
        if pg.evaluate("()=> !!(window.PLAN_LOADED && window.ALERTS_DATA && (typeof AUD_DATA==='undefined' || AUD_DATA))"): break
        pg.wait_for_timeout(2000)
    pg.wait_for_timeout(8000)
    print(pg.evaluate("""()=>{ var T=planTasks(true), out={}, hand=0;
      ['mgr','morning','rec','office','evening'].forEach(function(sec){ T[sec].forEach(function(t){ var st=planState(t); if(st==='snz') return; var g=(t.grp&&t.grp[0])||'other';
        var ci=planCoverInfo(t,g), o=planPerfOwner(t,g); if(planNormName(o||'')!=='Dalia') return; var base=''; try{ PLAN_DAY_SKIP=true; base=planNormName(planOwner0(t,g)||''); }finally{ PLAN_DAY_SKIP=false; }
        var dm=planDoneMin(t); var k=g+(t.past?'(past)':'')+' ← '+(base||'?')+(base&&base!=='Dalia'?(dm!=null&&dm<16*60+20?' [قبل 4:20]':' [بعد/مفتوح]'):'') + (t.sys&&!(PLAN_ST[t.key]||{}).by?' sys':''); var x=out[k]||(out[k]={tot:0,done:0}); x.tot++; if(st==='done') x.done++; }); });
      return JSON.stringify({today:ALERTS_DATA.today, n:Object.keys(PLAN_ST).length, groups:out}); }"""))
    b.close()
