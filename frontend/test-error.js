import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

async function run() {
  console.log("Starting preview server...");
  const preview = spawn('npm', ['run', 'preview'], { stdio: 'pipe' });
  
  await new Promise(resolve => setTimeout(resolve, 3000)); // wait for preview to start

  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.error("Page Error Caught:", err.toString());
    console.error(err.stack);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error("Console Error:", msg.text());
    }
  });

  console.log("Navigating to http://localhost:4173 ...");
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle0' }).catch(console.error);
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  await browser.close();
  preview.kill();
}

run();
