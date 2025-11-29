import ollama from 'ollama'

const message = { role: 'user', content: 'Provide a complete list of available options, flags and parameters available for creating docker containers' }
const response = await ollama.chat({ model: 'gpt-oss:120b-cloud', messages: [message], stream: true })
for await (const part of response) {
    process.stdout.write(part.message.content)
}