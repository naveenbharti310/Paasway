# Android interface modernization

The existing Passway diamond and number-private connection model are preserved.

- Charcoal, champagne gold and sage; bundled Manrope (OFL in assets/fonts).
- Original editorial illustrations; no extra animation dependency.
- Connect / Chats / You navigation resets the stack instead of accumulating screen listeners.
- Short native-driver transitions and press feedback; reduced-motion preferences respected.
- Scrollable forms, 44–56dp touch targets, Android resize keyboard mode and safe-area boundaries.
- Stable chat row renderer; incoming messages do not force a scrolled-up reader to the bottom.
- 2Factor sign-in unchanged. No new phone-number exposure or invented encryption/read-receipt claims.

## Assets

Binary design assets have canonical base64 text sources in assets/encoded. `npm install` / `npm ci` runs scripts/materialize-design-assets.cjs to verify SHA-256 and restore them before Metro builds. This keeps remote text-only repository tools lossless. No network fetch is required. Do not edit decoded files without updating the encoded source and manifest checksum.

## Verification and limitations

TypeScript and browser interface flows are checked with isolated synthetic accounts, synthetic API responses and zero real SMS. These renders are interface previews, not Android device screenshots or proof of native stability. Keep the internal diagnostic release available until native crash/ANR reports and an Oppo Reno 14 retest are reviewed. Play Store graphics must match the eventual native release before public publication.
