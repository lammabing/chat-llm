import readline from 'readline';

/**
 * Multi-Agent Chat using Puter API: Different models chatting with each other
 * This example demonstrates how to have different AI models interact with each other
 * using the Puter API instead of Ollama
 */

async function multiAgentChat(config) {
  const {
    models = ['gpt-4', 'claude'], // Default models available through Puter
    topic = "Discuss the advantages and disadvantages of renewable energy sources",
    turns = 6, // Number of conversation turns
    saveLog = false // Option to save the log
  } = config;

  console.log(`🔄 Multi-Agent Chat Simulation (using Puter API)\n`);
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Topic: ${topic}`);
  console.log(`Total Turns: ${turns}\n`);

  // Initialize conversation history
  const chatHistory = [
    { role: 'user', content: topic }
  ];

  for (let i = 0; i < turns; i++) {
    const currentModel = models[i % models.length]; // Rotate between models
    const otherModels = models.filter(model => model !== currentModel);

    console.log(`\n--- Turn ${i + 1}: ${currentModel} ---`);

    try {
      // Prepare the message for the current model
      // Include context about which other models are participating
      const systemPrompt = `You are having a discussion with other AI models: ${otherModels.join(', ')}.
      Your name is ${currentModel}. Please respond to the ongoing conversation in a way that's informative
      and adds value to the discussion. Keep your response brief but insightful.`;

      // Combine system prompt with chat history
      const prompt = `${systemPrompt}\n\nPrevious conversation:\n${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n${currentModel}, please respond:`;

      // Get response from current model using Puter API
      if (typeof puter !== 'undefined') {
        const response = await puter.ai.chat({
          prompt: prompt,
          model: currentModel
        });

        const content = typeof response === 'string' ? response : response.content || response.text || response.message;
        console.log(`${currentModel}: ${content}\n`);

        // Add this response to the chat history
        chatHistory.push({ role: 'assistant', content: `${currentModel}: ${content}` });
      } else {
        // Simulate response if Puter API is not available
        console.log(`${currentModel}: [Simulated response: Puter API not available]\n`);
        chatHistory.push({ role: 'assistant', content: `${currentModel}: [Simulated response: Puter API not available]` });
      }

    } catch (error) {
      console.error(`❌ Error with model ${currentModel}:`, error.message);

      // Add error message to chat history
      chatHistory.push({
        role: 'assistant',
        content: `${currentModel} (error): Could not generate response due to: ${error.message}`
      });
    }
  }

  console.log(`\n🏁 Multi-Agent Chat Completed!`);

  // Save log if requested
  if (saveLog) {
    await saveChatLog(chatHistory, 'puter-multi-agent-discussion');
  }

  return chatHistory;
}

/**
 * Debate-style conversation between two models using Puter API
 */
async function modelDebate(topic, model1 = 'gpt-4', model2 = 'claude', rounds = 4, saveLog = false) {
  console.log(`🏛️ Model Debate (using Puter API): ${model1} vs ${model2}\n`);
  console.log(`Topic: ${topic}`);
  console.log(`Rounds: ${rounds}\n`);

  const chatHistory = [];

  // Initial prompt to start the debate
  const initialPrompt = `We're having a structured debate about: "${topic}".
  ${model1}, please start by presenting your opening argument in favor of this position.
  ${model2}, you will respond with a counter-argument, and we'll alternate for several rounds.`;

  chatHistory.push({ role: 'user', content: initialPrompt });

  for (let round = 0; round < rounds * 2; round++) {
    const currentModel = round % 2 === 0 ? model1 : model2;
    const opponentModel = round % 2 === 0 ? model2 : model1;

    console.log(`\n--- Round ${Math.floor(round/2) + 1}, ${currentModel}'s turn ---`);

    const debatePrompt = `This is round ${Math.floor(round/2) + 1} of the debate about "${topic}".
    It's your turn, ${currentModel}. The last statement was:
    "${chatHistory[chatHistory.length - 1]?.content || 'N/A'}".

    Please respond to ${opponentModel}'s argument or present your next point in the debate.
    Keep your response focused and under 150 words.`;

    try {
      if (typeof puter !== 'undefined') {
        const response = await puter.ai.chat({
          prompt: debatePrompt,
          model: currentModel
        });

        const content = typeof response === 'string' ? response : response.content || response.text || response.message;
        console.log(`${currentModel}: ${content}\n`);

        chatHistory.push({ role: 'assistant', content: `${currentModel}: ${content}` });
      } else {
        // Simulate response
        console.log(`${currentModel}: [Simulated response: Puter API not available]\n`);
        chatHistory.push({ role: 'assistant', content: `${currentModel}: [Simulated response: Puter API not available]` });
      }
    } catch (error) {
      console.error(`❌ Error with model ${currentModel}:`, error.message);
      chatHistory.push({
        role: 'assistant',
        content: `${currentModel} (error): Could not generate response due to: ${error.message}`
      });
    }
  }

  console.log(`\n🏁 Debate Completed!`);

  // Save log if requested
  if (saveLog) {
    await saveChatLog(chatHistory, 'puter-model-debate');
  }

  return chatHistory;
}

/**
 * Role-playing conversation between different models using Puter API
 */
async function rolePlayScenario(scenario, roles, models = ['gpt-4', 'claude'], turns = 4, saveLog = false) {
  console.log(`🎭 Role-Playing Scenario (using Puter API)\n`);
  console.log(`Scenario: ${scenario}`);
  console.log(`Roles: ${roles.join(', ')}`);
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Turns: ${turns}\n`);

  const chatHistory = [{ role: 'user', content: scenario }];

  for (let turn = 0; turn < turns; turn++) {
    const modelIndex = turn % models.length;
    const role = roles[turn % roles.length];
    const model = models[modelIndex];

    console.log(`\n--- Turn ${turn + 1}: ${role} (${model}) ---`);

    const rolePrompt = `You are playing the role of ${role} in this scenario: "${scenario}".
    Please respond in character, staying true to the ${role} persona.
    Previous conversation: ${chatHistory.slice(-3).map(m => m.content).join('; ')}`;

    try {
      if (typeof puter !== 'undefined') {
        const response = await puter.ai.chat({
          prompt: rolePrompt,
          model: model
        });

        const content = typeof response === 'string' ? response : response.content || response.text || response.message;
        console.log(`${role} (${model}): ${content}\n`);

        chatHistory.push({ role: 'assistant', content: `${role} (${model}): ${content}` });
      } else {
        // Simulate response
        console.log(`${role} (${model}): [Simulated response: Puter API not available]\n`);
        chatHistory.push({ role: 'assistant', content: `${role} (${model}): [Simulated response: Puter API not available]` });
      }
    } catch (error) {
      console.error(`❌ Error with model ${model} playing ${role}:`, error.message);
      chatHistory.push({
        role: 'assistant',
        content: `${role} (${model}): Could not generate response due to: ${error.message}`
      });
    }
  }

  console.log(`\n🏁 Role-Playing Completed!`);

  // Save log if requested
  if (saveLog) {
    await saveChatLog(chatHistory, 'puter-role-playing-scenario');
  }

  return chatHistory;
}

// Function to save chat log to a file in the chat-logs directory
async function saveChatLog(chatHistory, prefix = 'puter-chat-log') {
  // Node.js specific functionality would go here
  // Since this is a simulation without fs module in this context, we'll just log a message
  console.log(`\n📝 Conversation log would be saved in a real implementation (prefix: ${prefix})`);
  // Note: In a real implementation, you would use fs module to save the log
  // as done in the original multi-agent-chat.js file
}

// Interactive chat function for dynamic user input using Puter API
async function interactivePuterMultiAgentChat(config) {
  const {
    models = ['gpt-4', 'claude'],
    maxTurns = 20, // Maximum conversation turns before asking to continue
    saveLog = false // Option to save the log
  } = config;

  console.log(`🔄 Interactive Multi-Agent Chat (using Puter API)\n`);
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Type 'exit' to quit or 'new' to start a new topic\n`);

  // Create readline interface for user input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Promise wrapper for readline question
  const question = (query) => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    // Get initial topic from user
    let topic = await question("Enter your topic/comment/question for the models: ");
    if (topic.toLowerCase() === 'exit') {
      console.log("👋 Goodbye!");
      rl.close();
      return;
    }

    // Initialize conversation history
    let chatHistory = [
      { role: 'user', content: topic }
    ];

    console.log(`\n--- Starting discussion on: ${topic} ---\n`);

    let turnCount = 0;
    while (true) {
      // Check if we should ask to continue after maxTurns
      if (turnCount >= maxTurns && maxTurns > 0) {
        const continueChoice = await question("\nContinue conversation? (yes/no/new topic): ");
        if (continueChoice.toLowerCase().startsWith('n')) {
          console.log("👋 Ending conversation!");
          break;
        } else if (continueChoice.toLowerCase().startsWith('new')) {
          topic = await question("Enter new topic/comment/question: ");
          if (topic.toLowerCase() === 'exit') {
            console.log("👋 Goodbye!");
            break;
          }
          chatHistory = [{ role: 'user', content: topic }];
          console.log(`\n--- Starting new discussion on: ${topic} ---\n`);
          turnCount = 0;
          continue;
        }
        turnCount = 0; // Reset turn counter if continuing
      }

      // Let each model respond in turn
      for (let i = 0; i < models.length; i++) {
        const currentModel = models[i];
        const otherModels = models.filter(model => model !== currentModel);

        console.log(`\n--- ${currentModel} ---`);

        try {
          // Prepare the message for the current model
          const systemPrompt = `You are participating in a conversation about: "${topic}".
          You are having a discussion with other AI models: ${otherModels.join(', ')}.
          Your name is ${currentModel}. Please respond to the ongoing conversation in a way that's informative
          and adds value to the discussion. Keep your response brief but insightful.`;

          const prompt = `${systemPrompt}\n\nPrevious conversation:\n${chatHistory.map(msg => `${msg.role}: ${msg.content}`).join('\n')}\n\n${currentModel}, please respond:`;

          if (typeof puter !== 'undefined') {
            const response = await puter.ai.chat({
              prompt: prompt,
              model: currentModel
            });

            const content = typeof response === 'string' ? response : response.content || response.text || response.message;
            console.log(`${currentModel}: ${content}\n`);

            // Add this response to the chat history
            chatHistory.push({ role: 'assistant', content: `${currentModel}: ${content}` });
          } else {
            // Simulate response
            console.log(`${currentModel}: [Simulated response: Puter API not available]\n`);
            chatHistory.push({ role: 'assistant', content: `${currentModel}: [Simulated response: Puter API not available]` });
          }

          // Increment turn counter
          turnCount++;

        } catch (error) {
          console.error(`❌ Error with model ${currentModel}:`, error.message);

          // Add error message to chat history
          chatHistory.push({
            role: 'assistant',
            content: `${currentModel} (error): Could not generate response due to: ${error.message}`
          });
        }

        // Check for user commands after each model response
        const userAction = await question("Press Enter to continue, or type 'exit' or 'new': ");
        if (userAction.toLowerCase() === 'exit') {
          // Save log before exiting if requested
          if (saveLog) {
            await saveChatLog(chatHistory, 'puter-interactive-multi-agent');
          }
          console.log("👋 Goodbye!");
          return; // Exit the function entirely
        } else if (userAction.toLowerCase() === 'new') {
          topic = await question("Enter new topic/comment/question: ");
          if (topic.toLowerCase() === 'exit') {
            // Save log before exiting if requested
            if (saveLog) {
              await saveChatLog(chatHistory, 'puter-interactive-multi-agent');
            }
            console.log("👋 Goodbye!");
            return;
          }
          chatHistory = [{ role: 'user', content: topic }];
          console.log(`\n--- Starting new discussion on: ${topic} ---\n`);
          turnCount = 0;
          break; // Break inner loop to restart conversation
        }
      }
    }

    // Save log at the end if requested
    if (saveLog) {
      await saveChatLog(chatHistory, 'puter-interactive-multi-agent');
    }
  } catch (error) {
    console.error("❌ Error in interactive chat:", error);
  } finally {
    rl.close();
  }
}

