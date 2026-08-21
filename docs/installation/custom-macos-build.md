# Installing the custom macOS build

The release DMG is built for Apple Silicon Macs (`arm64`).

1. Open the DMG and drag `Openscreen.app` into `Applications`.
2. Open Terminal and run:

   ```sh
   xattr -dr com.apple.quarantine /Applications/Openscreen.app
   ```

3. Launch Openscreen and grant the requested Screen Recording, Accessibility,
   Microphone, and Camera permissions in System Settings.

## Why the Terminal command is required

This community build is ad-hoc signed because it is not published with an Apple
Developer ID certificate and is not notarized by Apple. macOS may therefore block
the first launch of a downloaded copy. Only install DMGs downloaded from this
repository's release page, and verify the published SHA-256 checksum when sharing
the installer.
