const { chromium } = require("C:/Users/Yar/Desktop/dashboard/node_modules/.pnpm/playwright@1.62.1/node_modules/playwright");
const fs = require("fs");
const path = require("path");

const VIEWPORTS = [320, 340, 360, 375, 390, 430, 768, 1024, 1366, 1920];
const OUT = path.join(__dirname, "qa");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const rows = [];
  for (const w of VIEWPORTS) {
    const h = w < 768 ? 720 : 900;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.addInitScript(() => localStorage.removeItem("askona-stock-theme"));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("http://localhost:8080/", { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForSelector(".card, .empty");
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      saleCards: document.querySelectorAll(".card--sale").length,
      theme: document.documentElement.className,
    }));
    const ok = metrics.scrollWidth <= metrics.clientWidth;
    await page.screenshot({ path: path.join(OUT, `w${w}.png`), fullPage: true });
    if (w === 320) {
      await page.click("#filtersBtn");
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(OUT, "w320-sheet.png"),
        fullPage: false,
      });
    }
    if (w === 390) {
      await page.click('[data-theme-pref="light"]');
      await page.waitForTimeout(200);
      const light = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        theme: document.documentElement.className,
      }));
      if (light.scrollWidth > light.clientWidth) {
        console.error("OVERFLOW light", light);
        process.exit(1);
      }
      await page.screenshot({
        path: path.join(OUT, "w390-light.png"),
        fullPage: true,
      });
    }
    if (w === 1366) {
      await page.screenshot({
        path: path.join(OUT, "desktop-1366.png"),
        fullPage: false,
      });
      await page.click('[data-theme-pref="light"]');
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(OUT, "desktop-1366-light.png"),
        fullPage: false,
      });
    }
    await page.close();
    rows.push({ width: w, ...metrics, ok });
    console.log(JSON.stringify({ width: w, ...metrics, ok }));
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, "viewports.json"), JSON.stringify(rows, null, 2));
  const failed = rows.filter((r) => !r.ok);
  if (failed.length) {
    console.error("OVERFLOW", failed);
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