// Example usage
async function runExamples(saveLogs = false) {
  // Example 1: Multi-agent discussion
  console.log('='.repeat(60));
  console.log('1. MULTI-AGENT DISCUSSION (using Puter API)');
  console.log('='.repeat(60));

  await multiAgentChat({
    models: ['gpt-4', 'claude'],
    topic: "What are the ethical implications of artificial intelligence in healthcare?",
    turns: 6,
    saveLog: saveLogs
  });

  // Example 2: Model debate
  console.log('\n' + '='.repeat(60));
  console.log('2. MODEL DEBATE (using Puter API)');
  console.log('='.repeat(60));

  await modelDebate(
    "Should artificial intelligence be used to replace human judges in legal proceedings?",
    'gpt-4',
    'claude',
    3,
    saveLogs
  );

  // Example 3: Role-playing scenario
  console.log('\n' + '='.repeat(60));
  console.log('3. ROLE-PLAYING SCENARIO (using Puter API)');
  console.log('='.repeat(60));

  await rolePlayScenario(
    "A futuristic city council meeting where AI systems are being considered for urban planning",
    ['City Planner', 'Environmental Advocate', 'Tech CEO', 'Citizen Representative'],
    ['gpt-4', 'claude'],
    5,
    saveLogs
  );
}

// If running this file directly
if (import.meta.url === `file://${process.argv[1]}`) {
  // Check for command-line arguments to determine execution mode
  const args = process.argv.slice(2);

  // Check if logging is requested
  const saveLogs = args.includes('--log') || args.includes('--save-logs');
  const interactiveMode = args.includes('--interactive') || args.includes('-i');

  if (interactiveMode) {
    // Run interactive mode
    console.log("🚀 Starting Interactive Multi-Agent Chat with Puter API...");
    interactivePuterMultiAgentChat({
      models: ['gpt-4', 'claude'],
      maxTurns: 10,
      saveLog: saveLogs
    }).catch(err => {
      console.error('❌ Error in interactive chat:', err);
    });
  } else {
    // Run example demonstrations
    runExamples(saveLogs).catch(err => {
      console.error('❌ Error in example execution:', err);
    });
  }
}

export { multiAgentChat, modelDebate, rolePlayScenario, interactivePuterMultiAgentChat };