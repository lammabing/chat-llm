# Code Block Syntax Highlighting

## Overview

The web interface features **beautiful syntax highlighting** for code blocks with copy-to-clipboard functionality, powered by **Highlight.js**.

## Implementation

### Files Modified:
1. **`public/index.html`** - Added Highlight.js core + 22 language modules
2. **`public/script.js`** - Integrated Highlight.js with Marked.js, added `enhanceCodeBlocks()` function
3. **`public/styles.css`** - Added GitHub Dark theme styling with explicit syntax colors

### How It Works

1. Marked.js configured with `highlight` callback
2. Highlight.js highlights code during markdown processing
3. `enhanceCodeBlocks()` wraps code with header (language label + copy button)
4. Copy button uses Clipboard API

## Features

### ✨ Syntax Highlighting
- **22 languages** supported
- **GitHub Dark theme** for code blocks
- **Auto-detection** when language is not specified
- **Language label** displayed in the header

### 📋 Copy to Clipboard
- **One-click copy** button on every code block
- **Visual feedback** - shows "Copied!" with checkmark
- **Automatic reset** - button resets after 2 seconds

### 🎨 Beautiful Styling
- **Dark theme** optimized for readability
- **Monospace fonts** with fallbacks
- **Responsive design** - scrolls on small screens
- **Consistent with GitHub's code block style**

## Supported Languages

| Language | Alias | Example |
|----------|-------|---------|
| JavaScript | `js`, `javascript` | ````javascript` |
| TypeScript | `ts`, `typescript` | ````typescript` |
| Python | `py`, `python` | ````python` |
| Bash/Shell | `bash`, `sh`, `shell` | ````bash` |
| JSON | `json` | ````json` |
| CSS | `css` | ````css` |
| HTML/XML | `html`, `xml` | ````html` |
| SQL | `sql` | ````sql` |
| Java | `java` | ````java` |
| C++ | `cpp`, `c++` | ````cpp` |
| Go | `go`, `golang` | ````go` |
| Rust | `rust`, `rs` | ````rust` |
| Ruby | `ruby`, `rb` | ````ruby` |
| PHP | `php` | ````php` |
| YAML | `yaml`, `yml` | ````yaml` |
| Markdown | `md`, `markdown` | ````markdown` |
| Plaintext | `text`, `plaintext` | ````text` |

## Usage Examples

### Specifying a Language

When the AI generates code, it should include the language:

````markdown
```javascript
function greet(name) {
    return `Hello, ${name}!`;
}
```
````

### Without Language

If no language is specified, Highlight.js will auto-detect:

````markdown
```
function greet(name) {
    return "Hello, " + name + "!";
}
```
````

### Inline Code

Inline code is also styled differently:

```markdown
Use the `console.log()` function to debug.
```

Renders as: Use the `console.log()` function to debug.

## Testing

### 1. Open the chat interface
```
http://localhost:3075
```

### 2. Try these prompts:

**JavaScript:**
```
Write a JavaScript function to calculate Fibonacci numbers
```

**Python:**
```
Show me a Python script to read a CSV file
```

**SQL:**
```
Write a SQL query to find the top 10 users by score
```

**Bash:**
```
Give me a bash command to find all .js files modified in the last 7 days
```

### 3. Expected Output

Each code block should have:
- ✅ Dark background with syntax highlighting
- ✅ Language label in the top-left (e.g., "JAVASCRIPT")
- ✅ Copy button in the top-right
- ✅ Proper indentation and formatting
- ✅ Clicking "Copy" shows "✓ Copied!" feedback

## How It Works

### 1. Highlight.js Integration
```javascript
marked.setOptions({
    highlight: function(code, lang) {
        if (lang && hljs.getLanguage(lang)) {
            return hljs.highlight(code, { language: lang }).value;
        }
        // Auto-detect if no language
        return hljs.highlightAuto(code).value;
    }
});
```

### 2. Code Block Enhancement
After markdown rendering, the `enhanceCodeBlocks()` function:
1. Finds all `<pre><code>` blocks
2. Extracts the language from the class name
3. Wraps them in a container with header
4. Adds a copy button with clipboard API

### 3. Copy Functionality
```javascript
await navigator.clipboard.writeText(code);
// Shows "Copied!" feedback
setTimeout(() => resetButton(), 2000);
```

## Styling

### Code Block Structure
```html
<div class="code-block-wrapper">
    <div class="code-block-header">
        <span class="code-lang-label">JAVASCRIPT</span>
        <button class="copy-code-btn">
            <svg>...</svg>
            Copy
        </button>
    </div>
    <pre class="enhanced">
        <code class="language-javascript">
            // Highlighted code here
        </code>
    </pre>
</div>
```

### CSS Variables
The code blocks use GitHub's dark theme colors:
- Background: `#0d1117`
- Border: `#30363d`
- Text: `#c9d1d9`
- Header: `#161b22`

## Customization

### Adding More Languages

Edit `public/index.html` and add more Highlight.js language modules:

```html
<script src="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/lib/languages/KANGUAGE.min.js"></script>
```

Popular languages not yet included:
- `kotlin`
- `swift`
- `csharp`
- `scala`
- `perl`
- `lua`

### Changing the Theme

Highlight.js offers many themes. Replace the CSS link:

```html
<!-- Instead of github-dark -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/atom-one-dark.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/monokai-sublime.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.9.0/styles/dracula.min.css">
```

Popular themes:
- `github-dark` (current)
- `atom-one-dark`
- `monokai-sublime`
- `dracula`
- `tomorrow-night`
- `vs2015`

## Troubleshooting

### Code not highlighted?

1. **Check language label** - What language was detected?
2. **Open console (F12)** - Look for Highlight.js errors
3. **Verify CDN loaded** - Check Network tab for highlight.js files

### Copy button not working?

1. **Check browser support** - Clipboard API requires HTTPS or localhost
2. **Console errors** - Look for "Failed to copy code" messages
3. **Permissions** - Some browsers block clipboard in iframes

### Language shows as "text"?

- AI didn't specify a language in the markdown
- Auto-detection relevance was too low
- Solution: Ask AI to "include the language in code blocks"

## Performance

- **Highlight.js core**: ~35KB gzipped
- **Per-language**: ~1-3KB each
- **Total loaded**: ~60KB (18 languages)
- **Highlighting speed**: ~1-5ms per code block

## Files Modified

1. **`public/index.html`** - Added Highlight.js libraries
2. **`public/script.js`** - Added highlight configuration and `enhanceCodeBlocks()`
3. **`public/styles.css`** - Added code block styling and copy button styles

## Future Enhancements

- [ ] Line numbers for code blocks
- [ ] Code folding/collapsing
- [ ] Syntax error detection/linting
- [ ] Run code button (for JavaScript/Python)
- [ ] Download code as file
- [ ] Theme switcher (light/dark)
- [ ] Font size adjustment
- [ ] Word wrap toggle
