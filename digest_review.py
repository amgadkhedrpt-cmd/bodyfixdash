"""🔍 مراجعة اليوم في الإيميل الليلي: كل No Show / ملغي النهارده — اتأكد إمتى ومين · اتغيّر إمتى ومين · سبب الإلغاء · المكالمات قبلها.
البيانات: fin_sync (conf + cx — متشفرة بـ FIN_PASS) + سجل المكالمات من المخزن الخاص (SHEET_URL/SHEET_KEY). من غير أرقام تليفونات."""
import os, re, json, html, urllib.request as U
from datetime import datetime, timedelta, timezone

CAIRO = timezone(timedelta(hours=2))
H = lambda s: html.escape(str(s or ""))
TY = {"i": "in", "o": "out", "m": "miss", "q": "?"}
DOC_AR = {}


def wall(iso):
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(CAIRO).replace(tzinfo=None)
    except Exception:
        return None


def ph10(s):
    d = re.sub(r"\D", "", str(s or ""))
    return d[-10:] if len(d) >= 10 else ("0" + d if len(d) == 9 else d)


def hm(t):
    return "" if not t else f"{t.hour % 12 or 12}:{t.minute:02d} {'ص' if t.hour < 12 else 'م'}"


def dm(t):
    return "" if not t else f"{t.day:02d}/{t.month:02d} {hm(t)}"


def sheet(body):
    url, key = os.environ.get("SHEET_URL"), os.environ.get("SHEET_KEY")
    if not url or not key:
        return {}
    body = dict(body, key=key)
    req = U.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "text/plain;charset=utf-8"})
    return json.loads(U.urlopen(req, timeout=60).read())


def calls(months):
    out = {}
    for m in months:
        try:
            docs = (sheet({"action": "list", "prefix": f"calls/{m}/days"}) or {}).get("docs") or []
        except Exception as e:
            print("digest_review calls:", str(e)[:100]); docs = []
        for x in docs:
            d = x.get("data", x)
            if isinstance(d, str):
                try: d = json.loads(d)
                except Exception: continue
            day = d.get("d")
            if not day:
                continue
            base = datetime.fromisoformat(day)
            for r in d.get("r") or []:
                c = {"t": base + timedelta(seconds=r[1]), "ty": TY.get(r[2], "?"), "dur": r[3] or 0, "ln": d.get("ln")}
                out.setdefault(str(r[0]), []).append(c)
    return out


def table(fin, kind):
    out = []
    for mk, t in ((fin.get("kinds") or {}).get(kind) or {}).get("all", {}).items():
        cols = t.get("cols") or []
        for r in t.get("rows") or []:
            out.append({c: (r[i] if i < len(r) else None) for i, c in enumerate(cols)})
    return out


