# 🔨 Building RustFocus - Complete Guide

This guide provides step-by-step instructions for building RustFocus on a Windows machine with proper internet access.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **Windows 10 or 11** (64-bit)
- [ ] **Rust toolchain** (latest stable)
- [ ] **Node.js** 16+ with npm
- [ ] **Internet connection** (for downloading dependencies)
- [ ] **Git** (optional, for cloning)

## Step 1: Install Rust

### Using rustup (Recommended)
1. Download rustup from https://rustup.rs/
2. Run the installer and follow the prompts
3. Restart your terminal
4. Verify installation:
```bash
rustc --version
cargo --version
```

Expected output:
```
rustc 1.91.0 (or newer)
cargo 1.91.0 (or newer)
```

## Step 2: Install Node.js

1. Download Node.js LTS from https://nodejs.org/
2. Run the installer
3. Verify installation:
```bash
node --version
npm --version
```

Expected output:
```
v22.x.x (or newer)
10.x.x (or newer)
```

## Step 3: Get the Source Code

### Option A: Clone from Git
```bash
git clone https://github.com/your-username/Organizer2.0.git
cd Organizer2.0
```

### Option B: Download ZIP
1. Download the project as ZIP
2. Extract to a folder (e.g., `C:\Projects\RustFocus`)
3. Open terminal in that folder

## Step 4: Install Tauri CLI (Optional)

This step is optional but provides useful commands:

```bash
npm install -g @tauri-apps/cli
```

Or use with npm:
```bash
npm install --save-dev @tauri-apps/cli
```

## Step 5: Download Dependencies

Navigate to the src-tauri directory and fetch dependencies:

```bash
cd src-tauri
cargo fetch
```

This will download all Rust dependencies listed in Cargo.toml:
- tauri (1.5+)
- windows (0.58)
- serde (1.0)
- serde_json (1.0)
- parking_lot (0.12)
- anyhow (1.0)
- log (0.4)

**Expected download size**: ~200-300 MB (first time)

## Step 6: Generate Application Icons

Tauri requires proper icon files. You have two options:

### Option A: Use Existing Icons (if you have icon.png)
```bash
# Install icon generator
npm install -g @tauri-apps/cli

# Generate icons (must be 1024x1024 PNG with transparency)
tauri icon path/to/your/icon.png
```

### Option B: Create Placeholder Icons
Create simple placeholder icons in `src-tauri/icons/`:
- 32x32.png
- 128x128.png
- 128x128@2x.png
- icon.ico (for Windows)
- icon.icns (for macOS, if needed)

You can use any image editor or online tools like:
- https://www.favicon-generator.org/
- https://realfavicongenerator.net/

## Step 7: Development Build

### Test the application in development mode:

```bash
cd src-tauri
cargo tauri dev
```

**What happens**:
1. Rust backend compiles (takes 2-5 minutes first time)
2. Application window opens
3. Hot-reload is enabled (changes reflect automatically)

**Troubleshooting dev mode**:
- If it fails with "cannot find -lwindows", run `cargo clean` and retry
- If hotkeys don't work, run as Administrator
- If no windows detected, ensure Dofus is running

## Step 8: Production Build

### Create optimized release binary:

```bash
cd src-tauri
cargo tauri build
```

**Build process** (10-15 minutes):
1. Compiles Rust code with optimizations
2. Bundles frontend assets
3. Creates executable: `target/release/rustfocus.exe`
4. Creates MSI installer: `target/release/bundle/msi/rustfocus_1.0.0_x64_en-US.msi`

**Expected file sizes**:
- EXE: ~5-8 MB
- MSI: ~7-10 MB

## Step 9: Testing the Build

### Test the executable:
```bash
cd target/release
./rustfocus.exe
```

### Verify functionality:
1. ✅ Application launches
2. ✅ Window is responsive
3. ✅ "Refresh Windows" detects Dofus clients
4. ✅ Drag-and-drop reordering works
5. ✅ Hotkeys work (Page Up/Down, F1-F8)
6. ✅ Profile save/load functions
7. ✅ System tray integration works
8. ✅ CPU usage is 0% when idle
9. ✅ Memory usage < 50 MB

## Step 10: Install & Distribute

### Install the MSI:
```bash
cd target/release/bundle/msi
rustfocus_1.0.0_x64_en-US.msi
```

Follow the installation wizard.

### Manual distribution:
Simply copy `rustfocus.exe` to any Windows machine - no installation needed!

## Common Build Errors & Solutions

### Error: "linker `link.exe` not found"
**Solution**: Install Visual Studio Build Tools
- Download from: https://visualstudio.microsoft.com/downloads/
- Select "Desktop development with C++"

### Error: "failed to get successful HTTP response from crates.io"
**Solution**: Check internet connection or configure proxy
```bash
# If behind corporate proxy
export HTTP_PROXY=http://proxy:port
export HTTPS_PROXY=http://proxy:port
```

### Error: "could not compile `windows-sys`"
**Solution**: Update Rust toolchain
```bash
rustup update stable
```

### Error: "tauri.conf.json: No such file or directory"
**Solution**: Ensure you're in the correct directory
```bash
cd src-tauri
ls tauri.conf.json  # should exist
```

### Error: Hotkeys not working
**Solution**:
1. Close other hotkey applications
2. Run as Administrator
3. Check Windows Settings > Privacy > Background apps

## Performance Optimization

### For smallest binary size:
Edit `Cargo.toml` and add:
```toml
[profile.release]
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

### For fastest execution:
```toml
[profile.release]
opt-level = 3
lto = "fat"
codegen-units = 1
```

## Build Variants

### Debug build (fast compile, larger binary):
```bash
cargo build
```
Output: `target/debug/rustfocus.exe`

### Release build (slow compile, optimized):
```bash
cargo build --release
```
Output: `target/release/rustfocus.exe`

### With logging enabled:
```bash
$env:RUST_LOG="debug"
cargo tauri dev
```

## Continuous Integration

### GitHub Actions example:
```yaml
name: Build RustFocus

on: [push, pull_request]

jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: stable
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - name: Build
        run: |
          cd src-tauri
          cargo tauri build
      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: rustfocus-windows
          path: src-tauri/target/release/bundle/msi/*.msi
```

## Next Steps

After successful build:
1. Test thoroughly with multiple Dofus clients
2. Create custom icons for professional look
3. Sign the executable (optional, for distribution)
4. Create GitHub releases
5. Write user documentation

## Support

If you encounter build issues:
1. Check error messages carefully
2. Search GitHub issues
3. Ask in project discussions
4. Provide full error output when reporting

---

**Happy Building! 🚀**
