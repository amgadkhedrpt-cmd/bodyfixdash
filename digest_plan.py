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
    A = _ages(today_s, tasks)
    ages = {id(t): A.get((t["k"], t["g"]), 1) for t in tasks}
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


# ================= 📌 كروت السكرتارية (كارت لكل فرع — بيتصوّر ويتبعت) =================
# من غير أي إيراد ولا خصومات ولا تقييم: بس الشغل المطلوب من كل واحدة بالاسم
BRK = {"haram": "BODYFIX Center", "dokki": "FIX ZONE"}
WD = ["الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت", "الحد"]


def _owner_g(tasks, br, groups):
    cnt = defaultdict(int)
    for t in tasks:
        if t.get("br") == br and t.get("g") in groups and t.get("o") and t["o"] != "المدير":
            cnt[t["o"]] += 2 if t["g"] == groups[0] else 1
    return max(cnt, key=lambda o: cnt[o]) if cnt else None


from datetime import date


def _next_day(today_s):
    from datetime import timedelta
    d = date.fromisoformat(today_s) + timedelta(days=1)
    while d.weekday() == 4:   # الجمعة إجازة
        d += timedelta(days=1)
    return f"{WD[d.weekday()]} {d.day}/{d.month}"


CARD_PROB = (("عملوا كشف", "🩺 كشوفات ما اتحجزلهاش — احجزيلهم", ["kashf", "kashf0", "fix"]),
             ("بيلغوا ورا بعض", "🔁 بيلغوا ورا بعض — كلميهم", ["streak", "recur"]),
             ("مرضى جداد", "🚶 مرضى جداد ما رجعوش — كلميهم", ["drop", "idle", "call"]))
CARDS_OUT = {}   # اللي اتبعت النهارده (بيتحفظ في الشيت: الـ popup في خطة اليوم + مراجعة بكره)


