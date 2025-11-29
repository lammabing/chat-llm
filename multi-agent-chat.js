import ollama from 'ollama';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

/**
 * Multi-Agent Chat: Different models chatting with each other
 * This example demonstrates how to have different AI models interact with each other
 */

async function multiAgentChat(config) {
  const {
    models = ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'], // Updated to use available models
    topic = "Discuss the advantages and disadvantages of renewable energy sources",
    turns = 6, // Number of conversation turns
    maxTokensPerResponse = 100,
    saveLog = false // Option to save the log
  } = config;

  console.log(`🔄 Multi-Agent Chat Simulation\n`);
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

      const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory
      ];

      // Get response from current model
      const response = await ollama.chat({
        model: currentModel,
        messages: messages,
        options: {
          num_predict: maxTokensPerResponse
        }
      });

      const content = response.message.content;

      console.log(`${currentModel}: ${content}\n`);

      // Add this response to the chat history
      chatHistory.push({ role: 'assistant', content: `${currentModel}: ${content}` });

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
    await saveChatLog(chatHistory, 'multi-agent-discussion');
  }

  return chatHistory;
}

/**
 * Debate-style conversation between two models
 */
async function modelDebate(topic, model1 = 'gpt-oss:120b-cloud', model2 = 'qwen3-coder:480b-cloud', rounds = 4, saveLog = false) {
  console.log(`🏛️ Model Debate: ${model1} vs ${model2}\n`);
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
      const response = await ollama.chat({
        model: currentModel,
        messages: [
          { role: 'system', content: `You are participating in a debate. Your name is ${currentModel}.` },
          ...chatHistory,
          { role: 'user', content: debatePrompt }
        ],
        options: {
          num_predict: 200
        }
      });

      const content = response.message.content;
      console.log(`${currentModel}: ${content}\n`);

      chatHistory.push({ role: 'assistant', content: `${currentModel}: ${content}` });
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
    await saveChatLog(chatHistory, 'model-debate');
  }

  return chatHistory;
}

/**
 * Role-playing conversation between different models
 */
async function rolePlayScenario(scenario, roles, models = ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'], turns = 4, saveLog = false) {
  console.log(`🎭 Role-Playing Scenario\n`);
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
      const response = await ollama.chat({
        model: model,
        messages: [
          { role: 'system', content: `You are playing the role of ${role}. Stay in character.` },
          ...chatHistory,
          { role: 'user', content: rolePrompt }
        ],
        options: {
          num_predict: 150
        }
      });

      const content = response.message.content;
      console.log(`${role} (${model}): ${content}\n`);

      chatHistory.push({ role: 'assistant', content: `${role} (${model}): ${content}` });
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
    await saveChatLog(chatHistory, 'role-playing-scenario');
  }

  return chatHistory;
}

// Function to save chat log to a file in the chat-logs directory
async function saveChatLog(chatHistory, prefix = 'chat-log') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logDir = 'chat-logs';
  const filename = `${prefix}_${timestamp}.json`;
  const filepath = path.join(logDir, filename);

  try {
    // Ensure the chat-logs directory exists
    await fs.promises.mkdir(logDir, { recursive: true });

    // Extract model names from the beginning of each assistant message
    const modelsUsed = new Set();

    for (const msg of chatHistory) {
      if (msg.role === 'assistant') {
        // Find the first occurrence of ": " in the content, which indicates the model name
        const colonIndex = msg.content.indexOf(': ');
        if (colonIndex > 0) {
          const potentialModel = msg.content.substring(0, colonIndex).trim();
          // Check if it looks like a model name (contains expected patterns)
          if (potentialModel.includes(':') || potentialModel.includes('-')) {
            modelsUsed.add(potentialModel);
          }
        }
      }
    }

    const logContent = {
      timestamp: new Date().toISOString(),
      type: prefix,
      messages: chatHistory,
      summary: {
        totalMessages: chatHistory.length,
        modelsUsed: modelsUsed.size > 0 ? Array.from(modelsUsed) : ['unknown']
      }
    };

    await fs.promises.writeFile(filepath, JSON.stringify(logContent, null, 2));
    console.log(`\n📝 Conversation log saved to: ${filepath}`);
  } catch (error) {
    console.error(`❌ Error saving log to ${filepath}:`, error.message);
  }
}

// Interactive chat function for dynamic user input
async function interactiveMultiAgentChat(config) {
  const {
    models = ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'],
    maxTokensPerResponse = 100,
    maxTurns = 20, // Maximum conversation turns before asking to continue
    saveLog = false // Option to save the log
  } = config;

  console.log(`🔄 Interactive Multi-Agent Chat\n`);
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

          const messages = [
            { role: 'system', content: systemPrompt },
            ...chatHistory
          ];

          // Get response from current model
          const response = await ollama.chat({
            model: currentModel,
            messages: messages,
            options: {
              num_predict: maxTokensPerResponse
            }
          });

          const content = response.message.content;
          console.log(`${currentModel}: ${content}\n`);

          // Add this response to the chat history
          chatHistory.push({ role: 'assistant', content: `${currentModel}: ${content}` });

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
            await saveChatLog(chatHistory, 'interactive-multi-agent');
          }
          console.log("👋 Goodbye!");
          return; // Exit the function entirely
        } else if (userAction.toLowerCase() === 'new') {
          topic = await question("Enter new topic/comment/question: ");
          if (topic.toLowerCase() === 'exit') {
            // Save log before exiting if requested
            if (saveLog) {
              await saveChatLog(chatHistory, 'interactive-multi-agent');
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
      await saveChatLog(chatHistory, 'interactive-multi-agent');
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
  console.log('1. MULTI-AGENT DISCUSSION');
  console.log('='.repeat(60));

  await multiAgentChat({
    models: ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'],
    topic: "What are the ethical implications of artificial intelligence in healthcare?",
    turns: 6,
    saveLog: saveLogs
  });

  // Example 2: Model debate
  console.log('\n' + '='.repeat(60));
  console.log('2. MODEL DEBATE');
  console.log('='.repeat(60));

  await modelDebate(
    "Should artificial intelligence be used to replace human judges in legal proceedings?",
    'gpt-oss:120b-cloud',
    'qwen3-coder:480b-cloud',
    3,
    saveLogs
  );

  // Example 3: Role-playing scenario
  console.log('\n' + '='.repeat(60));
  console.log('3. ROLE-PLAYING SCENARIO');
  console.log('='.repeat(60));

  await rolePlayScenario(
    "A futuristic city council meeting where AI systems are being considered for urban planning",
    ['City Planner', 'Environmental Advocate', 'Tech CEO', 'Citizen Representative'],
    ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'],
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
    console.log("🚀 Starting Interactive Multi-Agent Chat...");
    interactiveMultiAgentChat({
      models: ['gpt-oss:120b-cloud', 'qwen3-coder:480b-cloud'],
      maxTokensPerResponse: 100,
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

export { multiAgentChat, modelDebate, rolePlayScenario, interactiveMultiAgentChat };