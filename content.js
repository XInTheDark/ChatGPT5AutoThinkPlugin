class ChatGPTAutoThink {
    constructor() {
        this.settings = {
            customString: 'Please think step by step before answering.',
            enabled: true,
            position: 'end',
            preventDuplicates: true,
            debug: false
        };
        this.isProcessing = false;
        this.capturedText = null;
        this.init();
    }

    log(...args) {
        if (this.settings.debug) {
            console.log('[AutoThink]', ...args);
        }
    }

    warn(...args) {
        if (this.settings.debug) {
            console.warn('[AutoThink]', ...args);
        }
    }

    error(...args) {
        console.error('[AutoThink]', ...args);
    }

    async init() {
        await this.loadSettings();
        this.setupInterception();
        this.log('Initialized');
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['customString', 'enabled', 'position', 'preventDuplicates', 'debug']);
            this.settings.customString = result.customString || this.settings.customString;
            this.settings.enabled = result.enabled !== false;
            this.settings.position = result.position || 'end';
            this.settings.preventDuplicates = result.preventDuplicates !== false;
            this.settings.debug = typeof result.debug === 'boolean' ? result.debug : false;
            this.log('Settings loaded', this.settings);
        } catch (err) {
            this.error('Failed to load settings', err);
        }
    }

    setupInterception() {
        const self = this;

        // Keyboard: Enter in composer; Cmd/Ctrl+Enter in edit mode
        document.addEventListener('keydown', function (e) {
            if (e._autoThinkTriggered) return;

            const main = self.getMainComposer();
            const edit = self.findEditingTextArea();

            // Main composer: Enter (no Shift)
            if (e.key === 'Enter' && !e.shiftKey && main && e.target === main) {
                const captured = self.getTextContent(main);
                if (self.shouldHandle(captured)) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    self.capturedText = captured;
                    self.handleSend();
                }
                return;
            }

            // Edit composer: Cmd/Ctrl+Enter
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && edit && e.target === edit) {
                const captured = self.getTextContent(edit);
                if (self.shouldHandle(captured)) {
                    const processed = self.processPlaceholders(self.settings.customString);
                    const modified = self.appendCustomString(captured, processed);
                    self.setTextContent(edit, modified);
                    // Let native handler continue to submit the edit
                    self.log('Edited text updated, letting native edit submit');
                }
            }
        }, true);

        // Click: Send button
        document.addEventListener('click', function (e) {
            if (e._autoThinkTriggered) return;

            // Main send button(s)
            const sendButtonSelectors = [
                '#composer-submit-button',
                '[data-testid="send-button"]',
                'button[aria-label="Send prompt"]',
                '.composer-submit-btn'
            ];

            for (const selector of sendButtonSelectors) {
                if ((e.target.matches && e.target.matches(selector)) || e.target.closest?.(selector)) {
                    const main = self.getMainComposer();
                    const captured = main ? self.getTextContent(main) : '';
                    if (main && self.shouldHandle(captured)) {
                        e.preventDefault();
                        e.stopImmediatePropagation();
                        self.capturedText = captured;
                        self.handleSend();
                    }
                    return;
                }
            }

            // Edit-mode send button
            const editSend = self.findEditingSendButton();
            if (editSend && (e.target === editSend || e.target.closest?.('button') === editSend)) {
                const edit = self.findEditingTextArea();
                const captured = edit ? self.getTextContent(edit) : '';
                if (edit && self.shouldHandle(captured)) {
                    const processed = self.processPlaceholders(self.settings.customString);
                    const modified = self.appendCustomString(captured, processed);
                    self.setTextContent(edit, modified);
                }
            }
        }, true);

        // Form submit (fallback path)
        document.addEventListener('submit', function (e) {
            if (e._autoThinkTriggered) return;
            const form = e.target;
            if (!form?.matches?.('form[data-type="unified-composer"]')) return;

            const main = self.getMainComposer();
            const captured = main ? self.getTextContent(main) : '';
            if (main && self.shouldHandle(captured)) {
                e.preventDefault();
                e.stopImmediatePropagation();
                self.capturedText = captured;
                self.handleSend();
            }
        }, true);
    }

    shouldHandle(text) {
        return this.settings.enabled && !!(this.settings.customString?.trim()) && !!(text?.trim());
    }

    async handleSend() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        try {
            await this.loadSettings();
            const main = this.getMainComposer() || this.findEditingTextArea();
            if (!main) {
                this.warn('No active composer found');
                return;
            }

            const currentText = this.capturedText?.trim();
            if (!currentText) {
                this.warn('No captured text');
                return;
            }

            const processed = this.processPlaceholders(this.settings.customString);
            const modified = this.appendCustomString(currentText, processed);

            const ok = this.setTextContent(main, modified);
            if (!ok) {
                this.error('Failed to set composer text');
                return;
            }

            // Allow DOM to settle, then trigger send
            setTimeout(() => {
                this.triggerSend();
                this.isProcessing = false;
                this.capturedText = null;
            }, 60);
        } catch (err) {
            this.error('Error during handleSend', err);
            this.isProcessing = false;
            this.capturedText = null;
        }
    }

    // Element helpers
    getMainComposer() {
        // ChatGPT ProseMirror root carries id="prompt-textarea"
        const el = document.querySelector('#prompt-textarea');
        return el && el.isContentEditable ? el : null;
    }

    findEditingTextArea() {
        // Look for a visible textarea inside known edit containers
        const containers = document.querySelectorAll('.bg-token-main-surface-tertiary');
        for (const c of containers) {
            const ta = c.querySelector('textarea');
            if (ta && this.isVisible(ta)) return ta;
        }
        return null;
    }

    findEditingSendButton() {
        const containers = document.querySelectorAll('.bg-token-main-surface-tertiary');
        for (const c of containers) {
            // Prefer primary-styled button
            const pri = c.querySelector('button.btn-primary');
            if (pri && /send/i.test(pri.textContent || '')) return pri;
            const any = Array.from(c.querySelectorAll('button')).find(b => /send/i.test(b.textContent || ''));
            if (any) return any;
        }
        return null;
    }

    isVisible(el) {
        const rect = el.getBoundingClientRect();
        return !!(rect.width || rect.height) && getComputedStyle(el).visibility !== 'hidden';
    }

    getTextContent(element) {
        if (element.isContentEditable || element.contentEditable === 'true') {
            // ProseMirror exposes plain text via innerText
            return (element.innerText || element.textContent || '').trim();
        }
        return (element.value || '').trim();
    }

    setTextContent(element, text) {
        try {
            element.focus();
            if (element.tagName === 'TEXTAREA') {
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            if (element.isContentEditable || element.contentEditable === 'true') {
                // Replace content safely without using innerHTML
                while (element.firstChild) element.removeChild(element.firstChild);
                const lines = String(text).split('\n');
                for (const line of lines) {
                    const p = document.createElement('p');
                    if (line.length === 0) {
                        const br = document.createElement('br');
                        p.appendChild(br);
                    } else {
                        p.appendChild(document.createTextNode(line));
                    }
                    element.appendChild(p);
                }
                // Move caret to end
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(element);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
                // Fire input/change
                element.dispatchEvent(new InputEvent('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            // Fallback
            element.value = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } catch (err) {
            this.error('Failed to setTextContent', err);
            return false;
        }
    }

    processPlaceholders(customString) {
        const now = new Date();
        const placeholders = {
            '{date}': now.toLocaleDateString(),
            '{time}': now.toLocaleTimeString(),
            '{datetime}': now.toLocaleString(),
            '{timestamp}': String(now.getTime()),
            '{newline}': '\n'
        };
        let out = String(customString || '');
        for (const [ph, val] of Object.entries(placeholders)) {
            out = out.replace(new RegExp(ph.replace(/[{}]/g, '\\$&'), 'g'), val);
        }
        return out;
    }

    appendCustomString(originalText, customString) {
        if (this.settings.preventDuplicates) {
            const a = String(originalText).replace(/\s+/g, ' ').trim().toLowerCase();
            const b = String(customString).replace(/\s+/g, ' ').trim().toLowerCase();
            if (a.includes(b)) return originalText;
        }
        return this.settings.position === 'start'
            ? `${customString}\n\n${originalText}`
            : `${originalText}\n\n${customString}`;
    }

    triggerSend() {
        const selectors = [
            '#composer-submit-button',
            '[data-testid="send-button"]',
            'button[aria-label="Send prompt"]',
            '.composer-submit-btn'
        ];
        let btn = null;
        for (const s of selectors) {
            btn = document.querySelector(s);
            if (btn) break;
        }
        if (!btn) {
            // Try edit-mode send
            btn = this.findEditingSendButton();
        }
        if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
            const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
            ev._autoThinkTriggered = true;
            btn.dispatchEvent(ev);
            return;
        }
        // Fallback: submit composer form
        const form = document.querySelector('form[data-type="unified-composer"]');
        if (form) {
            const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
            submitEvent._autoThinkTriggered = true;
            form.dispatchEvent(submitEvent);
        } else {
            this.warn('No send mechanism found');
        }
    }
}

let chatGPTAutoThinkInstance = null;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        chatGPTAutoThinkInstance = new ChatGPTAutoThink();
    });
} else {
    chatGPTAutoThinkInstance = new ChatGPTAutoThink();
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && chatGPTAutoThinkInstance) {
        chatGPTAutoThinkInstance.loadSettings();
    }
});
