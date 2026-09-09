(() => {
  "use strict";

  const COLORS = { light: "#ECECEC", dark: "#191919" };
  const STORAGE_KEY = "vault.encrypted.v1";
  const THEME_KEY = "vault.theme";
  const ITERATIONS = 250000;
  const TYPES = ["All", "Note", "Motivation", "Finding", "Learning"];

  const state = {
    vault: null,
    key: null,
    filter: "All",
    query: "",
    editingId: null,
    toastTimer: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    authView: $("authView"), mainView: $("mainView"), authForm: $("authForm"), authCopy: $("authCopy"),
    passwordInput: $("passwordInput"), confirmWrap: $("confirmWrap"), confirmInput: $("confirmInput"),
    authSubmit: $("authSubmit"), authError: $("authError"), filters: $("filters"), notesList: $("notesList"),
    emptyState: $("emptyState"), searchInput: $("searchInput"), newNoteButton: $("newNoteButton"),
    noteDialog: $("noteDialog"), noteForm: $("noteForm"), sheetTitle: $("sheetTitle"), typeInput: $("typeInput"),
    titleInput: $("titleInput"), bodyInput: $("bodyInput"), editActions: $("editActions"),
    deleteNoteButton: $("deleteNoteButton"), cancelNoteButton: $("cancelNoteButton"), saveNoteButton: $("saveNoteButton"),
    themeButton: $("themeButton"), lockButton: $("lockButton"), settingsButton: $("settingsButton"),
    settingsDialog: $("settingsDialog"), closeSettingsButton: $("closeSettingsButton"), storageText: $("storageText"),
    exportButton: $("exportButton"), importInput: $("importInput"), changePasswordButton: $("changePasswordButton"),
    passwordDialog: $("passwordDialog"), passwordForm: $("passwordForm"), cancelPasswordButton: $("cancelPasswordButton"),
    currentPasswordInput: $("currentPasswordInput"), newPasswordInput: $("newPasswordInput"),
    newPasswordConfirmInput: $("newPasswordConfirmInput"), passwordError: $("passwordError"), toast: $("toast")
  };

  function hasVault() { return Boolean(localStorage.getItem(STORAGE_KEY)); }
  function nowIso() { return new Date().toISOString(); }
  function newId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  function textToBytes(text) { return new TextEncoder().encode(text); }
  function bytesToText(bytes) { return new TextDecoder().decode(bytes); }
  function bytesToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }
  function base64ToBytes(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  }

  async function deriveKey(password, saltBytes) {
    const baseKey = await crypto.subtle.importKey("raw", textToBytes(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations: ITERATIONS, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encryptVault(vault, password, existingSalt = null) {
    const salt = existingSalt || crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const plaintext = textToBytes(JSON.stringify(vault));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    return {
      payload: {
        format: "vault-encrypted-backup",
        version: 1,
        kdf: "PBKDF2-SHA256",
        iterations: ITERATIONS,
        cipher: "AES-256-GCM",
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        ciphertext: bytesToBase64(new Uint8Array(cipher)),
        updatedAt: nowIso()
      },
      key,
      salt
    };
  }

  async function decryptStored(password, payload = null) {
    const raw = payload || JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!raw || raw.format !== "vault-encrypted-backup" || raw.version !== 1) throw new Error("Unsupported vault format.");
    const salt = base64ToBytes(raw.salt);
    const iv = base64ToBytes(raw.iv);
    const ciphertext = base64ToBytes(raw.ciphertext);
    const key = await deriveKey(password, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    const vault = JSON.parse(bytesToText(new Uint8Array(plain)));
    if (!vault || !Array.isArray(vault.notes)) throw new Error("Invalid vault data.");
    return { vault, key, salt };
  }

  async function persistWithKey() {
    if (!state.vault || !state.key) return;
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const salt = stored ? base64ToBytes(stored.salt) : crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = textToBytes(JSON.stringify(state.vault));
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, state.key, plaintext);
    const payload = {
      format: "vault-encrypted-backup",
      version: 1,
      kdf: "PBKDF2-SHA256",
      iterations: ITERATIONS,
      cipher: "AES-256-GCM",
      salt: bytesToBase64(salt),
      iv: bytesToBase64(iv),
      ciphertext: bytesToBase64(new Uint8Array(cipher)),
      updatedAt: nowIso()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    updateStorageText();
  }

  function showAuth() {
    const exists = hasVault();
    els.authCopy.textContent = exists
      ? "Enter your master password to decrypt this vault on this device."
      : "Create a master password. Your notes stay on this device and are encrypted before storage.";
    els.authSubmit.textContent = exists ? "Unlock vault" : "Create vault";
    els.confirmWrap.classList.toggle("hidden", exists);
    els.confirmInput.classList.toggle("hidden", exists);
    els.confirmInput.required = !exists;
    els.passwordInput.value = "";
    els.confirmInput.value = "";
    els.authError.textContent = "";
    els.mainView.classList.add("hidden");
    els.authView.classList.remove("hidden");
    setTimeout(() => els.passwordInput.focus(), 0);
  }

  function showMain() {
    els.authView.classList.add("hidden");
    els.mainView.classList.remove("hidden");
    els.searchInput.value = "";
    state.query = "";
    state.filter = "All";
    renderFilters();
    renderNotes();
    updateStorageText();
  }

  function lockVault() {
    state.vault = null;
    state.key = null;
    state.editingId = null;
    closeDialog(els.noteDialog);
    closeDialog(els.settingsDialog);
    closeDialog(els.passwordDialog);
    showAuth();
  }

  function renderFilters() {
    els.filters.innerHTML = "";
    TYPES.forEach(type => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-button${state.filter === type ? " active" : ""}`;
      button.dataset.label = type;
      button.textContent = type;
      button.addEventListener("click", () => { state.filter = type; renderFilters(); renderNotes(); });
      els.filters.appendChild(button);
    });
  }

  function filteredNotes() {
    if (!state.vault) return [];
    const q = state.query.trim().toLocaleLowerCase();
    return [...state.vault.notes]
      .filter(note => state.filter === "All" || note.type === state.filter)
      .filter(note => !q || `${note.title}\n${note.body}\n${note.type}`.toLocaleLowerCase().includes(q))
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function renderNotes() {
    const notes = filteredNotes();
    els.notesList.innerHTML = "";
    els.emptyState.classList.toggle("hidden", notes.length > 0);
    notes.forEach(note => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "note-card";
      const date = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" }).format(new Date(note.updatedAt));
      const title = note.title.trim() || "Untitled";
      const preview = note.body.trim().replace(/\s+/g, " ").slice(0, 180) || "No content";
      button.innerHTML = `
        <div class="note-meta"><span>${escapeHtml(note.type)}</span><span>${escapeHtml(date)}</span></div>
        <h2 class="note-title">${escapeHtml(title)}</h2>
        <p class="note-preview">${escapeHtml(preview)}</p>`;
      button.addEventListener("click", () => openEditNote(note.id));
      els.notesList.appendChild(button);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char]));
  }

  function openNewNote() {
    state.editingId = null;
    els.sheetTitle.textContent = "New note";
    els.typeInput.value = "Note";
    els.titleInput.value = "";
    els.bodyInput.value = "";
    els.editActions.classList.add("hidden");
    openDialog(els.noteDialog);
    setTimeout(() => els.titleInput.focus(), 0);
  }

  function openEditNote(id) {
    const note = state.vault.notes.find(item => item.id === id);
    if (!note) return;
    state.editingId = id;
    els.sheetTitle.textContent = "Edit note";
    els.typeInput.value = note.type;
    els.titleInput.value = note.title;
    els.bodyInput.value = note.body;
    els.editActions.classList.remove("hidden");
    openDialog(els.noteDialog);
  }

  async function saveNote(event) {
    event.preventDefault();
    const title = els.titleInput.value.trim();
    const body = els.bodyInput.value.trim();
    const type = els.typeInput.value;
    if (!title && !body) { showToast("Add a title or some content."); return; }
    const timestamp = nowIso();
    if (state.editingId) {
      const note = state.vault.notes.find(item => item.id === state.editingId);
      if (!note) return;
      Object.assign(note, { title, body, type, updatedAt: timestamp });
    } else {
      state.vault.notes.push({ id: newId(), title, body, type, createdAt: timestamp, updatedAt: timestamp });
    }
    state.vault.updatedAt = timestamp;
    await persistWithKey();
    closeDialog(els.noteDialog);
    renderNotes();
    showToast("Saved.");
  }

  async function deleteNote() {
    if (!state.editingId) return;
    if (!window.confirm("Delete this note? This cannot be undone.")) return;
    state.vault.notes = state.vault.notes.filter(item => item.id !== state.editingId);
    state.vault.updatedAt = nowIso();
    await persistWithKey();
    closeDialog(els.noteDialog);
    renderNotes();
    showToast("Deleted.");
  }

  function openDialog(dialog) { if (!dialog.open) dialog.showModal(); }
  function closeDialog(dialog) { if (dialog && dialog.open) dialog.close(); }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove("hidden");
    state.toastTimer = setTimeout(() => els.toast.classList.add("hidden"), 2200);
  }

  function applyTheme(theme) {
    const light = theme === "light";
    document.body.classList.toggle("light", light);
    localStorage.setItem(THEME_KEY, light ? "light" : "dark");
    document.querySelector('meta[name="theme-color"]').setAttribute("content", light ? COLORS.light : COLORS.dark);
    els.themeButton.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  }

  function toggleTheme() { applyTheme(document.body.classList.contains("light") ? "dark" : "light"); }

  function updateStorageText() {
    const count = state.vault?.notes?.length || 0;
    const bytes = new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
    const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    els.storageText.textContent = `${count} ${count === 1 ? "note" : "notes"} · encrypted storage ${size}`;
  }

  function exportBackup() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `vault-backup-${date}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast("Encrypted backup exported.");
  }

  async function importBackup(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.format !== "vault-encrypted-backup" || parsed.version !== 1 || !parsed.salt || !parsed.iv || !parsed.ciphertext) {
        throw new Error("Invalid backup file.");
      }
      if (!window.confirm("Replace the current vault with this encrypted backup?")) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      showToast("Backup imported. Unlock with its password.");
      setTimeout(lockVault, 500);
    } catch (error) {
      showToast(error.message || "Could not import backup.");
    } finally {
      els.importInput.value = "";
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    els.authError.textContent = "";
    const password = els.passwordInput.value;
    if (password.length < 8) { els.authError.textContent = "Use at least 8 characters."; return; }

    els.authSubmit.disabled = true;
    try {
      if (!hasVault()) {
        if (password !== els.confirmInput.value) throw new Error("Passwords do not match.");
        const timestamp = nowIso();
        const vault = { version: 1, createdAt: timestamp, updatedAt: timestamp, notes: [] };
        const encrypted = await encryptVault(vault, password);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted.payload));
        state.vault = vault;
        state.key = encrypted.key;
      } else {
        const decrypted = await decryptStored(password);
        state.vault = decrypted.vault;
        state.key = decrypted.key;
      }
      showMain();
    } catch (error) {
      els.authError.textContent = hasVault() ? "Could not unlock. Check your password." : (error.message || "Could not create vault.");
    } finally {
      els.authSubmit.disabled = false;
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    els.passwordError.textContent = "";
    const current = els.currentPasswordInput.value;
    const next = els.newPasswordInput.value;
    const confirm = els.newPasswordConfirmInput.value;
    if (next.length < 8) { els.passwordError.textContent = "Use at least 8 characters."; return; }
    if (next !== confirm) { els.passwordError.textContent = "New passwords do not match."; return; }

    try {
      await decryptStored(current);
      const encrypted = await encryptVault(state.vault, next);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted.payload));
      state.key = encrypted.key;
      els.passwordForm.reset();
      closeDialog(els.passwordDialog);
      showToast("Master password changed.");
    } catch {
      els.passwordError.textContent = "Current password is incorrect.";
    }
  }

  function bindEvents() {
    els.authForm.addEventListener("submit", handleAuth);
    els.searchInput.addEventListener("input", () => { state.query = els.searchInput.value; renderNotes(); });
    els.newNoteButton.addEventListener("click", openNewNote);
    els.noteForm.addEventListener("submit", saveNote);
    els.deleteNoteButton.addEventListener("click", deleteNote);
    els.cancelNoteButton.addEventListener("click", () => closeDialog(els.noteDialog));
    els.themeButton.addEventListener("click", toggleTheme);
    els.lockButton.addEventListener("click", lockVault);
    els.settingsButton.addEventListener("click", () => { updateStorageText(); openDialog(els.settingsDialog); });
    els.closeSettingsButton.addEventListener("click", () => closeDialog(els.settingsDialog));
    els.exportButton.addEventListener("click", exportBackup);
    els.importInput.addEventListener("change", () => { const file = els.importInput.files?.[0]; if (file) importBackup(file); });
    els.changePasswordButton.addEventListener("click", () => { els.passwordForm.reset(); els.passwordError.textContent = ""; openDialog(els.passwordDialog); });
    els.cancelPasswordButton.addEventListener("click", () => closeDialog(els.passwordDialog));
    els.passwordForm.addEventListener("submit", changePassword);

    [els.noteDialog, els.settingsDialog, els.passwordDialog].forEach(dialog => {
      dialog.addEventListener("click", event => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  async function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("service-worker.js"); } catch { /* PWA remains usable without SW */ }
    }
  }

  function init() {
    applyTheme(localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark");
    bindEvents();
    showAuth();
    registerServiceWorker();
  }

  init();
})();
