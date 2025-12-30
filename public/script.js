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
            messageDiv.innerHTML = `<strong>Assistant:</strong><br>${formatMessage(content)}`;
        } else if (role === 'system') {
            messageDiv.classList.add('system-message');
            messageDiv.textContent = content;
        }
        
        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
    
    // Format message content (add line breaks for readability and handle code blocks and tables)
    function formatMessage(text) {
        // First, handle code blocks to avoid formatting content inside them
        // This regex looks for ```language (optional) followed by content and ending with ```
        const codeBlockRegex = /```(?:\w+)?\n?([\s\S]*?)\n?```/g;

        // Store code blocks temporarily so they don't get further processed
        const tempCodeBlocks = [];
        text = text.replace(codeBlockRegex, (match, codeContent) => {
            // Escape HTML entities in the code content
            const escapedCode = escapeHtml(codeContent);
            const placeholder = `__TEMP_CODE_BLOCK_${tempCodeBlocks.length}__`;
            tempCodeBlocks.push(`<div class="code-block-container">
                                   <pre class="code-block"><code>${escapedCode}</code></pre>
                                 </div>`);
            return placeholder;
        });

        // Handle Markdown tables
        text = parseMarkdownTables(text);

        // Handle markdown-style links [text](url)
        text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // Replace code block placeholders with actual HTML
        tempCodeBlocks.forEach((codeBlockHtml, index) => {
            text = text.replace(`__TEMP_CODE_BLOCK_${index}__`, codeBlockHtml);
        });

        // Handle line breaks for the remaining text (outside code blocks)
        return text.replace(/\n/g, '<br>');
    }

    // Function to parse Markdown tables
    function parseMarkdownTables(text) {
        // Split the text into lines
        const lines = text.split('\n');
        let result = '';
        let inTable = false;
        let tableRows = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this line is a table row (contains | and at least one cell separator)
            const isTableRow = line.trim().startsWith('|') && line.includes('|');

            // Check if this line is a separator row (e.g., |------|------|)
            const isSeparatorRow = isTableRow &&
                                  line.trim().match(/\|[-: \t]+\|/g) &&
                                  line.trim().match(/\|[-: \t]+\|/g).length > 0;

            if (isTableRow && !isSeparatorRow && !inTable) {
                // This is the beginning of a table (header row)
                inTable = true;
                tableRows = [line];
            } else if (isTableRow && inTable) {
                // This is another row in an existing table
                tableRows.push(line);
            } else if (!isTableRow && inTable) {
                // We were in a table but have reached the end
                result += createTableHTML(tableRows);
                result += line + '\n';
                inTable = false;
                tableRows = [];
            } else {
                // Regular line
                result += line + '\n';
            }
        }

        // If we're still in a table at the end of the text
        if (inTable) {
            result += createTableHTML(tableRows);
        }

        // Remove the trailing newline that was added in the loop
        return result.trimEnd();
    }

    // Function to create HTML for a table from Markdown table rows
    function createTableHTML(rows) {
        if (rows.length === 0) return '';

        let html = '<table class="markdown-table"><tbody>';

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            // Skip separator rows (they define alignment but don't appear in final table)
            if (row.trim().match(/\|[-: \t]+\|/g)) {
                continue;
            }

            // Split the row by pipe character and remove leading/trailing pipes
            const cells = row.split('|').slice(1, -1);

            html += '<tr>';
            for (const cell of cells) {
                // Format cell content with basic markdown support
                let formattedCell = formatTableCellContent(cell.trim());
                html += `<td>${formattedCell}</td>`;
            }
            html += '</tr>';
        }

        html += '</tbody></table>';
        return html;
    }

    // Function to format content within table cells (for basic markdown support)
    function formatTableCellContent(content) {
        // Handle bold text (**bold** or __bold__)
        content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        content = content.replace(/__(.*?)__/g, '<strong>$1</strong>');

        // Handle italic text (*italic* or _italic_)
        content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
        content = content.replace(/_(.*?)_/g, '<em>$1</em>');

        // Handle links [text](url)
        content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        return content;
    }

    // Function to escape HTML entities to prevent XSS
    function escapeHtml(unsafe) {
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
                const contentElement = lastMessage.querySelector('strong');
                if (contentElement) {
                    contentElement.insertAdjacentHTML('afterend', formatMessage(content));
                } else {
                    lastMessage.innerHTML += formatMessage(content);
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