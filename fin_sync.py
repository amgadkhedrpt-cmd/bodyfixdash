# BodyFix finance sync: Medicolize Finances (Payments + Expense payments) + invoices + appointments since 2024-06
# -> data/fin.enc, encrypted with the owner's own password (GitHub secret FIN_PASS). Nothing readable is committed.
# data/fin_meta.json holds only field names, row counts and timings (no amounts, no names) so the sync can be checked.
import base64, gzip, json, os, re, sys, time, datetime as dt
import collect_sync as C
from playwright.sync_api import sync_playwright

PASS = os.environ.get("FIN_PASS", "")
START = "2024-06"
ENC, META = "data/fin.enc", "data/fin_meta.json"          # fin.enc = closed months (rarely rewritten)
ENC_C = "data/fin_c.enc"                                    # the last 2 months (small, rewritten when they change)
DROP_COLS = {"apt": {"patient.firstName", "patient.lastName"}}
MAX_BACKFILL = int(os.environ.get("FIN_BACKFILL", "30"))   # months per kind per branch per run (the first runs fill the history)
TZ = C.TZ
NOW = dt.datetime.now(dt.timezone.utc)
CUR = NOW.astimezone(TZ).strftime("%Y-%m")
META_D = {"at": C.NOW, "errors": []}
CAPT, SEEN = [], {}

APT_Q = ("query A($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!,$filters:Filter,$branchId:ID)"
         "{createdAppointments(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate,filters:$filters)"
         "{id start status type room{name} doctor{name} patient{id referenceId firstName lastName gender}}}")
APT_Q2 = ("query A($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!,$filters:Filter,$branchId:ID)"
          "{createdAppointments(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate,filters:$filters)"
          "{id start status type doctor{name} patient{id referenceId firstName lastName}}}")
PAY_Q = ("query P($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!,$filters:Filter)"
         "{payments(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate,filters:$filters)"
         "{id type amount balance refunded refundedAt details createdAt createdBy{name} doctor{name} transaction{treasury{publicName}}"
         " invoice{id referenceId total discount paid patient{id referenceId firstName lastName}}"
         " patient{id referenceId firstName lastName} appointment{type doctor{name}}}}")
EXP_Q = ("query E($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!,$filters:Filter)"
         "{expensePayments(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate,filters:$filters)"
         "{id type amount details refunded refundedAt expenseType expense{name type date branch{name}} transaction{treasury{publicName}}"
         " createdAt createdBy{name}}}")
OPS_Q = ("query Q($orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
         "{createdOperationSteps(orderBy:$orderBy skip:$skip take:$take rangeDate:$rangeDate)"
         "{id name end createdAt status total paid discount operation{name} doctor{name}"
         " patient{referenceId firstName lastName tags{name}} branch{name}}}")
XP_Q = ("query X($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!,$filters:Filter)"
        "{expenses(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate,filters:$filters)"
        "{id name type amount paid date refunded salaryAdjustment createdAt branch{name} createdBy{name}}}")
# nutrition section: only nutrition / slimming services are kept from the operation steps (keeps the file small)
def _norm_ar(t):
    t = re.sub("[أإآ]", "ا", str(t or "")).replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"\s+", " ", t).strip().lower()
NUT_RX = re.compile(r"تغذي|مونجار|ويجوفي|ريتا|تيرز|mounjaro|wegovy|ميزو|راديوفريكونسي|كرايو|كافيتيشن|اكسيليس|excilis|بشره|اسكن|كومبريشن"
                    r"|انبدي|inbody|^م ت \d|^م تغذي|نحت|تخسيس|\bdo\b|\brf\b|cryo|cavitation", re.I)
ALAA_RX = re.compile(r"الاء|آلاء|alaa|حرفوش", re.I)


def keep_ops(r):
    n = _norm_ar(r.get("name")) + " " + _norm_ar((r.get("operation") or {}).get("name"))
    return bool(NUT_RX.search(n) or ALAA_RX.search(str((r.get("doctor") or {}).get("name") or "")))
INV_Q = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
         "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate)"
         "{id referenceId createdAt total paid discount patient{id referenceId firstName lastName} referralSource{name} doctor{name}}}")
