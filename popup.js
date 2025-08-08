class PopupController {
    constructor() {
        this.elements = {
            enabled: document.getElementById('enabled'),
            customString: document.getElementById('customString'),
            position: document.getElementById('position'),
            saveBtn: document.getElementById('saveBtn'),
            resetBtn: document.getElementById('resetBtn'),
            status: document.getElementById('status')
        };

        this.defaults = {
            enabled: true,
            customString: 'Please think step by step before answering.',
            position: 'end'
        };

        this.init();
    }

    async init() {
        await this.loadSettings();
        this.attachEventListeners();
        this.setupPresetButtons();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['enabled', 'customString', 'position']);

            this.elements.enabled.checked = result.enabled !== false;
            this.elements.customString.value = result.customString || this.defaults.customString;
            this.elements.position.value = result.position || this.defaults.position;
        } catch (error) {
            this.showStatus('Error loading settings', 'error');
            console.error('Failed to load settings:', error);
        }
    }

    attachEventListeners() {
        this.elements.saveBtn.addEventListener('click', () => this.saveSettings());
        this.elements.resetBtn.addEventListener('click', () => this.resetSettings());

        this.elements.customString.addEventListener('input', () => this.clearStatus());
        this.elements.enabled.addEventListener('change', () => this.clearStatus());
        this.elements.position.addEventListener('change', () => this.clearStatus());

        this.elements.customString.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = e.target.selectionStart;
                const end = e.target.selectionEnd;
                const value = e.target.value;

                e.target.value = value.substring(0, start) + '  ' + value.substring(end);
                e.target.selectionStart = e.target.selectionEnd = start + 2;
            }
        });
    }

    setupPresetButtons() {
        const presetButtons = document.querySelectorAll('.preset-btn');
        presetButtons.forEach(button => {
            button.addEventListener('click', () => {
                const preset = button.getAttribute('data-preset');
                this.elements.customString.value = preset;
                this.clearStatus();
            });
        });
    }

    async saveSettings() {
        try {
            const settings = {
                enabled: this.elements.enabled.checked,
                customString: this.elements.customString.value.trim(),
                position: this.elements.position.value
            };

            await chrome.storage.sync.set(settings);
            this.showStatus('Settings saved successfully!', 'success');
        } catch (error) {
            this.showStatus('Error saving settings', 'error');
            console.error('Failed to save settings:', error);
        }
    }

    async resetSettings() {
        try {
            this.elements.enabled.checked = this.defaults.enabled;
            this.elements.customString.value = this.defaults.customString;
            this.elements.position.value = this.defaults.position;

            await chrome.storage.sync.set(this.defaults);
            this.showStatus('Settings reset to defaults', 'success');
        } catch (error) {
            this.showStatus('Error resetting settings', 'error');
            console.error('Failed to reset settings:', error);
        }
    }

    showStatus(message, type = '') {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;

        if (type === 'success') {
            setTimeout(() => this.clearStatus(), 3000);
        }
    }

    clearStatus() {
        this.elements.status.textContent = '';
        this.elements.status.className = 'status';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
});