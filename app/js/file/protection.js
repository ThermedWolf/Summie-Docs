// ==================== DOCUMENT PROTECTION ====================
// Password-protect .sumd files with AES-GCM. Plain .sumd files remain supported.

(function () {
    'use strict';

    const FORMAT = 'summie-encrypted-v1';
    const ITERATIONS = 250000;
    let currentPassword = null;
    let currentProtected = false;
    // True when the document is flagged as protected but no password is known
    // yet (e.g. restored into a "protected" undo step after the password was
    // cleared). In that state saves fall back to plaintext until the user sets
    // a new password, instead of nagging with a password dialog on auto-save.
    let pendingProtection = false;

    function bytesToBase64(bytes) {
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        return btoa(binary);
    }

    function base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    async function deriveKey(password, salt) {
        const material = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
            material,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    function isEncrypted(data) {
        return !!(data && data.summieFormat === FORMAT && data.crypto && data.payload);
    }

    async function encryptData(data, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);
        const plain = new TextEncoder().encode(JSON.stringify(data));
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);

        return {
            summieFormat: FORMAT,
            crypto: {
                algorithm: 'AES-GCM',
                kdf: 'PBKDF2-SHA256',
                iterations: ITERATIONS,
                salt: bytesToBase64(salt),
                iv: bytesToBase64(iv)
            },
            meta: {
                protected: true,
                timestamp: data.timestamp || new Date().toISOString()
            },
            payload: bytesToBase64(new Uint8Array(cipher))
        };
    }

    async function decryptData(wrapper, password) {
        const salt = base64ToBytes(wrapper.crypto.salt);
        const iv = base64ToBytes(wrapper.crypto.iv);
        const cipher = base64ToBytes(wrapper.payload);
        const key = await deriveKey(password, salt);
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
        return JSON.parse(new TextDecoder().decode(plain));
    }

    async function requestPassword(title, message, options = {}) {
        const value = await window.SummieDialogs.prompt(message, {
            title,
            password: true,
            placeholder: options.placeholder || SummieI18n.t('Wachtwoord'),
            secondPlaceholder: options.confirm ? SummieI18n.t('Herhaal wachtwoord') : null,
            confirmText: options.confirmText || SummieI18n.t('OK')
        });
        if (value === null) return null;
        if (Array.isArray(value)) {
            const [first, second] = value;
            if (!first) {
                await window.SummieDialogs.alert(SummieI18n.t('Vul een wachtwoord in.'), { title: SummieI18n.t('Wachtwoord nodig') });
                return requestPassword(title, message, options);
            }
            return first;
        }
        return value || null;
    }

    async function prepareForSave(data, opts = {}) {
        if (!currentProtected) return data;
        if (!currentPassword) {
            // Undo can restore a "protected" flag without a known password.
            // Never fall back to writing plaintext silently: a manual save
            // asks for the password, an auto-save aborts quietly (no password
            // dialog popping up in the background every few seconds).
            if (opts.silent) return null;
            const password = await requestPassword(
                SummieI18n.t('Document beveiligen'),
                SummieI18n.t('Kies een wachtwoord voor dit document.'),
                { confirm: true, confirmText: SummieI18n.t('Beveiligen') }
            );
            if (!password) return null;
            currentPassword = password;
        }
        pendingProtection = false;
        return encryptData(data, currentPassword);
    }

    async function openData(data) {
        if (!isEncrypted(data)) {
            currentProtected = false;
            currentPassword = null;
            updateButton();
            return data;
        }

        while (true) {
            const password = await requestPassword(
                SummieI18n.t('Beveiligd document'),
                SummieI18n.t('Dit document is beveiligd. Voer het wachtwoord in om het te openen.'),
                { confirmText: SummieI18n.t('Openen') }
            );
            if (!password) return null;
            try {
                const decrypted = await decryptData(data, password);
                currentProtected = true;
                currentPassword = password;
                updateButton();
                return decrypted;
            } catch (e) {
                const retry = await window.SummieDialogs.confirm(
                    SummieI18n.t('Het wachtwoord klopt niet, of het bestand is beschadigd.'),
                    { title: SummieI18n.t('Niet geopend'), confirmText: SummieI18n.t('Opnieuw proberen'), cancelText: SummieI18n.t('Annuleren') }
                );
                if (!retry) return null;
            }
        }
    }

    async function toggleProtection() {
        if (currentProtected) {
            const ok = await window.SummieDialogs.confirm(
                SummieI18n.t('Wil je de wachtwoordbeveiliging van dit document verwijderen? Sla het document daarna op om dit definitief te maken.'),
                { title: SummieI18n.t('Beveiliging verwijderen'), confirmText: SummieI18n.t('Verwijderen'), cancelText: SummieI18n.t('Annuleren'), danger: true }
            );
            if (!ok) return;
            currentProtected = false;
            currentPassword = null;
            pendingProtection = false;
        } else {
            const password = await requestPassword(
                SummieI18n.t('Document beveiligen'),
                SummieI18n.t('Kies een wachtwoord. Zonder dit wachtwoord kan het document later niet worden geopend.'),
                { confirm: true, confirmText: SummieI18n.t('Beveiligen') }
            );
            if (!password) return;
            currentProtected = true;
            currentPassword = password;
            pendingProtection = false;
        }
        updateButton();
        window.updateUnsavedIndicator?.();
        window.saveToLocalStorage?.();
        window.UndoManager && window.UndoManager.notifyExternalChange();
    }

    // Switch the in-memory protected flag without a password (used by undo/redo
    // restore). If the snapshot says "protected" but no password is known, the
    // document stays editable and saves plaintext until a password is set.
    function setProtected(enabled) {
        currentProtected = !!enabled;
        if (!currentProtected) {
            currentPassword = null;
            pendingProtection = false;
        } else if (!currentPassword) {
            pendingProtection = true;
        }
        updateButton();
    }

    function reset() {
        currentProtected = false;
        currentPassword = null;
        updateButton();
    }

    function updateButton() {
        const btn = document.getElementById('toggleProtectionBtn');
        const label = document.getElementById('toggleProtectionLabel');
        if (!btn || !label) return;
        btn.classList.toggle('active', currentProtected);
        label.textContent = currentProtected ? SummieI18n.t('Beveiliging verwijderen') : SummieI18n.t('Wachtwoord instellen');
        btn.title = currentProtected ? 'Dit document wordt beveiligd opgeslagen' : 'Beveilig dit document met een wachtwoord';
    }

    function init() {
        document.getElementById('toggleProtectionBtn')?.addEventListener('click', toggleProtection);
        updateButton();
    }

    window.DocumentProtection = {
        isEncrypted,
        openData,
        prepareForSave,
        reset,
        updateButton,
        setProtected,
        isProtected: () => currentProtected
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
