# -*- coding: utf-8 -*-
"""📈 تقرير الأسبوع (الخميس بالليل): الأسبوع قصاد متوسط آخر 4 أسابيع وقصاد السنة اللي فاتت لكل فرع ·
الاستمرار بعد أول شهر · الخدمات اللي متدفعتش · ترتيب السكرتارية (الكروت + الخطة) · أهم 3 حاجات للأسبوع الجاي."""
import json
from datetime import date, timedelta
from collections import defaultdict
import digest_fin as F

H = F.H
sub = F.sub
money = F.money
TH = 'style="padding:5px 6px;background:#f1f5f9;color:#475569;font-size:11px;font-weight:600"'
TD = 'style="padding:5px 6px;border-top:1px solid #e2e8f0;text-align:center;font-size:12.5px"'


def week_metrics(x, a, b):
    """مقاييس فترة (من a لـ b شامل)"""
    P = x.period(a.isoformat(), b.isoformat())
    ex = exb = bk = lost = 0
    d = a
    while d <= b:
        m = x.day(d.isoformat())
        ex += m["ex"]; exb += m["exB"]; bk += m["booked"]
        lost += round((m["canc"] or 0) * m["booked"])
        d += timedelta(days=1)
    return {"rev": P["rev"], "ses": P["ses"], "np": P["np"], "exR": exb / ex if ex else None, "canc": lost / bk if bk else None, "ex": ex}


def continuation(x, lo, hi):
    """مرضى أول زيارتهم بين lo و hi: كام % جم جلسة بين اليوم 31 و 60 من أول زيارة"""
    n = c = 0
    for pid, f in x.first.items():
        if f[:7] == x.m0 or not (lo <= f <= hi):
            continue
        fd = date.fromisoformat(f)
        a, b = (fd + timedelta(days=31)).isoformat(), (fd + timedelta(days=60)).isoformat()
        n += 1
        if any(ap["st"] in F.DONE and a <= ap["d"] <= b for ap in x.byp.get(pid, [])):
            c += 1
    return (c / n if n else None), n


def arrow(v, rate=False, good=1):
    return F.arrow(v, rate, good)


def ch(a, b, r=False):
    return F.ch(a, b, r)


MET = [("rev", "💰 التحصيل", False, 1), ("ses", "✅ الجلسات", False, 1), ("np", "🆕 مرضى جداد", False, 1),
       ("exR", "🩺 الكشف اتحول لحجز", True, 1), ("canc", "❌ الإلغاء والغياب", True, -1)]


