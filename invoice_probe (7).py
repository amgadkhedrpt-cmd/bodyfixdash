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

        # تجربة: جهة التحويل (referral) للمرضى — هل متاحة في بيانات المريض أو الميعاد؟ (أسامي الجهات بس)
        from collections import Counter
        me = gql("{me{branches{id name}}}", {})
        brs = cs.dec(me.get("data"), "me").get("branches") or []
        day0 = time.strftime("%Y-%m-%d")
        tries = {
            "patient.referralUser":   "patient{id referralUser{id name}}",
            "patient.referralSource": "patient{id referralSource{id name color} referralSubSource{id name}}",
        }
        for b in brs[:1]:
            for label, sel in tries.items():
                q = "query C($b:ID!,$s:DateTime!,$e:DateTime!){calendar(branch:$b,start:$s,end:$e){id " + sel + "}}"
                try:
                    j = gql(q, {"b": b["id"], "s": day0 + "T00:00:00+02:00", "e": day0 + "T23:59:59+02:00"})
                except Exception as e:
                    print(label, "failed:", str(e)[:120]); continue
                if j.get("errors"):
                    print(f"== {label}: NOT available ({str(j['errors'][0].get('message'))[:120]})"); continue
                cal = cs.dec(j.get("data"), "calendar") or []
                src, sub = Counter(), Counter()
                for a in cal:
                    o = a.get("patient") if label.startswith("patient") else a
                    o = o or {}
                    r1 = o.get("referralSource") or o.get("referral") or o.get("referralUser") or {}
                    r2 = o.get("referralSubSource") or {}
                    src[(r1 or {}).get("name") or "—"] += 1
                    sub[(r2 or {}).get("name") or "—"] += 1
                if label == "patient.birthDate":
                    bd = [((a.get("patient") or {}).get("birthDate")) for a in cal]
                    print(f"\n== birthDate @ {b['name']}: {sum(1 for x in bd if x)} of {len(bd)} have a birth date · sample format: {next((str(x)[:24] for x in bd if x), '-')}")
                    continue
                print(f"\n== {label} @ {b['name']}: {len(cal)} appts")
                print("   sources:", dict(src.most_common(20)))
                print("   sub-sources:", dict(sub.most_common(20)))
        # جهة التحويل من لستة الفواتير (آخر 60 يوم) — بنعدّ أسامي الجهات بس
        import datetime as _dt
        end = _dt.datetime.utcnow(); start = end - _dt.timedelta(days=60)
        rng = [start.strftime("%Y-%m-%dT%H:%M:%S.000Z"), end.strftime("%Y-%m-%dT%H:%M:%S.000Z")]
        QI = ("query INV($branchId:ID,$orderBy:String!,$skip:Int!,$take:Int!,$rangeDate:[DateTime!]!)"
              "{invoices(branchId:$branchId,orderBy:$orderBy,skip:$skip,take:$take,rangeDate:$rangeDate)"
              "{id patient{id} referralSource{id name} referralSubSource{id name}}}")
        for b in brs:
            try:
                j = gql(QI, {"branchId": b["id"], "orderBy": "createdAt-desc", "skip": 0, "take": 500, "rangeDate": rng})
                inv = cs.dec(j.get("data"), "invoices") or []
                src, sub, pats = Counter(), Counter(), set()
                for i in inv:
                    pats.add((i.get("patient") or {}).get("id"))
                    src[((i.get("referralSource") or {}).get("name")) or "—"] += 1
                    sub[((i.get("referralSubSource") or {}).get("name")) or "—"] += 1
                print(f"\n== invoices referral @ {b['name']} (60 days): {len(inv)} invoices · {len(pats)} patients")
                print("   sources:", dict(src.most_common(25)))
                print("   sub-sources:", dict(sub.most_common(25)))
            except Exception as e:
                print("invoice referral failed:", str(e)[:150])
        # أسامي أنواع المواعيد الحقيقية من إعدادات كل فرع (Enum1، Enum2 … = أنهي اسم)
        for b in brs:
            try:
                j = gql("query B($b:ID!){branchDetails(branch:$b){appointmentTypes}}", {"b": b["id"]})
                t = cs.dec(j.get("data"), "branchDetails")
                at = (t or {}).get("appointmentTypes") if isinstance(t, dict) else t
                print(f"\n== appointment types @ {b['name']}:")
                print(json.dumps(at, ensure_ascii=False)[:4000])
            except Exception as e:
                print("types failed:", str(e)[:150])
        br.close()


if __name__ == "__main__":
    main()
