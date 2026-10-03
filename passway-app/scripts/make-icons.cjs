// Turns the SVG artwork in assets/src into the PNG files the app build needs.
// Runs automatically on Expo's build servers, or by hand with: npm run icons
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'assets');
(async () => {
  for (const file of fs.readdirSync(path.join(root, 'src')).filter((f) => f.endsWith('.svg'))) {
    const out = path.join(root, file.replace(/\.svg$/, '.png'));
    await sharp(path.join(root, 'src', file)).png().toFile(out);
    console.log('made', path.relative(process.cwd(), out));
  }
})().catch((err) => { console.error(err); process.exit(1); });
