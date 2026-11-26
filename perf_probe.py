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
    print(pg.evaluate("""()=>{
      planDoneMin=function(t){ var st=PLAN_ST[t.key]||{}; if(st.s==='done'&&st.ts){ var p=new Date(st.ts).toLocaleTimeString('en-GB',{timeZone:'Africa/Cairo',hour12:false}).split(':'); return +p[0]*60+(+p[1]); }
        if(t.sys){ var d=(planTaskTimes(t,(t.grp||[])[0])||{}).done||''; var x=String(d).match(/(\\d{1,2}):(\\d{2})/); return x?+x[1]*60+(+x[2]):0; } return null; };
      var M=PLAN_DAY_OV['2026-11-26']['BODYFIX Center'], R=PLAN_ROLES['BODYFIX Center'], C='16:20', st0=M.stale;
      M.waitnext=function(t,g){ var b=planDayBase(t,g); return planDayCut(t,C,b,R.L); };
      M.nonext=function(t,g){ var b=planDayBase(t,g); if(b===R.J) return planDayCut(t,C,b,R.L); if(b===R.F) return planDayCut(t,C,b,R.H); return ''; };
      M.stale=function(t,g){ var d=planDoneMin(t); if(d!=null&&d<16*60+20) return planDayBase(t,g); return st0(t,g); };
      M.conf=function(t,g){ var b=planDayBase(t,g); return planDayCut(t,C,b,R.H); };
      PLAN_CMAP=null; var T=planTasks(true), sec={}, dal={};
      ['mgr','morning','rec','office','evening'].forEach(function(s2){ T[s2].forEach(function(t){ var st=planState(t); if(st==='snz') return; var g=(t.grp&&t.grp[0])||'other';
        var o=planNormName(planPerfOwner(t,g)||''); if(!o) return;
        if(g==='nonextrev'&&!t.past&&t.sys&&['Dalia'].indexOf(planNormName((PLAN_ST[t.key]||{}).by||''))<0) return;   // اتحجزله من غير ما داليا تعمل حاجة → مش عليها
        var x=sec[o]||(sec[o]={tot:0,done:0}); x.tot++; if(st==='done') x.done++;
        if(o==='Dalia'){ var b=''; try{ PLAN_DAY_SKIP=true; b=planNormName(planOwner0(t,g)||''); }finally{ PLAN_DAY_SKIP=false; } var k=g+(t.past?'(past)':'')+(b&&b!=='Dalia'?' ← '+b:''); var y=dal[k]||(dal[k]={tot:0,done:0}); y.tot++; if(st==='done') y.done++; }
      }); });
      return JSON.stringify({today:ALERTS_DATA.today, n:Object.keys(PLAN_ST).length, sec:sec, groups:dal}); }"""))
    b.close()
