import ollama from 'ollama'
import readline from 'readline'

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

// Chat history array to store conversation
const chatHistory = []

// Function to get user input
function getUserInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer)
    })
  })
}

// Function to start the chat session
async function startChat() {
  console.log('Welcome to the Ollama Chat Interface!')
  console.log('Commands:')
  console.log('  - Type your message and press Enter to chat')
  console.log('  - Type "/model <model_name>" to change the model (e.g., /model llama3)')
  console.log('  - Type "/clear" to clear the conversation history')
  console.log('  - Type "/exit" or "/quit" to end the session\n')

  // Default model - can be changed by user
  let model = 'gpt-oss:120b-cloud'
  console.log(`Using model: ${model}\n`)

  while (true) {
    // Get input from user
    const userInput = await getUserInput('You: ')

    // Check for special commands
    if (userInput.startsWith('/')) {
      const [command, ...args] = userInput.split(' ')

      if (command === '/exit' || command === '/quit') {
        console.log('Ending chat session. Goodbye!')
        rl.close()
        break
      } else if (command === '/model' && args.length > 0) {
        model = args[0]
        console.log(`Model changed to: ${model}\n`)
        continue
      } else if (command === '/clear') {
        chatHistory.length = 0 // Clear the array
        console.log('Conversation history cleared.\n')
        continue
      } else {
        console.log('Unknown command. Available commands: /model, /clear, /exit, /quit\n')
        continue
      }
    }

    // Add user message to chat history
    chatHistory.push({ role: 'user', content: userInput })

    try {
      // Stream the response from the model
      process.stdout.write('Assistant: ')
      const response = await ollama.chat({
        model: model,
        messages: chatHistory,
        stream: true
      })

      let fullResponse = ''
      for await (const part of response) {
        const content = part.message.content
        fullResponse += content
        process.stdout.write(content)
      }

      // Add assistant response to chat history
      chatHistory.push({ role: 'assistant', content: fullResponse })
      console.log('\n') // Add extra newline after response
    } catch (error) {
      console.error('\nError communicating with the model:', error.message)
      console.log('Please try again.\n')

      // Remove the user message from history since it wasn't processed
      chatHistory.pop()
    }
  }
}

// Start the chat session
startChat()

// Handle exit gracefully
rl.on('close', () => {
  console.log('\nChat session ended.')
  process.exit(0)
})