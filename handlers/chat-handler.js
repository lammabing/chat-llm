import ollama from 'ollama';

export function stripHtmlForLLM(content) {
  if (!content) return '';
  return content
    .replace(/<[^>]+>/g, '')
    .replace(/\$\$[^$]*\$\$/g, (match) => match.replace(/[\$]+/g, ' '))
    .replace(/\$[^\$]*\$/g, (match) => match.replace(/[\$]+/g, ' '))
    .replace(/\\\[/g, ' ')
    .replace(/\\\]/g, ' ')
    .replace(/\\\(/g, ' ')
    .replace(/\\\)/g, ' ')
    .trim();
}

export function createChatHandler(ctx) {
  return async function handleChatMessage(ws, message) {
    const { config, mcpClientManager, llmIntegration, openaiClient, sessionManager } = ctx;
    const { userMessage, chatHistory, sessionId, systemPrompt: customSystemPrompt } = message;
    const updatedChatHistory = [...chatHistory, { role: 'user', content: userMessage }];

    let currentMessages = updatedChatHistory;
    if (config.enableMCP && mcpClientManager || customSystemPrompt || config.systemPrompt) {
      const tools = mcpClientManager?.listTools() || [];
      const toolDescriptions = tools.length > 0 ? tools.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n') : '';

      let systemPromptContent = customSystemPrompt || config.systemPrompt || '';

      if (tools.length > 0) {
        const toolInfo = `\n\nYou have access to the following tools that you can call when needed:\n\n${toolDescriptions}\n\nWhen you need to use a tool, respond with a JSON object containing tool_calls.`;
        systemPromptContent = systemPromptContent ? systemPromptContent + toolInfo : toolInfo;
      }

      if (systemPromptContent) {
        const cleanedHistory = updatedChatHistory.map(msg => ({
          ...msg,
          content: stripHtmlForLLM(msg.content)
        }));
        const systemMessage = { role: 'system', content: systemPromptContent };
        currentMessages = [systemMessage, ...cleanedHistory];
      }
    }

    if (sessionManager && sessionId) {
      try {
        sessionManager.saveMessage(sessionId, {
          role: 'user',
          content: userMessage,
          provider: config.provider,
          model: config.models[config.provider] || config.models['ollama']
        });
      } catch (error) {
        console.error('Error saving user message to session:', error.message);
      }
    }

    ws.send(JSON.stringify({
      type: 'response_start',
      userMessage: userMessage
    }));

    try {
      let fullResponse = '';

      if (config.enableMCP && llmIntegration) {
        try {
          const toolProcessingResult = await llmIntegration.processMessageWithTools(
            currentMessages,
            true,
            {
              maxToolCalls: 5,
              onToolCall: (toolCall) => {
                console.log(`Tool called: ${toolCall.function?.name || toolCall.tool?.name}`);
              },
              onToolResult: (toolCall, result) => {
                console.log(`Tool result: ${toolCall.function?.name || toolCall.tool?.name}`);
              }
            }
          );

          if (toolProcessingResult.needsToolExecution) {
            currentMessages = toolProcessingResult.messages;

            ws.send(JSON.stringify({
              type: 'tool_results',
              results: toolProcessingResult.toolResults
            }));

            const lastMessage = toolProcessingResult.messages[toolProcessingResult.messages.length - 1];
            if (lastMessage && lastMessage.role === 'assistant' && lastMessage.content) {
              fullResponse = lastMessage.content;

              ws.send(JSON.stringify({
                type: 'response_complete',
                content: fullResponse
              }));

              return;
            }
          }
        } catch (error) {
          console.error('Error in LLM tool processing:', error);
        }
      }

      if (config.provider === 'ollama') {
        let messagesForLLM = [...currentMessages];
        let hasToolCalls = false;
        let toolIterations = 0;
        const maxToolIterations = 5;

        do {
          hasToolCalls = false;

          if (toolIterations >= maxToolIterations) {
            console.log(`Reached max tool iterations (${maxToolIterations}), stopping tool loop`);
            break;
          }

          toolIterations++;

          const tools = config.enableMCP ? mcpClientManager.getToolsForLLM() : [];

          const chatOptions = {
            model: config.models[config.provider] || config.models['ollama'],
            messages: messagesForLLM,
            stream: true
          };

          if (tools.length > 0) {
            chatOptions.tools = tools.map(tool => ({
              name: tool.name,
              description: tool.description || '',
              parameters: tool.inputSchema || {
                type: 'object',
                properties: {}
              }
            }));
          }

          const response = await ollama.chat(chatOptions);

          for await (const part of response) {
            const content = part.message.content;
            if (content) {
              fullResponse += content;

              ws.send(JSON.stringify({
                type: 'response_chunk',
                content: content
              }));
            }

            if (part.message.tool_calls && config.enableMCP) {
              hasToolCalls = true;

              for (const toolCall of part.message.tool_calls) {
                try {
                  let args = toolCall.function.arguments;
                  if (typeof args === 'string') {
                    args = JSON.parse(args);
                  }

                  const tools = mcpClientManager.listTools();
                  const tool = tools.find(t => t.name === toolCall.function.name);

                  if (!tool) {
                    throw new Error(`Tool ${toolCall.function.name} not found`);
                  }

                  const result = await mcpClientManager.executeTool(
                    tool.serverName,
                    toolCall.function.name,
                    args
                  );

                  messagesForLLM.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: toolCall.id
                  });

                  ws.send(JSON.stringify({
                    type: 'tool_result',
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    result: result
                  }));

                  fullResponse = '';
                } catch (error) {
                  console.error('Error executing tool:', error);

                  messagesForLLM.push({
                    role: 'system',
                    content: `Error executing tool ${toolCall.function.name}: ${error.message}`
                  });

                  ws.send(JSON.stringify({
                    type: 'tool_error',
                    toolName: toolCall.function.name,
                    error: error.message
                  }));
                }
              }
            }
          }
        } while (hasToolCalls);

      } else {
        if (!openaiClient) {
          throw new Error('OpenAI client not initialized. Please set OPENAI_API_KEY environment variable.');
        }

        let openaiMessages = currentMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        let hasToolCalls = false;
        let oaiToolIterations = 0;
        const oaiMaxToolIterations = 5;

        do {
          hasToolCalls = false;

          if (oaiToolIterations >= oaiMaxToolIterations) {
            console.log(`Reached max tool iterations (${oaiMaxToolIterations}), stopping tool loop`);
            break;
          }

          oaiToolIterations++;

          const tools = config.enableMCP ? mcpClientManager.getToolsForLLM() : [];
          const openAITools = tools.length > 0 ? llmIntegration.formatToolsForOpenAI(tools) : undefined;

          const chatOptions = {
            model: config.models[config.provider] || 'gpt-3.5-turbo',
            messages: openaiMessages,
            stream: true,
          };

          if (openAITools && openAITools.length > 0) {
            chatOptions.tools = openAITools;
          }

          const response = await openaiClient.chat.completions.create(chatOptions);

          for await (const part of response) {
            const content = part.choices[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;

              ws.send(JSON.stringify({
                type: 'response_chunk',
                content: content
              }));
            }

            const toolCallChunk = part.choices[0]?.delta?.tool_calls;
            if (toolCallChunk && config.enableMCP) {
              hasToolCalls = true;

              for (const toolCall of toolCallChunk) {
                try {
                  let args = toolCall.function.arguments;
                  if (typeof args === 'string') {
                    args = JSON.parse(args);
                  }

                  const tools = mcpClientManager.listTools();
                  const tool = tools.find(t => t.name === toolCall.function.name);

                  if (!tool) {
                    throw new Error(`Tool ${toolCall.function.name} not found`);
                  }

                  const result = await mcpClientManager.executeTool(
                    tool.serverName,
                    toolCall.function.name,
                    args
                  );

                  openaiMessages.push({
                    role: 'tool',
                    content: JSON.stringify(result),
                    tool_call_id: toolCall.id
                  });

                  ws.send(JSON.stringify({
                    type: 'tool_result',
                    toolCallId: toolCall.id,
                    toolName: toolCall.function.name,
                    result: result
                  }));

                  fullResponse = '';
                } catch (error) {
                  console.error('Error executing tool:', error);

                  openaiMessages.push({
                    role: 'system',
                    content: `Error executing tool ${toolCall.function.name}: ${error.message}`
                  });

                  ws.send(JSON.stringify({
                    type: 'tool_error',
                    toolName: toolCall.function.name,
                    error: error.message
                  }));
                }
              }
            }
          }
        } while (hasToolCalls);
      }

      ws.send(JSON.stringify({
        type: 'response_complete',
        content: fullResponse,
        sessionId: sessionId
      }));

      if (sessionManager && sessionId && fullResponse) {
        try {
          sessionManager.saveMessage(sessionId, {
            role: 'assistant',
            content: fullResponse,
            provider: config.provider,
          model: config.models[config.provider] || config.models['ollama']
          });
        } catch (error) {
          console.error('Error saving assistant message to session:', error.message);
        }
      }

    } catch (error) {
      console.error('Error in chat processing:', error);

      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  };
}
