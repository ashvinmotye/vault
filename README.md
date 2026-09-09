# Vault

Minimal local-first encrypted notes PWA.

## Included
- Master-password encrypted local vault using PBKDF2-SHA256 + AES-256-GCM.
- Notes, Motivation, Finding, and Learning types.
- Search and type filters.
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