def section(today_s, roles=None):
    try:
        import digest_fin
        fin = digest_fin.load()
    except Exception as e:
        print("digest_review:", e); return ""
    if not fin or "cx" not in (fin.get("kinds") or {}):
        return ""
    day = today_s
    cx = [r for r in table(fin, "cx") if wall(r.get("start")) and wall(r["start"]).strftime("%Y-%m-%d") == day]
    if not cx:
        return ""
    conf = {r["aid"]: r for r in table(fin, "conf")}
    d0 = datetime.fromisoformat(day)
    C = calls(sorted({(d0 - timedelta(days=2)).strftime("%Y-%m"), d0.strftime("%Y-%m")}))
    have_calls = bool(C)
    roles = roles or {}
    rows, notes, cts = [], [], []
    for r in sorted(cx, key=lambda r: ("NO" not in str(r.get("st")).upper(), str(r.get("start")))):
        ns = "NO" in str(r.get("st")).upper()
        aT, upT = wall(r.get("start")), wall(r.get("up"))
        c = conf.get(r.get("aid"))
        cT = wall(c.get("up")) if c else None
        L = sorted(C.get(ph10(r.get("ph")), []) + (C.get(ph10(c.get("ph2")), []) if c and c.get("ph2") else []), key=lambda k: k["t"])
        L = [k for k in L if k["t"] < aT]
        ref = cT or aT
        before = [k for k in L if ref - timedelta(hours=36) <= k["t"] <= ref + timedelta(minutes=15)]
        talk = [k for k in L if k["dur"] > 0 and k["ty"] != "miss"]
        flags = []
        if c and have_calls and not any(k["dur"] > 0 and k["ty"] != "miss" for k in before):
            flags.append("اتأكد من غير مكالمة اترد عليها")
        rsn = r.get("rsn") or ""
        if re.search(r"عدم الرد|ما ردش|مردش|لا يرد", rsn) and have_calls and not any(k["ty"] == "out" and upT and upT - timedelta(days=3) <= k["t"] <= upT for k in L):
            flags.append("إلغاء «لعدم الرد» ومفيش محاولة اتصال")
        if c:
            cts.append(cT)
            ub = c.get("ub")
            if not ub:
                b = r.get("b"); h = cT.hour if cT else 12
                rk = ("DM" if h < 17 else "DE") if b == "dokki" else ("F" if h < 15 else "J")
                ub = ((roles.get("FIX ZONE" if b == "dokki" else "BODYFIX Center") or {}).get(rk) or "صاحب الشيفت") + " *"
            cf = f"✔️ {dm(cT)} · {H(ub)}"
        else:
            cf = "— ما اتأكدش"
        st = ("🚫 No Show" if ns else "✖️ اتلغى") + (f" {dm(upT)}" if upT else "") + (f" · {H(r.get('ub'))}" if r.get("ub") else "")
        cl = f"آخر كلام {dm(talk[-1]['t'])}" if talk else ("❌ ولا مكالمة اترد عليها" if have_calls else "—")
        rows.append((hm(aT), H(r.get("pn")), H(r.get("type")), H(r.get("doc")), cf, st, H(rsn) if not ns else "", cl, " · ".join("⚠️ " + f for f in flags)))
    nsr = [x for x in cx if "NO" in str(x.get("st")).upper()]
    if nsr:
        k = sum(1 for x in nsr if x.get("aid") in conf)
        notes.append(f"{len(nsr)} No Show — منهم {k} كانوا «مؤكد»")
    cts = sorted(t for t in cts if t)
    best = None
    for i in range(len(cts)):
        j = i
        while j + 1 < len(cts) and cts[j + 1] - cts[i] <= timedelta(minutes=30):
            j += 1
        if j - i >= 2 and (not best or j - i > best[2]):
            best = (cts[i], cts[j], j - i + 1)
    if best:
        notes.append(f"{best[2]} مواعيد اتعلّم عليهم «مؤكد» مع بعض: {dm(best[0])} – {hm(best[1])}")
    nfl = sum(1 for r in rows if "من غير مكالمة" in r[8])
    if nfl:
        notes.append(f"{nfl} اتأكدوا من غير مكالمة اترد عليها")
    th = "".join(f'<th style="padding:5px;background:#fef2f2;color:#991b1b;font-size:11px;text-align:right">{h}</th>' for h in
                 ("الميعاد", "المريض", "النوع", "الدكتور", "اتعلّم Confirmed · مين", "الحالة · إمتى · مين", "السبب", "المكالمات", "ملاحظات"))
    tr = "".join("<tr>" + "".join(f'<td style="padding:5px;border-top:1px solid #f1f5f9;font-size:11px;vertical-align:top{";color:#b91c1c;font-weight:bold" if i == 8 else ""}">{v}</td>' for i, v in enumerate(x)) + "</tr>" for x in rows)
    return (f'<h3 style="margin:18px 0 6px">🔍 مراجعة اليوم — No Show والملغي ({len(rows)})</h3>'
            + (f'<ul style="margin:4px 0;padding-inline-start:18px;font-size:12px;color:#7f1d1d">{"".join(f"<li>{H(n)}</li>" for n in notes)}</ul>' if notes else "")
            + f'<table style="width:100%;border-collapse:collapse;border:1px solid #fecaca">{"<tr>" + th + "</tr>" + tr}</table>'
            + '<div style="color:#64748b;font-size:11px;margin-top:4px">* اسم اللي أكد مش متسجل → صاحب الشيفت ساعتها · المكالمات من سجل الخطوط اللي اترفع · الواتساب مش بيظهر · الصورة: صفحة الماليات ← ✔️ التأكيدات ← 🔍 مراجعة يوم</div>')
