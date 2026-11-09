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

        # تجربة: هل ينفع نجيب الخدمات (operations) مع لستة الفواتير مرة واحدة؟
        Q = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
             "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate)"
             "{id createdAt total patient{id} createAppointment{id start} operations{name price amount}}}")
        from collections import Counter
        import datetime as _dt
        me = gql("{me{branches{id name}}}", {})
        brs = cs.dec(me.get("data"), "me").get("branches") or []
        end = _dt.datetime.utcnow()
        start = end - _dt.timedelta(days=30)
        rng = [start.strftime("%Y-%m-%dT%H:%M:%S.000Z"), end.strftime("%Y-%m-%dT%H:%M:%S.000Z")]
        PK = re.compile(r"ب\s*(\d{1,2})(?!\d)")
        for b in brs:
            for take in (100, 500):
                t0 = time.time()
                try:
                    j = gql(Q, {"branchId": b["id"], "orderBy": "createdAt-desc", "skip": 0, "take": take, "rangeDate": rng})
                except Exception as e:
                    print(b["name"], take, "failed:", str(e)[:150]); continue
                dt = time.time() - t0
                if j.get("errors"):
                    print(f"== {b['name']} take={take}: errors {str(j['errors'])[:300]}"); break
                inv = cs.dec(j.get("data"), "invoices") or []   # Medicolize بيبعت الرد مضغوط في list
                names, sizes, pk_inv, with_appt = Counter(), Counter(), 0, 0
                all_names, n_ops = Counter(), Counter()
                for i in inv:
                    if i.get("createAppointment"): with_appt += 1
                    hit = False
                    ops = i.get("operations") or []
                    n_ops[len(ops)] += 1
                    for o in ops:
                        n = re.sub(r"[\u200e\u200f\u202a-\u202e\u0640]", "", str(o.get("name") or "")).strip()
                        all_names[n[:60]] += 1
                        m = PK.search(n)
                        if m:
                            hit = True; sizes[m.group(1)] += 1; names[n[:60]] += 1
                    pk_inv += hit
                print(f"\n== {b['name']} · last 30 days · take={take}: {len(inv)} invoices in {dt:.1f}s · {pk_inv} with a package · {with_appt} linked to an appointment")
                print("   package sizes:", dict(sizes.most_common()))
                print("   package service names:", dict(names.most_common(15)))
                print("   operations per invoice:", dict(sorted(n_ops.items())))
                print("   top service names:", dict(all_names.most_common(25)))
                if inv: print("   sample invoice keys:", sorted(inv[0].keys()), "· first ops:", json.dumps((inv[0].get("operations") or [])[:2], ensure_ascii=False)[:300])
                if len(inv) < take:
                    break
        br.close()


if __name__ == "__main__":
    main()
