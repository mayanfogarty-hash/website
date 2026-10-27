import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";
import { createStaticServer } from "./serve.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reportsDir = path.join(__dirname, "reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

const pagesToAudit = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : [
      "index.html",
      "delivery.html",
      "computers.html",
      "access.html",
      "goods.html",
      "contact.html",
      "about.html",
      "work.html",
      "woojer.html"
    ];

async function runAudits() {
  const server = createStaticServer(__dirname);
  const port = await new Promise((resolve) => {
    server.listen(0, () => {
      resolve(server.address().port);
    });
  });

  console.log(`\nLocal static server listening on http://localhost:${port}/`);
  console.log(`Auditing ${pagesToAudit.length} page(s) with Lighthouse...\n`);

  const chrome = await chromeLauncher.launch({
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"]
  });

  const results = [];

  try {
    for (const page of pagesToAudit) {
      const url = `http://localhost:${port}/${page}`;
      process.stdout.write(`  Auditing ${page}... `);

      const runnerResult = await lighthouse(url, {
        port: chrome.port,
        output: ["html", "json"],
        logLevel: "error"
      });

      const categories = runnerResult.lhr.categories;
      const scores = {
        page,
        performance: Math.round((categories.performance?.score || 0) * 100),
        accessibility: Math.round((categories.accessibility?.score || 0) * 100),
        bestPractices: Math.round((categories["best-practices"]?.score || 0) * 100),
        seo: Math.round((categories.seo?.score || 0) * 100)
      };
      results.push(scores);

      const pageBase = page.replace(/\.html$/, "");
      const htmlReport = runnerResult.report[0];
      const jsonReport = runnerResult.report[1];

      fs.writeFileSync(path.join(reportsDir, `${pageBase}.report.html`), htmlReport);
      fs.writeFileSync(path.join(reportsDir, `${pageBase}.report.json`), jsonReport);

      process.stdout.write(`Done (Perf: ${scores.performance}, A11y: ${scores.accessibility}, BP: ${scores.bestPractices}, SEO: ${scores.seo})\n`);
    }
  } finally {
    await chrome.kill();
    server.close();
  }

  console.log("\n==================== LIGHTHOUSE AUDIT RESULTS ====================");
  console.table(results);
  console.log(`Reports saved to: ${reportsDir}\n`);
}

runAudits().catch((err) => {
  console.error("Lighthouse audit failed:", err);
  process.exit(1);
});
