document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const messagesDiv = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const clearHistoryBtn = document.getElementById('clear-history-btn');
    const providerSelectBtn = document.getElementById('provider-select-btn');
    const modelSelectBtn = document.getElementById('model-select-btn');
    const providerDropdown = document.getElementById('provider-dropdown');
    const modelDropdown = document.getElementById('model-dropdown');
    const currentProviderSpan = document.getElementById('current-provider');
    const currentModelSpan = document.getElementById('current-model');
    const connectionStatus = document.getElementById('connection-status');
    const typingIndicator = document.getElementById('typing-indicator');
    const sessionInfo = document.getElementById('session-info');
    const sessionsList = document.getElementById('sessions-list');
    const newSessionBtn = document.getElementById('new-session-btn');
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const sidebar = document.getElementById('sidebar');
    const sessionStatsBtn = document.getElementById('session-stats-btn');
    
    // System prompt modal elements
    const systemPromptBtn = document.getElementById('system-prompt-btn');
    const systemPromptModal = document.getElementById('system-prompt-modal');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const closeModalBtn = document.querySelector('.close-modal');
    const saveSystemPromptBtn = document.getElementById('save-system-prompt-btn');
    const resetSystemPromptBtn = document.getElementById('reset-system-prompt-btn');
    
    // MCP servers modal elements
    const mcpServersBtn = document.getElementById('mcp-servers-btn');
    const mcpServersModal = document.getElementById('mcp-servers-modal');
    const mcpServersList = document.getElementById('mcp-servers-list');
    const saveMcpServersBtn = document.getElementById('save-mcp-servers-btn');
    
    // Track enabled MCP servers
    let enabledMcpServers = {};
    
    // Custom system prompt (override)
    let customSystemPrompt = '';

    // WebSocket connection
    let ws;
    let chatHistory = [];
    let currentSessionId = null; // Track current session ID

    // Auto-resize textarea
    messageInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 150) + 'px';
    });

    // Toggle dropdown visibility
    function toggleDropdown(dropdown) {
        const isVisible = dropdown.classList.contains('show');
        document.querySelectorAll('.dropdown-content').forEach(dd => dd.classList.remove('show'));
        if (!isVisible) {
            dropdown.classList.add('show');
        }
    }

    // Close dropdowns when clicking outside
    window.onclick = function(event) {
        if (!event.target.matches('#provider-select-btn') && !event.target.matches('#model-select-btn') &&
            !event.target.parentElement?.matches('#provider-select-btn') && !event.target.parentElement?.matches('#model-select-btn')) {
            document.querySelectorAll('.dropdown-content').forEach(dd => dd.classList.remove('show'));
        }
    }

    // Configure Marked.js with Highlight.js
    if (typeof marked !== 'undefined' && typeof hljs !== 'undefined') {
        // Register languages explicitly with Highlight.js core
        const languages = [
            'javascript', 'typescript', 'python', 'bash', 'shell',
            'json', 'css', 'xml', 'sql', 'java', 'cpp', 'c', 'csharp',
            'go', 'rust', 'ruby', 'php', 'yaml', 'markdown', 'plaintext',
            'http', 'dockerfile'
        ];

        console.log(`Highlight.js loaded with ${languages.length} languages`);

        // Configure marked to use highlight.js
        marked.setOptions({
            highlight: function(code, lang) {
                if (!code) return '';
                
                // If language specified, use it
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        const result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
                        return result.value;
                    } catch (err) {
                        console.warn(`Highlight.js error for ${lang}:`, err.message);
                    }
                }
                
                // Auto-detect if no language or detection failed
                if (!lang) {
                    try {
                        const result = hljs.highlightAuto(code);
                        if (result.relevance > 0) {
                            return result.value;
                        }
                    } catch (err) {
                        // Fall through
                    }
                }
                
                // Fall back to plaintext with basic escaping
                return code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            },
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false,
            sanitize: false,
            smartLists: true,
            smartypants: true,
            xhtml: false
        });
        
        console.log('Marked.js configured with Highlight.js');
    }
    
    // Connect to WebSocket
    function connectWebSocket() {
        // Determine the WebSocket URL based on the current location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            connectionStatus.textContent = 'Connected';
            connectionStatus.style.color = 'green';
            sendBtn.disabled = false;
        };
        
        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'connected':
                    connectionStatus.textContent = 'Connected';
                    connectionStatus.style.color = 'green';
                    break;
                    
                case 'response_start':
                    // Add user message to chat history
                    addToChatLog('user', data.userMessage);
                    // Show typing indicator
                    typingIndicator.style.display = 'inline';
                    break;
                    
                case 'response_chunk':
                    // Append the chunk to the last assistant message
                    appendToLastAssistantMessage(data.content);
                    break;
                    
                case 'response_complete':
                    // Hide typing indicator
                    typingIndicator.style.display = 'none';
                    // Add the complete response to chat history
                    addToChatLog('assistant', data.content);
                    // Update chat history
                    chatHistory.push({ role: 'assistant', content: data.content });
                    break;
                    
                case 'provider_switched':
                    currentProviderSpan.textContent = data.provider;
                    currentModelSpan.textContent = data.model;
                    providerSelectBtn.textContent = `Provider: ${data.provider}`;
                    connectionStatus.textContent = `Provider switched to ${data.provider}`;
                    if (data.endpoint) {
                        connectionStatus.textContent += ` (${data.endpoint})`;
                    }
                    break;
                    
                case 'model_selected':
                    currentModelSpan.textContent = data.model;
                    modelSelectBtn.textContent = `Model: ${data.model}`;
                    connectionStatus.textContent = `Model selected: ${data.model}`;
                    if (data.message) {
                        connectionStatus.textContent += ` (${data.message})`;
                    }
                    break;
                    
                case 'models_list':
                    populateModelDropdown(data.models);
                    break;

                case 'history_cleared':
                    clearChatHistory();
                    connectionStatus.textContent = data.message;
                    break;

                case 'search_started':
                    addToChatLog('system', `Searching for: "${data.query}"`);
                    break;

                case 'search_results':
                    addToChatLog('system', `Search Results from ${data.provider || 'search engine'}:`);
                    data.results.forEach((result, index) => {
                        addToChatLog('system', `${index + 1}. [${result.title}](${result.url})\n${result.content}`);
                    });
                    break;

                case 'warning':
                    alert(data.message);
                    break;

                case 'error':
                    typingIndicator.style.display = 'none';
                    addToChatLog('system', `Error: ${data.message}`);
                    connectionStatus.textContent = `Error: ${data.message}`;
                    connectionStatus.style.color = 'red';
                    break;

                // Session management messages
                case 'session_created':
                    updateSessionInfo(data.session);
                    loadSessionsList(); // Refresh the list
                    connectionStatus.textContent = `New session created: ${data.session.title}`;
                    break;

                case 'session_loaded':
                    // Clear current chat and load session
                    clearChatHistory();
                    updateSessionInfo(data.session);
                    
                    // Load messages
                    if (data.chatHistory && data.chatHistory.length > 0) {
                        chatHistory = data.chatHistory;
                        data.chatHistory.forEach(msg => {
                            addToChatLog(msg.role, msg.content);
                        });
                    }
                    connectionStatus.textContent = `Session loaded: ${data.session.title}`;
                    break;

                case 'sessions_list':
                    renderSessionsList(data.sessions);
                    break;

                case 'session_deleted':
                    loadSessionsList(); // Refresh the list
                    if (data.sessionId === currentSessionId) {
                        updateSessionInfo(null);
                        clearChatHistory();
                        chatHistory = [];
                    }
                    connectionStatus.textContent = 'Session deleted';
                    break;

                case 'session_updated':
                    updateSessionInfo(data.session);
                    loadSessionsList(); // Refresh the list
                    connectionStatus.textContent = 'Session updated';
                    break;

                case 'session_stats':
                    const stats = data.stats;
                    alert(`Session Statistics:\n\nTotal Sessions: ${stats.totalSessions}\nTotal Messages: ${stats.totalMessages}\nOldest Session: ${stats.oldestSession}\nNewest Activity: ${stats.newestSession}`);
                    break;
            }
        };
        
        ws.onclose = () => {
            connectionStatus.textContent = 'Disconnected';
            connectionStatus.style.color = 'red';
            sendBtn.disabled = true;
            setTimeout(connectWebSocket, 3000); // Attempt to reconnect after 3 seconds
        };
        
        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            connectionStatus.textContent = 'Connection error';
            connectionStatus.style.color = 'red';
        };
    }
    
    // Add message to chat log
    function addToChatLog(role, content) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');

        if (role === 'user') {
            messageDiv.classList.add('user-message');
            messageDiv.innerHTML = `<strong>You:</strong><br>${formatMessage(content)}`;
            // Add to chat history
            chatHistory.push({ role: 'user', content: content });
        } else if (role === 'assistant') {
            messageDiv.classList.add('assistant-message');
            messageDiv.innerHTML = `<strong>Assistant:</strong><div class="markdown-content">${formatMessage(content)}</div>`;
            
            // Enhance code blocks with copy buttons and language labels
            const markdownContent = messageDiv.querySelector('.markdown-content');
            if (markdownContent) {
                enhanceCodeBlocks(markdownContent);
                // Render math in the newly added message
                renderMathInElement(markdownContent);
            }
        } else if (role === 'system') {
            messageDiv.classList.add('system-message');
            messageDiv.textContent = content;
        }

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    // Enhance code blocks with copy buttons and language labels
    function enhanceCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre code');
        
        codeBlocks.forEach((codeEl, index) => {
            const preEl = codeEl.parentElement;
            if (!preEl || preEl.classList.contains('enhanced')) return;
            
            // Mark as enhanced to prevent double-processing
            preEl.classList.add('enhanced');
            
            // Detect language from class
            const langClass = codeEl.className.match(/language-(\w+)/);
            const lang = langClass ? langClass[1] : 'text';
            
            // Create wrapper
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            
            // Create header bar
            const header = document.createElement('div');
            header.className = 'code-block-header';
            header.innerHTML = `
                <span class="code-lang-label">${lang}</span>
                <button class="copy-code-btn" data-code-index="${index}" title="Copy to clipboard">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25z"/>
                        <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z"/>
                    </svg>
                    Copy
                </button>
            `;
            
            // Wrap the pre element
            preEl.parentNode.insertBefore(wrapper, preEl);
            wrapper.appendChild(header);
            wrapper.appendChild(preEl);
            
            // Add copy functionality
            const copyBtn = header.querySelector('.copy-code-btn');
            copyBtn.addEventListener('click', async () => {
                const code = codeEl.textContent;
                try {
                    await navigator.clipboard.writeText(code);
                    copyBtn.innerHTML = `
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
                        </svg>
                        Copied!
                    `;
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25z"/>
                                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z"/>
                            </svg>
                            Copy
                        `;
                        copyBtn.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy code:', err);
                    copyBtn.textContent = 'Failed';
                    setTimeout(() => {
                        copyBtn.innerHTML = `
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25z"/>
                                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25z"/>
                            </svg>
                            Copy
                        `;
                    }, 2000);
                }
            });
        });
    }
    
    // Format message content using marked.js for markdown rendering
    function formatMessage(text) {
        if (!text) return '';

        // Protect math delimiters before markdown processing
        const protectedText = protectMathDelimiters(text);

        // Render markdown to HTML using marked
        let html = marked.parse(protectedText);

        // Restore math delimiters after markdown processing
        html = restoreMathDelimiters(html);

        return html;
    }

    // Protect math delimiters from markdown processing by wrapping in HTML
    function protectMathDelimiters(text) {
        // Wrap \begin{...}...\end{...} environments in div
        text = text.replace(/(\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\})/g, '<div class="math-tex">$1</div>');
        
        // Wrap \[...\] blocks in div (block math)
        text = text.replace(/\\\[(\n?[\s\S]*?\n?)\\\]/g, '<div class="math-tex">\\[$1\\]</div>');
        
        // Wrap \(...\) in span (inline math)
        text = text.replace(/\\\(([\s\S]*?)\\\)/g, '<span class="math-tex-inline">\\($1\\)</span>');
        
        // Wrap $$...$$ blocks in div
        text = text.replace(/\$\$(\n?[\s\S]*?\n?)\$\$/g, '<div class="math-tex">$$\\[$1\\]$$</div>');
        
        // Wrap $...$ inline math in span
        text = text.replace(/\$([^\$\n]+?)\$/g, '<span class="math-tex-inline">\\($1\\)</span>');
        
        // Also handle bare [..] blocks (common AI output without backslashes)
        // More flexible - doesn't require trailing newline
        text = text.replace(/\n\[(\n[\s\S]*?\n)\](\n|$)/g, '\n<div class="math-tex">\\[$1\\]</div>$2');
        
        return text;
    }

    // Restore math delimiters after markdown processing
    function restoreMathDelimiters(text) {
        // The HTML tags protect the math, so we just need to ensure proper formatting
        // No restoration needed as the math is already in the correct format inside the HTML
        return text;
    }

    // Render KaTeX math in the message content
    function renderMathInElement(element) {
        // Check if KaTeX is available
        if (typeof window.katex === 'undefined') {
            console.warn('KaTeX not loaded');
            return;
        }

        try {
            // Render block math elements
            const blockMathElements = element.querySelectorAll('.math-tex');
            blockMathElements.forEach(mathEl => {
                try {
                    const texContent = mathEl.textContent;
                    // Remove delimiters if present
                    let tex = texContent
                        .replace(/^\\\[/, '').replace(/\\\]$/, '')
                        .replace(/^\$\$/, '').replace(/\$\$$/, '');
                    
                    // Render as display math
                    const rendered = window.katex.renderToString(tex.trim(), {
                        displayMode: true,
                        throwOnError: false,
                        trust: true
                    });
                    
                    // Replace content with rendered math
                    mathEl.outerHTML = `<div class="math-block">${rendered}</div>`;
                } catch (err) {
                    console.error('Error rendering block math:', err);
                    mathEl.classList.add('math-error');
                    mathEl.textContent = `Math Error: ${err.message}`;
                }
            });

            // Render inline math elements
            const inlineMathElements = element.querySelectorAll('.math-tex-inline');
            inlineMathElements.forEach(mathEl => {
                try {
                    const texContent = mathEl.textContent;
                    // Remove delimiters if present
                    let tex = texContent
                        .replace(/^\\\(/, '').replace(/\\\)$/, '')
                        .replace(/^\$/, '').replace(/\$$/, '');
                    
                    // Render as inline math
                    const rendered = window.katex.renderToString(tex.trim(), {
                        displayMode: false,
                        throwOnError: false,
                        trust: true
                    });
                    
                    // Replace content with rendered math
                    mathEl.outerHTML = `<span class="math-inline">${rendered}</span>`;
                } catch (err) {
                    console.error('Error rendering inline math:', err);
                    mathEl.classList.add('math-error');
                    mathEl.textContent = `Math Error: ${err.message}`;
                }
            });
        } catch (err) {
            console.error('Error in renderMathInElement:', err);
        }
    }

    // Function to escape HTML entities to prevent XSS
    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    // Append content to the last assistant message
    function appendToLastAssistantMessage(content) {
        const messages = messagesDiv.querySelectorAll('.message');
        if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.classList.contains('assistant-message')) {
                const markdownContent = lastMessage.querySelector('.markdown-content');
                if (markdownContent) {
                    // For streaming, accumulate raw text and re-render
                    const currentRawText = markdownContent.dataset.rawText || '';
                    const newRawText = currentRawText + content;
                    markdownContent.dataset.rawText = newRawText;
                    markdownContent.innerHTML = formatMessage(newRawText);
                    
                    // Enhance code blocks and render math in the updated content
                    enhanceCodeBlocks(markdownContent);
                    renderMathInElement(markdownContent);
                } else {
                    // Fallback: create markdown-content div
                    const newContent = document.createElement('div');
                    newContent.classList.add('markdown-content');
                    newContent.dataset.rawText = content;
                    newContent.innerHTML = formatMessage(content);
                    lastMessage.appendChild(newContent);
                    
                    // Enhance code blocks and render math in the new content
                    enhanceCodeBlocks(newContent);
                    renderMathInElement(newContent);
                }
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
        }
    }
    
    // Clear chat history
    function clearChatHistory() {
        messagesDiv.innerHTML = '';
        chatHistory = [];
    }
    
    // Populate model dropdown
    function populateModelDropdown(models) {
        modelDropdown.innerHTML = '';
        models.forEach(model => {
            const a = document.createElement('a');
            a.href = '#';
            a.dataset.model = model;
            a.textContent = model;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                selectModel(model);
                modelDropdown.classList.remove('show');
            });
            modelDropdown.appendChild(a);
        });
    }
    
    // Send message to server
    function sendMessage() {
        const message = messageInput.value.trim();
        if (!message) return;

        // Check if the message is a search command (e.g., starts with /search or contains specific keywords)
        if (message.startsWith('/search ')) {
            // Extract the search query by removing the /search prefix
            const query = message.substring(8).trim(); // Remove "/search " (8 characters)

            // Send search request via WebSocket
            ws.send(JSON.stringify({
                type: 'search',
                query: query
            }));
        } else {
            // If no session, create one automatically
            if (!currentSessionId) {
                createNewSession();
                // Wait a moment for session to be created, then send message
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'chat',
                        userMessage: message,
                        chatHistory: chatHistory,
                        sessionId: currentSessionId,
                        systemPrompt: customSystemPrompt
                    }));
                }, 100);
            } else {
                // Send regular chat message via WebSocket with session ID
                ws.send(JSON.stringify({
                    type: 'chat',
                    userMessage: message,
                    chatHistory: chatHistory,
                    sessionId: currentSessionId,
                    systemPrompt: customSystemPrompt
                }));
            }
        }

        // Clear input
        messageInput.value = '';
        messageInput.style.height = 'auto';
    }
    
    // Switch provider
    function switchProvider(provider) {
        ws.send(JSON.stringify({
            type: 'switch_provider',
            provider: provider
        }));
    }
    
    // Select model
    function selectModel(model) {
        ws.send(JSON.stringify({
            type: 'select_model',
            model: model
        }));
    }

    // ============================================================
    // Session Management Functions
    // ============================================================

    // Load sessions list from server
    function loadSessionsList() {
        ws.send(JSON.stringify({ type: 'list_sessions' }));
    }

    // Create a new chat session
    function createNewSession() {
        ws.send(JSON.stringify({
            type: 'create_session',
            title: 'New Chat',
            provider: currentProviderSpan.textContent,
            model: currentModelSpan.textContent
        }));
    }

    // Load a specific session
    function loadSession(sessionId) {
        ws.send(JSON.stringify({ type: 'load_session', sessionId }));
    }

    // Delete a session
    function deleteSession(sessionId) {
        if (confirm('Are you sure you want to delete this chat session?')) {
            ws.send(JSON.stringify({ type: 'delete_session', sessionId }));
        }
    }

    // Rename a session
    function renameSession(sessionId, currentTitle) {
        const newTitle = prompt('Enter new chat name:', currentTitle);
        if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
            ws.send(JSON.stringify({
                type: 'update_session',
                sessionId: sessionId,
                updates: { title: newTitle.trim() }
            }));
        }
    }

    // Render sessions list in sidebar
    function renderSessionsList(sessions) {
        if (!sessionsList) return;
        
        if (!sessions || sessions.length === 0) {
            sessionsList.innerHTML = '<div class="loading-sessions">No sessions yet. Start a new chat!</div>';
            return;
        }

        sessionsList.innerHTML = '';
        sessions.forEach(session => {
            const sessionEl = document.createElement('div');
            sessionEl.className = 'session-item';
            if (session.id === currentSessionId) {
                sessionEl.classList.add('active');
            }
            
            // Format date
            const date = new Date(session.updatedAt);
            const dateStr = date.toLocaleDateString();
            
            sessionEl.innerHTML = `
                <div class="session-title">${escapeHtml(session.title)}</div>
                <div class="session-meta">
                    <span>${session.messageCount} msgs</span>
                    <span>${dateStr}</span>
                </div>
                <button class="session-rename" title="Rename session">✎</button>
                <button class="session-delete" title="Delete session">×</button>
            `;

            // Click to load session
            sessionEl.addEventListener('click', (e) => {
                if (!e.target.classList.contains('session-delete') && !e.target.classList.contains('session-rename')) {
                    loadSession(session.id);
                }
            });

            // Rename button
            const renameBtn = sessionEl.querySelector('.session-rename');
            renameBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                renameSession(session.id, session.title);
            });

            // Delete button
            const deleteBtn = sessionEl.querySelector('.session-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSession(session.id);
            });

            sessionsList.appendChild(sessionEl);
        });
    }

    // Update session info display
    function updateSessionInfo(session) {
        if (sessionInfo) {
            if (session) {
                currentSessionId = session.id;
                sessionInfo.innerHTML = `
                    <span class="session-info-text">📝 ${escapeHtml(session.title)}</span>
                    <button class="session-info-rename" title="Rename session">✎</button>
                `;
                // Add rename button handler
                const renameBtn = sessionInfo.querySelector('.session-info-rename');
                if (renameBtn) {
                    renameBtn.addEventListener('click', () => {
                        renameSession(session.id, session.title);
                    });
                }
            } else {
                currentSessionId = null;
                sessionInfo.innerHTML = '';
            }
        }
    }

    // Toggle sidebar visibility
    function toggleSidebar() {
        sidebar.classList.toggle('collapsed');
        const isCollapsed = sidebar.classList.contains('collapsed');
        toggleSidebarBtn.textContent = isCollapsed ? '☰' : '✕';
        toggleSidebarBtn.title = isCollapsed ? 'Show sessions' : 'Hide sessions';
    }

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);
    
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    clearHistoryBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'clear_history' }));
    });
    
    // System prompt modal functionality
    systemPromptBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/system-prompt');
            const data = await response.json();
            systemPromptInput.value = data.defaultPrompt || '';
            customSystemPrompt = '';
        } catch (error) {
            console.error('Failed to load system prompt:', error);
        }
        systemPromptModal.style.display = 'block';
    });
    
    // Close modal
    closeModalBtn.addEventListener('click', () => {
        systemPromptModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === systemPromptModal) {
            systemPromptModal.style.display = 'none';
        }
    });
    
    // Reset to default
    resetSystemPromptBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/system-prompt');
            const data = await response.json();
            systemPromptInput.value = data.defaultPrompt || '';
            customSystemPrompt = '';
            
            // Clear custom prompt on server
            await fetch('/api/system-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPrompt: '' })
            });
        } catch (error) {
            console.error('Failed to reset system prompt:', error);
        }
    });
    
    // Save custom system prompt
    saveSystemPromptBtn.addEventListener('click', async () => {
        customSystemPrompt = systemPromptInput.value;
        try {
            await fetch('/api/system-prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPrompt: customSystemPrompt })
            });
            systemPromptModal.style.display = 'none';
        } catch (error) {
            console.error('Failed to save system prompt:', error);
        }
    });
    
    // MCP servers modal functionality
    mcpServersBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/mcp/config');
            const data = await response.json();
            
            // Build the server list HTML
            let html = '';
            data.configuredServers.forEach(server => {
                const isEnabled = data.enabled && data.connectedServers.includes(server);
                const statusClass = isEnabled ? 'connected' : 'disconnected';
                const statusText = isEnabled ? 'Enabled' : 'Disabled';
                html += `
                    <div class="mcp-server-item">
                        <label>
                            <input type="checkbox" data-server="${server}" ${isEnabled ? 'checked' : ''}>
                            <span>${server}</span>
                        </label>
                        <span class="mcp-server-status ${statusClass}">${statusText}</span>
                    </div>
                `;
            });
            mcpServersList.innerHTML = html;
            
            // Update enabledMcpServers tracking
            data.configuredServers.forEach(server => {
                const isConnected = data.connectedServers.includes(server);
                enabledMcpServers[server] = isConnected;
            });
            
            mcpServersModal.style.display = 'block';
        } catch (error) {
            console.error('Failed to load MCP servers:', error);
        }
    });
    
    // Toggle MCP server status display when checkbox changes
    mcpServersList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const server = e.target.dataset.server;
            const statusSpan = e.target.closest('.mcp-server-item').querySelector('.mcp-server-status');
            if (e.target.checked) {
                statusSpan.textContent = 'Enabled';
                statusSpan.className = 'mcp-server-status connected';
            } else {
                statusSpan.textContent = 'Disabled';
                statusSpan.className = 'mcp-server-status disconnected';
            }
        }
    });
    
    // Save MCP server settings
    saveMcpServersBtn.addEventListener('click', async () => {
        const checkboxes = mcpServersList.querySelectorAll('input[type="checkbox"]');
        const serversToEnable = [];
        const serversToDisable = [];
        
        checkboxes.forEach(cb => {
            const server = cb.dataset.server;
            if (cb.checked) {
                serversToEnable.push(server);
            } else {
                serversToDisable.push(server);
            }
        });
        
        // Send via WebSocket
        ws.send(JSON.stringify({
            type: 'mcp_toggle_servers',
            enable: serversToEnable,
            disable: serversToDisable
        }));
        
        mcpServersModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === systemPromptModal) {
            systemPromptModal.style.display = 'none';
        }
        if (e.target === mcpServersModal) {
            mcpServersModal.style.display = 'none';
        }
    });
    
    // Handle close modals with close button
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            systemPromptModal.style.display = 'none';
            mcpServersModal.style.display = 'none';
        });
    });

    // New session button
    newSessionBtn.addEventListener('click', () => {
        createNewSession();
    });

    // Toggle sidebar button
    toggleSidebarBtn.addEventListener('click', () => {
        toggleSidebar();
    });

    // Session stats button
    sessionStatsBtn.addEventListener('click', () => {
        ws.send(JSON.stringify({ type: 'session_stats' }));
    });
    
    providerSelectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown(providerDropdown);
    });
    
    modelSelectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Request models list from server first
        ws.send(JSON.stringify({ type: 'list_models' }));
        toggleDropdown(modelDropdown);
    });
    
    // Provider selection
    document.querySelectorAll('#provider-dropdown a').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const provider = e.target.dataset.provider;
            switchProvider(provider);
            providerDropdown.classList.remove('show');
        });
    });
    
    // Initial connection
    connectWebSocket();
});