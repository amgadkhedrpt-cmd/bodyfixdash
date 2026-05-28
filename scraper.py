import os
import json
import asyncio
from datetime import datetime, timezone, timedelta
from collections import defaultdict

os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.environ.get(
    "PLAYWRIGHT_BROWSERS_PATH", "/home/runner/.cache/ms-playwright"
)

from playwright.async_api import async_playwright

SITE_URL  = os.environ.get("MEDICOLIZE_URL",  "https://my.medicolize.com")
USERNAME  = os.environ.get("MEDICOLIZE_USER", "")
PASSWORD  = os.environ.get("MEDICOLIZE_PASS", "")
API_URL   = "https://api.medicolize.com/"
HEADLESS  = True
TIMEOUT   = 45000

GQL_QUERY = """
query CREATED_APPOINTMENTS(
  $doctor: ID, $branchId: ID, $orderBy: String!, $skip: Int!, $take: Int!,
  $searchTerm: String, $rangeDate: [DateTime!]!, $filters: Filter
) {
  createdAppointments(
    doctor: $doctor branchId: $branchId orderBy: $orderBy skip: $skip
    take: $take searchTerm: $searchTerm rangeDate: $rangeDate filters: $filters
  ) {
    id start end status type other
    doctor { id name color __typename }
    branch { id name __typename }
    patient {
      id firstName lastName phoneNumber patientId
      __typename
    }
    createdAt
    __typename
  }
}
"""