def cards(today_s, res, P, alerts, prev_rev=None):
    tasks = [t for t in (res or {}).get("tasks") or [] if t.get("br")]
    ages = _ages(today_s, tasks)
    byp = plan_by_pid(res)
    nd = _next_day(today_s)
    out = []
    for b, br in BRK.items():
        T = [t for t in tasks if t["br"] == br]
        PB = [p for p in P if p.get("b") == b]
        if not T and not PB:
            continue
        S = defaultdict(lambda: defaultdict(list))   # السكرتيرة → القسم → سطور

        def put(o, sec, line):
            S[o or "⚠️ مالهاش مسئولة (للمدير)"][sec].append(line)
        # 💸 حصّلي — كل مريض عند صاحبة مهمته في الخطة
        dflt = _owner_g(T, br, ["debtph", "debt"])
        oldq = None
        for p in PB:
            if p.get("oldq"):
                oldq = p
            if p.get("mgr_only") or p.get("oldq"):
                continue
            for i in p["items"]:
                if "remv" not in i:
                    continue
                ow = next((t["o"] for t in byp.get(i["pid"]) or [] if t.get("o") and t["o"] != "المدير"), None) or dflt
                tag = ' <b style="color:#b91c1c">(حضر تاني)</b>' if i.get("came") else (" (النهارده)" if i.get("today") else (f" (من {i['age']} يوم)" if i.get("age") else ""))
                put(ow, "💸 حصّلي", (i.get("came", 0), i.get("age") or 0, f'{H(i["n"])} — باقي {int(i["remv"]):,} ج{tag}', "pay", [i["pid"]], [i["n"]],
                                       f'{i["n"]} — باقي {int(i["remv"]):,} ج' + (" (حضر تاني)" if i.get("came") else "")))
        # 🩺 كشوفات · 🔁 بيلغوا
        for key, sec, gs in CARD_PROB:
            ow = _owner_g(T, br, gs)
            for p in PB:
                if key in p["t"]:
                    for i in p["items"]:
                        put(ow, sec, (0, i.get("age") or 0, H(i["n"]) + (f' {sub("(من " + str(i["age"]) + " يوم)")}' if i.get("age") else ""), "prob:" + key, [i["n"]], [i["n"]], i["n"]))
        # 🔁 خلص الباقة ومالوش ميعاد (آخر 7 أيام)
        ow = _owner_g(T, br, ["renew", "call", "drop"])
        for x in (alerts or {}).get("finished_packages") or []:
            if x.get("branch") == br and (x.get("days_since") or 99) <= 7:
                put(ow, "🔁 خلص الباقة ومالوش ميعاد — اعرضي التجديد", (0, x.get("days_since") or 0, H(x.get("name")) + " " + sub(f'(آخر جلسة من {x.get("days_since")} يوم)'),
                                                                           "fin", [x.get("pid")], [x.get("name")], str(x.get("name") or "")))
        # 🩺 تقييم لازم يتحجز قبل جلسة يوم الشغل الجاي: إعادة تقييم مع د. أمجد (كشف مع دكتور تاني) · أو 6 جلسات من غير تقييم
        ow = _owner_g(T, br, ["eval", "renew", "debt"])
        for x in (alerts or {}).get("eval_due") or []:
            if x.get("branch") != br or x.get("day") != "tomorrow":
                continue
            k = x.get("kashf_other")
            why = (f'إعادة تقييم مع د. أمجد — كشف مع {str(k.get("doctor") or "").replace("Dr. ", "د. ").replace("Dr ", "د. ")} يوم {k.get("date", "")[8:]}/{k.get("date", "")[5:7]}' + (f' (فاتت {k["after"]} مرة)' if k.get("after") else "")) if k \
                else f'جلسة {x.get("n")} من غير تقييم'
            put(ow, "🩺 احجزي تقييم قبل جلسته", (1 if k else 0, x.get("n") or 0, f'{H(x.get("name"))} — {H(why)}', "eval", [x.get("pid")], [x.get("name")], f'{x.get("name")} — {why}'))
        # 🩺 الهرم: محتاج تقييم ومالوش ميعاد خالص → كلميه واحجزيله
        if br == "BODYFIX Center":
            ow3 = _owner_g(T, br, ["evalamg", "eval"]) or ow
            for x in (alerts or {}).get("eval_pending") or []:
                if x.get("branch") != br or x.get("next"):
                    continue
                k = x.get("kashf_other")
                dr = str((k or {}).get("doctor") or "").replace("Dr. ", "د. ").replace("Dr ", "د. ")
                why = " · ".join(w for w in ((f"إعادة تقييم مع د. أمجد (كشف مع {dr})" if k else ""), (f"{x['n6']} جلسات من غير تقييم" if x.get("n6") is not None else "")) if w)
                put(ow3, "📵 محتاج تقييم ومالوش ميعاد — كلميه واحجزيله", (0, x.get("n6") or 0, f'{H(x.get("name"))} — {H(why)}', "eval", [x.get("pid")], [x.get("name")], f'{x.get("name")} — {why}'))
        # 🩺 الدقي: احجزي إعادة تقييم مع د. أمجد يوم زيارته (كل اللي كشفوا مع دكتور تاني ولسه ما اتحجزلهمش)
        if br == "FIX ZONE":
            ad = (alerts or {}).get("amgad_dokki_next")
            adl = f"{WD[date.fromisoformat(ad).weekday()]} {int(ad[8:])}/{int(ad[5:7])}" if ad else "(لسه مفيش يوم لد. أمجد على السيستم)"
            ow2 = _owner_g(T, br, ["evalamg", "eval"]) or ow
            tom = {x.get("pid") for x in (alerts or {}).get("eval_due") or [] if x.get("branch") == br and x.get("day") == "tomorrow"}
            for x in (alerts or {}).get("amgad_eval") or []:
                if x.get("pid") in tom:
                    continue
                k = x.get("kashf") or {}
                dr = str(k.get("doctor") or "").replace("Dr. ", "د. ").replace("Dr ", "د. ")
                why = f'كشف مع {dr} يوم {k.get("date", "")[8:]}/{k.get("date", "")[5:7]}' + ("" if x.get("next") else " · مالوش ميعاد جاي")
                put(ow2, f"🩺 احجزي إعادة تقييم مع د. أمجد يوم {adl}", (0, 0, f'{H(x.get("name"))} — {H(why)}', "eval2", [x.get("pid")], [x.get("name")], f'{x.get("name")} — {why}'))
        # 📞 تأكيد يوم الشغل الجاي · ⏳ مترحّل · ما اتعملش النهارده
        for o in {t["o"] for t in T if t.get("o") and t["o"] != "المدير"}:
            L = [t for t in T if t["o"] == o and t["st"] != "done"]
            cf = [t for t in L if t["g"] in ("conf", "confsp", "waitnext", "waitnut")]
            if cf:
                put(o, f"📞 مواعيد {nd} لسه ما اتأكدتش", (0, 0, f"{len(cf)} ميعاد — في خطة اليوم", "plan", [t["k"] for t in cf], [t["n"] for t in cf], f"{len(cf)} ميعاد"))
            g = defaultdict(list)
            for t in L:
                if t["g"] in ("conf", "confsp", "waitnext", "waitnut", "conftoday", "late", "waittoday", "risk", "mgr") or money_task(t) or t["g"] in ("kashf", "kashf0", "streak", "recur", "eval", "evalamg"):   # مهام يومها خلص مش بتترحّل
                    continue
                g[t["gt"].split("(")[0].strip()].append(t)
            for gt, LL in sorted(g.items(), key=lambda kv: -len(kv[1])):
                mx = max(ages.get((t["k"], t["g"]), 1) for t in LL)
                nm = "، ".join(H(t["n"]) for t in LL[:4] if t["n"]) + (f" +{len(LL) - 4}" if len(LL) > 4 else "")
                sec = "⏳ مترحّل من أيام — أول حاجة الصبح" if mx >= 2 else "📝 ما اتعملش النهارده — كمّليه"
                put(o, sec, (mx, len(LL), f'{H(gt)}: <b>{len(LL)}</b>' + (f' <span style="color:#dc2626">(من {mx} يوم)</span>' if mx >= 2 else "") + (f' {sub("— " + nm)}' if nm else ""),
                             "plan", [t["k"] for t in LL], [t["n"] for t in LL], f'{gt}: {len(LL)}' + (f' (من {mx} يوم)' if mx >= 2 else "")))
        if not S:
            continue
        ORDER = ["⏳ مترحّل من أيام — أول حاجة الصبح", "💸 حصّلي", f"📞 مواعيد {nd} لسه ما اتأكدتش", "🩺 احجزي تقييم قبل جلسته", "🩺 كشوفات ما اتحجزلهاش — احجزيلهم",
                 "🔁 بيلغوا ورا بعض — كلميهم", "🔁 خلص الباقة ومالوش ميعاد — اعرضي التجديد", "🚶 مرضى جداد ما رجعوش — كلميهم", "📝 ما اتعملش النهارده — كمّليه"]
        blocks, wa = [], [f"🏥 {BR_AR[br]} — مهام {nd} الصبح"]
        for o in sorted(S, key=lambda o: (o.startswith("⚠️"), -sum(len(v) for v in S[o].values()))):
            secs, rec = [], []
            pr = (prev_rev or {}).get(o)
            wa.append(f"\n👤 {o}" + (f" — كارت امبارح: اتعمل {pr[0]} من {pr[1]}" if pr else ""))
            extra = [k for k in S[o] if k not in ORDER]
            for sec in ORDER[:4] + extra + ORDER[4:]:
                L = sorted(S[o].get(sec) or [], key=lambda x: (-x[0], -x[1]))
                if not L:
                    continue
                rec.append({"t": sec, "items": [{"x": x[6], "k": x[3], "ids": x[4], "ns": x[5]} for x in L]})
                wa.append(sec + ":\n" + "\n".join("• " + x[6] for x in L[:8]) + (f"\n+ {len(L) - 8} كمان في خطة اليوم" if len(L) > 8 else ""))
                cap = 8
                lis = "".join(f'<li style="margin:1px 0">{x[2]}</li>' for x in L[:cap])
                more = f'<li style="color:#64748b;list-style:none">+ {len(L) - cap} كمان — في خطة اليوم</li>' if len(L) > cap else ""
                secs.append(f'<div style="margin:4px 0 0"><b style="font-size:12.5px">{sec}</b> <span style="color:#64748b;font-size:11px">({len(L)})</span>'
                            f'<ul style="margin:1px 0;padding-inline-start:18px">{lis}{more}</ul></div>')
            if not o.startswith("⚠️"):
                CARDS_OUT[o] = {"d": today_s, "nd": nd, "br": br, "prev": pr, "secs": rec}
            prh = (f' <span style="font-weight:400;font-size:12px;color:{"#16a34a" if pr[0] >= 0.8 * pr[1] else "#dc2626"}">· كارت امبارح: اتعمل {pr[0]} من {pr[1]}</span>' if pr else "")
            blocks.append(f'<div style="border-top:1px dashed #cbd5e1;padding:6px 0"><div style="font-weight:800;color:#0f766e;font-size:14px">👤 {H(o)}{prh}</div>{"".join(secs)}</div>')
        foot = (f'<div style="color:#64748b;font-size:11px;margin-top:4px">🗂️ {oldq["n"]} حالة فلوس قديمة (أكتر من 30 يوم) في مراجعة الفواتير</div>' if oldq else "")
        out.append(f'<div style="border:2px solid #0f766e;border-radius:10px;padding:10px 12px;margin:10px 0;font-size:13px;background:#fff">'
                   f'<div style="font-size:16px;font-weight:800">🏥 {BR_AR[br]} — مهام {nd} الصبح</div>'
                   f'<div style="color:#64748b;font-size:11px">من تقرير {today_s} · القايمة الكاملة لكل مهمة في «خطة اليوم» على الداشبورد</div>{"".join(blocks)}{foot}</div>'
                   + f'<div style="margin:-4px 0 12px"><a href="https://wa.me/?text={_q(chr(10).join(wa)[:3500])}" style="background:#25D366;color:#06281a;padding:6px 14px;border-radius:8px;text-decoration:none;font-size:12px;font-weight:700">📤 ابعت كارت {BR_AR[br]} واتساب</a></div>')
    if not out:
        return ""
    return ('<h3 style="margin:14px 0 4px">📌 كروت السكرتارية</h3>'
            '<div style="color:#64748b;font-size:11px">كارت لكل فرع — صوّره وابعته · مفيهوش إيراد ولا خصومات ولا تقييم السكرتارية</div>' + "".join(out))


