class ChatGPTAutoThink {
  constructor() {
    this.settings = {
      customString: '',
      enabled: true,
      position: 'end'
    };
    this.isProcessing = false;
    this.init();
  }

  async init() {
    await this.loadSettings();
    this.setupMessageInterception();
    console.log('ChatGPT Auto Think Plugin initialized');
  }

  async loadSettings() {
    try {
      const result = await chrome.storage.sync.get(['customString', 'enabled', 'position']);
      this.settings = {
        customString: result.customString || 'Please think step by step before answering.',
        enabled: result.enabled !== false,
        position: result.position || 'end'
      };
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  setupMessageInterception() {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          this.attachEventListeners();
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.attachEventListeners();
  }

  attachEventListeners() {
    const sendButton = document.querySelector('#composer-submit-button, [data-testid="send-button"]');
    const textArea = document.querySelector('#prompt-textarea');
    const form = document.querySelector('form[data-type="unified-composer"]');

    if (sendButton && !sendButton.hasAttribute('data-auto-think-attached')) {
      sendButton.setAttribute('data-auto-think-attached', 'true');
      sendButton.addEventListener('click', (e) => this.handleSend(e), true);
    }

    if (textArea && !textArea.hasAttribute('data-auto-think-attached')) {
      textArea.setAttribute('data-auto-think-attached', 'true');
      textArea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          this.handleSend(e);
        }
      }, true);
    }

    if (form && !form.hasAttribute('data-auto-think-attached')) {
      form.setAttribute('data-auto-think-attached', 'true');
      form.addEventListener('submit', (e) => this.handleSend(e), true);
    }
  }

  async handleSend(event) {
    if (!this.settings.enabled || this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      await this.loadSettings();

      if (!this.settings.customString.trim()) {
        this.isProcessing = false;
        return;
      }

      const textArea = document.querySelector('#prompt-textarea');
      if (!textArea) {
        this.isProcessing = false;
        return;
      }

      const currentText = this.getTextContent(textArea);
      if (!currentText.trim()) {
        this.isProcessing = false;
        return;
      }

      const processedCustomString = this.processPlaceholders(this.settings.customString);
      const modifiedText = this.appendCustomString(currentText, processedCustomString);

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      this.setTextContent(textArea, modifiedText);

      setTimeout(() => {
        this.triggerSend();
        this.isProcessing = false;
      }, 50);

    } catch (error) {
      console.error('Error in handleSend:', error);
      this.isProcessing = false;
    }
  }

  getTextContent(element) {
    if (element.contentEditable === 'true') {
      return element.innerText || element.textContent || '';
    } else {
      return element.value || '';
    }
  }

  setTextContent(element, text) {
    if (element.contentEditable === 'true') {
      element.innerHTML = `<p>${text.replace(/\n/g, '</p><p>')}</p>`;
      
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
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
    if (this.settings.position === 'start') {
      return customString + '\n\n' + originalText;
    } else {
      return originalText + '\n\n' + customString;
    }
  }

  triggerSend() {
    const sendButton = document.querySelector('#composer-submit-button, [data-testid="send-button"]');
    const form = document.querySelector('form[data-type="unified-composer"]');

    if (sendButton && !sendButton.disabled) {
      sendButton.click();
    } else if (form) {
      form.submit();
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ChatGPTAutoThink();
  });
} else {
  new ChatGPTAutoThink();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync') {
    window.location.reload();
  }
});