INV_Q2 = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
          "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate)"
          "{id createdAt total paid discount patient{id referenceId firstName lastName} referralSource{name}}}")


# ---------- crypto (AES-256-GCM, key = PBKDF2-SHA256 of the password; the page does the same with WebCrypto) ----------
ITER = 250000


def _key(pw, salt):
    import hashlib
    return hashlib.pbkdf2_hmac("sha256", pw.encode("utf-8"), salt, ITER, 32)


def encrypt(obj):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    salt, iv = os.urandom(16), os.urandom(12)
    raw = gzip.compress(json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), 9)
    ct = AESGCM(_key(PASS, salt)).encrypt(iv, raw, None)
    return json.dumps({"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITER, "salt": base64.b64encode(salt).decode(),
                       "iv": base64.b64encode(iv).decode(), "data": base64.b64encode(ct).decode()})


def decrypt(txt):
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    j = json.loads(txt)
    salt, iv = base64.b64decode(j["salt"]), base64.b64decode(j["iv"])
    raw = AESGCM(_key(PASS, salt)).decrypt(iv, base64.b64decode(j["data"]), None)
    return json.loads(gzip.decompress(raw).decode("utf-8"))


# ---------- helpers ----------
def months(a, b):
    y, m = int(a[:4]), int(a[5:7])
    out = []
    while "%04d-%02d" % (y, m) <= b:
        out.append("%04d-%02d" % (y, m))
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def mrange(k):
    y, m = int(k[:4]), int(k[5:7])
    a = dt.datetime(y, m, 1, tzinfo=TZ)
    b = dt.datetime(y + (m == 12), 1 if m == 12 else m + 1, 1, tzinfo=TZ)
    return [C.iso(a.astimezone(dt.timezone.utc)), C.iso((b - dt.timedelta(milliseconds=1)).astimezone(dt.timezone.utc))]


def flat(o, pre="", out=None, depth=0):
    """a row as {path: scalar}; nested objects become a.b paths, lists of objects are summarised"""
    out = {} if out is None else out
    if depth > 3:
        return out
    if isinstance(o, dict):
        for k, v in o.items():
            if k == "__typename":
                continue
            p = pre + k
            if isinstance(v, dict):
                flat(v, p + ".", out, depth + 1)
            elif isinstance(v, list):
                if v and all(isinstance(x, dict) for x in v):
                    names = [str(x.get("name") or x.get("title") or "") for x in v]
                    if any(names):
                        out[p + "[].name"] = " | ".join(n for n in names if n)[:300]
                    amts = [x.get("amount") for x in v if isinstance(x.get("amount"), (int, float))]
                    if amts:
                        out[p + "[].amount"] = sum(amts)
                elif v and not any(isinstance(x, (dict, list)) for x in v):
                    out[p] = " | ".join(str(x) for x in v)[:300]
            else:
                if isinstance(v, str) and len(v) > 400:
                    v = v[:400]
                out[p] = v
    return out


def table(rows, kind=""):
    cols = []
    seen = set()
    drop = DROP_COLS.get(kind, set())
    fl = [{k: v for k, v in flat(r).items() if v is not None and k not in drop and k != "id" and not k.endswith(".id")}
          for r in rows if isinstance(r, dict)]
    for f in fl:
        for k in f:
            if k not in seen:
                seen.add(k)
                cols.append(k)
    return {"cols": cols, "rows": [[f.get(c) for c in cols] for f in fl]}


# ---------- Medicolize ----------
STRIPPED = {}


def strip_field(q, f):
    """remove field `f` (and its sub-selection) from a query text"""
    out, i = q, 0
    m = re.search(r"(?<![\w$])%s\s*(\{)?" % re.escape(f), out[out.index("{"):])
    if not m:
        return out
    st = out.index("{") + m.start()
    en = out.index("{") + m.end()
    if m.group(1):
        depth = 1
        while depth and en < len(out):
            depth += {"{": 1, "}": -1}.get(out[en], 0)
            en += 1
    return out[:st] + out[en:]


