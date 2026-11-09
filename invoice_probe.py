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
    with sync_playwright() as p:
        try:
            br = p.chromium.launch(channel="chrome")
        except Exception:
            br = p.chromium.launch()
        st = os.environ["MZ_STATE"]
        ctx = br.new_context(storage_state=st) if os.path.exists(st) else br.new_context()
        pg = ctx.new_page()
        AUTH, CAP = [], []

        def on_resp(r):
            try:
                pd = r.request.post_data or ""
                if r.request.method == "POST" and re.search(r"login|signin|auth|token", pd + r.url, re.I):
                    AUTH.append(r)
                if r.request.method == "POST" and '"query"' in pd and re.search(r"invoice|operation", pd, re.I):
                    CAP.append((json.loads(pd), r))
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

        for path in ("/finances/invoices", "/finances/invoice", "/invoices", "/finances"):
            n0 = len(CAP)
            try:
                pg.goto(cs.SITE + path, wait_until="domcontentloaded", timeout=60000)
            except Exception as e:
                print(path, "goto failed:", str(e)[:80]); continue
            for _ in range(15):
                pg.wait_for_timeout(1000)
            print(f"\n== {path} -> {pg.url} · captured {len(CAP) - n0} invoice/operation queries")
            if len(CAP) > n0:
                break

        for body, r in CAP[:6]:
            name = body.get("operationName") or (re.findall(r"(?:query)\s+(\w+)", body.get("query", "")) or ["?"])[0]
            if name in seen_q:
                continue
            seen_q[name] = 1
            print("\n" + "=" * 70)
            print("OPERATION:", name)
            print("VARIABLES:", json.dumps({k: v for k, v in (body.get("variables") or {}).items()}, ensure_ascii=False)[:600])
            print("QUERY:\n" + re.sub(r"\s+", " ", body.get("query", ""))[:2500])
            try:
                data = r.json()
                print("RESPONSE SHAPE:")
                shape(data.get("data"))
            except Exception as e:
                print("no json:", str(e)[:100])
        br.close()


if __name__ == "__main__":
    main()
