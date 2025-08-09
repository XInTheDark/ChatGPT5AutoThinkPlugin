class ChatGPTAutoThink {
    constructor() {
        this.settings = {
            customString: '',
            enabled: true,
            position: 'end',
            preventDuplicates: true
        };
        this.isProcessing = false;
        this.capturedText = null; // Store text before ChatGPT clears it
        this.init();
    }

    async init() {
        console.log('ChatGPT Auto Think Plugin starting initialization...');
        await this.loadSettings();
        console.log('Settings loaded:', this.settings);
        this.setupMessageInterception();
        console.log('ChatGPT Auto Think Plugin initialized successfully');

        // Add a simple test to confirm extension is working
        setTimeout(() => {
            console.log('Extension test: Looking for elements...');
            const textArea = document.querySelector('#prompt-textarea');
            console.log('TextArea found in test:', !!textArea);
            if (textArea) {
                console.log('TextArea details:', textArea.id, textArea.tagName, textArea.contentEditable);
            }

            // Test editing interface detection
            const editingTextArea = this.findEditingTextArea();
            const editingSendButton = this.findEditingSendButton();
            console.log('Editing TextArea found in test:', !!editingTextArea);
            console.log('Editing Send Button found in test:', !!editingSendButton);

            if (editingTextArea) {
                console.log('Editing TextArea details:', editingTextArea.tagName, editingTextArea.className);
            }
            if (editingSendButton) {
                console.log('Editing Send Button details:', editingSendButton.tagName, editingSendButton.className, editingSendButton.textContent);
            }
        }, 2000);
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['customString', 'enabled', 'position', 'preventDuplicates']);
            this.settings = {
                customString: result.customString || 'Please think step by step before answering.',
                enabled: result.enabled !== false,
                position: result.position || 'end',
                preventDuplicates: result.preventDuplicates !== false
            };
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    setupMessageInterception() {
        console.log('Setting up document-level event interception...');

        // Document-level keyboard event capture (more reliable)
        const self = this; // Capture this context
        document.addEventListener('keydown', function(e) {
            // Log ALL keydown events to see what's happening
            if (e.key === 'Enter') {
                console.log('Document keydown:', e.key, 'target ID:', e.target.id, 'target tag:', e.target.tagName, 'shiftKey:', e.shiftKey, 'metaKey:', e.metaKey, 'ctrlKey:', e.ctrlKey);
                console.log('Target element:', e.target);
            }

            const textArea = document.querySelector('#prompt-textarea');
            const editingTextArea = self.findEditingTextArea();

            // Handle regular compose interface
            if (e.key === 'Enter' && !e.shiftKey && e.target === textArea) {
                // Skip if this is our own triggered event
                if (e._autoThinkTriggered) {
                    console.log('Skipping our own triggered event');
                    return;
                }

                console.log('DOCUMENT LEVEL: Enter pressed in textarea');

                // CAPTURE TEXT IMMEDIATELY before ChatGPT clears it
                const capturedText = textArea?.innerText || textArea?.textContent || '';
                console.log('Captured text before clearing:', capturedText);
                console.log('TextArea has content:', !!capturedText.trim());

                if (textArea && capturedText.trim()) {
                    console.log('Storing captured text and PREVENTING original send...');
                    // PREVENT THE ORIGINAL EVENT IMMEDIATELY
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    self.capturedText = capturedText.trim();
                    self.handleSend(e);
                } else {
                    console.log('NOT HANDLING: textarea empty or not found');
                }
            }
            // Handle editing interface with Command+Enter or Control+Enter
            else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                console.log('Command/Ctrl+Enter detected. Checking if target is editing textarea...');
                console.log('Editing textarea found:', !!editingTextArea);
                console.log('Target matches editing textarea:', e.target === editingTextArea);
                console.log('Target details:', e.target);

                if (e.target === editingTextArea) {
                    console.log('DOCUMENT LEVEL: Command/Ctrl+Enter pressed in editing textarea');

                    // CAPTURE TEXT IMMEDIATELY
                    const capturedText = editingTextArea?.value || editingTextArea?.innerText || editingTextArea?.textContent || '';
                    console.log('Captured text (editing):', capturedText);

                    if (editingTextArea && capturedText.trim() && self.settings.enabled && self.settings.customString.trim()) {
                        console.log('Modifying editing text and allowing original action to proceed...');
                        
                        // Process the custom string
                        const processedCustomString = self.processPlaceholders(self.settings.customString);
                        const modifiedText = self.appendCustomString(capturedText.trim(), processedCustomString);
                        
                        // Update the textarea content
                        self.setTextContent(editingTextArea, modifiedText);
                        
                        // LET THE ORIGINAL EVENT CONTINUE - don't prevent it
                        // ChatGPT's native editing mechanism will handle saving
                        console.log('Letting original editing action proceed with modified text');
                    } else {
                        console.log('NOT HANDLING: editing textarea empty, extension disabled, or no custom string');
                    }
                } else {
                    console.log('Target does not match editing textarea');
                }
            }
        }, true);

        // Document-level click event capture
        document.addEventListener('click', function(e) {
            // Log all button clicks to see what's happening
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
                console.log('Button clicked:', e.target.id, e.target.className, e.target.getAttribute('aria-label'));
            }

            const sendButtonSelectors = [
                '#composer-submit-button',
                '[data-testid="send-button"]',
                'button[aria-label="Send prompt"]',
                '.composer-submit-btn'
            ];

            // Check for editing interface send button
            const editingSendButton = self.findEditingSendButton();

            for (const selector of sendButtonSelectors) {
                if (e.target.matches && e.target.matches(selector)) {
                    // Skip if this is our own triggered event
                    if (e._autoThinkTriggered) {
                        console.log('Allowing our own triggered click event');
                        return;
                    }

                    console.log('DOCUMENT LEVEL: Send button clicked directly:', selector);

                    // CAPTURE TEXT IMMEDIATELY before ChatGPT processes the click
                    const textArea = document.querySelector('#prompt-textarea');
                    const capturedText = textArea?.innerText || textArea?.textContent || '';
                    console.log('Captured text from click:', capturedText);

                    if (textArea && capturedText.trim()) {
                        // PREVENT THE ORIGINAL CLICK IMMEDIATELY
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();

                        self.capturedText = capturedText.trim();
                        self.handleSend(e);
                    }
                    return;
                }

                // Check if clicked element is inside a send button
                const parentButton = e.target.closest(selector);
                if (parentButton) {
                    // Skip if this is our own triggered event
                    if (e._autoThinkTriggered) {
                        console.log('Allowing our own triggered click event (parent button)');
                        return;
                    }

                    console.log('DOCUMENT LEVEL: Click inside send button:', selector);

                    // CAPTURE TEXT IMMEDIATELY
                    const textArea = document.querySelector('#prompt-textarea');
                    const capturedText = textArea?.innerText || textArea?.textContent || '';
                    console.log('Captured text from parent button click:', capturedText);

                    if (textArea && capturedText.trim()) {
                        // PREVENT THE ORIGINAL CLICK IMMEDIATELY
                        e.preventDefault();
                        e.stopPropagation();
                        e.stopImmediatePropagation();

                        self.capturedText = capturedText.trim();
                        self.handleSend(e);
                    }
                    return;
                }
            }

            // Handle editing interface send button click
            if (editingSendButton && (e.target === editingSendButton || e.target.closest('button') === editingSendButton)) {
                console.log('DOCUMENT LEVEL: Editing send button clicked');

                // CAPTURE TEXT IMMEDIATELY
                const editingTextArea = self.findEditingTextArea();
                const capturedText = editingTextArea?.value || editingTextArea?.innerText || editingTextArea?.textContent || '';
                console.log('Captured text from editing button click:', capturedText);

                if (editingTextArea && capturedText.trim() && self.settings.enabled && self.settings.customString.trim()) {
                    console.log('Modifying editing text and allowing original click to proceed...');
                    
                    // Process the custom string
                    const processedCustomString = self.processPlaceholders(self.settings.customString);
                    const modifiedText = self.appendCustomString(capturedText.trim(), processedCustomString);
                    
                    // Update the textarea content
                    self.setTextContent(editingTextArea, modifiedText);
                    
                    // LET THE ORIGINAL CLICK CONTINUE - don't prevent it
                    // ChatGPT's native editing mechanism will handle saving
                    console.log('Letting original editing button click proceed with modified text');
                } else {
                    console.log('NOT HANDLING: editing textarea empty, extension disabled, or no custom string');
                }
                return;
            }
        }, true);

        // Form submission capture
        document.addEventListener('submit', function(e) {
            // Skip if this is our own triggered event
            if (e._autoThinkTriggered) {
                console.log('Allowing our own triggered submit event');
                return;
            }

            const form = e.target;
            if (form && form.matches && form.matches('form[data-type="unified-composer"]')) {
                console.log('DOCUMENT LEVEL: Form submission detected');

                // CAPTURE TEXT IMMEDIATELY
                const textArea = document.querySelector('#prompt-textarea');
                const capturedText = textArea?.innerText || textArea?.textContent || '';
                console.log('Captured text from form submit:', capturedText);

                if (textArea && capturedText.trim()) {
                    // PREVENT THE ORIGINAL SUBMIT IMMEDIATELY
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    self.capturedText = capturedText.trim();
                    self.handleSend(e);
                }
            }
        }, true);

        // No mutation observer needed anymore with document-level handlers
        console.log('Document-level event handlers setup complete');
    }

    async handleSend(event) {
        console.log('=== HANDLE SEND CALLED ===');
        console.log('Settings enabled:', this.settings.enabled);
        console.log('Is processing:', this.isProcessing);
        console.log('Event type:', event.type);
        console.log('Event target:', event.target);

        if (!this.settings.enabled || this.isProcessing) {
            console.log('Aborting: disabled or processing');
            return;
        }

        console.log('Setting isProcessing to true...');
        this.isProcessing = true;

        try {
            console.log('Loading settings...');
            await this.loadSettings();
            console.log('Settings loaded in handleSend:', this.settings);

            console.log('Checking customString:', this.settings.customString);
            if (!this.settings.customString.trim()) {
                console.log('No custom string, aborting');
                this.isProcessing = false;
                this.capturedText = null;
                return;
            }

            console.log('Looking for textarea...');
            const textArea = document.querySelector('#prompt-textarea');
            const editingTextArea = this.findEditingTextArea();
            const activeTextArea = textArea || editingTextArea;

            console.log('Main TextArea found:', !!textArea);
            console.log('Editing TextArea found:', !!editingTextArea);
            console.log('Active TextArea found:', !!activeTextArea);

            if (!activeTextArea) {
                console.log('No textarea found, aborting');
                this.isProcessing = false;
                this.capturedText = null;
                return;
            }

            console.log('Using captured text...');
            const currentText = this.capturedText;
            console.log('Captured text:', currentText);
            if (!currentText || !currentText.trim()) {
                console.log('No captured text, aborting');
                this.isProcessing = false;
                this.capturedText = null;
                return;
            }

            console.log('Processing placeholders...');
            const processedCustomString = this.processPlaceholders(this.settings.customString);
            console.log('Processed custom string:', processedCustomString);

            console.log('Creating modified text...');
            const modifiedText = this.appendCustomString(currentText, processedCustomString);
            console.log('Original text:', currentText);
            console.log('Modified text:', modifiedText);

            console.log('Event already prevented earlier...');

            console.log('Setting text content...');
            const success = this.setTextContent(activeTextArea, modifiedText);
            console.log('Text setting success:', success);

            if (!success) {
                console.error('Failed to set text content, aborting');
                this.isProcessing = false;
                this.capturedText = null;
                return;
            }

            console.log('Scheduling send trigger...');
            // Shorter timeout since we're preventing the original send more effectively
            setTimeout(() => {
                console.log('Triggering send after text update...');
                console.log('Current textarea content after update:', this.getTextContent(activeTextArea));
                this.triggerSend();
                this.isProcessing = false;
                // Clear captured text after use
                this.capturedText = null;
            }, 100);

        } catch (error) {
            console.error('Error in handleSend:', error);
            console.error('Error stack:', error.stack);
            this.isProcessing = false;
            // Clear captured text on error
            this.capturedText = null;
        }
    }

    getTextContent(element) {
        console.log('Getting text content from element:', element.tagName, element.contentEditable);

        if (element.contentEditable === 'true') {
            // For ProseMirror, try multiple methods to get text
            const innerText = element.innerText;
            const textContent = element.textContent;
            const innerHTML = element.innerHTML;

            console.log('innerText:', innerText);
            console.log('textContent:', textContent);
            console.log('innerHTML:', innerHTML);

            // ProseMirror sometimes needs special handling
            const text = innerText || textContent || '';
            console.log('Final extracted text:', JSON.stringify(text));
            return text.trim();
        } else {
            const value = element.value || '';
            console.log('Input value:', value);
            return value.trim();
        }
    }

    setTextContent(element, text) {
        console.log('Setting text content:', text);
        console.log('Element type:', element.tagName, 'contentEditable:', element.contentEditable);

        try {
            element.focus();

            // For regular textarea elements (like in editing interface)
            if (element.tagName === 'TEXTAREA') {
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));

                console.log('Text set in textarea element');
                return true;
            }
            // For contenteditable elements (like ProseMirror)
            else if (element.contentEditable === 'true') {
                // Simple and direct approach - just set the HTML content
                const lines = text.split('\n');
                const htmlContent = lines.map(line => `<p>${line || '<br>'}</p>`).join('');
                element.innerHTML = htmlContent;

                // Move cursor to end
                const range = document.createRange();
                const selection = window.getSelection();
                range.selectNodeContents(element);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);

                // Dispatch events
                element.dispatchEvent(new InputEvent('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));

                console.log('Text set in contenteditable element');
                return true;
            } else {
                // For regular input/textarea
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                element.dispatchEvent(new Event('change', { bubbles: true }));

                console.log('Text set in regular input element');
                return true;
            }
        } catch (error) {
            console.error('Failed to set text content:', error);
            return false;
        }
    }

    processPlaceholders(customString) {
        const now = new Date();
        const placeholders = {
            '{date}': now.toLocaleDateString(),
            '{time}': now.toLocaleTimeString(),
            '{datetime}': now.toLocaleString(),
            '{timestamp}': now.getTime().toString(),
            '{newline}': '\n'
        };

        let processed = customString;
        for (const [placeholder, value] of Object.entries(placeholders)) {
            processed = processed.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        }

        return processed;
    }

    appendCustomString(originalText, customString) {
        // Check for duplicates if the setting is enabled
        if (this.settings.preventDuplicates) {
            // Normalize whitespace for comparison
            const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim().toLowerCase();
            const normalizedCustom = customString.replace(/\s+/g, ' ').trim().toLowerCase();
            
            // Check if custom string already exists in original text
            if (normalizedOriginal.includes(normalizedCustom)) {
                console.log('Custom string already present, skipping addition');
                return originalText;
            }
        }
        
        if (this.settings.position === 'start') {
            return customString + '\n\n' + originalText;
        } else {
            return originalText + '\n\n' + customString;
        }
    }

    findEditingTextArea() {
        // Look for textarea in editing interface
        const editingContainers = document.querySelectorAll('.bg-token-main-surface-tertiary');
        for (const container of editingContainers) {
            const textarea = container.querySelector('textarea');
            if (textarea) {
                return textarea;
            }
        }
        return null;
    }

    findEditingSendButton() {
        // Look for send button in editing interface
        const editingContainers = document.querySelectorAll('.bg-token-main-surface-tertiary');
        for (const container of editingContainers) {
            const sendButton = container.querySelector('button.btn-primary');
            if (sendButton) {
                // Check if button text contains "Send" (might be in nested element)
                const buttonText = sendButton.textContent.trim();
                if (buttonText === 'Send' || buttonText.includes('Send')) {
                    return sendButton;
                }
            }
        }

        // Alternative: look for any button with "Send" text in editing containers
        for (const container of editingContainers) {
            const buttons = container.querySelectorAll('button');
            for (const button of buttons) {
                if (button.textContent.trim().includes('Send')) {
                    return button;
                }
            }
        }

        return null;
    }

    triggerSend() {
        console.log('=== TRIGGER SEND ===');

        // Multiple selectors for send button (it appears dynamically)
        const sendButtonSelectors = [
            '#composer-submit-button',
            '[data-testid="send-button"]',
            'button[aria-label="Send prompt"]',
            '.composer-submit-btn'
        ];

        let sendButton = null;
        let usedSelector = null;

        // Find the send button
        for (const selector of sendButtonSelectors) {
            sendButton = document.querySelector(selector);
            if (sendButton) {
                usedSelector = selector;
                break;
            }
        }

        // Check for editing interface send button if main send button not found
        if (!sendButton) {
            sendButton = this.findEditingSendButton();
            if (sendButton) {
                usedSelector = 'editing-send-button';
            }
        }

        const form = document.querySelector('form[data-type="unified-composer"]');

        console.log('Send button found:', !!sendButton, 'using selector:', usedSelector);
        console.log('Send button disabled:', sendButton?.disabled);
        console.log('Send button aria-disabled:', sendButton?.getAttribute('aria-disabled'));
        console.log('Form found:', !!form);

        if (sendButton && !sendButton.disabled && !sendButton.getAttribute('aria-disabled')) {
            console.log('Triggering send with button click...');

            // Create a new click event that isn't prevented by our handlers
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window,
                detail: 1
            });

            // Mark this event so our handlers know to ignore it
            clickEvent._autoThinkTriggered = true;

            sendButton.dispatchEvent(clickEvent);
        } else {
            console.log('No valid send button, trying form submission...');
            if (form) {
                const submitEvent = new Event('submit', {
                    bubbles: true,
                    cancelable: true
                });

                // Mark this event so our handlers know to ignore it
                submitEvent._autoThinkTriggered = true;

                form.dispatchEvent(submitEvent);
            } else {
                console.error('No send mechanism found');
                // Fallback: try to trigger send by simulating Enter key
                const textArea = document.querySelector('#prompt-textarea');
                if (textArea) {
                    console.log('Fallback: simulating Enter key...');
                    const enterEvent = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        which: 13,
                        keyCode: 13,
                        bubbles: true,
                        cancelable: true
                    });
                    enterEvent._autoThinkTriggered = true;
                    textArea.dispatchEvent(enterEvent);
                }
            }
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
        // Cleanly reload settings instead of reloading the entire page
        chatGPTAutoThinkInstance.loadSettings();
    }
});