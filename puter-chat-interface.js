import readline from 'readline';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Chat history array to store conversation
const chatHistory = [];

// Function to get user input
function getUserInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// Function to start the chat session
async function startChat() {
  console.log('Welcome to the Puter AI Chat Interface!');
  console.log('Note: You must be signed into Puter to use AI features.');
  console.log('Commands:');
  console.log('  - Type your message and press Enter to chat');
  console.log('  - Type "/model <model_name>" to change the model (e.g., /model gpt-4)');
  console.log('  - Type "/models" to list available models');
  console.log('  - Type "/clear" to clear the conversation history');
  console.log('  - Type "/exit" or "/quit" to end the session\n');

  // Default model - can be changed by user
  let model = 'gpt-4';
  console.log(`Using model: ${model}\n`);

  // Check if user is signed in
  if (typeof puter !== 'undefined' && puter.auth && puter.auth.isSignedIn()) {
    console.log('Signed in to Puter successfully!');
  } else {
    console.log('⚠️  You are not signed in to Puter. Please visit https://puter.com and sign in first.');
    console.log('The chat interface will simulate responses without actual API calls.');
  }

  while (true) {
    // Get input from user
    const userInput = await getUserInput('You: ');

    // Check for special commands
    if (userInput.startsWith('/')) {
      const [command, ...args] = userInput.split(' ');

      if (command === '/exit' || command === '/quit') {
        console.log('Ending chat session. Goodbye!');
        rl.close();
        break;
      } else if (command === '/model' && args.length > 0) {
        model = args[0];
        console.log(`Model changed to: ${model}\n`);
        continue;
      } else if (command === '/models') {
        if (typeof puter !== 'undefined') {
          try {
            const models = await puter.ai.listModels();
            console.log('Available models:', models.join(', '), '\n');
          } catch (error) {
            console.log('Could not fetch models list. API might not be available.\n');
          }
        } else {
          console.log('Puter API not available. Please ensure you are running this in an environment with Puter API access.\n');
        }
        continue;
      } else if (command === '/clear') {
        chatHistory.length = 0; // Clear the array
        console.log('Conversation history cleared.\n');
        continue;
      } else {
        console.log('Unknown command. Available commands: /model, /models, /clear, /exit, /quit\n');
        continue;
      }
    }

    // Add user message to chat history
    chatHistory.push({ role: 'user', content: userInput });

    try {
      // Check if Puter API is available
      if (typeof puter !== 'undefined') {
        // Stream the response from the model
        process.stdout.write('Assistant: ');
        const response = await puter.ai.chat({
          prompt: userInput,
          model: model,
          stream: true
        });

        // Process streaming response
        let fullResponse = '';
        for await (const chunk of response) {
          const content = typeof chunk === 'string' ? chunk : chunk.content || '';
          fullResponse += content;
          process.stdout.write(content);
        }

        // Add assistant response to chat history
        chatHistory.push({ role: 'assistant', content: fullResponse });
        console.log('\n'); // Add extra newline after response
      } else {
        // Simulate response if Puter API is not available
        console.log('Assistant: [Puter API not available - this is a simulated response]');
        console.log('To use the actual Puter API, run this code in an environment where Puter.js is loaded.');
        console.log('(Include <script src="https://js.puter.com/v2/"></script> in an HTML file and run in browser)\n');
        chatHistory.push({ role: 'assistant', content: '[Simulated response: Puter API not available]' });
      }
    } catch (error) {
      console.error('\nError communicating with the model:', error.message);
      console.log('Please try again.\n');

      // Remove the user message from history since it wasn't processed
      chatHistory.pop();
    }
  }
}

// Start the chat session
startChat();

// Handle exit gracefully
rl.on('close', () => {
  console.log('\nChat session ended.');
  process.exit(0);
});