def _q(t):
    import urllib.parse
    return urllib.parse.quote(t)


_AGES = {}


def _ages(today_s, tasks):
    """كام يوم كل مهمة مفتوحة (مرة واحدة لكل تشغيل — الكروت والمراجعة بيستخدموها)"""
    if "a" not in _AGES:
        a = carry(today_s, tasks)
        _AGES["a"] = {(t["k"], t["g"]): a[id(t)] for t in tasks if id(t) in a}
    return _AGES["a"]


# ================= كروت امبارح: اتعمل كام من كام =================
def load_cards(reasons, before):
    """آخر كروت اتبعتت قبل النهارده من الشيت (مقسومة على كذا سطر CARD|اليوم|الاسم|رقم)"""
    parts = defaultdict(dict)
    for k, v in (reasons or {}).items():
        if not k.startswith("CARD|"):
            continue
        try:
            _, d, name, i = k.split("|", 3)
        except ValueError:
            continue
        if d < before and str(v or "").strip():
            parts[(d, name)][int(i)] = str(v)
    if not parts:
        return None, {}
    d0 = max(d for d, _ in parts)
    out = {}
    for (d, name), ch in parts.items():
        if d != d0:
            continue
        try:
            out[name] = json.loads("".join(ch[i] for i in sorted(ch)))
        except Exception as e:
            print("card parse", name, e)
    return d0, out


