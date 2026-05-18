# Photography Module Deployment

## System Dependencies

### macOS (developer machines)
brew install libheif

### Ubuntu/Debian (production / Docker)
apt-get install -y libheif-dev libvips-dev

If sharp is already installed, rebuild it after libheif:
pnpm rebuild sharp

## Node Dependencies
pnpm add multer sharp file-type express-rate-limit
pnpm add -D @types/multer

## Verification
node -e "const sharp = require('sharp'); console.log('HEIC:', sharp.format.heif ? 'OK' : 'MISSING')"

## Dockerfile changes
Add libheif and libvips to the apt-get line in Dockerfile.
