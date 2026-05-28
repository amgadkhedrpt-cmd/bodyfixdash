import os
import json
import asyncio
from datetime import datetime, timezone, timedelta
from collections import defaultdict

# ══════════════════════════════════════════════════════
#  إجباري: توجيه Playwright للمسار المخصص
#  على GitHub Actions بيتحدد تلقائياً
# ══════════════════════════════════════════════════════
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.environ.get(
    "PLAYWRIGHT_BROWSERS_PATH", "/home/runner/.cache/ms-playwright"
)

from playwright.async_api import async_playwright, TimeoutError as PWTimeout

# ─── إعدادات من GitHub Secrets ───────────────────────
SITE_URL  = os.environ.get("MEDICOLIZE_URL",  "https://my.medicolize.com")
USERNAME  = os.environ.get("MEDICOLIZE_USER", "")
PASSWORD  = os.environ.get("MEDICOLIZE_PASS", "")
HEADLESS  = True
TIMEOUT   = 45000

# ─── نطاق التواريخ: آخر 365 يوم + 365 قادم ──────────
def build_url():
    now   = datetime.now(timezone.utc)
    start = (now - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    end   = (now + timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%S.999Z")
    return (
        f"{SITE_URL}/logs/created-appointments"
        f"?start={start}&end={end}"
        f"&queryName=createdAppointments"
        f'&filters=%7B%22rangeDateKey%22%3A%22start%22%7D'
    )

# ─── تسجيل الدخول ────────────────────────────────────
async def do_login(page):
    ts = lambda: datetime.now().strftime("%H:%M:%S")
    login_url = f"{SITE_URL}/login"
    print(f"[{ts()}] 🌐 فتح صفحة الدخول: {login_url}")
    await page.goto(login_url, wait_until="domcontentloaded", timeout=TIMEOUT)
    await page.wait_for_timeout(2500)

    # username
    for sel in ['input[type="email"]','input[name="username"]','input[name="email"]',
                'input[id*="email" i]','input[id*="user" i]','input[placeholder*="email" i]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.fill(USERNAME)
                print(f"[{ts()}] ✅ تم إدخال البريد الإلكتروني")
                break
        except Exception:
            continue

    # password
    for sel in ['input[type="password"]','input[name="password"]','input[id*="pass" i]']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.fill(PASSWORD)
                print(f"[{ts()}] ✅ تم إدخال كلمة المرور")
                break
        except Exception:
            continue

    # submit
    for sel in ['button[type="submit"]','input[type="submit"]',
                'button:has-text("Login")','button:has-text("Sign in")',
                'button:has-text("دخول")','button:has-text("تسجيل الدخول")']:
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=2000):
                await loc.click()
                print(f"[{ts()}] ✅ تم الضغط على زر الدخول")
                break
        except Exception:
            continue

    await page.wait_for_timeout(4000)
    print(f"[{ts()}] 🔄 تم تسجيل الدخول — جاري التحميل...")

# ─── سحب المواعيد عبر الـ API الداخلي ───────────────
async def fetch_appointments(page):
    ts  = lambda: datetime.now().strftime("%H:%M:%S")
    url = build_url()
    print(f"[{ts()}] 📋 فتح صفحة المواعيد...")
    await page.goto(url, wait_until="domcontentloaded", timeout=TIMEOUT)
    await page.wait_for_timeout(3000)

    # محاولة اعتراض بيانات الـ API مباشرة
    appointments_raw = []

    # قراءة الـ network responses المخزنة في الصفحة
    api_data = await page.evaluate("""() => {
        // محاولة قراءة البيانات من React/Apollo cache أو window
        try {
            const keys = Object.keys(window.__APOLLO_STATE__ || {});
            if (keys.length) return {source: 'apollo', data: window.__APOLLO_STATE__};
        } catch(e) {}
        try {
            if (window.__INITIAL_STATE__) return {source: 'initial', data: window.__INITIAL_STATE__};
        } catch(e) {}
        return {source: 'none', data: null};
    }""")

    print(f"[{ts()}] 🔍 مصدر البيانات: {api_data.get('source','unknown')}")

    # قراءة الجدول من الـ DOM
    rows = await page.evaluate("""() => {
        const results = [];
        // جرب كل الجداول
        document.querySelectorAll('table tr').forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'))
                              .map(c => c.innerText.trim());
            if (cells.length >= 3 && cells.some(c => c.length > 0)) {
                results.push(cells);
            }
        });
        // لو مفيش جدول، جرب الـ grid أو list items
        if (!results.length) {
            document.querySelectorAll('[class*="row"], [class*="item"], [class*="appointment"]')
                .forEach(el => {
                    const text = el.innerText.trim();
                    if (text.length > 10) results.push([text]);
                });
        }
        return results;
    }""")

    print(f"[{ts()}] ✅ صفوف مقروءة: {len(rows)}")

    # ─── تحليل الصفوف ────────────────────────────────
    appointments = []
    headers = []

    for i, row in enumerate(rows):
        if i == 0:
            headers = row
            continue
        if not any(row):
            continue
        appt = {}
        for j, val in enumerate(row):
            key = headers[j] if j < len(headers) else f"col_{j}"
            appt[key] = val
        # تعيين حقول أساسية لو الأسماء مختلفة
        appt["_raw"] = row
        appointments.append(appt)

    return appointments, headers

# ─── تحليل المواعيد ───────────────────────────────────
def analyze(appointments, headers):
    by_doctor  = defaultdict(list)
    by_branch  = defaultdict(list)
    by_date    = defaultdict(int)
    by_type    = defaultdict(int)

    for a in appointments:
        raw = a.get("_raw", [])

        # محاولة تحديد الحقول بناءً على الهيدر أو الموضع
        doctor = ""
        branch = ""
        date   = ""
        appt_type = ""

        for h, v in zip(headers, raw):
            hl = h.lower()
            if any(k in hl for k in ["doctor","دكتور","physician","dr"]):
                doctor = v
            elif any(k in hl for k in ["branch","فرع","clinic","عيادة"]):
                branch = v
            elif any(k in hl for k in ["date","تاريخ","day","يوم","start","time"]):
                date = v[:10] if v else ""
            elif any(k in hl for k in ["type","نوع","status","حالة","category"]):
                appt_type = v

        # fallback بالموضع
        if not doctor and len(raw) > 2: doctor = raw[2]
        if not branch and len(raw) > 4: branch = raw[4]
        if not date   and len(raw) > 0: date   = raw[0][:10] if raw[0] else ""
        if not appt_type and len(raw) > 3: appt_type = raw[3]

        entry = {
            "doctor":    doctor,
            "branch":    branch,
            "date":      date,
            "type":      appt_type,
            "raw":       raw,
        }

        if doctor: by_doctor[doctor].append(entry)
        if branch: by_branch[branch].append(entry)
        if date:   by_date[date] += 1
        if appt_type: by_type[appt_type] += 1

    # أعلى 30 يوم
    top_dates = sorted(by_date.items(), key=lambda x: x[0], reverse=True)[:30]

    return {
        "by_doctor": {
            doc: {
                "total": len(appts),
                "appointments": appts[:200]  # آخر 200 لكل دكتور
            }
            for doc, appts in sorted(by_doctor.items())
        },
        "by_branch": {
            br: {"total": len(appts), "appointments": appts[:200]}
            for br, appts in sorted(by_branch.items())
        },
        "by_date":  dict(top_dates),
        "by_type":  dict(sorted(by_type.items(), key=lambda x: -x[1])),
        "headers":  headers,
    }

# ─── الدالة الرئيسية ─────────────────────────────────
async def main():
    print("=" * 55)
    print("   BODYFIX — Medicolize Sync")
    print(f"   الوقت: {datetime.now():%Y-%m-%d %H:%M:%S}")
    print("=" * 55)

    if not USERNAME or not PASSWORD:
        raise ValueError("❌ MEDICOLIZE_USER و MEDICOLIZE_PASS مش محددين في الـ Secrets")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            args=["--no-sandbox", "--disable-setuid-sandbox",
                  "--disable-dev-shm-usage", "--disable-gpu"]
        )
        context = await browser.new_context(
            viewport={"width": 1400, "height": 900},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            locale="ar-EG",
        )
        page = await context.new_page()

        # اعتراض الـ API responses
        api_responses = []
        async def handle_response(response):
            if "appointment" in response.url.lower() or "logs" in response.url.lower():
                try:
                    if "json" in response.headers.get("content-type", ""):
                        data = await response.json()
                        api_responses.append({"url": response.url, "data": data})
                        print(f"🎯 API intercepted: {response.url[:80]}")
                except Exception:
                    pass
        page.on("response", handle_response)

        try:
            await do_login(page)
            appointments, headers = await fetch_appointments(page)

            # لو اعترضنا API responses، استخدمها
            if api_responses:
                print(f"✅ تم اعتراض {len(api_responses)} API response")

            analysis = analyze(appointments, headers)

            # ─── حفظ الملفات ─────────────────────────
            now_str = datetime.now(timezone.utc).isoformat()

            output = {
                "last_updated":    now_str,
                "total":           len(appointments),
                "appointments":    appointments[:500],
                "analysis":        analysis,
                "api_raw":         api_responses[:5] if api_responses else [],
            }

            os.makedirs("data", exist_ok=True)

            with open("data/appointments.json", "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)

            # ملف ملخص خفيف للداشبورد
            summary = {
                "last_updated": now_str,
                "total":        len(appointments),
                "doctors":      list(analysis["by_doctor"].keys()),
                "branches":     list(analysis["by_branch"].keys()),
                "by_type":      analysis["by_type"],
                "by_date":      analysis["by_date"],
                "doctor_totals": {
                    doc: v["total"]
                    for doc, v in analysis["by_doctor"].items()
                },
            }

            with open("data/summary.json", "w", encoding="utf-8") as f:
                json.dump(summary, f, ensure_ascii=False, indent=2)

            ts = datetime.now().strftime("%H:%M:%S")
            print(f"\n✅ [{ts}] اكتمل — {len(appointments)} موعد")
            print(f"   الأطباء: {list(analysis['by_doctor'].keys())[:5]}")
            print(f"   الفروع:  {list(analysis['by_branch'].keys())}")

        except PWTimeout:
            print("❌ انتهت المهلة — تحقق من الإنترنت أو زد TIMEOUT")
            raise
        except Exception as e:
            print(f"❌ خطأ: {e}")
            raise
        finally:
            await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
