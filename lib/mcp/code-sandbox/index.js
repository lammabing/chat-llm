import Docker from 'dockerode';
import readline from 'readline';
import { Writable } from 'stream';

const docker = new Docker();
const CONTAINERS = new Map();
let containerCounter = 0;

function log(msg) {
    console.error(JSON.stringify(msg));
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

function sendResponse(id, result) {
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + '\n');
}

function sendError(id, error) {
    console.error(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32600, message: error.message || String(error) } }));
}

rl.on('line', async (line) => {
    let request;
    try {
        request = JSON.parse(line);
    } catch (e) {
        return;
    }

    const { jsonrpc, id, method, params } = request;

    // Validate JSON-RPC version
    if (jsonrpc !== '2.0') {
        console.error(JSON.stringify({ jsonrpc: "2.0", id: id || null, error: { code: -32600, message: "Invalid JSON-RPC version: must be 2.0" } }));
        return;
    }

    try {
        switch (method) {
            case 'initialize':
                sendResponse(id, {
                    protocolVersion: '2024-11-05',
                    capabilities: { tools: {} },
                    serverInfo: {
                        name: 'code-sandbox-mcp',
                        version: '1.0.0'
                    },
                    tools: [
                        {
                            name: 'sandbox_initialize',
                            description: 'Initialize a new sandbox container (Python or Node.js). Returns a container_id that MUST be used in all subsequent calls. Default: python:3.12-slim-bookworm. For Node.js, specify image: "node:18-slim".',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    image: { type: 'string', description: "Either 'python:3.12-slim-bookworm' or 'node:18-slim'" }
                                }
                            }
                        },
                        {
                            name: 'write_file',
                            description: 'Write a file to the sandbox. Requires container_id from sandbox_initialize call.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    container_id: { type: 'string' },
                                    file_name: { type: 'string' },
                                    file_contents: { type: 'string' },
                                    dest_dir: { type: 'string', default: '/workspace' }
                                },
                                required: ['container_id', 'file_name', 'file_contents']
                            }
                        },
                        {
                            name: 'sandbox_exec',
                            description: 'Execute commands in the sandboxed environment.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    container_id: { type: 'string' },
                                    commands: {
                                        type: 'array',
                                        items: { type: 'string' },
                                        description: 'List of command(s) to run in the sandbox environment'
                                    }
                                },
                                required: ['container_id', 'commands']
                            }
                        },
                        {
                            name: 'sandbox_stop',
                            description: 'Stop and remove a running container sandbox.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    container_id: { type: 'string' }
                                },
                                required: ['container_id']
                            }
                        },
                        {
                            name: 'list_containers',
                            description: 'List all active sandbox containers.',
                            inputSchema: {
                                type: 'object',
                                properties: {}
                            }
                        }
                    ]
                });
                break;

            case 'tools/list':
            case 'tools/call':
                const toolName = params.name;
                const toolArgs = params.arguments || {};

                if (toolName === 'sandbox_initialize') {
                    const containerId = `sandbox-${Date.now()}-${++containerCounter}`;
                    // Support both Python and Node.js images
                    const allowedImages = ['python:3.12-slim-bookworm', 'node:18-slim'];
                    const requestedImage = toolArgs.image;
                    const image = requestedImage && allowedImages.includes(requestedImage) ? requestedImage : 'python:3.12-slim-bookworm';

                    log({ status: 'Creating container', image, containerId });

                    const container = await docker.createContainer({
                        Image: image,
                        name: containerId,
                        Cmd: ['sleep', 'infinity'],
                        AutoRemove: true,
                        HostConfig: {
                            Memory: 512 * 1024 * 1024,
                            NanoCpus: 1000000000
                        }
                    });

                    await container.start();
                    CONTAINERS.set(containerId, container);

                    log({ status: 'Container started', containerId });

                    sendResponse(id, {
                        container_id: containerId,
                        image: image,
                        message: `Container ${containerId} created and started`
                    });

                } else if (toolName === 'write_file') {
                    const { container_id, file_name, file_contents, dest_dir } = toolArgs;
                    
                    if (!container_id || !file_name) {
                        throw new Error('Missing container_id or file_name');
                    }

                    const container = CONTAINERS.get(container_id);
                    if (!container) {
                        throw new Error(`Container ${container_id} not found`);
                    }

                    const workDir = dest_dir || '/workspace';
                    const filePath = `${workDir}/${file_name}`.replace(/\/+/g, '/');

                    // Create directory and write file using dockerode exec
                    const mkdirExec = await container.exec({
                        Cmd: ['mkdir', '-p', workDir],
                        AttachStdout: true,
                        AttachStderr: true
                    });
                    await new Promise((resolve, reject) => {
                        mkdirExec.start((err, stream) => {
                            if (err) return reject(err);
                            stream.on('end', resolve);
                            stream.resume();
                        });
                    });

                    // Write file content via stdin
                    const writeExec = await container.exec({
                        Cmd: ['sh', '-c', `cat > '${filePath}'`],
                        AttachStdin: true,
                        AttachStdout: true,
                        AttachStderr: true
                    });
                    await new Promise((resolve, reject) => {
                        writeExec.start({ stdin: true }, (err, stream) => {
                            if (err) return reject(err);
                            stream.write(file_contents, 'utf-8');
                            stream.end();
                            stream.on('end', resolve);
                            stream.resume();
                        });
                    });

                    sendResponse(id, {
                        container_id,
                        file_name,
                        message: `File ${file_name} written to ${container_id}`
                    });

                } else if (toolName === 'sandbox_exec') {
                    const { container_id, commands } = toolArgs;
                    
                    if (!container_id || !commands) {
                        throw new Error('Missing container_id or commands');
                    }

                    const container = CONTAINERS.get(container_id);
                    if (!container) {
                        throw new Error(`Container ${container_id} not found`);
                    }

                    const cmdStr = 'cd /workspace && ' + commands.join(' && ');

                    const exec = await container.exec({
                        Cmd: ['sh', '-c', cmdStr],
                        AttachStdout: true,
                        AttachStderr: true
                    });

                    let stdout = '';
                    let stderr = '';

                    await new Promise((resolve, reject) => {
                        exec.start((err, stream) => {
                            if (err) return reject(err);
                            stream.on('data', (chunk) => {
                                const str = chunk.toString();
                                // dockerode streams may include frame headers
                                const output = str.replace(/^[\x01\x02]\x00\x00\x00\x00\x00\x00/, '');
                                if (output) {
                                    // Detect stderr frames (type 2)
                                    if (str.charCodeAt(0) === 2) {
                                        stderr += output;
                                    } else {
                                        stdout += output;
                                    }
                                }
                            });
                            stream.on('end', resolve);
                            stream.on('error', reject);
                        });
                    });

                    sendResponse(id, {
                        container_id,
                        commands,
                        stdout,
                        stderr
                    });

                } else if (toolName === 'sandbox_stop') {
                    const { container_id } = toolArgs;
                    const container = CONTAINERS.get(container_id);

                    if (container) {
                        try {
                            await container.stop({ t: 10 });
                        } catch (e) {
                            // Container may already be stopped
                        }
                        try {
                            await container.remove({ force: true });
                        } catch (e) {
                            // Container may already be removed
                        }
                        CONTAINERS.delete(container_id);
                        sendResponse(id, { container_id, message: `Container ${container_id} stopped and removed` });
                    } else {
                        throw new Error(`Container ${container_id} not found`);
                    }

                } else if (toolName === 'list_containers') {
                    sendResponse(id, {
                        containers: Array.from(CONTAINERS.keys())
                    });

                } else if (method === 'tools/list') {
                    sendResponse(id, {
                        tools: [
                            {
                                name: 'sandbox_initialize',
                                description: 'Initialize a new sandbox container (Python or Node.js). Returns a container_id that MUST be used in all subsequent calls. Default: python. For Node.js, use image: "node:18-slim".',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'write_file',
                                description: 'Write content to a file in the sandbox. Requires container_id from sandbox_initialize.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        container_id: { type: 'string', description: 'The container_id returned by sandbox_initialize' },
                                        file_name: { type: 'string', description: 'Name of file to create' },
                                        file_contents: { type: 'string', description: 'Content to write' },
                                        dest_dir: { type: 'string', default: '/workspace' }
                                    },
                                    required: ['container_id', 'file_name', 'file_contents']
                                }
                            },
                            {
                                name: 'sandbox_stop',
                                description: 'Stop and remove a running container',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        container_id: { type: 'string' }
                                    },
                                    required: ['container_id']
                                }
                            },
                            {
                                name: 'list_containers',
                                description: 'List all active sandbox containers',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            }
                        ]
                    });
                } else {
                    throw new Error(`Unknown tool: ${toolName}`);
                }
                break;

            default:
                sendError(id, new Error(`Unknown method: ${method}`));
        }
    } catch (error) {
        log({ error: error.message, method, stack: error.stack });
        sendError(id, error);
    }
});

log({ status: 'ready' });