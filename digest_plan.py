# -*- coding: utf-8 -*-
"""📋 مراجعة خطة اليوم في الإيميل: لكل فرع ولكل سكرتيرة — اتعمل إيه (على السيستم ولا بالزرار بس) · فاضل إيه ومترحّل من كام يوم ·
مهام اتعلّم عليها والفلوس لسه متدفعتش · وتقييم كل سكرتيرة من أول الشهر (من سطور PERF في شيت الطلبات)."""
import os, json, hashlib
from collections import defaultdict

BR_AR = {"BODYFIX Center": "الهرم", "FIX ZONE": "الدقي"}
MONEY_G = {"debt": "تحصيل وهو جاي", "debtph": "تحصيل بالتليفون", "invrev": "مراجعة الفاتورة", "invfix": "تعديل الفاتورة"}
STATE_F = "data/plan_open.json"
H = lambda t: str(t if t is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
sub = lambda t: f'<span style="color:#64748b;font-size:11px">{t}</span>'
pc = lambda a, b: f"{round(a * 100 / b)}%" if b else "—"
hk = lambda k: hashlib.sha1(k.encode("utf-8")).hexdigest()[:12]   # الشيت عام: مفاتيح المهام بتتحفظ متشفرة (من غير أسامي)
TH = 'style="padding:4px 6px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:600"'
TD = 'style="padding:4px 6px;border-top:1px solid #e2e8f0;text-align:center;font-size:12px"'


def money_task(t):
    return t["g"] in MONEY_G or (t["g"] == "mgr" and "debt" in t["k"])


def money_label(t):
    return MONEY_G.get(t["g"], "عند المدير")


def plan_by_pid(res):
    """pid → مهام التحصيل بتاعته النهارده (للمشاكل المفتوحة: المريض ده ليه مهمة في الخطة؟)"""
    out = defaultdict(list)
    for t in (res or {}).get("tasks") or []:
        if t.get("pid") and money_task(t):
            out[t["pid"]].append(t)
    return out


def task_badge(L):
    if not L:
        return '<span style="color:#b45309">⚠️ مش في خطة النهارده</span>'
    t = sorted(L, key=lambda t: t["st"] != "done")[0]
    st = "✅ اتعملت" + ("" if t["how"] == "sys" else " (بالزرار)") if t["st"] == "done" else ("📞 ما ردش" if t["st"] == "nr" else "⏳ لسه")
    return f'📋 {money_label(t)} — {H(t["o"] or "مالهاش مسئولة")} — {st}'


def carry(today_s, tasks):
    """كام يوم المهمة دي بتظهر مفتوحة ورا بعض (من حالة الأيام اللي فاتت)"""
    try:
        S = json.load(open(STATE_F, encoding="utf-8")).get("days") or {}
    except Exception:
        S = {}
    prev = sorted((k for k in S if k < today_s), reverse=True)
    sets = [set(S[k]) for k in prev]
    ages = {}
    for t in tasks:
        if t["st"] == "done":
            continue
        h, n = hk(t["k"] + "|" + t["g"]), 1
        for st in sets:
            if h in st:
                n += 1
            else:
                break
        ages[id(t)] = n
    if not os.environ.get("DIGEST_PREVIEW"):
        try:
            S[today_s] = sorted({hk(t["k"] + "|" + t["g"]) for t in tasks if t["st"] != "done"})
            S = {k: S[k] for k in sorted(S)[-15:]}
            json.dump({"days": S}, open(STATE_F, "w", encoding="utf-8"), separators=(",", ":"))
        except Exception as e:
            print("plan state:", e)
    return ages


def perf_sum(o):
    z = defaultdict(int)
    for g, x in (o.get("g") or {}).items():
        for k in ("n", "sys", "btn", "nr", "open", "timed", "fast", "moved"):
            z[k] += int(x.get(k) or 0)
    return z


def month_eval(today_s, reasons, perf_today):
    """تقييم من أول الشهر لحد النهارده — مجموع سطور PERF اليومية لكل سكرتيرة"""
    m = today_s[:7]
    agg = defaultdict(lambda: {"days": set(), "br": set(), "z": defaultdict(int), "miss": defaultdict(int)})
    first = None

    def add(name, d, o):
        nonlocal first
        if name in ("_none", "", "المدير"):
            return
        a = agg[name]
        a["days"].add(d)
        a["br"].update((o.get("br") or {}).keys())
        for k, v in perf_sum(o).items():
            a["z"][k] += v
        for g, x in (o.get("g") or {}).items():
            a["miss"][g] += int(x.get("open") or 0)
        first = min(first or d, d)
    for k, v in (reasons or {}).items():
        if not k.startswith("PERF|" + m):
            continue
        try:
            _, d, name = k.split("|", 2)
            o = json.loads(v) if isinstance(v, str) else v
        except Exception:
            continue
        if d < today_s and isinstance(o, dict):
            add(name, d, o)
    for name, o in (perf_today or {}).items():
        add(name, today_s, o)
    if not agg:
        return ""
    GT = {}
    try:
        import re
        src = open("index.html", encoding="utf-8").read()
        i = src.index("var PLAN_GT={")
        for g, t in re.findall(r"(\w+):\['[^']*','([^']+)'\]", src[i:i + 6000]):
            GT[g] = t
    except Exception:
        pass
    rows = []
    for name, a in sorted(agg.items(), key=lambda kv: -((kv[1]["z"]["sys"] + kv[1]["z"]["btn"]) / kv[1]["z"]["n"] if kv[1]["z"]["n"] else 0)):
        z = a["z"]
        done = z["sys"] + z["btn"]
        r = done / z["n"] if z["n"] else 0
        col = "#16a34a" if r >= 0.85 else "#ea580c" if r >= 0.65 else "#dc2626"
        mg = max(a["miss"].items(), key=lambda kv: kv[1]) if a["miss"] else None
        miss = f'{H(GT.get(mg[0], mg[0]).split("(")[0].strip())} ({mg[1]})' if mg and mg[1] else "—"
        rows.append(f'<tr><td {TD.replace("center", "right")}><b>{H(name)}</b> {sub(" · ".join(BR_AR.get(b, b) for b in sorted(a["br"])))}</td>'
                    f'<td {TD}>{len(a["days"])}</td><td {TD}>{z["n"]:,}</td><td {TD}><b style="color:{col}">{pc(done, z["n"])}</b></td>'
                    f'<td {TD}>{pc(z["sys"], done)}</td><td {TD}>{z["nr"]}</td><td {TD}>{z["open"]}</td><td {TD}>{pc(z["fast"], z["timed"])}</td><td {TD}>{miss}</td></tr>')
    return (f'<h3 style="margin:18px 0 6px">🏅 تقييم السكرتارية من أول الشهر</h3>'
            f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr><th {TH}>السكرتيرة</th><th {TH}>أيام</th><th {TH}>مهام</th><th {TH}>اتعمل</th>'
            f'<th {TH}>منها اتقفل على السيستم</th><th {TH}>ما ردش</th><th {TH}>فاتت</th><th {TH}>في الوقت</th><th {TH}>أكتر حاجة بتفوتها</th></tr>{"".join(rows)}</table>'
            + sub(f'من {first} لحد النهارده · «اتعمل» = اتقفلت على Medicolize أو بالزرار · «على السيستم» = ليها أثر فعلي مش بس زرار · '
                  f'«في الوقت» = قبل ما المريض يمشي (الاستقبال) أو قبل 3 العصر (الباقي) · «فاتت» = فضلت مفتوحة لآخر اليوم'))


def review(today_s, res, reasons, debts_by_pid):
    tasks = [t for t in (res or {}).get("tasks") or [] if t.get("br")]
    if not tasks:
        return ""
    ages = carry(today_s, tasks)
    perf = (res or {}).get("perf") or {}
    fast = {n: perf_sum(o) for n, o in perf.items()}
    out = ['<h3 style="margin:18px 0 6px">📋 مراجعة خطة اليوم</h3>',
           sub("«على السيستم» = اتقفلت لوحدها لما الشغل ظهر على Medicolize · «بالزرار» = السكرتيرة علّمت عليها بس · «مترحّلة» = بقالها كام يوم مفتوحة")]
    for br in [b for b in BR_AR if any(t["br"] == b for t in tasks)]:
        T = [t for t in tasks if t["br"] == br]
        d = [t for t in T if t["st"] == "done"]
        sy = sum(1 for t in d if t["how"] == "sys")
        nr = sum(1 for t in T if t["st"] == "nr")
        op = [t for t in T if t["st"] == "open"]
        out.append(f'<div style="background:#eff6ff;color:#1d4ed8;font-weight:700;padding:5px 10px;border-radius:6px;margin:12px 0 4px">🏥 {BR_AR[br]} — اتعمل {len(d)} من {len(T)} ({pc(len(d), len(T))})</div>'
                   f'<div style="font-size:12px;margin:2px 0 6px">على السيستم {sy} · بالزرار بس {len(d) - sy} · ما ردش {nr} · فاضل {len(op)}</div>')
        # جدول السكرتيرات
        own = defaultdict(list)
        for t in T:
            own[t["o"] or "⚠️ مالهاش مسئولة"].append(t)
        rows = []
        for o, L in sorted(own.items(), key=lambda kv: (kv[0] == "المدير", -len(kv[1]))):
            dd = [t for t in L if t["st"] == "done"]
            ss = sum(1 for t in dd if t["how"] == "sys")
            oo = [t for t in L if t["st"] == "open"]
            f = fast.get(o) or {}
            col = "#16a34a" if len(dd) >= 0.85 * len(L) else "#ea580c" if len(dd) >= 0.65 * len(L) else "#dc2626"
            rows.append(f'<tr><td {TD.replace("center", "right")}><b>{H(o)}</b></td><td {TD}>{len(L)}</td><td {TD}><b style="color:{col}">{len(dd)} ({pc(len(dd), len(L))})</b></td>'
                        f'<td {TD}>{ss}</td><td {TD}>{len(dd) - ss}</td><td {TD}>{sum(1 for t in L if t["st"] == "nr")}</td><td {TD}>{len(oo)}</td>'
                        f'<td {TD}>{pc(f.get("fast", 0), f.get("timed", 0))}</td></tr>')
        out.append(f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr><th {TH}>المسئولة</th><th {TH}>مهامها</th><th {TH}>اتعمل</th>'
                   f'<th {TH}>على السيستم</th><th {TH}>بالزرار</th><th {TH}>ما ردش</th><th {TH}>فاضل</th><th {TH}>في الوقت</th></tr>{"".join(rows)}</table>')
        # اتعلّم عليها والفلوس لسه متدفعتش
        bad, seenp = [], set()
        for t in d:
            if money_task(t) and t["how"] == "btn" and t.get("pid") in debts_by_pid and t["pid"] not in seenp:
                seenp.add(t["pid"])
                rem = "{:,}".format(int(debts_by_pid[t["pid"]]))
                note = "— " + money_label(t) + " · علّمت عليها " + H(t["by"] or t["o"]) + " · لسه باقي " + rem + " جنيه"
                bad.append(f'<li>{H(t["n"])} {sub(note)}</li>')
        if bad:
            out.append(f'<div style="border-inline-start:3px solid #dc2626;padding:4px 10px;margin:8px 0;font-size:13px"><b>⚠️ مهام تحصيل اتعلّم إنها اتعملت والفلوس لسه متدفعتش: {len(bad)}</b>'
                       f'<ul style="margin:2px 0;padding-inline-start:18px">{"".join(bad[:8])}</ul>{sub(f"+ {len(bad) - 8} كمان") if len(bad) > 8 else ""}</div>')
        # اللي فاضل باسم كل مسئولة
        blocks = []
        for o, L in sorted(own.items(), key=lambda kv: -sum(1 for t in kv[1] if t["st"] == "open")):
            oo = [t for t in L if t["st"] == "open"]
            if not oo:
                continue
            g = defaultdict(list)
            for t in oo:
                g[t["gt"]].append(t)
            lines = []
            for gt, LL in sorted(g.items(), key=lambda kv: -len(kv[1])):
                mx = max(ages.get(id(t), 1) for t in LL)
                nm = "، ".join(H(t["n"]) for t in LL[:4] if t["n"]) + (f" +{len(LL) - 4}" if len(LL) > 4 else "")
                lines.append(f'<li>{H(gt.split("(")[0].strip())}: <b>{len(LL)}</b>'
                             + (f' <span style="color:#dc2626;font-size:11px">· مترحّلة من {mx} يوم</span>' if mx >= 2 else "") + (f' {sub("— " + nm)}' if nm else "") + "</li>")
            blocks.append(f'<div style="margin:4px 0"><b>{H(o)}</b> — فاضل {len(oo)}<ul style="margin:2px 0;padding-inline-start:18px">{"".join(lines[:6])}</ul></div>')
        if blocks:
            out.append(f'<div style="border-inline-start:3px solid #ea580c;padding:4px 10px;margin:8px 0;font-size:13px"><b>⏳ اللي ما اتعملش النهارده</b>{"".join(blocks)}</div>')
    out.append(month_eval(today_s, reasons, perf))
    return "".join(out)
