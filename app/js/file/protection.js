// ==================== DOCUMENT PROTECTION ====================
// Password-protect .sumd files with AES-GCM. Plain .sumd files remain supported.

(function () {
    'use strict';

    const FORMAT = 'summie-encrypted-v1';
    const ITERATIONS = 250000;
    let currentPassword = null;
    let currentProtected = false;

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
            placeholder: options.placeholder || 'Wachtwoord',
            secondPlaceholder: options.confirm ? 'Herhaal wachtwoord' : null,
            confirmText: options.confirmText || 'OK'
        });
        if (value === null) return null;
        if (Array.isArray(value)) {
            const [first, second] = value;
            if (!first) {
                await window.SummieDialogs.alert('Vul een wachtwoord in.', { title: 'Wachtwoord nodig' });
                return requestPassword(title, message, options);
            }
            return first;
        }
        return value || null;
    }

    async function prepareForSave(data) {
        if (!currentProtected) return data;
        if (!currentPassword) {
            currentPassword = await requestPassword(
                'Document beveiligen',
                'Kies een wachtwoord voor dit document.',
                { confirm: true, confirmText: 'Beveiligen' }
            );
        }
        if (!currentPassword) return null;
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
                'Beveiligd document',
                'Dit document is beveiligd. Voer het wachtwoord in om het te openen.',
                { confirmText: 'Openen' }
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
                    'Het wachtwoord klopt niet, of het bestand is beschadigd.',
                    { title: 'Niet geopend', confirmText: 'Opnieuw proberen', cancelText: 'Annuleren' }
                );
                if (!retry) return null;
            }
        }
    }

    async function toggleProtection() {
        if (currentProtected) {
            const ok = await window.SummieDialogs.confirm(
                'Wil je de wachtwoordbeveiliging van dit document verwijderen? Sla het document daarna op om dit definitief te maken.',
                { title: 'Beveiliging verwijderen', confirmText: 'Verwijderen', cancelText: 'Annuleren', danger: true }
            );
            if (!ok) return;
            currentProtected = false;
            currentPassword = null;
        } else {
            const password = await requestPassword(
                'Document beveiligen',
                'Kies een wachtwoord. Zonder dit wachtwoord kan het document later niet worden geopend.',
                { confirm: true, confirmText: 'Beveiligen' }
            );
            if (!password) return;
            currentProtected = true;
            currentPassword = password;
        }
        updateButton();
        window.updateUnsavedIndicator?.();
        window.saveToLocalStorage?.();
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
        label.textContent = currentProtected ? 'Beveiliging verwijderen' : 'Wachtwoord instellen';
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
        isProtected: () => currentProtected
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else setTimeout(init, 0);
})();
