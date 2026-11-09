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

        # 1) remainingPackage على مرضى النهارده (أرقام بس، من غير أسامي)
        try:
            me = gql("{me{branches{id name}}}", {})
            brs = cs.dec(me.get("data"), "me").get("branches") or []
            day0 = time.strftime("%Y-%m-%d")
            for b in brs:
                j = gql("query C($b:ID!,$s:DateTime!,$e:DateTime!){calendar(branch:$b,start:$s,end:$e){type status patient{remainingPackage totalRemaining}}}",
                        {"b": b["id"], "s": day0 + "T00:00:00+02:00", "e": day0 + "T23:59:59+02:00"})
                cal = cs.dec(j.get("data"), "calendar") or []
                rp = Counter(str((a.get("patient") or {}).get("remainingPackage")) for a in cal)
                print(f"\n== remainingPackage today @ {b['name']}: {len(cal)} appts -> {dict(rp.most_common(20))}")
                if j.get("errors"):
                    print("errors:", str(j["errors"])[:300])
        except Exception as e:
            print("remainingPackage check failed:", str(e)[:200])

        # 2) صفحة الفواتير: نلقط الـ query بتاعها ونعيد نبعته عشان نشوف شكل الرد
        n0 = len(REQS)
        pg.goto(cs.SITE + "/finances/invoices", wait_until="domcontentloaded", timeout=60000)
        for _ in range(15):
            pg.wait_for_timeout(1000)
        print(f"\n== invoices page -> {pg.url} · {len(REQS) - n0} queries")
        SKIP = {"CURRENT_USER_QUERY", "ActiveFlags", "GET_LAST_ATTENDANCE", "BRANCH_DETAILS", "GET_NOTIFICATIONS", "GET_CALENDAR_QUERY"}
        done = set()
        for body in REQS[n0:]:
            q = body.get("query", "")
            name = body.get("operationName") or (re.findall(r"(?:query)\s+(\w+)", q) or ["?"])[0]
            print("  seen:", name)
            if name in SKIP or name in done or not re.search(r"invoice", q, re.I):
                continue
            done.add(name)
            print("\n" + "=" * 70)
            print("OPERATION:", name)
            print("VARIABLES:", json.dumps(body.get("variables") or {}, ensure_ascii=False)[:700])
            print("QUERY:\n" + re.sub(r"\s+", " ", q)[:3500])
            try:
                v = dict(body.get("variables") or {})
                for k in list(v):
                    if k.lower() == "take":
                        v[k] = 3
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
