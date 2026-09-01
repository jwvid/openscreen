# Stable local signing on macOS

macOS privacy permissions are associated with both the bundle identifier and the
app's designated code-signing requirement. Ad-hoc signatures change on every
build, so Screen Recording and Accessibility can be requested again after every
local update.

For development on one Apple Silicon Mac, install a locally trusted code-signing
certificate named `OpenScreen Local Development` in the login keychain. Keep its
private key in Keychain Access; never add or export it into this repository.

Once the identity exists, build and replace `/Applications/Openscreen.app` with:

```sh
npm run install:mac:local
```

The command:

1. requires the exact local signing identity;
2. builds only the Apple Silicon application directory, not another DMG;
3. signs the completed app bundle once with the local identity, then verifies the
   signature and bundle identifier before installation;
4. stages and verifies the copy before replacing the installed app; and
5. removes the duplicate packaged app after a successful installation.

Existing Apple Silicon ScreenCaptureKit helpers are reused for routine UI and
Electron updates, so full Xcode is not required every time. After changing the
native Swift code, install full Xcode and rebuild the helpers explicitly:

```sh
npm run install:mac:local -- --rebuild-native
```

The first build signed with this certificate is a new application identity, so
Screen & System Audio Recording and Accessibility must be granted one final time.
Later builds retain those permissions as long as all of these remain unchanged:

- certificate and private key;
- bundle identifier (`com.siddharthvaddem.openscreen`); and
- installation path (`/Applications/Openscreen.app`).

This certificate is only for local development. A DMG shared with other Macs
still needs an Apple Developer ID signature and notarization to establish a
trusted identity on those machines.
