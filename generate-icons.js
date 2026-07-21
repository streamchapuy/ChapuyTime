const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const logoPath = path.join(__dirname, 'public', 'logo-base.png');
const iconDir = path.join(__dirname, 'public', 'icons');

// Ensure icons directory exists
if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

// Generate PNG icons for each size
async function generateIcons() {
  for (const size of sizes) {
    try {
      await sharp(logoPath)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 }
        })
        .png()
        .toFile(path.join(iconDir, `icon-${size}x${size}.png`));
      console.log(`✓ Generated icon-${size}x${size}.png`);
    } catch (error) {
      console.error(`✗ Error generating icon-${size}x${size}.png:`, error.message);
    }
  }

  // Generate favicon
  try {
    await sharp(logoPath)
      .resize(64, 64, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(path.join(__dirname, 'public', 'favicon.png'));
    console.log(`✓ Generated favicon.png`);
  } catch (error) {
    console.error(`✗ Error generating favicon.png:`, error.message);
  }
}

generateIcons();