def card_review(today_s, reasons, res, P, alerts, debts_by_pid):
    d0, C = load_cards(reasons, today_s)
    if not C:
        return "", {}
    cur_tasks = {(t["k"]): t for t in (res or {}).get("tasks") or []}
    fin_now = {x.get("pid") for x in (alerts or {}).get("finished_packages") or []}
    # بيخرج من القايمة الكاملة بس لما التقييم يتحجز أو يتعمل (مش لأن ميعاده بعيد)
    _pend = (alerts or {}).get("eval_pending")
    eval_now = {x.get("pid") for x in (_pend if _pend is not None else (alerts or {}).get("eval_due") or [])}
    amg_now = {x.get("pid") for x in (_pend if _pend is not None else (alerts or {}).get("amgad_eval") or [])}
    probs_now = defaultdict(set)
    for p in P or []:
        for key, _, _ in CARD_PROB:
            if key in p["t"]:
                probs_now[(PB_.get(p["b"]), key)].update(i["n"] for i in p["items"])

    def ok(kind, idv, br):
        if kind == "pay":
            return idv not in debts_by_pid
        if kind == "fin":
            return idv not in fin_now
        if kind == "eval":
            return idv not in eval_now
        if kind == "eval2":
            return idv not in amg_now
        if kind.startswith("prob:"):
            return idv not in probs_now[(br, kind[5:])]
        if kind == "plan":
            try:
                st = json.loads((reasons or {}).get("PLAN|" + idv) or "{}").get("s")
            except Exception:
                st = None
            t = cur_tasks.get(idv)
            return st in ("done", "auto", "nr") or bool(t and t["st"] in ("done", "nr"))
        return False
    rev, rows = {}, defaultdict(list)
    for name, c in C.items():
        done = tot = 0
        miss = []
        for sec in c.get("secs") or []:
            for it in sec.get("items") or []:
                for j, idv in enumerate(it.get("ids") or []):
                    tot += 1
                    if ok(it.get("k") or "", idv, c.get("br")):
                        done += 1
                    else:
                        nm = (it.get("ns") or [""])[j] if j < len(it.get("ns") or []) else ""
                        miss.append(f'{H(nm or "—")} {sub("(" + sec["t"].split("—")[0].strip() + ")")}')
        if tot:
            rev[name] = (done, tot)
            rows[c.get("br")].append((name, done, tot, miss))
    if not rows:
        return "", rev
    out = [f'<h3 style="margin:14px 0 4px">✅ مراجعة كروت {d0}</h3>',
           sub("اتعمل = ليه أثر على السيستم (اتدفع · اتحجز · خرج من القايمة · اتعلّم في الخطة) · ما ردش بيتحسب اتعمل")]
    for br in [b for b in BR_AR if b in rows]:
        lines = []
        for name, dn, tt, miss in sorted(rows[br], key=lambda r: r[1] / r[2]):
            col = "#16a34a" if dn >= 0.8 * tt else "#ea580c" if dn >= 0.5 * tt else "#dc2626"
            lst = ("<br>" + sub("ما اتعملش: ") + "، ".join(miss[:8]) + (sub(f" +{len(miss) - 8}") if len(miss) > 8 else "")) if miss else ""
            lines.append(f'<div style="margin:4px 0"><b>{H(name)}</b>: <b style="color:{col}">اتعمل {dn} من {tt} ({pc(dn, tt)})</b>{lst}</div>')
        out.append(f'<div style="border-inline-start:3px solid #0f766e;padding:2px 10px;margin:6px 0;font-size:13px"><b>🏥 {BR_AR[br]}</b>{"".join(lines)}</div>')
    return "".join(out), rev


