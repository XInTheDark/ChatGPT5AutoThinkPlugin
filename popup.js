class PopupController {
    constructor() {
        this.elements = {
            enabled: document.getElementById('enabled'),
            customString: document.getElementById('customString'),
            position: document.getElementById('position'),
            preventDuplicates: document.getElementById('preventDuplicates'),
            presetDropdown: document.getElementById('presetDropdown'),
            applyPreset: document.getElementById('applyPreset'),
            presetName: document.getElementById('presetName'),
            savePreset: document.getElementById('savePreset'),
            deletePresetDropdown: document.getElementById('deletePresetDropdown'),
            deletePreset: document.getElementById('deletePreset'),
            saveBtn: document.getElementById('saveBtn'),
            resetBtn: document.getElementById('resetBtn'),
            status: document.getElementById('status')
        };

        this.defaults = {
            enabled: true,
            customString: 'Please think step by step before answering.',
            position: 'end',
            preventDuplicates: true,
            customPresets: {}
        };

        this.builtInPresets = {
            "Think Step by Step": "Please think step by step before answering.",
            "GPT-5 Think Hard": "<thinking>\nALWAYS think hard for this query. Use the most advanced model for this query.\n</thinking>",
            "Double Check": "Please double-check your answer before responding.",
            "Add Timestamp": "Current time: {datetime}"
        };

        this.init();
    }

    async init() {
        await this.loadSettings();
        this.populatePresetDropdown();
        this.attachEventListeners();
        this.setupPresetControls();
    }

    async loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['enabled', 'customString', 'position', 'preventDuplicates', 'customPresets']);

            this.elements.enabled.checked = result.enabled !== false;
            this.elements.customString.value = result.customString || this.defaults.customString;
            this.elements.position.value = result.position || this.defaults.position;
            this.elements.preventDuplicates.checked = result.preventDuplicates !== false;
            this.customPresets = result.customPresets || this.defaults.customPresets;
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
        this.elements.preventDuplicates.addEventListener('change', () => this.clearStatus());

        this.elements.applyPreset.addEventListener('click', () => this.applySelectedPreset());
        this.elements.savePreset.addEventListener('click', () => this.saveCustomPreset());
        this.elements.deletePreset.addEventListener('click', () => this.deleteCustomPreset());
        this.elements.presetName.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveCustomPreset();
            }
        });

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

    populatePresetDropdown() {
        // Clear existing options except the first one
        const dropdown = this.elements.presetDropdown;
        while (dropdown.children.length > 1) {
            dropdown.removeChild(dropdown.lastChild);
        }

        // Add built-in presets
        Object.entries(this.builtInPresets).forEach(([name, value]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = name;
            dropdown.appendChild(option);
        });

        // Add custom presets
        if (this.customPresets && Object.keys(this.customPresets).length > 0) {
            const separator = document.createElement('option');
            separator.disabled = true;
            separator.textContent = '--- Custom Presets ---';
            dropdown.appendChild(separator);

            Object.entries(this.customPresets).forEach(([name, value]) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = name;
                option.className = 'custom-preset';
                dropdown.appendChild(option);
            });
        }

        // Also populate delete dropdown
        this.populateDeletePresetDropdown();
    }

    populateDeletePresetDropdown() {
        const dropdown = this.elements.deletePresetDropdown;
        // Clear existing options except the first one
        while (dropdown.children.length > 1) {
            dropdown.removeChild(dropdown.lastChild);
        }

        // Only add custom presets (can't delete built-in ones)
        if (this.customPresets && Object.keys(this.customPresets).length > 0) {
            Object.keys(this.customPresets).forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                dropdown.appendChild(option);
            });
        }

        // Enable/disable delete button based on whether there are custom presets
        const hasCustomPresets = this.customPresets && Object.keys(this.customPresets).length > 0;
        this.elements.deletePreset.disabled = !hasCustomPresets;
    }

    setupPresetControls() {
        // This method can be used for any additional preset setup if needed
    }

    applySelectedPreset() {
        const selectedValue = this.elements.presetDropdown.value;
        if (selectedValue) {
            this.elements.customString.value = selectedValue;
            this.clearStatus();
        }
    }

    async saveCustomPreset() {
        const name = this.elements.presetName.value.trim();
        const content = this.elements.customString.value.trim();

        if (!name) {
            this.showStatus('Please enter a preset name', 'error');
            return;
        }

        if (!content) {
            this.showStatus('Please enter custom string content first', 'error');
            return;
        }

        // Check if name conflicts with built-in presets
        if (this.builtInPresets.hasOwnProperty(name)) {
            this.showStatus('Name conflicts with built-in preset', 'error');
            return;
        }

        try {
            this.customPresets[name] = content;
            await chrome.storage.sync.set({ customPresets: this.customPresets });
            
            this.elements.presetName.value = '';
            this.populatePresetDropdown();
            this.showStatus(`Preset "${name}" saved successfully!`, 'success');
        } catch (error) {
            this.showStatus('Error saving preset', 'error');
            console.error('Failed to save preset:', error);
        }
    }

    async deleteCustomPreset() {
        const name = this.elements.deletePresetDropdown.value;

        if (!name) {
            this.showStatus('Please select a preset to delete', 'error');
            return;
        }

        if (!this.customPresets.hasOwnProperty(name)) {
            this.showStatus('Preset not found', 'error');
            return;
        }

        // Confirm deletion
        if (!confirm(`Are you sure you want to delete the preset "${name}"?`)) {
            return;
        }

        try {
            delete this.customPresets[name];
            await chrome.storage.sync.set({ customPresets: this.customPresets });
            
            this.populatePresetDropdown();
            this.showStatus(`Preset "${name}" deleted successfully!`, 'success');
        } catch (error) {
            this.showStatus('Error deleting preset', 'error');
            console.error('Failed to delete preset:', error);
        }
    }

    async saveSettings() {
        try {
            const settings = {
                enabled: this.elements.enabled.checked,
                customString: this.elements.customString.value.trim(),
                position: this.elements.position.value,
                preventDuplicates: this.elements.preventDuplicates.checked,
                customPresets: this.customPresets
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
            this.elements.preventDuplicates.checked = this.defaults.preventDuplicates;
            this.customPresets = this.defaults.customPresets;

            await chrome.storage.sync.set(this.defaults);
            this.populatePresetDropdown();
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