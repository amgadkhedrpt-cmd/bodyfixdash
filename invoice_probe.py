# تشغيلة تجربة: بتفتح صفحة الفواتير في Medicolize وبتكتب في اللوج شكل البيانات بس
# (أسامي الحقول + أسامي الخدمات زي "ب 12 ع ط ...") — من غير أسامي مرضى ولا تليفونات. مش بتغير أي حاجة.
import os, re, json, time
os.environ.setdefault("MZ_STATE", ".session/state.json")
import collect_sync as cs
from playwright.sync_api import sync_playwright

SERVICE_RE = re.compile(r"(^|\s)ب\s*\d+|جلس|علاج|باق|package", re.I)
SAFE_KEYS = re.compile(r"name|title|procedure|operation|service|label|description|type", re.I)
seen_q, samples = {}, []


def shape(o, depth=0, path=""):
    """يطبع شكل البيانات: اسم الحقل ونوعه — وأسامي الخدمات بس."""
    pad = "  " * depth
    if depth > 8:
        return
    if isinstance(o, dict):
        for k, v in list(o.items())[:40]:
            t = type(v).__name__
            show = ""
            if isinstance(v, str) and SAFE_KEYS.search(k) and SERVICE_RE.search(v) and "patient" not in path.lower():
                show = "  = " + v[:80]
            elif isinstance(v, (int, float)) and re.search(r"price|total|amount|count|quantity|sessions", k, re.I):
                show = "  = " + str(v)
            print(f"{pad}{k}: {t}{show}")
            if isinstance(v, (dict, list)) and "patient" not in k.lower():
                shape(v, depth + 1, path + "." + k)
            elif isinstance(v, dict):
                print(f"{pad}  (patient fields: {', '.join(list(v.keys())[:15])})")
    elif isinstance(o, list):
        print(f"{pad}[list of {len(o)}]")
        if o:
            shape(o[0], depth + 1, path + "[0]")


def main():
    from collections import Counter
    with sync_playwright() as p:
        try:
            br = p.chromium.launch(channel="chrome")
        except Exception:
            br = p.chromium.launch()
        st = os.environ["MZ_STATE"]
        ctx = br.new_context(storage_state=st) if os.path.exists(st) else br.new_context()
        pg = ctx.new_page()
        AUTH, REQS, SEEN = [], [], {}

        def on_req(r):
            try:
                b = r.post_data_json
            except Exception:
                return
            if isinstance(b, dict) and "query" in b:
                REQS.append(b)
                SEEN["url"] = r.url
                SEEN["h"] = {k: v for k, v in r.headers.items() if k[:2] == "x-" or k in ("content-type", "authorization")}
        pg.on("request", on_req)

        def on_resp(r):
            try:
                pd = r.request.post_data or ""
                if r.request.method == "POST" and re.search(r"login|signin|auth|token", pd + r.url, re.I):
                    AUTH.append(r)
            except Exception:
                pass
        pg.on("response", on_resp)

        pg.goto(cs.SITE + "/calendar", wait_until="domcontentloaded", timeout=90000)
        pg.wait_for_timeout(6000)
        if "/auth/login" in pg.url or pg.locator("input[type=password]:visible").count():
            print("login needed:", cs.login(pg, AUTH))
        else:
            print("saved session OK")
        os.makedirs(os.path.dirname(st), exist_ok=True)
        ctx.storage_state(path=st)

        def gql(q, v):
            r = ctx.request.post(SEEN["url"], data={"query": q, "variables": v}, headers=SEEN["h"], timeout=90000)
            return r.json()

        # 1) أسامي حقول الفاتورة (introspection) — أسامي بس
        for tname in ("Invoice", "InvoiceOperation", "Operation", "PatientOperation"):
            try:
                j = gql('query T($n:String!){__type(name:$n){name fields{name type{name kind ofType{name kind ofType{name}}}}}}', {"n": tname})
                t = (j.get("data") or {}).get("__type")
                if t:
                    print(f"\n== TYPE {tname}:")
                    for f in t["fields"]:
                        ty = f["type"]; nm = ty.get("name") or (ty.get("ofType") or {}).get("name") or ((ty.get("ofType") or {}).get("ofType") or {}).get("name")
                        print(f"   {f['name']}: {nm}")
                elif j.get("errors"):
                    print(f"== TYPE {tname}: errors {str(j['errors'])[:200]}")
            except Exception as e:
                print("introspection failed:", str(e)[:150])

        # 2) صفحة الفواتير + فتح أول فاتورة عشان نلقط query العمليات
        n0 = len(REQS)
        pg.goto(cs.SITE + "/finances/invoices", wait_until="domcontentloaded", timeout=60000)
        for _ in range(12):
            pg.wait_for_timeout(1000)
        n1 = len(REQS)
        clicked = False
        for sel in (".ant-table-row-expand-icon", "tr.ant-table-row td:nth-child(2)", "tr.ant-table-row"):
            try:
                loc = pg.locator(sel).first
                if loc.count():
                    loc.click(timeout=5000); clicked = sel; break
            except Exception:
                pass
        for _ in range(8):
            pg.wait_for_timeout(1000)
        print(f"\n== invoices page: {n1 - n0} queries on load · clicked={clicked} · {len(REQS) - n1} queries after click")
        SKIP = {"CURRENT_USER_QUERY", "ActiveFlags", "GET_LAST_ATTENDANCE", "BRANCH_DETAILS", "GET_NOTIFICATIONS", "GET_CALENDAR_QUERY", "TOTAL_INVOICES", "MEDICALS"}
        done = set()
        for body in REQS[n0:]:
            q = body.get("query", "")
            name = body.get("operationName") or (re.findall(r"(?:query)\s+(\w+)", q) or ["?"])[0]
            print("  seen:", name)
            if name in SKIP or name in done:
                continue
            done.add(name)
            print("\n" + "=" * 70)
            print("OPERATION:", name)
            print("VARIABLES:", json.dumps(body.get("variables") or {}, ensure_ascii=False)[:500])
            print("QUERY:\n" + re.sub(r"\s+", " ", q)[:2500])
            try:
                v = dict(body.get("variables") or {})
                for k in list(v):
                    if k.lower() == "take":
                        v[k] = 5
                j = gql(q, v)
                if j.get("errors"):
                    print("errors:", str(j["errors"])[:300])
                print("RESPONSE SHAPE:")
                shape(j.get("data"))
            except Exception as e:
                print("replay failed:", str(e)[:200])
        br.close()


if __name__ == "__main__":
    main()