def gql(ctx, q, v, key):
    for _ in range(10):
        try:
            return gql1(ctx, q, v, key)
        except RuntimeError as e:
            bad = re.findall(r'Cannot query field \\?"(\w+)\\?"', str(e))
            if not bad:
                raise
            for f in bad:
                STRIPPED.setdefault(key, []).append(f)
                q = strip_field(q, f)
    return gql1(ctx, q, v, key)


def gql1(ctx, q, v, key):
    r = ctx.request.post(SEEN["url"], data={"query": q, "variables": v}, headers=SEEN["h"], timeout=120000)
    j = r.json()
    if j.get("errors") and not j.get("data"):
        raise RuntimeError(str(j["errors"])[:300])
    d = j.get("data")
    return C.dec(d, key)


def capture(pg, paths, want, avoid=r"total|count|sum|stat"):
    """open the app's own pages and keep the first list query whose name matches `want`"""
    tried = {}
    for path in paths:
        n0 = len(CAPT)
        try:
            pg.goto(C.SITE + path, wait_until="domcontentloaded", timeout=60000)
        except Exception as e:
            tried[path] = "goto: %s" % str(e)[:80]
            continue
        for _ in range(18):
            pg.wait_for_timeout(1000)
            for b in CAPT[n0:]:
                q = b.get("query") or ""
                name = b.get("operationName") or (re.findall(r"query\s+(\w+)", q) or [""])[0]
                if re.search(want, name + " " + q[:200], re.I) and not re.search(avoid, name, re.I) and "amount" in q:
                    tried[path] = {"url": pg.url, "op": name}
                    return b, tried
        tried[path] = {"url": pg.url, "ops": sorted({(b.get("operationName") or "?") for b in CAPT[n0:]})[:30]}
    return None, tried


