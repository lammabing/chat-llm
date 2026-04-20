import Docker from 'dockerode';
import readline from 'readline';
import { Writable } from 'stream';

const docker = new Docker();
const CONTAINERS = new Map();
let containerCounter = 0;

function buildTarArchive(files) {
    const tar = require('tar');
    const list = [];
    
    for (const [path, content] of Object.entries(files)) {
        list.push({
            path: path,
            content: Buffer.from(content)
        });
    }
    
    if (list.length === 0) return Buffer.alloc(0);
    
    const entries = list.map(item => ({
        header: {
            name: item.path,
            type: 'file',
            mode: 0o644,
            size: item.content.length,
            mtime: new Date()
        },
        body: item.content
    }));
    
    return tar.encode({ entries });
}

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
                            description: 'Initialize a new compute environment for code execution. Creates a container based on the specified Docker image.',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    image: {
                                        type: 'string',
                                        description: "Docker image to use as the base environment (default: 'python:3.12-slim-bookworm')",
                                        default: 'python:3.12-slim-bookworm'
                                    }
                                }
                            }
                        },
                        {
                            name: 'write_file',
                            description: 'Write a file to the sandboxed filesystem.',
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
                    const image = toolArgs.image || 'python:3.12-slim-bookworm';

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
                    const container = CONTAINERS.get(container_id);

                    if (!container) {
                        throw new Error(`Container ${container_id} not found`);
                    }

                    const workDir = dest_dir || '/workspace';
                    const tarBuffer = buildTarArchive({
                        [`${workDir}/${file_name}`]: file_contents
                    });

                    await container.putArchive(tarBuffer);

                    sendResponse(id, {
                        container_id,
                        file_name,
                        message: `File ${file_name} written to ${container_id}`
                    });

                } else if (toolName === 'sandbox_exec') {
                    const { container_id, commands } = toolArgs;
                    const container = CONTAINERS.get(container_id);

                    if (!container) {
                        throw new Error(`Container ${container_id} not found`);
                    }

                    const cmd = ['sh', '-c', commands.join(' && ')];

                    const exec = await container.exec({
                        Cmd: cmd,
                        AttachStdout: true,
                        AttachStderr: true
                    });

                    const stream = await exec.start({ hijack: true, stdin: false });

                    let stdout = '';
                    let stderr = '';

                    const stdoutStream = new Writable({
                        write(chunk, encoding, callback) {
                            stdout += chunk.toString();
                            callback();
                        }
                    });

                    const stderrStream = new Writable({
                        write(chunk, encoding, callback) {
                            stderr += chunk.toString();
                            callback();
                        }
                    });

                    await new Promise((resolve) => {
                        docker.modem.demuxStream(stream, stdoutStream, stderrStream);
                        stream.on('end', resolve);
                    });

                    const info = await exec.inspect();

                    sendResponse(id, {
                        container_id,
                        commands,
                        exitCode: info.ExitCode,
                        stdout: stdout,
                        stderr: stderr
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
                                description: 'Initialize a new compute environment for code execution',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        image: { type: 'string', default: 'python:3.12-slim-bookworm' }
                                    }
                                }
                            },
                            {
                                name: 'write_file',
                                description: 'Write a file to the sandboxed filesystem',
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
                                description: 'Execute commands in the sandbox environment',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        container_id: { type: 'string' },
                                        commands: { type: 'array', items: { type: 'string' } }
                                    },
                                    required: ['container_id', 'commands']
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