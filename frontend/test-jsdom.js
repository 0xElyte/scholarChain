import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

async function run() {
  const html = fs.readFileSync(path.join(process.cwd(), 'dist', 'index.html'), 'utf-8');
  
  const dom = new JSDOM(html, {
    url: "http://localhost/",
    runScripts: "dangerously",
    resources: "usable"
  });

  dom.window.console.error = (msg, ...args) => {
    console.log("[JSDOM ERROR]", msg, ...args);
  };
  
  dom.window.addEventListener('error', (event) => {
    console.log("[JSDOM UNCAUGHT]", event.error || event.message);
  });

  dom.window.addEventListener('unhandledrejection', (event) => {
    console.log("[JSDOM PROMISE REJECTION]", event.reason);
  });

  setTimeout(() => {
    console.log("Done waiting.");
    process.exit(0);
  }, 2000);
}

run();
