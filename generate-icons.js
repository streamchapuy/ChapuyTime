const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svgPath = path.join(__dirname, 'public', 'logo.svg');
const iconDir = path.join(__dirname, 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Generate PNG icons for each size
async function generateIcons() {
  for (const size of sizes) {
    try {
      await sharp(svgPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 245, g: 245, b: 245, alpha: 1 }
        })
        .png()
        .toFile(path.join(iconDir, `icon-${size}x${size}.png`));
      console.log(`Generated icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`Error generating icon-${size}x${size}.png:`, error.message);
    }
  }
}

generateIcons();