def menu_paths(pg):
    """links under Finances in the app's own menu"""
    try:
        pg.goto(C.SITE + "/finances", wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(4000)
        hrefs = pg.eval_on_selector_all("a[href]", "els => els.map(e => e.getAttribute('href'))")
        return sorted({h for h in hrefs if h and h.startswith("/") and re.search("financ|expens|payment|treasur", h, re.I)})
    except Exception as e:
        META_D["errors"].append("menu: %s" % str(e)[:120])
        return []


def run_listing(ctx, op, bid, rng):
    q = op["query"]
    root = re.search(r"\{\s*(\w+)\s*[\({]", q[q.index("{"):]).group(1)
    v0 = dict(op.get("variables") or {})
    v = dict(v0)
    has_skip = False
    for k in list(v):
        lk = k.lower()
        if lk in ("branchid", "branch"):
            v[k] = bid
        elif lk == "rangedate" or (lk.endswith("date") and isinstance(v[k], list)) or lk in ("range", "daterange"):
            v[k] = rng
        elif lk == "take":
            v[k] = 500
        elif lk == "skip":
            v[k] = 0
            has_skip = True
        elif lk == "searchterm":
            v[k] = ""
    if not any(k.lower() in ("branchid", "branch") for k in v) and re.search(r"\$branch(Id)?\b", q):
        v["branchId"] = bid
    rows, sk = [], 0
    while True:
        for k in v:
            if k.lower() == "skip":
                v[k] = sk
        part = gql(ctx, q, v, root) or []
        if isinstance(part, dict):
            part = next((x for x in part.values() if isinstance(x, list)), [])
        rows += part
        if not has_skip or len(part) < 500 or sk > 60000:
            break
        sk += 500
    return rows


def run_paged(ctx, qs, root, var, rng):
    last = None
    for q in qs:
        try:
            rows, sk = [], 0
            while True:
                v = dict(var, skip=sk, take=500, rangeDate=rng)
                part = gql(ctx, q, v, root) or []
                rows += part
                if len(part) < 500 or sk > 60000:
                    break
                sk += 500
            return rows
        except Exception as e:
            last = e
    raise last


def main():
    if not PASS:
        print("FIN_PASS secret not set - finance sync skipped (add it in GitHub → Settings → Secrets → Actions)")
        META_D["skipped"] = "no FIN_PASS"
    old = {}
    for fn in (ENC, ENC_C):
        if PASS and os.path.exists(fn):
            try:
                o = decrypt(open(fn).read())
                old.setdefault("branches", {}).update(o.get("branches", {}))
                old.setdefault("types", {}).update(o.get("types", {}))
                old.setdefault("exp_types", {}).update(o.get("exp_types", {}))
                for kind, bs in (o.get("kinds") or {}).items():
                    for b, ms in bs.items():
                        old.setdefault("kinds", {}).setdefault(kind, {}).setdefault(b, {}).update(ms)
            except Exception as e:
                print("old data not readable with this password (password changed?) - full refill:", str(e)[:80])
    data = {"v": 1, "start": START, "branches": old.get("branches", {}), "kinds": old.get("kinds", {}), "types": old.get("types", {}),
            "exp_types": old.get("exp_types", {})}
    ALL = months(START, CUR)
    # the history is filled on every run; once complete, scheduled runs refresh only a few times a day (keeps the repo small)
    full = all(len(data["kinds"].get(kd, {}).get(b, {})) >= len(ALL) - 2 for kd in ("pay", "exp", "inv", "apt")
               for b in (data["branches"] or {"x": 0})) and data["branches"] \
        and len(data["kinds"].get("ops", {}).get("all", {})) >= len(ALL) - 2 \
        and all(len(data["kinds"].get("xp", {}).get(b, {})) >= len(ALL) - 2 for b in data["branches"])
    cai = NOW.astimezone(TZ)
    if PASS and full and os.environ.get("GITHUB_EVENT_NAME") == "schedule" and not (cai.hour in (11, 14, 17, 20, 23) and cai.minute < 30):
        if os.path.exists(META):
            prev = json.load(open(META))
            META_D.clear()
            META_D.update(prev)
        META_D["skipped_at"] = C.NOW
        print("finance: history complete - this scheduled run skips (refreshes at 11, 14, 17, 20, 23)")
        return
    t0 = time.time()
    with sync_playwright() as p:
        try:
            br = p.chromium.launch(channel="chrome")
        except Exception:
            br = p.chromium.launch()
        ctx = br.new_context(storage_state=C.STATE) if os.path.exists(C.STATE) else br.new_context()
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
        pg.goto(C.SITE + "/calendar", wait_until="domcontentloaded", timeout=90000)
        for _ in range(16):
            pg.wait_for_timeout(500)
            if "/auth/login" in pg.url or pg.locator("input[type=password]:visible").count():
                break
        if "/auth/login" in pg.url or pg.locator("input[type=password]:visible").count():
            C.login(pg, [])
            try:
                ctx.storage_state(path=C.STATE)
            except Exception:
                pass
            pg.goto(C.SITE + "/calendar", wait_until="domcontentloaded", timeout=90000)
        for _ in range(60):
            if SEEN.get("h", {}).get("x-user-id"):
                break
            pg.wait_for_timeout(1000)
        brs = gql(ctx, "{me{branches{id name}}}", {}, "me").get("branches") or []
        for b in brs:
            key = "dokki" if "FIXZONE" in b["name"].upper().replace(" ", "") else "haram"
            data["branches"][key] = {"id": b["id"], "name": b["name"]}
        try:
            raw = (gql(ctx, "{me{company{appointmentTypes}}}", {}, "me").get("company") or {}).get("appointmentTypes")
            lst = json.loads(raw) if isinstance(raw, str) else (raw or [])
            data["types"] = {t["enum"]: str(t["name"]).strip() for t in lst if isinstance(t, dict) and t.get("enum") and t.get("name")}
        except Exception as e:
            META_D["errors"].append("types: %s" % str(e)[:120])
        # expense items are saved as codes (Enum1…): their names live in the company settings, like appointment types
        data.setdefault("exp_types", {})
        for qq, path in (("{me{company{expenseTypes}}}", ("company", "expenseTypes")), ("{me{company{expensesTypes}}}", ("company", "expensesTypes")),
                         ("{me{company{expenseCategories}}}", ("company", "expenseCategories"))):
            try:
                o = gql(ctx, qq, {}, "me")
                raw = (o.get(path[0]) or {}).get(path[1])
                lst = json.loads(raw) if isinstance(raw, str) else (raw or [])
                mp_ = {str(t.get("enum") or t.get("id") or t.get("value")): str(t.get("name") or t.get("label") or "").strip()
                       for t in lst if isinstance(t, dict) and (t.get("enum") or t.get("id") or t.get("value")) and (t.get("name") or t.get("label"))}
                if mp_:
                    data["exp_types"] = mp_
                    META_D["exp_types_from"] = qq
                    break
            except Exception as e:
                META_D.setdefault("exp_types_tries", []).append(str(e)[:150])
        mp = menu_paths(pg)
        META_D["finance_links"] = mp
        pay_paths = [x for x in mp if re.search("payment", x, re.I) and not re.search("expens", x, re.I)] + \
                    ["/finances/payments", "/finances/payment", "/payments"]
        exp_paths = [x for x in mp if re.search("expens", x, re.I)] + \
                    ["/finances/expense-payments", "/finances/expenses-payments", "/finances/expensePayments",
                     "/finances/expenses", "/finances/expense", "/expenses"]
        ops = {}
        ops["pay"], META_D["pay_pages"] = capture(pg, list(dict.fromkeys(pay_paths)), r"payment", r"total|count|sum|stat|expens")
        n_exp0 = len(CAPT)
        ops["exp"], META_D["exp_pages"] = capture(pg, list(dict.fromkeys(exp_paths)), r"expens")
        ops["xp"], META_D["xp_pages"] = capture(pg, ["/finances/expenses", "/expenses", "/finances/expense"], r"^EXPENSES\b", r"PAYMENT|total|count|sum|stat")
        META_D["exp_page_ops"] = sorted({re.sub(r"\s+", " ", b.get("query") or "")[:300] for b in CAPT[n_exp0:]
                                         if re.search(r"expenseType|company|setting", b.get("query") or "", re.I)})[:8]
        for k in ("pay", "exp", "xp"):
            if ops.get(k):
                META_D[k + "_op"] = {"name": ops[k].get("operationName"), "vars": sorted((ops[k].get("variables") or {}).keys()),
                                    "query": re.sub(r"\s+", " ", ops[k]["query"])[:1500]}
        if not PASS:
            br.close()
            return
        def own_or_page(q, root, kind):
            def f(bid, rng):
                try:
                    return run_paged(ctx, [q], root, {"branchId": bid, "orderBy": "createdAt-asc", "filters": {}}, rng)
                except Exception as e:
                    META_D["errors"].append("%s own query: %s" % (kind, str(e)[:200]))
                    if not ops[kind]:
                        raise
                    return run_listing(ctx, ops[kind], bid, rng)
            return f
        kinds = {
            "pay": own_or_page(PAY_Q, "payments", "pay"),
            "exp": own_or_page(EXP_Q, "expensePayments", "exp"),
            "inv": lambda bid, rng: run_paged(ctx, [INV_Q, INV_Q2], "invoices", {"branchId": bid, "orderBy": "createdAt-asc"}, rng),
            "apt": lambda bid, rng: run_paged(ctx, [APT_Q, APT_Q2], "createdAppointments",
                                              {"branchId": bid, "orderBy": "start-asc", "filters": {"status": []}}, rng),
            "xp": own_or_page(XP_Q, "expenses", "xp"),
            "ops": lambda bid, rng: [r for r in run_paged(ctx, [OPS_Q, OPS_Q.replace(" discount", "")], "createdOperationSteps",
                                                          {"orderBy": "createdAt"}, rng) if isinstance(r, dict) and keep_ops(r)],
        }
        for kind, fn in kinds.items():
            if not fn:
                META_D["errors"].append("%s: no query found" % kind)
                continue
            store = data["kinds"].setdefault(kind, {})
            targets = list(data["branches"].items())
            if kind == "ops":
                targets = [("all", {"id": None})]        # steps have no branch filter: one list, split by branch.name in the page
            if kind == "exp" and ops["exp"] and not re.search(r"\$branch", ops["exp"]["query"], re.I):
                targets = [("all", {"id": None})]        # one list for both branches (split later by its branch column, if any)
                META_D["exp_scope"] = "all"
            for key, b in targets:
                bstore = store.setdefault(key, {})
                todo = [k for k in ALL if k not in bstore]
                refresh = [k for k in ALL[-2:] if k in bstore]        # current + last month every run (late edits)
                if kind == "ops":
                    refresh = [k for k in ALL[-4:] if k in bstore]    # package steps get paid / done over the next months
                    if NOW.astimezone(TZ).weekday() == 4 and NOW.astimezone(TZ).hour >= 22:
                        refresh = [k for k in ALL if k in bstore]      # Friday night: the whole history
                if kind == "inv" and (NOW.astimezone(TZ).hour >= 22 or os.environ.get("FIN_FULL")):
                    refresh = [k for k in ALL if k in bstore]          # every night: old invoices get paid later
                for k in todo[:MAX_BACKFILL] + refresh:
                    if time.time() - t0 > 10 * 60:
                        META_D["errors"].append("time limit - continues next run")
                        break
                    try:
                        rows = fn(b["id"], mrange(k))
                        bstore[k] = table(rows, kind)
                        bstore[k]["at"] = C.NOW
                    except Exception as e:
                        META_D["errors"].append("%s %s %s: %s" % (kind, key, k, str(e)[:160]))
                    time.sleep(0.2)
        br.close()
    # meta: structure only
    for kind, st in data["kinds"].items():
        mk = META_D.setdefault("kinds", {}).setdefault(kind, {})
        for key, bs in st.items():
            cols = []
            for k in sorted(bs):
                for c in bs[k].get("cols", []):
                    if c not in cols:
                        cols.append(c)
            vals = {}
            for col in {"pay": ["type", "refunded"], "exp": ["type", "refunded"], "apt": ["status"], "ops": ["status", "branch.name"],
                        "xp": ["type", "refunded", "salaryAdjustment"]}.get(kind, []):
                vs = set()
                for x in bs.values():
                    if col in x.get("cols", []):
                        i = x["cols"].index(col)
                        vs.update(str(r[i]) for r in x["rows"] if i < len(r))
                vals[col] = sorted(vs)[:20]
            mk[key] = {"values": vals, "months": len(bs), "first": min(bs) if bs else "", "last": max(bs) if bs else "",
                       "rows": sum(len(x.get("rows", [])) for x in bs.values()), "cols": cols,
                       "missing": [k for k in ALL if k not in bs]}
    META_D["stripped"] = STRIPPED
    data["at"] = C.NOW
    os.makedirs("data", exist_ok=True)
    cur = set(ALL[-2:])
    cur_ops = set(ALL[-4:])
    old_h = json.load(open(META)).get("hash", {}) if os.path.exists(META) else {}
    META_D["hash"] = {}
    for fn, keep in ((ENC, lambda k, kd: k not in (cur_ops if kd == "ops" else cur)), (ENC_C, lambda k, kd: k in (cur_ops if kd == "ops" else cur))):
        part = {"v": 1, "start": START, "branches": data["branches"], "at": data["at"], "types": data.get("types", {}), "exp_types": data.get("exp_types", {}),
                "kinds": {kd: {b: {k: v for k, v in ms.items() if keep(k, kd)} for b, ms in bs.items()} for kd, bs in data["kinds"].items()}}
        body = dict(part, at="")
        for bs in body["kinds"].values():
            for ms in bs.values():
                for v in ms.values():
                    v.pop("at", None) if isinstance(v, dict) else None
        import hashlib
        h = hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]
        META_D["hash"][fn] = h
        if h != old_h.get(fn) or not os.path.exists(fn):
            with open(fn, "w") as f:
                f.write(encrypt(part))
            META_D.setdefault("written", []).append(fn)
    META_D["secs"] = int(time.time() - t0)


if __name__ == "__main__":
    try:
        main()
    except BaseException as e:
        import traceback
        META_D["errors"].append("fatal: " + traceback.format_exc()[-800:])
        print(traceback.format_exc())
    finally:
        os.makedirs("data", exist_ok=True)
        with open(META, "w", encoding="utf-8") as f:
            json.dump(META_D, f, ensure_ascii=False, indent=1)
        print(json.dumps({k: v for k, v in META_D.items() if k != "kinds"}, ensure_ascii=False)[:3000])
