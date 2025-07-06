require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');

const app = express();
const PORT = process.env.PORT || 4000;

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
      'http://localhost:4000',
      'http://127.0.0.1:4000',
      // Add production origins when deployed
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
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
  const { system, prompt } = req.body;
  
  if (!system || !prompt) {
    return res.status(400).json({ 
      error: "Missing required parameters: 'system' and 'prompt' are required" 
    });
  }

  try {
    console.log('Sending request to OpenAI API...');
    console.log('Prompt length:', prompt.length, 'characters');
    
    // Use different max_tokens based on whether this is initial or continuation
    const isInitial = !prompt.includes('Continue this story');
    
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-nano-2025-04-14',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ],
      max_tokens: isInitial ? 120 : 150, // Allow longer continuations
      temperature: isInitial ? 0.9 : 0.8, // Slightly less random for continuations
    });
    
    console.log('Response received from OpenAI API');
    res.json({ text: response.choices[0].message.content });
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

// Fallback route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../vanilla/index.html'));
});

app.listen(PORT, () => {
  console.log(`\x1b[32m%s\x1b[0m`, `🚀 Server running at http://localhost:${PORT}`);
  console.log(`\x1b[32m%s\x1b[0m`, `📝 Access the writing app in your browser`);
  console.log(`\x1b[32m%s\x1b[0m`, `🔄 Back-and-forth writing mode activated`);
});
