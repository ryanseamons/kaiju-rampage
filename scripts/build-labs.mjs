// The Voyage Labs build: the normal build plus the platform's browser SDK as a plain script
// (dist/voyagelabs.js, loaded before the game). src/labs.ts finds it as window.VoyageLabs.
// Run after `npm run build`; needs scripts/labs-sdk.sh to have fetched the SDK.
import fs from 'node:fs';

const sdk = 'vendor/voyage-labs-sdk/dist/voyagelabs.browser.js';
if (!fs.existsSync(sdk)) {
  console.error(`Missing ${sdk}: run scripts/labs-sdk.sh first.`);
  process.exit(1);
}
fs.copyFileSync(sdk, 'dist/voyagelabs.js');
const html = fs.readFileSync('dist/index.html', 'utf8');
if (!html.includes('voyagelabs.js')) {
  const tag = '    <script src="./voyagelabs.js"></script>\n';
  fs.writeFileSync('dist/index.html', html.replace('<script type="module"', `${tag.trimStart()}    <script type="module"`));
}
console.log('dist/ ready for Voyage Labs (SDK added)');