def build_date_range():
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end   = (now + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.999Z")
    return [start, end]

async def do_login(page):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    print(f"[{ts()}] 🌐 فتح صفحة تسجيل الدخول...")
    await page.goto(f"{SITE_URL}/auth/login", wait_until="domcontentloaded", timeout=TIMEOUT)
    await page.wait_for_timeout(2000)

    for sel in ['input[type="email"]','input[name="email"]','input[id*="email" i]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.fill(USERNAME)
                print(f"[{ts()}] ✅ تم إدخال البريد")
                break
        except: continue

    for sel in ['input[type="password"]','input[name="password"]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.fill(PASSWORD)
                print(f"[{ts()}] ✅ تم إدخال كلمة المرور")
                break
        except: continue

    for sel in ['button[type="submit"]','button:has-text("Login")','button:has-text("دخول")']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click()
                print(f"[{ts()}] ✅ تم الضغط على Login")
                break
        except: continue

    await page.wait_for_timeout(5000)
    print(f"[{ts()}] 🔄 تم تسجيل الدخول")

async def fetch_all_appointments(page):
    ts         = lambda: datetime.now().strftime("%H:%M:%S")
    range_date = build_date_range()
    all_appts  = []
    skip       = 0
    take       = 100
    page_num   = 1

    print(f"[{ts()}] 📋 بدء سحب المواعيد...")

    while True:
        payload = {
            "operationName": "CREATED_APPOINTMENTS",
            "variables": {
                "skip":       skip,
                "take":       take,
                "orderBy":    "createdAt-desc",
                "searchTerm": "",
                "rangeDate":  range_date,
                "filters":    {"rangeDateKey": "start"},
            },
            "query": GQL_QUERY,
        }

        result = await page.evaluate("""
            async (args) => {
                const res = await fetch(args.url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(args.payload)
                });
                return await res.json();
            }
        """, {"url": API_URL, "payload": payload})

        if result.get("errors"):
            print(f"[{ts()}] ❌ GraphQL error: {result['errors'][0]['message']}")
            break

        data = result.get("data") or {}
        raw = data.get("createdAppointments") or []
        batch = raw if isinstance(raw, list) else []
        if not batch:
            break

        all_appts.extend(batch)
        print(f"[{ts()}] 📄 صفحة {page_num}: {len(batch)} موعد (إجمالي: {len(all_appts)})")

        if len(batch) < take:
            break

        skip     += take
        page_num += 1
        await asyncio.sleep(0.5)

        # حد أقصى 5000 موعد
        if len(all_appts) >= 5000:
            print(f"[{ts()}] ⚠️ وصلنا للحد الأقصى 5000 موعد")
            break

    print(f"[{ts()}] ✅ إجمالي المواعيد: {len(all_appts)}")
    return all_appts

def analyze(appointments):
    by_doctor  = defaultdict(list)
    by_branch  = defaultdict(list)
    by_date    = defaultdict(int)
    by_type    = defaultdict(int)
    by_status  = defaultdict(int)

    for a in appointments:
        doc    = (a.get("doctor")  or {}).get("name", "غير محدد")
        branch = (a.get("branch")  or {}).get("name", "غير محدد")
        start  = (a.get("start")   or "")[:10]
        atype  = a.get("type")     or a.get("other") or "غير محدد"
        status = a.get("status")   or "غير محدد"

        entry = {
            "id":      a.get("id"),
            "start":   a.get("start"),
            "end":     a.get("end"),
            "status":  status,
            "type":    atype,
            "doctor":  doc,
            "branch":  branch,
            "patient": f"{(a.get('patient') or {}).get('firstName','')} {(a.get('patient') or {}).get('lastName','')}".strip(),
            "phone":   (a.get("patient") or {}).get("phoneNumber", ""),
        }

        by_doctor[doc].append(entry)
        by_branch[branch].append(entry)
        if start: by_date[start] += 1
        by_type[atype]   += 1
        by_status[status] += 1

    top_dates = dict(sorted(by_date.items(), reverse=True)[:60])

    return {
        "by_doctor": {
            doc: {"total": len(v), "appointments": v[:200]}
            for doc, v in sorted(by_doctor.items())
        },
        "by_branch": {
            br: {"total": len(v), "appointments": v[:200]}
            for br, v in sorted(by_branch.items())
        },
        "by_date":   top_dates,
        "by_type":   dict(sorted(by_type.items(),   key=lambda x: -x[1])),
        "by_status": dict(sorted(by_status.items(), key=lambda x: -x[1])),
    }

async def main():
    print("=" * 55)
    print("   BODYFIX — Medicolize GraphQL Sync")
    print(f"   الوقت: {datetime.now():%Y-%m-%d %H:%M:%S}")
    print("=" * 55)

    if not USERNAME or not PASSWORD:
        raise ValueError("❌ MEDICOLIZE_USER و MEDICOLIZE_PASS غير محددين")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox","--disable-setuid-sandbox",
                  "--disable-dev-shm-usage","--disable-gpu"]
        )
        context = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        )
        page = await context.new_page()

        try:
            await do_login(page)
            appointments = await fetch_all_appointments(page)
            analysis     = analyze(appointments)
            now_str      = datetime.now(timezone.utc).isoformat()

            os.makedirs("data", exist_ok=True)

            # ملف كامل
            with open("data/appointments.json", "w", encoding="utf-8") as f:
                json.dump({
                    "last_updated": now_str,
                    "total":        len(appointments),
                    "appointments": appointments[:500],
                    "analysis":     analysis,
                }, f, ensure_ascii=False, indent=2)

            # ملف ملخص
            with open("data/summary.json", "w", encoding="utf-8") as f:
                json.dump({
                    "last_updated":   now_str,
                    "total":          len(appointments),
                    "doctors":        list(analysis["by_doctor"].keys()),
                    "branches":       list(analysis["by_branch"].keys()),
                    "by_type":        analysis["by_type"],
                    "by_status":      analysis["by_status"],
                    "by_date":        analysis["by_date"],
                    "doctor_totals":  {
                        doc: v["total"]
                        for doc, v in analysis["by_doctor"].items()
                    },
                }, f, ensure_ascii=False, indent=2)

            ts = datetime.now().strftime("%H:%M:%S")
            print(f"\n✅ [{ts}] اكتمل بنجاح!")
            print(f"   الأطباء: {list(analysis['by_doctor'].keys())[:5]}")
            print(f"   الفروع:  {list(analysis['by_branch'].keys())}")
            print(f"   الأنواع: {list(analysis['by_type'].keys())[:5]}")

        except Exception as e:
            print(f"\n❌ خطأ: {e}")
            raise
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
