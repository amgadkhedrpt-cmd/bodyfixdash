# BodyFix sync: Medicolize -> collection tool sheet (same rules as the tool's file import)
import json, os, re, time, datetime as dt, urllib.request as U
from playwright.sync_api import sync_playwright

SITE = "https://my.medicolize.com"
SHEET, KEY = os.environ["SHEET_URL"], os.environ["SHEET_KEY"]
DRY = os.environ.get("DRY", "1") != "0"
REM_ONLY = os.environ.get("REM_ONLY", "1") != "0"
ADD_NEW = False  # only update patients already in the tool (owner decision 8 Oct)
from zoneinfo import ZoneInfo
TZ = ZoneInfo("Africa/Cairo")  # Egypt switches between UTC+3 (summer) and UTC+2 (winter)
now = dt.datetime.now(dt.timezone.utc)
cai = now.astimezone(TZ)
DAY = cai.strftime("%Y-%m-%d")
d0 = dt.datetime(cai.year, cai.month, cai.day, tzinfo=TZ).astimezone(dt.timezone.utc)
iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (d.microsecond // 1000)
S, E = iso(d0), iso(d0 + dt.timedelta(days=1) - dt.timedelta(milliseconds=1))
NOW = iso(now)
CAL = ("query C($b:ID!,$s:DateTime!,$e:DateTime!){calendar(branch:$b,start:$s,end:$e){id status start end type "
       "patient{id firstName lastName phoneNumber referenceId totalRemaining}}}")
CRT = ("query A($b:ID,$r:[DateTime!]!,$f:Filter){createdAppointments(branchId:$b,rangeDate:$r,orderBy:\"start-asc\","
       "skip:0,take:500,filters:$f){id patient{id referenceId firstPaymentDate dailyAmountPaid lastPaymentDate}}}")
STATUS = {"CHECKEDIN": "Checked In", "INPROGRESS": "In Progress", "COMPLETED": "Completed", "CONFIRMED": "Confirmed",
          "DELAYED": "Delayed", "OPEN": "Open", "WAITING": "Waiting", "CANCELED": "Canceled", "CANCELLED": "Canceled",
          "NOSHOW": "No Show"}
OK_NEW = {"Open", "Confirmed", "Checked In", "In Progress", "Completed", "Delayed", "Waiting"}
# follow-up / dropped-out call entries (the "Follow up" calendar, room "Waiting list"): متابعة، متابعة انقطاع، منقطع نهائي.
# They are phone follow-ups, not visits, so nothing is due from them.
FOLLOWUP_TYPES = {"Enum23", "Enum33", "Enum34"}
FOLLOW_ONLY = {}
EXPORT_ST = {"Open", "Confirmed", "Checked In", "In Progress", "Completed", "Delayed"}  # the morning export's Status filter
CRT2 = ("query A($b:ID,$r:[DateTime!]!,$f:Filter){createdAppointments(branchId:$b,rangeDate:$r,orderBy:\"start-asc\","
        "skip:0,take:500,filters:$f){id start status type patient{id referenceId totalRemaining}}}")
NOSHOW = re.compile(r"cancel|no ?show|missed|absent|ملغ|لم يحضر", re.I)
SEEN, DIAG, CAND, CFG, CAPT, PAID = {}, {}, {}, {}, [], {}


def dec(a, key):
    if isinstance(a, dict):
        return a[key]
    def r(i):
        v = a[i]
        if isinstance(v, dict):
            return {k: r(x) for k, x in v.items()}
        return [r(x) for x in v] if isinstance(v, list) else v
    return r(next(i for i, v in enumerate(a) if isinstance(v, dict) and key in v))[key]


def round_min(s):
    if not s:
        return None
    d = dt.datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    d = (d + dt.timedelta(seconds=30)).replace(second=0, microsecond=0)
    return iso(d.astimezone(dt.timezone.utc))


def name_key(n):
    s = re.sub("[ً-ْـ]", "", str(n or ""))
    s = re.sub("[أإآٱ]", "ا", s).replace("ة", "ه").replace("ى", "ي")
    s = re.sub("[^؀-ۿa-zA-Z0-9 ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub("(^| )(عبد|ابو|أبو) ", r"\1\2", s)
    s = re.sub(r"([؀-ۿ])\1+", r"\1", s)
    return " ".join([w for w in s.split(" ") if w not in ("بن", "ابن")][:3])


def flags(p):
    f = []
    if len(p["services"]) > 1:
        f.append("%d مواعيد — يتحاسب مرة واحدة" % len(p["services"]))
    if 0 < p["rem"] <= 20:
        f.append("فرق كسور")
    fp = p.get("firstPay")
    if fp and p["rem"] > 20:
        days = (dt.datetime.fromisoformat(DAY + "T00:00:00+00:00") - dt.datetime.fromisoformat(fp.replace("Z", "+00:00"))).total_seconds() / 86400
        if days <= 10:
            f.append("مريض جديد — غالبًا قسط باقة")
    return f


def sheet(body):
    body["key"] = KEY
    err = None
    for n in range(5):
        try:
            req = U.Request(SHEET, data=json.dumps(body).encode(), headers={"Content-Type": "text/plain;charset=utf-8"})
            j = json.loads(U.urlopen(req, timeout=90).read())
            if j.get("error") == "unauthorized":
                raise SystemExit("SHEET ERROR: unauthorized (check SHEET_KEY)")
            if j.get("ok", True) and not j.get("error"):
                return j
            err = j.get("error")
        except SystemExit:
            raise
        except Exception as e:
            err = str(e)[:120]
        time.sleep(3 * (n + 1))
    raise SystemExit("SHEET ERROR after retries: %s" % err)


STATE = os.environ.get("MZ_STATE") or os.path.join(".mz", "state.json")   # shared with the dashboard sync = one Medicolize login
GMAIL_USER = os.environ.get("GMAIL_USER", "").strip()
GMAIL_PASS = os.environ.get("GMAIL_APP_PASS", "").replace(" ", "").strip()


def gmail_code_once(since):
    """one look at Gmail (read-only IMAP) for a Medicolize/Dentolize login code sent after `since` (UTC datetime).
    Returns the code or "" — the caller keeps polling (and keeps accepting a code typed in the tool)."""
    if not GMAIL_USER or not GMAIL_PASS:
        return ""
    import imaplib, email
    from email.utils import parsedate_to_datetime
    from email.header import decode_header, make_header
    hdr = lambda v: str(make_header(decode_header(v or "")))
    M = imaplib.IMAP4_SSL("imap.gmail.com")
    try:
        M.login(GMAIL_USER, GMAIL_PASS)
        box = "INBOX"
        try:
            for b in M.list()[1] or []:
                line = b.decode(errors="ignore")
                if "\\All" in line:
                    box = line.split(' "/" ')[-1].strip()
                    break
        except Exception:
            pass
        M.select(box, readonly=True)
        _, ids = M.search(None, "(SINCE %s)" % (since - dt.timedelta(days=1)).strftime("%d-%b-%Y"))
        for mid in reversed(ids[0].split()[-25:]):
            _, data = M.fetch(mid, "(RFC822)")
            msg = email.message_from_bytes(data[0][1])
            try:
                sent = parsedate_to_datetime(msg["Date"]).astimezone(dt.timezone.utc)
            except Exception:
                continue
            if sent < since - dt.timedelta(seconds=90):
                continue
            frm, subj = hdr(msg.get("From")), hdr(msg.get("Subject"))
            if not re.search(r"medicolize|dentolize", frm + " " + subj, re.I):
                continue
            m = re.search(r"code[^0-9]{0,40}(\d{4,8})\b", subj, re.I)
            if not m:
                text = ""
                for part in msg.walk():
                    if part.get_content_type() in ("text/plain", "text/html"):
                        try:
                            text += part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "ignore") + " "
                        except Exception:
                            pass
                text = re.sub(r"<[^>]+>|&nbsp;", " ", text)
                m = re.search(r"(?<![\d#])(\d{6})(?!\d)", text)
            if m:
                print("login code found in Gmail (%s)" % sent.strftime("%H:%M:%S"))
                return m.group(1)
    finally:
        try:
            M.logout()
        except Exception:
            pass
    return ""


def login(pg, AUTH):
    if "/auth/login" not in pg.url:
        pg.goto(SITE + "/auth/login", wait_until="domcontentloaded", timeout=90000)
    pw = pg.locator("input[type=password]:visible").first
    pw.wait_for(timeout=60000)
    pg.wait_for_timeout(1500)
    user = os.environ["MEDICOLIZE_USER"].strip()
    mode = "email"
    if "@" not in user:
        try:
            pg.get_by_text(re.compile(r"login with username", re.I)).last.click(timeout=8000)
            pg.wait_for_timeout(1500)
            pw = pg.locator("input[type=password]:visible").first
            pw.wait_for(timeout=15000)
            mode = "username"
        except Exception as e:
            mode = "username-switch-failed"
            print("username switch not found:", e)
    box = pg.locator("input:visible:not([type=password]):not([type=hidden]):not([type=checkbox])").first
    box.click()
    box.fill(user)
    pw.click()
    pw.fill(os.environ["MEDICOLIZE_PASS"].strip())
    try:
        cb = pg.locator("input[type=checkbox]:visible").first
        if cb.count() and not cb.is_checked():
            cb.check(timeout=3000)   # Remember me: keeps the saved session valid longer
    except Exception:
        pass

    def submit():
        b = pg.locator("form button[type=submit]:visible")
        if not b.count():
            b = pg.get_by_role("button", name=re.compile(r"^\s*(login|log in|sign in|verify|continue|تسجيل الدخول|دخول)\s*$", re.I))
        try:
            b.last.click(timeout=8000)
        except Exception:
            pw.press("Enter")

    code_box = pg.locator("input[placeholder='000000']:visible, input[autocomplete='one-time-code']:visible, input[name*=code i]:visible")

    def wait_result(sec, code_counts=True):
        for _ in range(sec * 2):
            pg.wait_for_timeout(500)
            if "/auth/login" not in pg.url:
                return "in"
            if code_counts and code_box.count():
                return "code"
        return "code-rejected" if not code_counts else "stuck"

    clicked = dt.datetime.now(dt.timezone.utc)
    submit()
    res = wait_result(40)
    if res == "code":
        mode += "+code"
        asked = NOW
        print("Medicolize asked for the emailed verification code - waiting for it in the tool (config/mfa_code)")
        try:
            sheet({"action": "batch", "items": [{"path": "config/mfa_request", "data": {"at": asked, "need": True, "email": user[:3] + "***" + user[user.find("@"):] if "@" in user else ""}}]})
        except BaseException as e:
            print("could not ask for code:", e)
        code = ""
        gmail_ok = bool(GMAIL_USER and GMAIL_PASS)
        for _ in range(54):   # up to 9 minutes: the code is read from Gmail by itself, or typed in the tool
            if gmail_ok:
                try:
                    code = gmail_code_once(clicked)
                except Exception as e:
                    print("Gmail check failed (the tool's code box still works):", str(e)[:120])
                    gmail_ok = False
                if code:
                    break
            try:
                d = sheet({"action": "get", "path": "config/mfa_code"}).get("doc") or {}
                d = d.get("data", d) if isinstance(d, dict) else {}
                if isinstance(d, dict) and str(d.get("at") or "") > asked and re.fullmatch(r"\d{4,8}", str(d.get("code") or "").strip()):
                    code = str(d["code"]).strip()
                    break
            except BaseException:
                pass
            time.sleep(10)
        if code:
            code_box.first.fill(code)
            submit()
            res = wait_result(45, code_counts=False)   # the code box stays on screen until the page moves on
        else:
            res = "no-code"
    if res != "in":
        txt = ""
        try:
            txt = re.sub(r"\s+", " ", pg.inner_text("body"))[:800]
        except Exception:
            pass
        info = {"at": NOW, "day": DAY, "step": "login", "result": res, "mode": mode, "url": pg.url, "page_text": txt,
                "fields": pg.eval_on_selector_all("input:visible", "els => els.map(e => e.type + ':' + (e.name||e.placeholder||''))"),
                "auth_calls": []}
        for r in AUTH[-4:]:
            try:
                body = (r.text() or "")[:300]
            except Exception as e:
                body = "?" + str(e)[:60]
            info["auth_calls"].append({"url": r.url[-60:], "status": r.status, "body": body})
        print("LOGIN FAILED:", json.dumps(info, ensure_ascii=False))
        try:
            sheet({"action": "batch", "items": [{"path": "config/sync_error", "data": info}]})
        except BaseException as e:
            print("could not write error to sheet:", e)
        raise SystemExit("LOGIN FAILED (%s) - see page_text above" % res)
    return mode


def fetch():
    out = {}
    with sync_playwright() as p:
        try:
            br = p.chromium.launch(channel="chrome")
        except Exception:
            br = p.chromium.launch()
        # a saved Medicolize session (kept between runs by the workflow cache) avoids logging in again:
        # since 30 Oct a login from outside Egypt needs a code that Medicolize emails to the account owner
        ctx = br.new_context(storage_state=STATE) if os.path.exists(STATE) else br.new_context()
        pg = ctx.new_page()

        def on_req(r):
            try:
                b = r.post_data_json
            except Exception:
                return
            if isinstance(b, dict) and "query" in b:
                CAPT.append(b)
                SEEN["url"] = r.url
                SEEN["h"] = {k: v for k, v in r.headers.items() if k[:2] == "x-" or k in ("content-type", "authorization")}
        pg.on("request", on_req)
        AUTH = []

        def on_resp(r):
            try:
                pd = r.request.post_data or ""
                if r.request.method == "POST" and re.search(r"login|signin|sign_in|auth|token", (pd + r.url), re.I):
                    AUTH.append(r)
            except Exception:
                pass
        pg.on("response", on_resp)
        pg.goto(SITE + "/calendar", wait_until="domcontentloaded", timeout=90000)
        for _ in range(16):
            pg.wait_for_timeout(500)
            if "/auth/login" in pg.url or pg.locator("input[type=password]:visible").count():
                break
        mode = "saved-session"
        if "/auth/login" in pg.url or pg.locator("input[type=password]:visible").count():
            mode = login(pg, AUTH)
        try:
            os.makedirs(os.path.dirname(STATE), exist_ok=True)
            ctx.storage_state(path=STATE)
        except Exception as e:
            print("could not save session:", e)
        try:
            sheet({"action": "batch", "items": [{"path": "config/sync_error", "data": {"at": NOW, "ok": True, "mode": mode}},
                                                {"path": "config/mfa_request", "data": {"at": NOW, "need": False}}]})
        except BaseException:
            pass
        pg.goto(SITE + "/calendar", wait_until="domcontentloaded", timeout=90000)
        for _ in range(60):
            if SEEN.get("h", {}).get("x-user-id"):
                break
            time.sleep(1)
        time.sleep(3)

        def gql(q, v, key):
            r = ctx.request.post(SEEN["url"], data={"query": q, "variables": v}, headers=SEEN["h"], timeout=90000)
            return dec(r.json().get("data"), key)

        for b in gql("{me{branches{id name}}}", {}, "me").get("branches") or []:
            key = "dokki" if "FIXZONE" in b["name"].upper().replace(" ", "") else "haram"
            cal = gql(CAL, {"b": b["id"], "s": S, "e": E}, "calendar") or []
            try:
                crt = gql(CRT, {"b": b["id"], "r": [S, E], "f": {"status": []}}, "createdAppointments") or []
            except Exception as e:
                crt = []; DIAG.setdefault("errors", []).append("crt %s: %s" % (key, str(e)[:150]))
            first = {}
            for a in crt:
                q = a.get("patient") or {}
                lp = q.get("lastPaymentDate")
                lpd = dt.datetime.fromisoformat(str(lp).replace("Z", "+00:00")).astimezone(TZ).strftime("%Y-%m-%d") if lp else ""
                first[q.get("id")] = {"fp": q.get("firstPaymentDate"), "paid": float(q.get("dailyAmountPaid") or 0) if lpd == DAY else 0.0}
                if q.get("dailyAmountPaid"):
                    DIAG.setdefault("paid_raw", {}).setdefault(key, {})[str(q.get("referenceId"))] = [q.get("dailyAmountPaid"), lp]
            try:
                crt2 = gql(CRT2, {"b": b["id"], "r": [S, E], "f": {"status": []}}, "createdAppointments") or []
            except Exception as e:
                crt2 = []; DIAG.setdefault("errors", []).append("crt2 %s: %s" % (key, str(e)[:150]))
            try:
                DIAG.setdefault("types_raw", {})[key] = str(gql("query B($b:ID!){branchDetails(branch:$b){appointmentTypes}}", {"b": b["id"]}, "branchDetails"))[:4000]
            except Exception as e:
                DIAG.setdefault("errors", []).append("types %s: %s" % (key, str(e)[:150]))
            CAND[key] = crt2
            out[key] = (cal, first)
            BRS[key] = b["id"]
        try:
            payments(pg, gql)
        except Exception as e:
            DIAG.setdefault("errors", []).append("payments: %s" % str(e)[:200])
        br.close()
    return out


BRS = {}


def find_key(o, k, depth=0):
    if depth > 4:
        return None
    if isinstance(o, dict):
        if o.get(k) not in (None, ""):
            return o[k]
        for v in o.values():
            x = find_key(v, k, depth + 1)
            if x not in (None, ""):
                return x
    return None


def payments(pg, gql):
    """today's payments, the same list as the Payments export: PAID[branch][rid] = {amt, name, rem}"""
    op, seen_ops = None, {}
    for path in ("/finances/payments", "/finances/payment", "/payments", "/finances/transactions", "/finances"):
        n0 = len(CAPT)
        try:
            pg.goto(SITE + path, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            seen_ops[path] = "goto failed: %s" % str(e)[:80]
            continue
        for _ in range(20):
            pg.wait_for_timeout(1000)   # lets Playwright deliver the page's requests (time.sleep would block them)
            for b in CAPT[n0:]:
                q = b.get("query") or ""
                name = b.get("operationName") or (re.findall(r"(?:query)\s+(\w+)", q) or [""])[0]
                if re.search("payment", name, re.I) and not re.search("total|count|sum", name, re.I) and "amount" in q:
                    op = b
                    break
            if op:
                break
        seen_ops[path] = {"url": pg.url, "ops": sorted({(b.get("operationName") or "?") for b in CAPT[n0:]})[:40]}
        if op:
            break
    if not op:
        DIAG["payments"] = {"error": "no payments query seen", "pages": seen_ops}
        return
    q = op["query"]
    root = re.search(r"\{\s*(\w+)\s*\(", q[q.index("{"):]).group(1)
    q0 = q
    if True:
        # the page's own query has no top-level patient: ask for it next to the payment's id
        q = re.sub(r"(\b%s\s*\([^)]*\)\s*\{)" % root, r"\1 patient { id referenceId firstName lastName totalRemaining } ", q, count=1)
    v0 = dict(op.get("variables") or {})
    info = {"op": op.get("operationName"), "root": root, "vars": sorted(v0), "pages": seen_ops}
    for key, bid in BRS.items():
        v = dict(v0)
        for k in list(v):
            lk = k.lower()
            if lk in ("branchid", "branch"):
                v[k] = bid
            elif lk == "rangedate" or (lk.endswith("date") and isinstance(v[k], list)):
                v[k] = [S, E]
            elif lk == "take":
                v[k] = 500
            elif lk == "skip":
                v[k] = 0
            elif lk == "searchterm":
                v[k] = ""
        if not any(k.lower() in ("branchid", "branch") for k in v):
            v["branchId"] = bid
        try:
            rows = gql(q, v, root) or []
            info["patient_query"] = "added"
        except Exception as e:
            info["patient_query"] = "refused: %s" % str(e)[:150]
            rows = gql(q0, v, root) or []
        if isinstance(rows, dict):
            rows = next((x for x in rows.values() if isinstance(x, list)), [])
        tot, n, types, got = 0.0, 0, {}, {}
        for r in rows:
            if not isinstance(r, dict):
                continue
            amt = float(r.get("amount") or 0)
            tp = str(r.get("type") or "")
            types[tp] = types.get(tp, 0) + 1
            pat = next((x for x in (r.get("patient"), (r.get("invoice") or {}).get("patient") if isinstance(r.get("invoice"), dict) else None,
                                     (r.get("appointment") or {}).get("patient") if isinstance(r.get("appointment"), dict) else None)
                        if isinstance(x, dict) and x.get("referenceId")), {})
            ref = pat.get("referenceId")   # only the payment's own patient: other ids in the row (invoice numbers) are not patients
            created = str(r.get("createdAt") or r.get("created") or "")
            if "balance" in tp.lower() or r.get("refunded") or r.get("isRefunded") or not ref or amt <= 0 \
                    or not (pat.get("firstName") or pat.get("lastName")):
                continue
            try:
                cday = dt.datetime.fromisoformat(created.replace("Z", "+00:00")).astimezone(TZ).strftime("%Y-%m-%d") if created else DAY
            except Exception:
                cday = DAY
            if cday != DAY:
                continue
            rid = ("d" if key == "dokki" else "p") + re.sub("[^0-9A-Za-z]", "", str(ref))
            g = got.setdefault(rid, {"amt": 0.0, "name": ("%s %s" % (pat.get("firstName") or "", pat.get("lastName") or "")).strip(),
                                     "pid": "#" + str(ref), "rem": float(find_key(pat, "totalRemaining") or 0), "phone": pat.get("phoneNumber") or ""})
            g["amt"] += amt
            tot += amt
            n += 1
        PAID[key] = got
        info[key] = {"rows": len(rows), "counted": n, "total": tot, "types": types,
                     "row_keys": sorted(rows[0].keys())[:40] if rows and isinstance(rows[0], dict) else [],
                     "patient": str(rows[0].get("patient"))[:60] if rows and isinstance(rows[0], dict) else "",
                     "invoice": str(rows[0].get("invoice"))[:300] if rows and isinstance(rows[0], dict) else "",
                     "appointment": str(rows[0].get("appointment"))[:300] if rows and isinstance(rows[0], dict) else ""}
    DIAG["payments"] = info


def candidates(key, cfg, cal):
    """patients the morning export (Remaining filter) would list: export statuses, allowed types, remaining > 0.
    Source is today's calendar (the created-appointments log only lists appointments whose time has come)."""
    allowed = cfg.get("types")
    excluded = set(cfg.get("exclude_types") or []) | FOLLOWUP_TYPES
    out, seen = {}, []
    for a in (CAND.get(key) if cfg.get("source") == "crt" else cal) or []:
        q = a.get("patient") or {}
        if not q.get("referenceId"):
            continue
        rid = ("d" if key == "dokki" else "p") + re.sub("[^0-9A-Za-z]", "", str(q["referenceId"]))
        st = STATUS.get(a.get("status") or "", str(a.get("status") or "").title())
        tp = str(a.get("type") or "")
        rem = float(q.get("totalRemaining") or 0)
        seen.append([rid, (round_min(a.get("start")) or "")[11:16], st, tp, rem])
        if st in EXPORT_ST and rem > 0 and (not allowed or tp in allowed) and tp not in excluded:
            out.setdefault(rid, set()).add(round_min(a.get("start")))
    return out, seen


def build(key, cal, first):
    pts = {}
    excluded = set(CFG.get("exclude_types") or []) | FOLLOWUP_TYPES
    real, follow = set(), set()
    for a in cal:
        q0 = a.get("patient") or {}
        if q0.get("referenceId"):
            r0 = ("d" if key == "dokki" else "p") + re.sub("[^0-9A-Za-z]", "", str(q0["referenceId"]))
            (follow if str(a.get("type") or "") in excluded else real).add(r0)
    FOLLOW_ONLY[key] = follow - real
    for a in cal:
        if str(a.get("type") or "") in excluded:
            continue
        q = a.get("patient")
        if not q or not q.get("referenceId"):
            continue
        ref = str(q["referenceId"])
        rid = ("d" if key == "dokki" else "p") + re.sub("[^0-9A-Za-z]", "", ref)
        paidmap = PAID.get(key) if CFG.get("payments", True) else None
        p = pts.setdefault(rid, {"branch": key, "pid": "#" + ref, "rem": float(q.get("totalRemaining") or 0),
                                 "name": ("%s %s" % (q.get("firstName") or "", q.get("lastName") or "")).strip(),
                                 "phone": q.get("phoneNumber") or "", "firstPay": (first.get(q.get("id")) or {}).get("fp"),
                                 "paidToday": ((paidmap.get(rid) or {}).get("amt", 0.0) if paidmap is not None
                                               else (first.get(q.get("id")) or {}).get("paid", 0.0)), "services": []})
        st = a.get("status") or ""
        tp = str(a.get("type") or "")
        tp = (CFG.get("names") or {}).get(tp, tp)
        p["services"].append({"type": "موعد" if not tp or re.match(r"^Enum\d+$", tp) else tp, "time": round_min(a.get("start")), "end": round_min(a.get("end")),
                              "status": STATUS.get(st, st.title())})
    return pts


def plan(key, pts, rows):
    paidmap_on = bool(PAID.get(key)) and CFG.get("payments", True)
    writes, stats = {}, {"feed": len(pts), "new": 0, "updated": 0, "merged": 0, "autoCancelled": 0}
    manuals = [r for r in rows.values() if not r.get("deleted") and r.get("manual") and not r.get("sysAdded")
               and (r.get("branch") or "haram") == key]
    for rid, p in pts.items():
        cur0 = rows.get(rid)
        cur = cur0 if cur0 and not cur0.get("deleted") else None
        sv = sorted(p["services"], key=lambda x: x["time"] or "")
        old_t = {x.get("time"): x.get("type") for x in (cur0 or {}).get("services") or []
                 if x.get("type") and not re.match(r"^Enum\d+$", str(x.get("type")))}
        sv = [{**x, "type": old_t.get(x["time"], x["type"])} if x["type"] == "موعد" else x for x in sv]
        all_off = bool(sv) and all(NOSHOW.search(x["status"] or "") for x in sv)
        base = {"branch": key, "name": p["name"], "pid": p["pid"], "phone": p["phone"], "services": sv,
                "systemRem": p["rem"], "flags": flags({**p, "services": sv}), "order": (sv[0]["time"] if sv else "") or "",
                "manual": False, "syncAt": NOW}
        if paidmap_on:
            base["sysPaidToday"] = float(p.get("paidToday") or 0)  # lets the tool flag a typed amount the system never recorded
        k = name_key(p["name"])
        carry = {}
        for i, m in enumerate(manuals):
            mk = name_key(m.get("name"))
            if m["_id"] != rid and k and (mk == k or (len(k.split(" ")) >= 2 and (mk.startswith(k) or k.startswith(mk)))):
                manuals.pop(i)
                if not (cur and float(cur.get("collected") or 0) > 0):
                    carry = {"collected": float(m.get("collected") or 0), "collector": m.get("collector") or "",
                             "collectedAt": m.get("collectedAt") or "",
                             "note": " · ".join([x for x in ((cur or {}).get("note"), m.get("note")) if x])}
                writes[m["_id"]] = {**m, "deleted": True, "deletedAt": NOW, "mergedInto": rid}
                stats["merged"] += 1
                break
        if not cur:
            c = all_off and not (carry.get("collected") or 0) > 0
            stats["autoCancelled"] += c
            data = {**base, "deleted": False, "due": p["rem"], "collected": 0, "collector": "", "collectedAt": "",
                    "cancelled": c, "autoCancelled": c, "note": "", "createdAt": NOW, **carry}
            stats["new"] += 1
        else:
            data = {**base, **carry}
            sp = p.get("paidToday") or 0
            staff = float(cur.get("collected") or 0) > 0 and not cur.get("sysPaid")
            if not staff and not carry.get("collected") and float(cur.get("due") or 0) == float(cur.get("systemRem") or 0) + float(cur.get("collected") or 0) * bool(cur.get("sysPaid")):
                data["due"] = p["rem"] + sp
            # only the system's own "paid today" counts: the remaining also drops when sessions are cancelled or a balance is cleared
            if not staff and not carry.get("collected"):
                if sp > 0.5:
                    data.update(collected=sp, collector="من السيستم", collectedAt=cur.get("collectedAt") or NOW, sysPaid=True,
                                sysAdjusted=True, staffCollected=0, sysAt=NOW)
                    stats["paidInSystem"] = stats.get("paidInSystem", 0) + 1
                elif cur.get("sysPaid"):
                    data.update(collected=0, collector="", collectedAt="", sysPaid=False, sysAdjusted=False)
            elif staff and not carry.get("collected") and paidmap_on and sp > float(cur.get("collected") or 0) + 0.5:
                # the system took more today than the staff typed (e.g. a new package paid on top): show the system's amount,
                # keep who collected it, and keep the typed amount so «رجّع تسجيل الموظفين» can undo it
                typed = float(cur.get("staffCollected") or 0) if cur.get("sysTopUp") else float(cur.get("collected") or 0)
                data.update(collected=sp, due=max(float(cur.get("due") or 0), sp), sysAdjusted=True, sysTopUp=True,
                            staffCollected=typed, sysAt=NOW)
                stats["toppedUp"] = stats.get("toppedUp", 0) + 1
            paid = float(data.get("collected", cur.get("collected")) or 0) > 0 or (carry.get("collected") or 0) > 0
            if all_off and not paid and not cur.get("cancelled"):
                data.update(cancelled=True, autoCancelled=True)
                stats["autoCancelled"] += 1
            elif (not all_off or paid) and cur.get("cancelled") and cur.get("autoCancelled"):
                data.update(cancelled=False, autoCancelled=False)
            stats["updated"] += 1
        writes[rid] = {**(cur0 or {}), **data}
    for w in writes.values():
        w.pop("_id", None)
        w["updatedAt"] = NOW
    return writes, stats


def load_cfg():
    try:
        d = sheet({"action": "get", "path": "config/autoadd"}).get("doc") or {}
        d = d.get("data", d) if isinstance(d, dict) else {}
        if isinstance(d, str):
            d = json.loads(d)
        CFG.update(d if isinstance(d, dict) else {})
    except SystemExit:
        pass
    except Exception as e:
        DIAG.setdefault("errors", []).append("cfg: %s" % str(e)[:150])


def main():
    load_cfg()
    AUTO = CFG.get("on") is True
    data = fetch()
    print("medicolize ok:", {k: len(v[0]) for k, v in data.items()}, flush=True)
    def listing():
        j = sheet({"action": "list", "prefix": "days/%s/rows" % DAY})
        return {d["path"].split("/")[-1]: {**(d.get("data") or {}), "_id": d["path"].split("/")[-1]} for d in j.get("docs") or []}
    rows, second = listing(), listing()
    for _ in range(3):
        if set(rows) == set(second):
            break
        time.sleep(5)
        rows, second = second, listing()
    unstable = set(rows) != set(second)
    shaky = unstable
    stable_ids = set(rows) & set(second)
    for i, r in second.items():
        rows[i] = r
    if unstable:
        # updates only touch rows seen in both reads, so a shaky read can't create or overwrite anything wrong
        rows = {i: r for i, r in rows.items() if i in stable_ids}
        unstable = False
    report, items = {"day": DAY, "dry": DRY, "sheet_rows": len(rows)}, []
    undo = [i for i, r in rows.items() if DAY == "2026-10-08" and not r.get("deleted") and not r.get("manual")
            and r.get("createdAt") and r.get("createdAt") == r.get("syncAt") and "2026-10-08T13:35" <= r["createdAt"] <= "2026-10-08T15:00"
            and not float(r.get("collected") or 0) > 0] if not unstable else []
    for i in undo:
        r = {k: v for k, v in rows[i].items() if k != "_id"}
        r.update(deleted=True, deletedAt=NOW, updatedAt=NOW, note=((r.get("note") or "") + " · اتشال (اتضاف بالغلط من المزامنة)").strip(" ·"))
        rows[i]["deleted"] = True
        items.append({"path": "days/%s/rows/%s" % (DAY, i), "data": r})
    report["removed_wrong_adds"] = len(undo)
    preview = {"day": DAY, "at": NOW, "auto": AUTO, "shaky": shaky, "branches": {}}
    for key, (cal, first) in data.items():
        pts = build(key, cal, first)
        live = {i for i, r in rows.items() if not r.get("deleted")}
        cands, seen = candidates(key, CFG, cal)
        preview["branches"][key] = {"cands": sorted(cands), "appts": seen}
        # a new patient is added only when the sheet read was stable and the id was never in today's sheet (deleted rows stay deleted)
        add = {i for i in cands if i in pts and i not in rows} if (AUTO and not shaky) else set()
        for i in add:
            keep = [x for x in pts[i]["services"] if x["time"] in cands[i]] or pts[i]["services"]
            pts[i]["services"] = keep
        pts = {i: p for i, p in pts.items() if i in live or i in add}
        sysrows = {i: r for i, r in rows.items() if not r.get("deleted") and not r.get("manual") and not r.get("sysAdded")
                   and (r.get("branch") or "haram") == key}
        both = set(sysrows) & set(pts)
        same = sum(1 for i in both if abs(float(sysrows[i].get("systemRem") or 0) - pts[i]["rem"]) < 1)
        writes, st = plan(key, pts, rows)
        # a row whose only appointment today is a follow-up call: not a visit, nothing to collect
        nfu = 0
        for i in FOLLOW_ONLY.get(key, ()):
            r = rows.get(i)
            if (r and not r.get("deleted") and not r.get("manual") and not r.get("sysAdded") and i not in writes
                    and not (float(r.get("collected") or 0) > 0)):
                w = {k: v for k, v in r.items() if k != "_id"}
                w.update(deleted=True, deletedAt=NOW, updatedAt=NOW, followUpOnly=True,
                         note=((r.get("note") or "") + " · اتشال: متابعة/انقطاع مش زيارة").strip(" ·"))
                writes[i] = w
                nfu += 1
        if nfu:
            st["followUpRemoved"] = nfu
        if not sysrows and not unstable:
            for i in [i for i in pts if i not in rows][:3]:
                if sheet({"action": "get", "path": "days/%s/rows/%s" % (DAY, i)}).get("doc"):
                    unstable = True
                    break
        if unstable:
            writes, st = {}, {"SKIPPED": "sheet answer looks incomplete - nothing written, will retry next run"}
        st.update(appts=len(cal), sheet=len(sysrows), matched=len(both), rem_same=same)
        if len(sysrows) >= 5 and len(both) < 0.6 * len(sysrows):
            st["SKIPPED"] = "IDs do not match the sheet - nothing written"
            writes = {}
        if CFG.get("payments", True) and not shaky and not st.get("SKIPPED") and PAID.get(key):
            nadd = nupd = 0
            taken = {str(r.get("pid") or "").lstrip("#") for r in rows.values() if not r.get("deleted") and (r.get("branch") or "haram") == key}
            names = {name_key(r.get("name")) for r in rows.values() if not r.get("deleted") and r.get("manual") and (r.get("branch") or "haram") == key}
            for i, g in PAID[key].items():
                ex = rows.get(i)
                if i in writes:
                    continue
                if ex is None and (g["pid"].lstrip("#") in taken or name_key(g["name"]) in names):
                    continue
                if ex is None:
                    svc = (pts.get(i) or {}).get("services") or []
                    writes[i] = {"deleted": False, "sysAdded": True, "sysPaid": True, "branch": key, "name": g["name"], "pid": g["pid"], "phone": "",
                                 "services": [{**x, "status": x.get("status") or "system"} for x in svc] or [{"type": "دفع", "time": NOW, "status": "system"}],
                                 "systemRem": g["rem"], "due": g["rem"] + g["amt"], "collected": g["amt"], "staffCollected": 0,
                                 "sysAdjusted": True, "sysAt": NOW, "collector": "من السيستم", "collectedAt": NOW, "cancelled": False,
                                 "note": "دفع في السيستم ومكانش في قايمة الأداة", "flags": ["من السيستم"], "manual": False,
                                 "order": (svc[0]["time"] if svc else NOW), "createdAt": NOW, "syncAt": NOW, "updatedAt": NOW}
                    nadd += 1
                elif ex.get("sysAdded") and not ex.get("deleted") and abs(float(ex.get("collected") or 0) - g["amt"]) > 0.5:
                    w = {k: v for k, v in ex.items() if k != "_id"}
                    w.update(collected=g["amt"], due=max(float(ex.get("due") or 0), g["rem"] + g["amt"]), systemRem=g["rem"], sysAt=NOW, syncAt=NOW, updatedAt=NOW)
                    writes[i] = w
                    nupd += 1
            st.update(payersAdded=nadd, payersUpdated=nupd, paymentsToday=len(PAID[key]))
        report[key] = st
        items += [{"path": "days/%s/rows/%s" % (DAY, i), "data": w} for i, w in writes.items()]
    if not DRY:
        for n in range(0, len(items), 40):
            sheet({"action": "batch", "items": items[n:n + 40]})
    report["written"] = 0 if DRY else len(items)
    try:
        preview.update(payments=DIAG.get("payments"), paid_raw=DIAG.get("paid_raw", {}), errors=DIAG.get("errors", []), types_raw=DIAG.get("types_raw", {}), report={k: v for k, v in report.items() if k != "written"})
        if not DRY:
            snap = [{"path": "config/autoadd_preview", "data": preview}]
            try:
                if not (sheet({"action": "get", "path": "days/%s/meta/autoadd_first" % DAY}).get("doc")):
                    snap.append({"path": "days/%s/meta/autoadd_first" % DAY, "data": preview})
            except BaseException:
                pass
            sheet({"action": "batch", "items": snap})
    except BaseException as e:
        print("preview not saved:", str(e)[:120])
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except BaseException as e:
        if isinstance(e, SystemExit) and (e.code in (0, None) or "LOGIN FAILED" in str(e.code)):
            raise
        import traceback
        tb = traceback.format_exc()
        print(tb)
        try:
            sheet({"action": "batch", "items": [{"path": "config/sync_error", "data": {"at": NOW, "day": DAY, "step": "after-login", "error": tb[-1500:],
                                                                                        "seen_url": SEEN.get("url", ""), "headers": sorted(SEEN.get("h", {}))}}]})
        except BaseException:
            pass
        raise
