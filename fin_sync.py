# BodyFix finance sync: Medicolize Finances (Payments + Expense payments) + invoices + appointments since 2024-06
# -> data/fin.enc, encrypted with the owner's own password (GitHub secret FIN_PASS). Nothing readable is committed.
# data/fin_meta.json holds only field names, row counts and timings (no amounts, no names) so the sync can be checked.
import base64, gzip, json, os, re, sys, time, datetime as dt
import collect_sync as C
from playwright.sync_api import sync_playwright

PASS = os.environ.get("FIN_PASS", "")
START = "2024-06"
ENC, META = "data/fin.enc", "data/fin_meta.json"
MAX_BACKFILL = int(os.environ.get("FIN_BACKFILL", "8"))   # months per kind per branch per run (the first runs fill the history)
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


def table(rows):
    cols = []
    seen = set()
    fl = [flat(r) for r in rows if isinstance(r, dict)]
    for f in fl:
        for k in f:
            if k not in seen:
                seen.add(k)
                cols.append(k)
    return {"cols": cols, "rows": [[f.get(c) for c in cols] for f in fl]}


# ---------- Medicolize ----------
def gql(ctx, q, v, key):
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
    if PASS and os.path.exists(ENC):
        try:
            old = decrypt(open(ENC).read())
        except Exception as e:
            print("old data not readable with this password (password changed?) - full refill:", str(e)[:80])
            old = {}
    data = {"v": 1, "start": START, "branches": old.get("branches", {}), "kinds": old.get("kinds", {})}
    ALL = months(START, CUR)
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
        mp = menu_paths(pg)
        META_D["finance_links"] = mp
        pay_paths = [x for x in mp if re.search("payment", x, re.I) and not re.search("expens", x, re.I)] + \
                    ["/finances/payments", "/finances/payment", "/payments"]
        exp_paths = [x for x in mp if re.search("expens", x, re.I)] + \
                    ["/finances/expense-payments", "/finances/expenses-payments", "/finances/expensePayments",
                     "/finances/expenses", "/finances/expense", "/expenses"]
        ops = {}
        ops["pay"], META_D["pay_pages"] = capture(pg, list(dict.fromkeys(pay_paths)), r"payment", r"total|count|sum|stat|expens")
        ops["exp"], META_D["exp_pages"] = capture(pg, list(dict.fromkeys(exp_paths)), r"expens")
        for k in ("pay", "exp"):
            if ops[k]:
                META_D[k + "_op"] = {"name": ops[k].get("operationName"), "vars": sorted((ops[k].get("variables") or {}).keys()),
                                    "query": re.sub(r"\s+", " ", ops[k]["query"])[:1500]}
        if not PASS:
            br.close()
            return
        kinds = {
            "pay": (lambda bid, rng: run_listing(ctx, ops["pay"], bid, rng)) if ops["pay"] else None,
            "exp": (lambda bid, rng: run_listing(ctx, ops["exp"], bid, rng)) if ops["exp"] else None,
            "inv": lambda bid, rng: run_paged(ctx, [INV_Q, INV_Q2], "invoices", {"branchId": bid, "orderBy": "createdAt-asc"}, rng),
            "apt": lambda bid, rng: run_paged(ctx, [APT_Q, APT_Q2], "createdAppointments",
                                              {"branchId": bid, "orderBy": "start-asc", "filters": {"status": []}}, rng),
        }
        for kind, fn in kinds.items():
            if not fn:
                META_D["errors"].append("%s: no query found" % kind)
                continue
            store = data["kinds"].setdefault(kind, {})
            targets = list(data["branches"].items())
            if kind == "exp" and not re.search(r"\$branch", ops["exp"]["query"], re.I):
                targets = [("all", {"id": None})]        # one list for both branches (split later by its branch column, if any)
                META_D["exp_scope"] = "all"
            for key, b in targets:
                bstore = store.setdefault(key, {})
                todo = [k for k in ALL if k not in bstore]
                refresh = [k for k in ALL[-2:] if k in bstore]        # current + last month every run (late edits)
                for k in todo[:MAX_BACKFILL] + refresh:
                    if time.time() - t0 > 10 * 60:
                        META_D["errors"].append("time limit - continues next run")
                        break
                    try:
                        rows = fn(b["id"], mrange(k))
                        bstore[k] = table(rows)
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
            mk[key] = {"months": len(bs), "first": min(bs) if bs else "", "last": max(bs) if bs else "",
                       "rows": sum(len(x.get("rows", [])) for x in bs.values()), "cols": cols,
                       "missing": [k for k in ALL if k not in bs]}
    data["at"] = C.NOW
    os.makedirs("data", exist_ok=True)
    with open(ENC, "w") as f:
        f.write(encrypt(data))
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