def build(today_s, reasons):
    data = F.load()
    if not data:
        return ""
    t = date.fromisoformat(today_s)
    a = t - timedelta(days=6)                  # آخر 7 أيام (السبت → الخميس)
    B = {b: F.Br(data, b) for b in F.BR}
    B = {b: x for b, x in B.items() if x.ok}
    out = [f'<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#0f172a;max-width:640px;margin:auto">',
           f'<h2 style="margin:0">📈 تقرير الأسبوع — {a.day}/{a.month} لـ {t.day}/{t.month}</h2>',
           sub("«عن العادي» = متوسط آخر 4 أسابيع · «عن السنة اللي فاتت» = نفس الأسبوع السنة اللي فاتت")]
    flags = []   # (الأهمية، الجملة) — أهم 3 حاجات
    for b, x in B.items():
        cur = week_metrics(x, a, t)
        prev = [week_metrics(x, a - timedelta(days=7 * k), t - timedelta(days=7 * k)) for k in range(1, 5)]
        ly = week_metrics(x, a - timedelta(days=364), t - timedelta(days=364))
        avg = {}
        for k, *_ in MET:
            v = [p[k] for p in prev if p[k] is not None]
            avg[k] = sum(v) / len(v) if v else None
        rows = []
        for k, lbl, r, good in MET:
            v = cur[k]
            f = "—" if v is None else (f"{v * 100:.0f}%" if r else money(v))
            c1, c2 = ch(v, avg[k], r), (ch(v, ly[k], r) if ly["ses"] else None)
            rows.append(f'<tr><td {TD.replace("center", "right")}>{lbl}</td><td {TD}><b>{f}</b></td><td {TD}>{arrow(c1, r, good)}</td><td {TD}>{arrow(c2, r, good) or "—"}</td></tr>')
            if c1 is not None:
                bad = (c1 < 0) == (good > 0)
                lim = 0.05 if r else 0.10
                if bad and abs(c1) >= lim:
                    flags.append((abs(c1) * (2 if k in ("rev", "exR") else 1), f'{F.BR[b]}: {lbl[2:].strip()} {"قل" if c1 < 0 else "زاد"} {abs(c1) * 100:.0f}{" نقطة" if r else "%"} عن العادي'))
        c_now, n_now = continuation(x, (t - timedelta(days=88)).isoformat(), (t - timedelta(days=60)).isoformat())
        c_prev, n_prev = continuation(x, (t - timedelta(days=116)).isoformat(), (t - timedelta(days=89)).isoformat())
        cont = ""
        if c_now is not None:
            d = ch(c_now, c_prev, True)
            cont = (f'<div style="font-size:12.5px;margin:6px 0">🔄 <b>الاستمرار بعد أول شهر</b>: {c_now * 100:.0f}% من {n_now} مريض جديد '
                    f'{sub("(جم جلسة بين اليوم 31 و60 من أول زيارة · مرضى أول زيارتهم من 60–88 يوم)")} {arrow(d, True, 1)} {sub("عن الـ 4 أسابيع اللي قبلهم") if d is not None else ""}</div>')
            if d is not None and d <= -0.05:
                flags.append((abs(d) * 2, f"{F.BR[b]}: الاستمرار بعد أول شهر نزل {abs(d) * 100:.0f} نقطة ({c_now * 100:.0f}%) — راجع مع الدكاترة المرضى اللي وقفوا"))
        out.append(f'<h3 style="margin:16px 0 6px">🏥 {F.BR[b]}</h3>'
                   f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr><th {TH}></th><th {TH}>الأسبوع</th><th {TH}>عن العادي</th><th {TH}>عن السنة اللي فاتت</th></tr>{"".join(rows)}</table>{cont}')
    # 🏥 الدقي: د. محمود قصاد د. أمجد في الكشف · أكتر أيام وساعات زحمة · كام مريض محتاج د. أمجد في الزيارة
    try:
        out.append(dokki_block(B.get("dokki"), t, flags))
    except Exception as e:
        print("week dokki:", e)
    # 💸 خدمات اتعملت ومتدفعتش: اتفتح كام واتقفل كام (من حالة الإيميل اليومي)
    try:
        S = json.load(open(F.STATE_F, encoding="utf-8")).get("days") or {}
        ks = sorted(S)
        k0 = max([k for k in ks if k <= (t - timedelta(days=7)).isoformat()] or [ks[0]]) if ks else None
        k1 = max([k for k in ks if k <= today_s] or [None]) if ks else None
        if k0 and k1 and k0 < k1:
            lines = []
            for b in F.BR:
                s0, s1 = set(S[k0].get(b) or []), set(S[k1].get(b) or [])
                op, cl = len(s1 - s0), len(s0 - s1)
                lines.append(f'<b>{F.BR[b]}</b>: اتفتح {op} · اتقفل {cl} · مفتوح دلوقتي {len(s1)}')
                if op > cl:
                    flags.append((0.3 + (op - cl) / 50, f"{F.BR[b]}: الخدمات اللي متدفعتش بتزيد ({op} اتفتحت و{cl} اتقفلت) — التحصيل وهو جوه"))
            out.append(f'<h3 style="margin:16px 0 6px">💸 خدمات اتعملت ومتدفعتش</h3><div style="font-size:12.5px;line-height:1.9">{"<br>".join(lines)}</div>'
                       + sub(f"من {k0} لـ {k1} (عدد الخدمات)"))
    except Exception as e:
        print("week unpaid:", e)
    # 🏅 السكرتارية: الكروت + الخطة في الأسبوع
    days = {(a + timedelta(days=i)).isoformat() for i in range(7)}
    sec = defaultdict(lambda: {"cd": 0, "ct": 0, "n": 0, "dn": 0, "open": 0})
    for k, v in (reasons or {}).items():
        p = k.split("|")
        if len(p) >= 3 and p[1] in days:
            try:
                if p[0] == "CARDREV":
                    d_, t_ = (int(z) for z in str(v).split("/"))
                    sec[p[2]]["cd"] += d_; sec[p[2]]["ct"] += t_
                elif p[0] == "PERF":
                    o = json.loads(v)
                    for g, z in (o.get("g") or {}).items():
                        sec[p[2]]["n"] += int(z.get("n") or 0)
                        sec[p[2]]["dn"] += int(z.get("sys") or 0) + int(z.get("btn") or 0)
                        sec[p[2]]["open"] += int(z.get("open") or 0)
            except Exception:
                pass
    sec = {k: v for k, v in sec.items() if k not in ("_none", "", "المدير") and (v["n"] or v["ct"])}
    if sec:
        pc = lambda d, n: f"{round(d * 100 / n)}%" if n else "—"
        score = lambda v: (v["cd"] / v["ct"] if v["ct"] else 0) * 0.6 + (v["dn"] / v["n"] if v["n"] else 0) * 0.4
        L = sorted(sec.items(), key=lambda kv: -score(kv[1]))
        rows = "".join(f'<tr><td {TD.replace("center", "right")}>{"🥇" if i == 0 else ""}<b>{H(n)}</b></td><td {TD}>{pc(v["cd"], v["ct"])} {sub("(" + str(v["cd"]) + "/" + str(v["ct"]) + ")") if v["ct"] else ""}</td>'
                       f'<td {TD}>{pc(v["dn"], v["n"])}</td><td {TD}>{v["open"]}</td></tr>' for i, (n, v) in enumerate(L))
        out.append(f'<h3 style="margin:16px 0 6px">🏅 السكرتارية في الأسبوع</h3><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0">'
                   f'<tr><th {TH}>السكرتيرة</th><th {TH}>نفّذت من الكروت</th><th {TH}>الخطة اتعمل</th><th {TH}>مهام فاتت</th></tr>{rows}</table>'
                   + sub("الكروت = اللي اتعمل فعلاً من كارت كل يوم (ليه أثر على السيستم) · الترتيب: الكروت 60% + الخطة 40%"))
        worst = L[-1]
        if worst[1]["ct"] and worst[1]["cd"] / worst[1]["ct"] < 0.6:
            flags.append((0.4, f'{worst[0]} نفّذت {pc(worst[1]["cd"], worst[1]["ct"])} بس من كروتها — اقعد معاها على اللي بيفوتها'))
    flags.sort(key=lambda f: -f[0])
    top = "".join(f"<li style='margin:3px 0'>{H(f[1])}</li>" for f in flags[:3]) or "<li>مفيش حاجة محتاجة تدخل — الأسبوع ماشي زي العادي أو أحسن 👍</li>"
    out.insert(3, f'<div style="border:2px solid #0f172a;border-radius:10px;padding:8px 12px;margin:12px 0;font-size:13.5px"><b>🎯 أهم 3 حاجات للأسبوع الجاي</b><ol style="margin:4px 0;padding-inline-start:20px">{top}</ol></div>')
    out.append("</div>")
    return "".join(out)


WDN = ["الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت", "الحد"]


def dokki_block(x, t, flags):
    if not x:
        return ""
    lo, hi = (t - timedelta(days=90)).isoformat(), (t - timedelta(days=30)).isoformat()
    td = t.isoformat()
    by = defaultdict(lambda: [0, 0])
    for pid, L in x.byp.items():
        for e in L:
            if e["st"] in F.DONE and e["ty"] in x.exam_t and lo <= e["d"] <= hi:
                lim = (date.fromisoformat(e["d"]) + timedelta(days=30)).isoformat()
                conv = any(a is not e and a["ty"] not in x.exam_t and ((a["st"] in F.DONE and e["d"] < a["d"] <= lim) or (a["d"] >= td and a["st"] not in F.LOST)) for a in L)
                z = by[F.doc_ar(e["doc"]) if e["doc"] else "—"]
                z[0] += 1; z[1] += conv
    rows = "".join(f'<tr><td {TD.replace("center", "right")}>{H(d)}</td><td {TD}>{n}</td><td {TD}><b>{round(c * 100 / n)}%</b></td></tr>'
                   for d, (n, c) in sorted(by.items(), key=lambda kv: -kv[1][0]) if n >= 3)
    # الزحمة: آخر 8 أسابيع
    w0 = (t - timedelta(days=56)).isoformat()
    slot, exd = defaultdict(int), defaultdict(int)
    for a in x.apt:
        if w0 <= a["d"] <= td and a["st"] in F.DONE:
            wd = date.fromisoformat(a["d"]).weekday()
            slot[(wd, a["h"])] += 1
            if a["ty"] in x.exam_t:
                exd[wd] += 1
    top = sorted(slot.items(), key=lambda kv: -kv[1])[:4]
    tops = "، ".join(f"{WDN[w]} {h if h <= 12 else h - 12}{'م' if h >= 12 else 'ص'} ({round(n / 8, 1)} مريض)" for (w, h), n in top)
    tex = "، ".join(f"{WDN[w]} ({n})" for w, n in sorted(exd.items(), key=lambda kv: -kv[1])[:3])
    need = ""
    try:
        A = json.load(open("alerts.json", encoding="utf-8"))
        n1 = len(A.get("amgad_eval") or [])
        n2 = sum(1 for z in A.get("eval_pending") or [] if z.get("branch") == "FIX ZONE" and z.get("n6") is not None and not z.get("kashf_other"))
        need = f"<br>👨‍⚕️ <b>محتاجينك دلوقتي</b>: {n1} إعادة تقييم (كشفوا مع دكتور تاني) + {n2} عندهم 6 جلسات من غير تقييم"
    except Exception:
        pass
    amg = [(d, n, c) for d, (n, c) in by.items() if "أمجد" in d]
    oth = [(d, n, c) for d, (n, c) in by.items() if "أمجد" not in d and n >= 5]
    if amg and oth:
        ra = amg[0][2] / amg[0][1] if amg[0][1] else 0
        for d, n, c in oth:
            if ra - c / n >= 0.15:
                flags.append((0.5, f"الدقي: كشوفات {d} بتتحول {round(c * 100 / n)}% بس قصاد {round(ra * 100)}% لكشوفاتك — مكالمة فيديو معاك وقت الكشف أو احجز الكشوفات في يومك"))
    return (f'<h3 style="margin:16px 0 6px">🏥 الدقي — الكشف والزحمة</h3>'
            + (f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr><th {TH}>الدكتور</th><th {TH}>كشوفات</th><th {TH}>اتحول لجلسات</th></tr>{rows}</table>'
               + sub("كشوفات من 30–90 يوم · «اتحول» = حضر جلسة في خلال 30 يوم من الكشف أو ليه ميعاد جاي") if rows else "")
            + f'<div style="font-size:12.5px;line-height:1.9;margin-top:6px">⏰ <b>أكتر ساعات زحمة</b> (متوسط في الأسبوع، آخر 8 أسابيع): {tops or "—"}'
            + f'<br>🩺 <b>أكتر أيام فيها كشوفات</b>: {tex or "—"}{need}</div>')
