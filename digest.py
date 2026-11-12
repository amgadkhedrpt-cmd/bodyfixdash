# -*- coding: utf-8 -*-
"""ملخص آخر اليوم بالإيميل — بيشتغل بعد السحب وأداة التحصيل، مرة واحدة في اليوم بعد الساعة 9 بالليل.
المصادر: alerts.json (من السحب) · .session/digest_ctx.json (المواعيد + فواتير اليوم) · .session/paid.json (المدفوعات من التحصيل)
         · شيت التثبيتات (الشيفتات والمرضى المتثبتين) · شيت الغيابات."""
import json, os, re, smtplib, urllib.request
from collections import defaultdict, Counter
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

CAIRO = timezone(timedelta(hours=2))
DIGEST_HOUR = 23
DASH_URL = "https://amgadkhedrpt-cmd.github.io/bodyfixdash/"
SHEETS = {
    "BODYFIX Center": "https://script.google.com/macros/s/AKfycbx2zEjS2Bk3IT9NAQgounmv_YRNGCNvbgqt5sxkyVjkIlGbprO69rA3CmSdoqu_V3j_/exec",
    "FIX ZONE": "https://script.google.com/macros/s/AKfycbyAW7vO8RLqdUccJwn_7Pz1rXSwYwqt5D-dTezRuNBEll28CdqXKUuXxQzkrHgAa3De/exec",
}
ATT_URL = "https://script.google.com/macros/s/AKfycbz1IT5SQheUyc1OHYJW-MyA5ALGukul3guWqYSsNOcwjhZhVOFPng1fdfkkCE_yZYoy/exec"
BR_AR = {"BODYFIX Center": "الهرم", "FIX ZONE": "الدقي"}
PAY_KEY = {"BODYFIX Center": "haram", "FIX ZONE": "dokki"}
ATT_NAME_MAP = {'Abeer': 'Abeer Osman', 'Dr. Adel Ashraf': 'Adel Ashraf Abdullah', 'Dr. Ahmad Ibrahim': 'Ahmad Ibrahim', 'Dr. Ahmad': 'Ahmad Ibrahim',
                'Dr. Ahmad Mokhtar': 'Ahmad Mokhtar', 'Dr. Ahmed Ashraf': 'Ahmed Ashraf', 'Dr. Alaa Harfoush': 'Alaa Harfoush',
                'Dr. Mohammad Reda': 'Mohamed Reda', 'Dr. Sara Hussein': 'Sarah Hussein', 'Dr. Yasmin Ayman': 'Yasmin Ayman',
                'Dr. Yasmin Mohamad': 'Yasmin Mohammad', 'Dr. Yasmin Sakr': 'Yasmin Sakr', 'Gomaa Mohammad': 'Gomaa Mohammad', 'Hisham': 'Hisham',
                'Mahmoud El Kashef': 'Mahmoud El Kashef', 'Mahmoud Gomaa': 'Mahmoud Gomaa', 'Malak Ashour': 'Malak Ashour', 'Malak': 'Malak Mohammad',
                'Mohammad Alaa': 'Mohammad Alaa', 'Roba': 'Roba', 'Sarah Ahmad': 'Sara Ahmad', 'Shorouk': 'Sherouk', 'Basmala': 'Basmala',
                'Ola Mohammad': 'Ola Mohammad', 'Ahmad Abdelaal': 'Ahmad Abdelaal', 'Dr. Abdelrahman Abdelbaset': 'Abdelrahman Abdelbaset',
                'Georgina': 'Georgina Farid', 'Dr. Mona Magdy': 'Mona Magdy', 'Dr. Martina': 'Martina Monis', 'Dr. Manar': 'Manar Magdy',
                'Nayera Mahmoud': 'Nayera'}
