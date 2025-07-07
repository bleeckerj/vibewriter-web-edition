require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');
const fs = require('fs');
const rfs = require('rotating-file-stream');

const app = express();
const PORT = process.env.PORT || 3000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Create rotating write stream for logs
const accessLogStream = rfs.createStream('ghostwriter-access.log', {
  interval: '1d',        // Rotate daily
  size: '10M',           // Rotate after 10 MegaBytes
  path: logsDir,
  compress: 'gzip'       // Compress rotated files
});

// Custom logger for conversations
const logConversation = (req, data) => {
  const timestamp = new Date().toISOString();
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const logEntry = {
    timestamp,
    ip,
    metadata: data.metadata || {},
    conversation: data.conversation || [],
    settings: data.settings || {}
  };
  
  accessLogStream.write(JSON.stringify(logEntry) + '\n');
  
  // Enhanced console logging
  console.log(`\n\x1b[36m%s\x1b[0m`, `📝 Logged conversation at ${timestamp} from IP: ${ip}`);
  if (data.settings) {
    console.log(`\x1b[36m%s\x1b[0m`, `⚙️ Settings: ${JSON.stringify(data.settings)}`);
  }
  if (data.conversation && data.conversation.length) {
    console.log(`\x1b[32m%s\x1b[0m`, `💬 User: ${data.conversation.find(msg => msg.role === 'user')?.content.substring(0, 50)}...`);
    console.log(`\x1b[34m%s\x1b[0m`, `🤖 AI: ${data.conversation.find(msg => msg.role === 'assistant')?.content.substring(0, 50)}...`);
  }
  console.log('\x1b[36m%s\x1b[0m', `──────────────────────────────────────────────────────`);
};

// Check if OpenAI API key is set
if (!process.env.OPENAI_API_KEY) {
  console.warn('\x1b[33m%s\x1b[0m', 'Warning: OPENAI_API_KEY is not set in .env file');
  console.warn('\x1b[33m%s\x1b[0m', 'Create a .env file in the server directory with your OpenAI API key');
  console.warn('\x1b[33m%s\x1b[0m', 'Example: OPENAI_API_KEY=your_api_key_here');
}

// CORS configuration for development and production
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      // Add production origins when deployed
      'http://146.190.161.27:3000',
    ];
    
// For debugging - log all origins
    console.log('Request origin:', origin);
    
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Increase JSON payload size limit for long stories
app.use(express.json({ limit: '2mb' }));

// Serve static frontend from /vanilla
app.use(express.static(path.join(__dirname, '../vanilla')));

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// LLM API endpoint
app.post('/api/llm', async (req, res) => {
  const { system, prompt, aiLength = 'medium' } = req.body;
  
  if (!system || !prompt) {
    return res.status(400).json({ 
      error: "Missing required parameters: 'system' and 'prompt' are required" 
    });
  }

  try {
    console.log('Sending request to OpenAI API...');
    console.log('Prompt length:', prompt.length, 'characters');
    console.log('AI length setting:', aiLength);
    
    // Use different max_tokens based on whether this is initial or continuation
    const isInitial = !prompt.includes('Continue this story');
    
    // Determine token limits based on AI length setting
    let maxTokens;
    switch (aiLength) {
      case 'short':
        maxTokens = isInitial ? 30 : 40; // About one sentence
        break;
      case 'long':
        maxTokens = isInitial ? 200 : 250; // ~150 words
        break;
      case 'medium':
      default:
        maxTokens = isInitial ? 120 : 150; // ~80 words
    }
    
    console.log(`Using max_tokens: ${maxTokens}`);
    
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-nano-2025-04-14',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_tokens: maxTokens,
      temperature: isInitial ? 0.9 : 0.8, // Slightly less random for continuations
    });
    
    console.log('Response received from OpenAI API');
    res.json({ text: response.choices[0].message.content });
    
    // Log the conversation
    logConversation(req, {
      metadata: { system, aiLength },
      conversation: [{ role: 'user', content: prompt }, { role: 'assistant', content: response.choices[0].message.content }],
      settings: { maxTokens, temperature: isInitial ? 0.9 : 0.8 }
    });
  } catch (err) {
    console.error('OpenAI API Error:', err.message);
    
    // Provide more helpful error messages
    let errorMessage = err.message;
    let suggestion = "Check your OpenAI API key and model availability";
    
    if (err.message.includes('API key')) {
      errorMessage = "Invalid API key";
      suggestion = "Please check your OPENAI_API_KEY in the .env file";
    } else if (err.message.includes('not found') || err.message.includes('does not exist')) {
      errorMessage = "Model not available";
      suggestion = "The specified model may not be available. Try updating the OPENAI_MODEL in your .env file.";
    }
    
    res.status(500).json({ 
      error: errorMessage,
      suggestion: suggestion
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    version: '0.1.0',
    env: process.env.NODE_ENV || 'development',
    openaiKey: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4.1-nano-2025-04-14 (default)'
  });
});

// API endpoint to log conversations
app.post('/api/log', (req, res) => {
  try {
    const { conversation, metadata, settings } = req.body;
    
    if (!conversation) {
      return res.status(400).json({ error: 'Missing conversation data' });
    }
    
    logConversation(req, { conversation, metadata, settings });
    res.json({ success: true });
  } catch (err) {
    console.error('Logging error:', err.message);
    res.status(500).json({ error: 'Failed to log conversation' });
  }
});

// Admin endpoint to view logs (requires authentication)
app.get('/api/admin/logs', (req, res) => {
  // Simple basic auth for demo purposes - in production use proper authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Base64 decode credentials
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  // Check credentials (in production, use environment variables or a secure method)
  if (username !== 'admin' || password !== 'ghostwriter123') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  try {
    // Read the log file
    fs.readFile(path.join(logsDir, 'ghostwriter-access.log'), 'utf8', (err, data) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to read logs' });
      }
      
      // Parse logs (each line is a JSON object)
      const logs = data.trim().split('\n').map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return { error: 'Invalid log entry', raw: line };
        }
      });
      
      res.json({ logs });
    });
  } catch (err) {
    console.error('Error retrieving logs:', err.message);
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../vanilla/admin.html'));
});

// Privacy policy route
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '../vanilla/privacy.html'));
});

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../vanilla/index.html'));
});

app.listen(PORT, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `🚀 Server running at http://localhost:${PORT}`);
  console.log(`\x1b[32m%s\x1b[0m`, `📝 Access the writing app in your browser`);
  console.log(`\x1b[32m%s\x1b[0m`, `🔄 Back-and-forth writing mode activated`);
});
