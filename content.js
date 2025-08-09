class ChatGPTAutoThink {
    constructor() {
        this.settings = {
            customString: 'Please think step by step before answering.',
            enabled: true,
            position: 'end',
            preventDuplicates: true,
            hideAppendedInUI: true,
            debug: false
        };
        this.isProcessing = false;
        this.capturedText = null;
        this.lastProcessedCustomString = null;
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
        this.setupUIMasking();
        this.log('Initialized');
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['customString', 'enabled', 'position', 'preventDuplicates', 'hideAppendedInUI', 'debug']);
            this.settings.customString = result.customString || this.settings.customString;
            this.settings.enabled = result.enabled !== false;
            this.settings.position = result.position || 'end';
            this.settings.preventDuplicates = result.preventDuplicates !== false;
            this.settings.hideAppendedInUI = typeof result.hideAppendedInUI === 'boolean' ? result.hideAppendedInUI : true;
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
                    self.lastProcessedCustomString = processed;
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
                    self.lastProcessedCustomString = processed;
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
            this.log('handleSend: captured', { len: currentText.length, preview: currentText.slice(0, 100) });
            this.log('handleSend: customString (processed)', {
                len: processed.length,
                lines: processed.split('\n').length,
                position: this.settings.position
            });
            const modified = this.appendCustomString(currentText, processed);
            this.log('handleSend: modified text', {
                len: modified.length,
                lines: modified.split('\n').length,
                preview: modified.slice(0, 120)
            });
            this.lastProcessedCustomString = processed;

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

    // UI masking of custom string in user message bubbles (cosmetic only)
    setupUIMasking() {
        const runInitialPass = () => {
            try {
                if (!this.settings.hideAppendedInUI) return;
                const nodes1 = document.querySelectorAll('[data-message-author-role="user"][data-message-id]');
                const nodes2 = document.querySelectorAll('.user-message-bubble-color');
                nodes1.forEach(node => this.maskNodeIfNeeded(node));
                nodes2.forEach(node => this.maskNodeIfNeeded(node));
            } catch (e) {
                this.warn('Initial UI masking pass failed', e);
            }
        };

        // Initial pass after a short delay to let DOM settle
        setTimeout(runInitialPass, 300);

        const observer = new MutationObserver(mutations => {
            if (!this.settings.hideAppendedInUI) return;
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (!(n instanceof HTMLElement)) continue;
                    // Direct user message node
                    if (n.matches?.('[data-message-author-role="user"][data-message-id]')) {
                        this.maskNodeIfNeeded(n);
                        continue;
                    }
                    // Direct user bubble
                    if (n.matches?.('.user-message-bubble-color')) {
                        this.maskNodeIfNeeded(n);
                        continue;
                    }
                    // Or any descendants that include user messages
                    const candidates = n.querySelectorAll?.('[data-message-author-role="user"][data-message-id], .user-message-bubble-color');
                    candidates?.forEach(el => this.maskNodeIfNeeded(el));
                }
                if (m.type === 'characterData') {
                    const node = m.target.parentElement;
                    if (node) {
                        const container = node.closest?.('.user-message-bubble-color, [data-message-author-role="user"][data-message-id]');
                        if (container) this.maskNodeIfNeeded(container);
                    }
                }
            }
        });

        try {
            observer.observe(document.body, { childList: true, subtree: true, characterData: true });
            this.log('UI masking observer attached');
        } catch (e) {
            this.warn('Failed to attach UI masking observer', e);
        }
    }

    maskNodeIfNeeded(container) {
        if (!container) return;
        const textEl = this.findUserTextElement(container);
        if (!textEl) return;

        // Restore if masking disabled but previously redacted
        if (!this.settings.hideAppendedInUI && container.getAttribute('data-auto-think-redacted') === '1') {
            const orig = textEl.getAttribute('data-auto-think-original');
            if (orig != null) {
                textEl.textContent = orig;
            }
            container.removeAttribute('data-auto-think-redacted');
            return;
        }

        if (container.getAttribute('data-auto-think-redacted') === '1') return;

        const original = textEl.textContent || '';
        if (!original) return;

        const cs = this.lastProcessedCustomString || this.processPlaceholders(this.settings.customString);
        this.log('maskNodeIfNeeded: attempt', {
            originalLen: original.length,
            csLen: cs.length,
            position: this.settings.position
        });
        const redacted = this.redactCustomStringFromText(original, cs, this.settings.position);
        if (redacted !== original) {
            if (!textEl.hasAttribute('data-auto-think-original')) {
                textEl.setAttribute('data-auto-think-original', original);
            }
            textEl.textContent = redacted;
            container.setAttribute('data-auto-think-redacted', '1');
            this.log('Redacted appended custom string in UI for a user message');
        } else {
            this.log('maskNodeIfNeeded: no change after redaction attempt');
        }
    }

    findUserTextElement(container) {
        // Primary: div with whitespace-pre-wrap inside the user bubble
        let el = container.querySelector?.('.user-message-bubble-color .whitespace-pre-wrap');
        if (el) return el;
        // Fallback: any whitespace-pre-wrap under the container
        el = container.querySelector?.('.whitespace-pre-wrap');
        if (el) return el;
        // Fallback: bubble root itself
        el = container.querySelector?.('.user-message-bubble-color') || (container.classList?.contains('user-message-bubble-color') ? container : null);
        return el || null;
    }

    redactCustomStringFromText(text, customString, position) {
        if (!customString) return text;
        const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Allow flexible whitespace differences between composer and render
        const patternFlexibleWS = esc(customString).replace(/\s+/g, '\\s+');
        this.log('redactCustomStringFromText: begin', {
            position,
            customLen: customString.length,
            textLen: text.length,
            linesText: text.split('\n').length,
            pattern: patternFlexibleWS.slice(0, 120)
        });
        let out = text;
        if (position === 'start') {
            const re = new RegExp(`^\\s*(?:${patternFlexibleWS})\\s*`, '');
            const matched = re.test(out);
            this.log('redactCustomStringFromText: start regex', { matched });
            out = out.replace(re, '');
        } else {
            const re = new RegExp(`\\s*(?:${patternFlexibleWS})\\s*$`, '');
            const matched = re.test(out);
            this.log('redactCustomStringFromText: end regex', { matched });
            out = out.replace(re, '');
        }
        if (out.trim() !== text.trim()) {
            this.log('redactCustomStringFromText: regex removal succeeded');
            return out.trim();
        }
        this.log('redactCustomStringFromText: no changes');
        return out.trim();
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
            let txt = (element.innerText || element.textContent || '').trim();
            txt = txt.replace(/\n{2,}/g, '\n').replace(/\r/g, ''); // Normalize newlines
            this.log('getTextContent(contenteditable)', { len: txt.length, lines: txt.split('\n').length });
            return txt;
        }
        let val = (element.value || '').trim();
        this.log('getTextContent(textarea)', { len: val.length, lines: val.split('\n').length });
        return val;
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
                this.log('setTextContent(contenteditable): rebuilding', {
                    lines: lines.length,
                    len: String(text).length
                });
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
        const result = this.settings.position === 'start'
            ? `${customString}\n\n${originalText}`
            : `${originalText}\n\n${customString}`;
        this.log('appendCustomString', {
            pos: this.settings.position,
            origLen: String(originalText).length,
            csLen: String(customString).length,
            resultLen: result.length
        });
        return result;
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
        chatGPTAutoThinkInstance.loadSettings().then(() => {
            // 1. Mask or restore UI elements based on changes
            try {
                const nodes = document.querySelectorAll('[data-message-author-role="user"][data-message-id], .user-message-bubble-color');
                if (changes.hideAppendedInUI) {
                    const enabled = !!changes.hideAppendedInUI.newValue;
                    if (enabled) {
                        // Redact on enable
                        nodes.forEach(node => chatGPTAutoThinkInstance.maskNodeIfNeeded(node));
                    } else {
                        // Restore on disable
                        nodes.forEach(node => {
                            const textEl = chatGPTAutoThinkInstance.findUserTextElement(node);
                            if (!textEl) return;
                            const orig = textEl.getAttribute('data-auto-think-original');
                            if (orig != null) {
                                textEl.textContent = orig;
                            }
                            node.removeAttribute('data-auto-think-redacted');
                        });
                    }
                }
            } catch (e) {
                chatGPTAutoThinkInstance.warn('Failed to run masking/restore after setting change', e);
            }
        });
    }
});
