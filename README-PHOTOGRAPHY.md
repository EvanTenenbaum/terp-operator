# Photography Module Deployment

## System Dependencies

`sharp` needs `libvips` (and `libheif` for HEIC/HEIF support) available on the host.

### macOS (developer machines)

```bash
brew install libheif
```

### Alpine (Docker — `node:22-alpine` is the project's base image)

```bash
apk add --no-cache vips libheif
```

This is the relevant install for production: the project `Dockerfile` builds and runs on `node:22-alpine`, so `apt-get` is not available inside the image.

### Ubuntu/Debian (bare-metal or alternative base, non-Docker)

```bash
apt-get install -y libheif-dev libvips-dev
```

If sharp was already installed before the system libraries were present, rebuild it:

```bash
pnpm rebuild sharp
```

## Node Dependencies

```bash
pnpm add multer sharp file-type express-rate-limit
pnpm add -D @types/multer
```

**Important — pnpm v10 build allowlist:** `sharp` must be listed in `pnpm.onlyBuiltDependencies` in `package.json` so its native postinstall is allowed to run. Without this, pnpm will print `Ignored build scripts: sharp@...` and fresh installs (Docker, CI, new dev clones) will end up with a broken sharp until someone manually runs `pnpm rebuild sharp`.

## Verification

The project is ESM (`"type": "module"` in `package.json`), so use `--input-type=commonjs` for the inline `require` form:

```bash
node --input-type=commonjs -e "const sharp = require('sharp'); console.log('HEIC:', sharp.format.heif ? 'OK' : 'MISSING')"
```

Expected output:

```text
HEIC: OK
```

## Dockerfile changes

Add the runtime libraries to both Docker stages (build and runtime) in `Dockerfile`:

```bash
apk add --no-cache vips libheif
```
