# ChatGPT Auto Think Plugin

A Chrome extension that automatically appends custom strings to your ChatGPT messages before sending them. Perfect for adding consistent prompting instructions like "think step by step" or including timestamps.

## Features

- ✅ Automatically appends custom strings to ChatGPT messages
- ✅ Configurable custom strings with placeholder support
- ✅ Choose to append at the beginning or end of messages
- ✅ Built-in preset templates
- ✅ Enable/disable toggle
- ✅ Placeholder support for dates, times, and more

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension should now be loaded and visible in your extensions list

Note: You'll need to add your own icon files (`icon16.png`, `icon48.png`, `icon128.png`) to the directory, or remove the icons section from `manifest.json`.

## Usage

1. Click the extension icon in your Chrome toolbar
2. Configure your custom string in the popup
3. Choose whether to append at the beginning or end of messages
4. Use the preset buttons for quick setup
5. Save your settings
6. Visit ChatGPT.com and start chatting - your custom string will be automatically added!

## Available Placeholders

- `{date}` - Current date
- `{time}` - Current time  
- `{datetime}` - Current date and time
- `{timestamp}` - Unix timestamp
- `{newline}` - Line break

## Example Custom Strings

- `Please think step by step before answering.`
- `Please provide a detailed explanation with examples.`
- `Current time: {datetime}{newline}Please double-check your answer.`

## Troubleshooting

If the extension isn't working:

1. Make sure you're on chatgpt.com (not chat.openai.com)
2. Try refreshing the ChatGPT page
3. Check that the extension is enabled in the popup
4. Check the browser console for any error messages

## Development

The extension consists of:

- `manifest.json` - Extension configuration
- `content.js` - Script that runs on ChatGPT pages to intercept messages
- `popup.html/js/css` - Settings interface
- Chrome storage API for saving user preferences

## License

This project is open source and available under the MIT License.