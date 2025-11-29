import fs from 'fs';
import path from 'path';

/**
 * Script to move existing JSON log files to the chat-logs directory
 */

async function moveLogFiles() {
  try {
    // Get all files in the current directory
    const files = await fs.promises.readdir('.');
    
    // Filter for JSON log files that appear to be conversation logs
    const logFiles = files.filter(file => 
      file.endsWith('.json') && 
      (file.startsWith('multi-agent-discussion_') || 
       file.startsWith('model-debate_') || 
       file.startsWith('role-playing-scenario_'))
    );
    
    if (logFiles.length === 0) {
      console.log('No existing conversation logs found to move.');
      return;
    }
    
    // Create chat-logs directory if it doesn't exist
    const logDir = 'chat-logs';
    await fs.promises.mkdir(logDir, { recursive: true });
    
    console.log(`Moving ${logFiles.length} log files to ${logDir}/ directory...`);
    
    for (const file of logFiles) {
      const oldPath = path.join('.', file);
      const newPath = path.join(logDir, file);
      
      try {
        await fs.promises.rename(oldPath, newPath);
        console.log(`✓ Moved: ${file}`);
      } catch (error) {
        console.error(`❌ Error moving ${file}:`, error.message);
      }
    }
    
    console.log(`\nAll log files have been moved to the ${logDir} directory.`);
  } catch (error) {
    console.error('❌ Error in moveLogFiles:', error.message);
  }
}

// Run the function if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  moveLogFiles();
}

export { moveLogFiles };