ATTENDED = {"completed", "checked in", "checkedin", "in progress", "inprogress"}
ACTIVE = ATTENDED | {"confirmed", "open", "delayed", "note"}            # بيشغل ساعة في جدول الدكتور
DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]          # datetime.weekday()
SLIM_SESS = {"Cavitation": "Cavitation", "RF": "RF", "Cryo-blade": "Cryo-blade", "Cryo-Air": "Cryo-Air", "Cryo": "Cryo",
             "Excilis": "Excilis", "جلسه تصريف ليمفاوي": "تصريف ليمفاوي", "أجهزه": "أجهزه"}

H = lambda x: str(x if x is not None else "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
money = lambda v: f"{int(round(v or 0)):,}"


def norm(s):
    s = str(s or "").strip()
    s = re.sub("[أإآٱ]", "ا", s).replace("ى", "ي").replace("ة", "ه").replace("ـ", "")
    s = re.sub(r"[ً-ٟ]", "", s)
    s = re.sub(r"^(dr\.?|د\.?)\s*", "", s, flags=re.I)
    s = re.sub(r"[.\-_,()/\\0-9]", " ", s)
    return re.sub(r"\s+", " ", s).strip().lower()


def get_json(url, timeout=40):
    req = urllib.request.Request(url + ("&" if "?" in url else "?") + "callback=cb", headers={"User-Agent": "bodyfix-digest"})
    txt = urllib.request.urlopen(req, timeout=timeout).read().decode("utf-8", "replace").strip()
    m = re.match(r"^[\w$.]+\((.*)\)\s*;?\s*$", txt, re.S)
    return json.loads(m.group(1) if m else txt)


def parse_shift(t):
    if not t:
        return None
    p = str(t).replace(" ", "").split("-")
    try:
        f, to = int(p[0].split(":")[0]), int(p[1].split(":")[0])
    except Exception:
        return None
    if f < 12: f += 12
    if to < 12: to += 12
    return (f, to) if to > f else None


def ceil_hour(dt):
    return (dt.hour + (1 if dt.minute > 0 else 0)) % 24


def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def main():
    now = datetime.now(CAIRO)
    force = os.environ.get("DIGEST_FORCE") == "1"
    if now.hour < DIGEST_HOUR and not force:
        print("digest: لسه بدري"); return
    today_s = now.strftime("%Y-%m-%d")
    pk = load("packages.json", {"inv": {}})
    if (pk.get("_digest") or {}).get("date") == today_s and not force:
        print("digest: اتبعت النهارده"); return
    alerts = load("alerts.json", {})
    ctx = load(".session/digest_ctx.json", {})
    paid = load(".session/paid.json", {})
    if paid.get("date") != today_s:
        paid = {}
    html = build(now, alerts, ctx, paid)
    try:
        html = html.replace("<!--PLAN-->", plan_section(today_s))
    except Exception as e:
        print(f"digest plan: {e}")
    user, pw = os.environ.get("GMAIL_USER", ""), os.environ.get("GMAIL_APP_PASS", "")
    to = os.environ.get("DIGEST_TO", "").strip() or user
    if os.environ.get("DIGEST_PREVIEW"):
        open(os.environ["DIGEST_PREVIEW"], "w", encoding="utf-8").write(html); print("preview written"); return
    if not (user and pw):
        print("digest: مفيش GMAIL_USER / GMAIL_APP_PASS"); return
    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"📋 ملخص BODYFIX — {today_s}"
    msg["From"], msg["To"] = user, to
    msg.attach(MIMEText(html, "html", "utf-8"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as sm:
        sm.login(user, pw)
        sm.sendmail(user, [to], msg.as_string())
    pk["_digest"] = {"date": today_s, "at": now.isoformat()}
    with open("packages.json", "w", encoding="utf-8") as f:
        json.dump(pk, f, ensure_ascii=False, separators=(",", ":"))
    print("📧 الملخص اتبعت")



REQ_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzy1UbUmQmVOLnrgP69vALV_RH8VlejQ5Npo9a9xS1u9Hhz5oRiPKF7GIgSVYAxCp_m/exec"
BR_AR = {"BODYFIX Center": "الهرم", "FIX ZONE": "الدقي"}


def plan_section(today_s):
    """✅ خطة اليوم: نسبة الإنجاز لكل فرع ولكل سكرتيرة + اللي اتعمل بالظبط مع كل مريض (من شيت الطلبات)."""
    raw = urllib.request.urlopen(REQ_SCRIPT_URL + "?action=getAll&callback=cb", timeout=40).read().decode("utf-8")
    m = re.search(r"cb\((.*)\)\s*;?\s*$", raw, re.S)
    data = json.loads(m.group(1) if m else raw)
    reasons = data.get("reasons") or {}
    summ, items = None, []
    for k, v in reasons.items():
        try:
            o = json.loads(v) if isinstance(v, str) and v.strip().startswith("{") else None
        except Exception:
            o = None
        if not o:
            continue
        if k == f"PLANSUM|{today_s}":
            summ = o
        elif k.startswith("PLAN|") and o.get("d") == today_s and o.get("s") in ("done", "auto", "nr") and o.get("name"):
            items.append(o)
    if not summ and not items:
        return '<h3 style="margin:16px 0 6px">✅ خطة اليوم</h3><div style="color:#64748b;font-size:13px">محدش فتح «خطة اليوم» النهارده</div>'
    H = lambda t: (str(t or "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    pc = lambda a, b: f"{round(a * 100 / b)}%" if b else "—"
    out = ['<h3 style="margin:16px 0 6px">✅ خطة اليوم — اتعمل إيه</h3>']
    if summ:
        rows = "".join(f'<tr><td style="padding:4px 8px">{H(BR_AR.get(b, b))}</td><td style="padding:4px 8px;text-align:center"><b>{pc(x["done"], x["tot"])}</b></td>'
                       f'<td style="padding:4px 8px;text-align:center">{x["done"]} من {x["tot"]}</td></tr>' for b, x in (summ.get("br") or {}).items() if x.get("tot"))
        out.append(f'<table style="border-collapse:collapse;font-size:13px;margin-bottom:6px"><tr style="color:#64748b;font-size:12px"><th style="text-align:right;padding:4px 8px">الفرع</th><th>الإنجاز</th><th></th></tr>{rows}</table>')
        sec = summ.get("sec") or {}
        if sec:
            rows = "".join(f'<tr><td style="padding:4px 8px"><b>{H(n)}</b></td><td style="padding:4px 8px;text-align:center"><b>{pc(x["done"], x["tot"])}</b></td>'
                           f'<td style="padding:4px 8px;text-align:center">{x["done"]} من {x["tot"]}</td><td style="padding:4px 8px;text-align:center">{x.get("hand", 0)}</td></tr>'
                           for n, x in sorted(sec.items(), key=lambda kv: -(kv[1]["done"] / kv[1]["tot"] if kv[1]["tot"] else 0)))
            out.append(f'<table style="border-collapse:collapse;font-size:13px;margin-bottom:6px"><tr style="color:#64748b;font-size:12px"><th style="text-align:right;padding:4px 8px">السكرتيرة</th><th>الإنجاز</th><th>مهامها</th><th>بإيدها</th></tr>{rows}</table>')
        # المهام اللي فاضلة لكل نوع
        left = []
        for b, x in (summ.get("br") or {}).items():
            for g, y in (x.get("groups") or {}).items():
                if y["tot"] - y["done"] > 0:
                    left.append(f'{H(g)} ({H(BR_AR.get(b, b))}): {y["tot"] - y["done"]}')
        if left:
            out.append(f'<div style="font-size:12px;color:#b91c1c;margin:4px 0 8px">⏳ لسه ما اتعملش — {" · ".join(left[:12])}</div>')
    groups = {}
    for o in items:
        groups.setdefault(o.get("kind") or "أخرى", []).append(o)
    for g, L in groups.items():
        L.sort(key=lambda o: o.get("s") != "done")
        lis = "".join(
            f'<li style="margin:2px 0">{H(o["name"])} <span style="color:#64748b">— {H(BR_AR.get(o.get("br"), o.get("br", "")))}'
            f' · {"📞 ما ردش" if o.get("s") == "nr" else ("✅ " + H(o.get("by")) if o.get("s") == "done" else "🤖 على السيستم")} {H(o.get("at", ""))}</span>'
            + (f'<div style="font-size:12px;color:#0f766e">📌 {H(o.get("what") or o.get("note"))}</div>' if (o.get("what") or o.get("note")) else "")
            + "</li>" for o in L[:12])
        more = f'<div style="color:#64748b;font-size:12px">+ {len(L) - 12} كمان</div>' if len(L) > 12 else ""
        out.append(f'<div style="border-inline-start:3px solid #16a34a;padding:4px 10px;margin:8px 0"><div style="font-size:13px;font-weight:700">{H(g)}: {len(L)}</div>'
                   f'<ul style="margin:2px 0;padding-inline-start:18px;font-size:13px">{lis}</ul>{more}</div>')
    return "".join(out)


def build(now, alerts, ctx, paid):
    today = now.date()
    today_s = today.isoformat()
    svc = lambda t: bool(re.search(r"جلسة?\s*علاج\s*طبيع|ريكفر|حجام", t or "")) and not re.search(r"منزل|اونلاين|أونلاين|online", t or "", re.I)
    A = []
    for r in ctx.get("appts") or []:
        try:
            A.append({**r, "dt": datetime.fromisoformat(r["start"]).astimezone(CAIRO)})
        except Exception:
            pass
    inv_stats = ctx.get("inv_stats") or {}

    # ── شيت التثبيتات + الغيابات ──
    sheets, sheet_err = {}, []
    for br, url in SHEETS.items():
        try:
            d = get_json(url + "?action=getData")
            sheets[br] = d.get("doctors") or [] if isinstance(d, dict) else []
        except Exception as e:
            sheets[br] = []; sheet_err.append(f"{BR_AR[br]}: {str(e)[:60]}")
    att = {}
    try:
        q = (today.month - 1) // 3 + 1
        d = get_json(ATT_URL + f"?action=getAttendance&quarter={q}")
        att = ((d or {}).get("attendance") or {}).get(str(q)) or {}
    except Exception as e:
        sheet_err.append(f"الغيابات: {str(e)[:60]}")
    att_norm = {norm(k): v for k, v in att.items()}
    doc_map = load("doc_map.json", {})

    def att_code(doc_name, day):
        emp = ATT_NAME_MAP.get(doc_name) or doc_name
        rec = att.get(emp) or att_norm.get(norm(emp)) or att_norm.get(norm(doc_name)) or {}
        return re.sub(r"\s+", "", str(rec.get(day) or ""))

    def appts_of(doc_name, br, day):
        nd = norm(doc_name)
        out = []
        for a in A:
            if a["branch"] != br or a["dt"].date() != day:
                continue
            en = a["doctor"] or ""
            if en == doc_name or norm(en) == nd or norm(doc_map.get(en) or "") == nd or (len(nd) > 3 and (nd in norm(en) or norm(en) in nd) and len(norm(en)) > 3):
                out.append(a)
        return out

    def capacity(br, day):
        """ساعات الشيفت والساعات المحجوزة والفاضية لكل نوع (♂/♀) — الغايبين مش محسوبين."""
        key = DAY_KEYS[day.weekday()]
        res = {"male": [0, 0, 0], "female": [0, 0, 0]}          # [ساعات شيفت, محجوز, فاضي]
        for d in sheets.get(br) or []:
            name = d.get("name") or ""
            if norm(name) in ("امجد خضر",) or "amgad" in name.lower():
                continue
            sh = parse_shift((d.get("days") or {}).get(key))
            if not sh:
                continue
            code = att_code(name, day.isoformat())
            if code in ("غط", "غئ"):
                continue
            hours = list(range(sh[0], sh[1]))
            booked = {ceil_hour(a["dt"]) for a in appts_of(name, br, day) if a["status"] in ACTIVE}
            g = "female" if (d.get("gender") or "").startswith("f") else "male"
            res[g][0] += len(hours)
            res[g][1] += sum(1 for h in hours if h in booked)
            res[g][2] += sum(1 for h in hours if h not in booked)
        return res

    def fixed_index(br):
        idx = []
        for d in sheets.get(br) or []:
            for sl in (d.get("slots") or {}).values():
                p = (sl or {}).get("patient")
                if p and p not in ("-", "—"):
                    idx.append(norm(p))
        return idx

    def is_fixed(name, idx):
        n = norm(name)
        if not n:
            return False
        for f in idx:
            if f == n or (len(f.split()) >= 2 and (n + " ").startswith(f + " ")) or (len(n.split()) >= 2 and (f + " ").startswith(n + " ")):
                return True
        return False

    def day_stats(br, day):
        L = [a for a in A if a["branch"] == br and a["dt"].date() == day and svc(a["type"])]
        return {"L": L, "all": len(L), "att": sum(1 for a in L if a["status"] in ATTENDED),
                "loss": sum(1 for a in L if a["status"] in ("no show", "noshow", "canceled", "cancelled")),
                "cx": sum(1 for a in L if a["status"] in ("canceled", "cancelled")),
                "open": sum(1 for a in L if a["status"] == "open"), "wait": sum(1 for a in L if "wait" in a["status"])}

    def delta(a, b):
        if not b:
            return ""
        d = round((a - b) * 100 / b)
        return f'<span style="color:{"#16a34a" if d >= 0 else "#dc2626"};font-size:11px"> {"▲" if d >= 0 else "▼"}{abs(d)}%</span>'

    pct = lambda a, b: f"{round(a * 100 / b)}%" if b else "—"
    sub = lambda t: f'<span style="color:#64748b;font-size:11px">{t}</span>'
    week0 = today - timedelta(days=(today.weekday() - 5) % 7)
    fu = alerts.get("followups") or {}
    kind_ar = {"fu": "متابعه", "inq": "متابعه انقطاع"}
    verdict_ar = {"few_calls": "ما ردش ومكتوب أقل من 3 أوقات اتصال", "no_note": "مفيش ملحوظة خالص",
                  "unclear": "مش واضح رد ولا لأ", "callback_unbooked": "طلب نكلمه ومتحجزلوش متابعة"}

    cols, slim, acts = {}, {}, []
    pt_idx = {norm(r[0]): r for r in (alerts.get("pt_index") or []) if isinstance(r, list) and len(r) > 11}
    NOT_BILL = re.compile(r"متابعه$|متابعة$|متابعه انقطاع|منقطع|تقييم|موعد محجوز|الغاء|إلغاء|اعتذار|تقرير|استرداد|feedback|شكو|تصوير", re.I)
    BILLABLE = lambda t: bool(t) and not NOT_BILL.search(t.strip())
    for br, br_ar in BR_AR.items():
        inb = lambda x, br=br: (x.get("branch") or "") == br
        T, W, TM = day_stats(br, today), day_stats(br, today - timedelta(days=7)), day_stats(br, today + timedelta(days=1))
        wk = sum(day_stats(br, week0 + timedelta(days=i))["att"] for i in range((today - week0).days + 1))
        lwk = sum(day_stats(br, week0 - timedelta(days=7) + timedelta(days=i))["att"] for i in range((today - week0).days + 1))
        capT, capTM = capacity(br, today), capacity(br, today + timedelta(days=1))
        occ = lambda c, g=None: pct(sum(c[x][1] for x in ([g] if g else ("male", "female"))), sum(c[x][0] for x in ([g] if g else ("male", "female"))))
        ps = (paid.get("branches") or {}).get(PAY_KEY[br]) or {}
        ist = inv_stats.get(br) or {}
        pkgs = ist.get("pkgs") or {}
        fidx = fixed_index(br)
        kp = [x for x in alerts.get("kashf_pending") or [] if inb(x) and x.get("days_since") == 0]
        # كشوفات النهارده كلها (حتى اللي اتثبتوا): من المواعيد
        kashf_today = [a for a in A if a["branch"] == br and a["dt"].date() == today and "كشف" in a["type"] and "تغذ" not in a["type"]
                       and a["status"] not in ("canceled", "cancelled", "no show", "noshow")]
        k_names = {a["name"] for a in kashf_today}
        k_fixed = [n for n in k_names if is_fixed(n, fidx)]
        kp_map = {x["name"]: x for x in alerts.get("kashf_pending") or [] if inb(x)}
        k_booked = [n for n in k_names if n in k_fixed or (kp_map.get(n) or {}).get("next_pt") or (kp_map.get(n) or {}).get("sessions_after")]
        fin = [x for x in alerts.get("finished_packages") or [] if inb(x) and (x.get("days_since") or 99) <= 7]
        calls = [x for x in fu.get("calls") or [] if inb(x) and x.get("is_today")]
        came = [x for x in fu.get("returned") or [] if inb(x) and x.get("state") == "came" and str(x.get("ret_date", ""))[:10] == today_s]
        sd_rep = [x for x in alerts.get("sudden") or [] if inb(x) and str(x.get("date", ""))[:10] == today_s and (x.get("prior_sudden") or x.get("prior_noshow"))]
        mt = [x for x in alerts.get("missing_today") or [] if inb(x)]
        nn = [x for x in alerts.get("today_no_next") or [] if inb(x)]
        paid_today = ps.get("today") if ps else None
        cols[br_ar] = [
            f'<b>{T["att"]}</b>{delta(T["att"], W["att"])}',
            f'{T["loss"]} {sub("(" + pct(T["loss"], T["all"]) + ")")}',
            f'<b>{wk}</b>{delta(wk, lwk)}',
            f'<b>{occ(capT)}</b><br>{sub("♂ " + occ(capT, "male") + " · ♀ " + occ(capT, "female"))}',
            (f'<b>{money(paid_today)}</b>' + (f'<br>{sub(str(ps.get("today_n", 0)) + " دفعة")}' if ps.get("today_n") else "")) if paid_today is not None
            else (f'{money((ist.get("today") or {}).get("paid"))}<br>{sub("من الفواتير")}' if ist.get("today") else "—"),
            (money(ps["month"]) if ps.get("month") is not None else "—"),
            (" · ".join(f"باقة {k}: {v}" for k, v in sorted(pkgs.items(), key=lambda x: -int(x[0]))) or "0") if ist else "—",
            f'<b>{len(k_names)}</b><br>{sub("حجز " + str(len(k_booked)) + " · اتثبت " + str(len(k_fixed)))}',
            f'{len(came)}',
            f'<b>{TM["all"] - TM["cx"]}</b><br>{sub("Open " + str(TM["open"]) + " · Waiting " + str(TM["wait"]))}',
            f'{sub("♂")} {capT["male"][2]} · {sub("♀")} {capT["female"][2]}',
            f'{sub("♂")} {capTM["male"][2]} · {sub("♀")} {capTM["female"][2]}',
        ]
        # التخسيس
        D = [a for a in A if a["branch"] == br and a["dt"].date() == today]
        done = lambda a: a["status"] in ATTENDED
        cnt = lambda pred: (sum(1 for a in D if pred(a) and done(a)), sum(1 for a in D if pred(a) and a["status"] not in ("canceled", "cancelled")))
        sess = Counter(SLIM_SESS[a["type"]] for a in D if a["type"] in SLIM_SESS and done(a))
        inj = Counter(a["type"] for a in D if "حقن" in a["type"] and done(a))
        slim[br_ar] = {"kashf": cnt(lambda a: "كشف" in a["type"] and "تغذ" in a["type"]),
                       "fu": cnt(lambda a: "متابع" in a["type"] and "تغذ" in a["type"]),
                       "sess": sess, "inj": inj}
        # محتاج أكشن
        for n in sorted(k_names - set(k_booked)):
            acts.append(("🩺", "كشف النهارده وما حجزش جلسة", "#7c3aed", br_ar, n, ""))
        for n in sorted(set(k_booked) - set(k_fixed)):
            acts.append(("📌", "كشف وحجز بس لسه متثبتش في الشيت", "#9333ea", br_ar, n, ""))
        for x in fin:
            acts.append(("❌", "خلص باقته ومجددش (آخر أسبوع)", "#dc2626", br_ar, x["name"],
                         f'باقة {x.get("size") or 12} · ' + {"done": "دخل التقييم", "booked": "حاجز تقييم", "none": "ما دخلش التقييم"}.get(x.get("eval"), "")))
        for x in calls:
            if x.get("verdict") in verdict_ar:
                det = f'{kind_ar.get(x.get("kind"), "")} {x.get("step", "")} · {verdict_ar[x["verdict"]]}'
                if x.get("verdict") == "few_calls":
                    det += f' ({len(x.get("times") or [])} من 3)'
                if x.get("note"):
                    det += f' · «{str(x["note"])[:60]}»'
                acts.append(("📞", "متابعات النهارده — موقف كل واحد", "#ca8a04", br_ar, x["name"], det))
        for x in sd_rep:
            acts.append(("⚡", "اعتذار مفاجئ / No Show — ومتكرر", "#ea580c", br_ar, x["name"], "No Show" if x.get("kind") == "noshow" else "اعتذار مفاجئ"))
        for x in mt:
            acts.append(("🙋", "بييجي بانتظام ومالوش ميعاد النهارده", "#e11d48", br_ar, x["name"], ""))
        for x in [x for x in alerts.get("eval_due") or [] if inb(x) and x.get("day") == "tomorrow"]:
            acts.append(("🩺", "يوم الشغل الجاي جلسته السادسة أو أكتر من غير تقييم — احجزله تقييم", "#db2777", br_ar, x["name"], f'جلسة {x.get("n")}'))
        acts.append(("📅", "حضروا النهارده ومالهمش ميعاد جاي", "#0284c7", br_ar, None, len(nn)))

    labels = ["✅ حضروا النهارده", "❌ إلغاء + No Show", "📆 من أول الأسبوع", "📊 الإشغال النهارده", "💰 المدفوع النهارده",
              "💰 المدفوع من أول الشهر", "🛒 باقات اتباعت", "🩺 كشوفات النهارده", "🔁 رجعوا من المتابعة", "📅 بكره محجوز",
              "🔓 ساعات فاضية النهارده", "🔓 ساعات فاضية بكره"]
    brs = list(cols)
    td = lambda v: f'<td style="padding:6px;border-top:1px solid #e2e8f0;text-align:center;font-size:13px">{v}</td>'
    table = (f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr><th></th>'
             + "".join(f'<th style="padding:6px;background:#eff6ff;color:#1d4ed8">{b}</th>' for b in brs) + "</tr>"
             + "".join(f'<tr><td style="padding:6px;border-top:1px solid #e2e8f0;font-size:13px">{l}</td>' + "".join(td(cols[b][k]) for b in brs) + "</tr>"
                       for k, l in enumerate(labels)) + "</table>")
    # جدول التخسيس
    def slim_cell(b):
        s = slim[b]
        lines = [f'كشف تغذيه: <b>{s["kashf"][0]}</b>{sub(" من " + str(s["kashf"][1]))}',
                 f'متابعة تغذيه: <b>{s["fu"][0]}</b>{sub(" من " + str(s["fu"][1]))}']
        lines.append("جلسات: " + (" · ".join(f"{k} <b>{v}</b>" for k, v in s["sess"].most_common()) or "0"))
        lines.append("حقن: " + (" · ".join(f"{H(k.replace('حقن ', ''))} <b>{v}</b>" for k, v in s["inj"].most_common()) or "0"))
        return "<br>".join(lines)
    slim_tbl = (f'<table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0"><tr>'
                + "".join(f'<th style="padding:6px;background:#fdf2f8;color:#be185d">{b}</th>' for b in brs) + "</tr><tr>"
                + "".join(f'<td style="padding:8px;border-top:1px solid #e2e8f0;font-size:13px;vertical-align:top;line-height:1.8">{slim_cell(b)}</td>' for b in brs)
                + "</tr></table>")
    out = [f'<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#0f172a;max-width:620px;margin:auto">'
           f'<h2 style="margin:0">📋 ملخص يوم {today_s}</h2>'
           f'<div style="color:#64748b;font-size:12px;margin:2px 0 10px">▲▼ مقارنة بنفس اليوم الأسبوع اللي فات · الجلسات = علاج طبيعي + ريكفري + حجامه · '
           f'الإشغال = الساعات المحجوزة ÷ ساعات شيفت الدكاترة الحاضرين</div>', table,
           '<h3 style="margin:16px 0 6px">💗 التخسيس والتغذية (اللي حضر النهارده)</h3>', slim_tbl,
           '<h3 style="margin:16px 0 6px">🔴 محتاج أكشن</h3>']
    groups = {}
    for ic, title, col, b, name, det in acts:
        groups.setdefault((ic, title, col), []).append((b, name, det))
    shown = 0
    for (ic, title, col), items in groups.items():
        named = [it for it in items if it[1]]
        counts = [it for it in items if it[1] is None]
        if counts:
            tot = sum(int(c[2] or 0) for c in counts)
            if tot:
                shown += 1
                out.append(f'<div style="border-inline-start:3px solid {col};padding:4px 10px;margin:6px 0;font-size:13px">{ic} {title}: <b>{tot}</b> '
                           f'{sub("(" + " · ".join(f"{c[0]} {c[2]}" for c in counts if c[2]) + ")")} — الأسامي في الداشبورد</div>')
            continue
        if not named:
            continue
        shown += 1
        cap = 15 if ic == "📞" else 8
        lis = "".join(f'<li style="margin:2px 0">{H(n)} {sub("— " + b + ((" · " + H(d)) if d else ""))}</li>' for b, n, d in named[:cap])
        more = f'<div style="color:#64748b;font-size:12px">+ {len(named) - cap} كمان في الداشبورد</div>' if len(named) > cap else ""
        out.append(f'<div style="border-inline-start:3px solid {col};padding:4px 10px;margin:8px 0"><div style="font-size:13px;font-weight:700">{ic} {title}: {len(named)}</div>'
                   f'<ul style="margin:2px 0;padding-inline-start:18px;font-size:13px">{lis}</ul>{more}</div>')
    if not shown:
        out.append('<div style="color:#16a34a;font-size:13px">✅ مفيش حاجة محتاجة أكشن</div>')
    notes = []
    if not paid:
        notes.append("المدفوع جاي من الفواتير (أداة التحصيل ما بعتتش أرقام النهارده)")
    if sheet_err:
        notes.append("ما قدرتش أقرا: " + "، ".join(sheet_err))
    out.append("<!--PLAN-->")
    out.append(f'<div style="margin-top:14px"><a href="{DASH_URL}" style="background:#2563eb;color:#fff;padding:8px 16px;border-radius:8px;text-decoration:none;font-size:13px">افتح الداشبورد للتفاصيل ←</a></div>'
               + (f'<div style="color:#94a3b8;font-size:11px;margin-top:10px">{" · ".join(H(n) for n in notes)}</div>' if notes else "") + '</div>')
    return "".join(out)


if __name__ == "__main__":
    main()
