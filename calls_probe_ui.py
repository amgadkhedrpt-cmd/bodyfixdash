"""يفتح الداشبورد الحقيقي (مربوط بالشيت) ويعدّ مهام «📵 فايتة» — أعداد بس."""
import os, json, asyncio
from playwright.async_api import async_playwright
CFG = json.dumps({"url": os.environ["SHEET_URL"], "key": os.environ["SHEET_KEY"]})
async def main():
    async with async_playwright() as pw:
        try: b = await pw.chromium.launch(channel="chrome", args=["--no-sandbox"])
        except Exception: b = await pw.chromium.launch(args=["--no-sandbox"])
        p = await b.new_page()
        await p.add_init_script(f"localStorage.setItem('bf_sheet_cfg', {json.dumps(CFG)}); localStorage.setItem('bf_branch','haram');")
        await p.goto("https://amgadkhedrpt-cmd.github.io/bodyfixdash/?probe=" + str(os.getpid()), wait_until="domcontentloaded")
        await p.wait_for_timeout(8000)
        await p.evaluate("()=>{const bt=[...document.querySelectorAll('button.tab')].find(x=>x.textContent.includes('خطة اليوم')); if(bt) sw('plan',bt)}")
        for i in range(12):
            await p.wait_for_timeout(5000)
            ok = await p.evaluate("()=>!!(typeof MC!=='undefined'&&MC.calls&&MC.calls.length)")
            if ok: break
        r = await p.evaluate("""()=>{ try{ planRender(); }catch(e){}
          const T=planTasks(true), c={}, days={}; let n=0;
          for(const s in T) T[s].forEach(t=>{ const g=(t.grp||[])[0]; if(g!=='mcall') return; n++;
            const k=(t.br==='FIX ZONE'?'Dokki':'Haram')+' | owner='+planOwner(t,g)+' | '+planState(t)+(t.sys?' | sys='+String(t.sys).slice(0,40):''); c[k]=(c[k]||0)+1;
            const d=String(t.key).split('|').pop(); days[d]=(days[d]||0)+1; });
          const E=(MC.ep||[]).filter(e=>e.s==='miss'&&e.tC==null&&e.ph.length>=9&&cfDay(e.t0)>='2026-11-01');
          const why={}; E.forEach(e=>{ const pt=mcPt(e.ph), came=pt.last&&pt.last>=cfDay(e.t0), tr=mcTries(e,ALERTS_DATA.today), ref=(PLAN_ST['mcall|'+e.ln+'|'+e.ph+'|'+cfDay(e.t0)]||{}).s==='ref';
            const k=came?'came('+(pt.last===ALERTS_DATA.today?'today':'before')+')':tr.gone?'gone3x3':ref?'refused':'open'; why[k]=(why[k]||0)+1; });
          return {calls:(MC.calls||[]).length, err:MC.err||'', lines:Object.keys(MC.lines||{}), n, c, days, openEpisodes:E.length, why, today:ALERTS_DATA&&ALERTS_DATA.today}; }""")
        print(json.dumps(r, ensure_ascii=False, indent=1))
        await b.close()
asyncio.run(main())
