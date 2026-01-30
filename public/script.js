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
    
    // WebSocket connection
    let ws;
    let chatHistory = [];
    
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
        } else if (role === 'system') {
            messageDiv.classList.add('system-message');
            messageDiv.textContent = content;
        }
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    // Format message content using marked.js for markdown rendering
    function formatMessage(text) {
        if (!text) return '';

        // Configure marked options
        marked.setOptions({
            breaks: true,        // Convert single newlines to <br>
            gfm: true,          // GitHub Flavored Markdown
            headerIds: false,   // Don't add IDs to headers
            mangle: false,      // Don't mangle email addresses
            sanitize: false,    // We'll use DOMPurify or manual sanitization
            smartLists: true,   // Use smarter list behavior
            smartypants: true,  // Use smart punctuation
            xhtml: false        // Don't close empty tags with />
        });

        // Render markdown to HTML using marked
        let html = marked.parse(text);

        return html;
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
                } else {
                    // Fallback: create markdown-content div
                    const newContent = document.createElement('div');
                    newContent.classList.add('markdown-content');
                    newContent.dataset.rawText = content;
                    newContent.innerHTML = formatMessage(content);
                    lastMessage.appendChild(newContent);
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
            // Send regular chat message via WebSocket
            ws.send(JSON.stringify({
                type: 'chat',
                userMessage: message,
                chatHistory: chatHistory
            }));
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