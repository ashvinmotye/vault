# Vault

Minimal local-first encrypted notes PWA.

## Included
- Master-password encrypted local vault using PBKDF2-SHA256 + AES-256-GCM.
- Notes, Motivation, Finding, and Learning types.
- Category-gated note lists: no saved notes are shown until a category is selected.
- Title-only category lists with search inside the selected category.
- Notes open in full read-only view with an explicit Edit action.
- Encrypted JSON export/import.
- Master password change.
- Dark mode by default with optional light mode.
- Installable offline PWA.
- Two-colour interface only: #191919 and #ECECEC.
- Inter Thin (100), Regular (400), and Black (900).
- Notifications intentionally not implemented in this version.

## Run locally
Use any local static web server. For example:

    python3 -m http.server 8080

Then open http://localhost:8080 from inside this folder.

For PWA installation on another device, serve it over HTTPS (or localhost).


## Security update
- Automatically locks after 30 seconds without activity.
- Locks immediately when the app is backgrounded or the device screen is locked.
- Browser-native focus rings use the Vault dark colour instead of blue.
- A full-screen dark privacy shield covers Vault before backgrounding/app-switcher snapshots, then remains until the locked screen has painted again.
