# Mathematical Notation Support

## Overview
The web interface supports rendering of mathematical notation using **KaTeX**, a fast and elegant math typesetting library for the web.

## Implementation

### Files Modified:
1. **`public/index.html`** - Added KaTeX CSS and JavaScript libraries
2. **`public/script.js`** - Added math rendering with delimiter protection
3. **`public/styles.css`** - Added styling for rendered math content

### How It Works

Math delimiters are protected before markdown processing:
1. Wrap math in HTML elements (`<div>`, `<span>`)
2. Process markdown (HTML passes through unchanged)
3. Render math with KaTeX
4. Display beautifully formatted equations

## Supported Math Formats

### Inline Math
Use single dollar signs for inline mathematical expressions:
- `$E = mc^2$` → E = mc²
- `$\frac{a}{b}$` → a/b
- `$\sum_{i=1}^{n} x_i$` → summation notation

### Display Math (Centered, Block Mode)
Use double dollar signs for displayed equations:
- `$$\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}$$`
- `$$\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u$$`

### LaTeX Environments
The following LaTeX environments are supported:
- `\begin{equation}...\end{equation}`
- `\begin{align}...\end{align}`
- `\begin{alignat}...\end{alignat}`
- `\begin{gather}...\end{gather}`
- `\begin{CD}...\end{CD}` (commutative diagrams)
- `\(...\)` for inline math
- `\[...\]` for display math

## Examples

### Example 1: Pythagorean Theorem
```
The Pythagorean theorem states: $a^2 + b^2 = c^2$

$$x^2 + y^2 = r^2$$
```

### Example 2: Quadratic Formula
```
The quadratic formula is:

$$x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}$$

where $a$, $b$, and $c$ are coefficients.
```

### Example 3: Maxwell's Equations
```
Maxwell's equations in differential form:

$$\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}$$

$$\nabla \cdot \mathbf{B} = 0$$

$$\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}$$

$$\nabla \times \mathbf{B} = \mu_0\left(\mathbf{J} + \varepsilon_0\frac{\partial \mathbf{E}}{\partial t}\right)$$
```

## How It Works

1. **Markdown Processing**: Messages are first processed through Marked.js to convert Markdown to HTML
2. **Math Rendering**: KaTeX auto-render scans the content and renders mathematical expressions
3. **Display**: Rendered math is displayed with proper formatting and styling

## Testing

A test page is available at: `http://localhost:3075/test-math.html`

This page demonstrates:
- Inline math rendering
- Display math equations
- Complex mathematical formulas
- Markdown with embedded math

## Fallback Behavior

If KaTeX fails to load or is unavailable:
- Math expressions will display as raw LaTeX code
- A warning will be logged to the browser console
- The chat interface will continue to work normally

## Styling

Custom CSS has been added to ensure:
- Proper spacing around math expressions
- Scrollable block equations (for long formulas)
- Error highlighting (red background) for invalid LaTeX
- Consistent font sizing

## Browser Requirements

- Modern browser with ES6+ support
- Internet connection (to load KaTeX from CDN)
- JavaScript enabled

## CDN Resources Used

- KaTeX CSS: `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css`
- KaTeX JS: `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js`
- Auto-render: `https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js`

## Troubleshooting

### Math not rendering?
1. Check browser console for errors
2. Verify internet connection (CDN resources needed)
3. Ensure delimiters are properly paired (matching `$` or `$$`)

### Math rendering looks broken?
1. Check for syntax errors in LaTeX code
2. Ensure all braces `{}` are properly closed
3. Look for error messages in browser console (F12)

### Want to use offline?
Download KaTeX files and serve them locally:
```bash
npm install katex
```

Then update `index.html` to use local paths instead of CDN.

## Additional Resources

- [KaTeX Documentation](https://katex.org/docs/supported.html)
- [KaTeX Demo](https://katex.org/)
- [LaTeX Math Symbols](https://artofproblemsolving.com/wiki/index.php/LaTeX:Symbols)