PB_ = {"haram": "BODYFIX Center", "dokki": "FIX ZONE"}


# ================= 📋 زيارة د. أمجد للدقي: مين محتاجك (قبل الزيارة بيومين) =================
def dokki_visit(today_s, alerts):
    """قايمة بالأولويات للمرضى اللي يتحجزوا في ساعاتك: إعادة تقييم · 6 جلسات من غير تقييم · خلص الباقة وما جددش · بيلغوا ورا بعض"""
    from datetime import date as _d
    A = alerts or {}
    nd = A.get("amgad_dokki_next")
    if not nd:
        return ""
    gap = (_d.fromisoformat(nd) - _d.fromisoformat(today_s)).days
    if not (0 < gap <= 3):
        return ""
    Z = "FIX ZONE"
    from digest_fin import doc_ar as dr
    nx = lambda x: (f'ميعاده الجاي {str(x["next"]["time"])[8:10]}/{str(x["next"]["time"])[5:7]}' if x.get("next") else "مالوش ميعاد")
    G = []
    G.append(("🩺 إعادة تقييم (كشفوا مع دكتور تاني)", [
        f'{H(x["name"])} {sub("— كشف مع " + H(dr(x["kashf"]["doctor"])) + " " + x["kashf"]["date"][8:] + "/" + x["kashf"]["date"][5:7] + " · " + nx(x))}'
        for x in A.get("amgad_eval") or []]))
    G.append(("🔢 6 جلسات أو أكتر من غير تقييم", [
        f'{H(x["name"])} {sub("— " + str(x["n6"]) + " جلسات · " + nx(x))}'
        for x in A.get("eval_pending") or [] if x.get("branch") == Z and x.get("n6") is not None and not x.get("kashf_other")]))
    G.append(("🔁 خلص الباقة وما جددش (آخر 30 يوم)", [
        f'{H(x["name"])} {sub("— آخر جلسة من " + str(x.get("days_since")) + " يوم مع " + H(dr(x.get("doctor"))))}'
        for x in A.get("finished_packages") or [] if x.get("branch") == Z and (x.get("days_since") or 99) <= 30]))
    G.append(("⚠️ بيلغوا ورا بعض", [
        f'{H(x["name"])} {sub("— لغى/غاب " + str(x.get("lost")) + " مرات · مع " + H(dr(x.get("doctor"))))}'
        for x in A.get("recur_cancel") or [] if x.get("branch") == Z]))
    G = [(t, L) for t, L in G if L]
    if not G:
        return ""
    wd = WD[_d.fromisoformat(nd).weekday()]
    tot = sum(len(L) for _, L in G)
    body = "".join(f'<div style="margin:6px 0"><b>{t}</b> ({len(L)})<ul style="margin:2px 0;padding-inline-start:18px">{"".join("<li>" + x + "</li>" for x in L[:10])}</ul>'
                   + (sub(f"+ {len(L) - 10} كمان") if len(L) > 10 else "") + "</div>" for t, L in G)
    return (f'<h3 style="margin:18px 0 6px">📋 زيارتك للدقي يوم {wd} {int(nd[8:])}/{int(nd[5:7])} — {tot} مريض محتاجك</h3>'
            f'<div style="font-size:13px;border-inline-start:3px solid #7c3aed;padding:2px 10px">{body}'
            + sub("خلّي الاستقبال يحجزهم في ساعاتك بالترتيب ده · اللي اتحجزله إعادة تقييم معاك بيختفي من القايمة") + "</div>")
