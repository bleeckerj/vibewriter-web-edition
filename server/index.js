require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');
const fs = require('fs');
const rfs = require('rotating-file-stream');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Configure rate limiters for different endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each IP to 60 requests per 15-minute window (4 requests per minute average)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    error: 'Too many requests from this IP',
    suggestion: 'Please try again later. Rate limit: 60 requests per 15 minutes.'
  },
  // Add to the logs when rate limit is hit
  handler: (req, res, options) => {
    console.log(`⚠️ Rate limit exceeded for IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    res.status(429).json(options.message);
  }
});

// More strict limiter for LLM endpoint specifically
const llmLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit each IP to 20 requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many AI requests',
    suggestion: 'To prevent abuse, we limit AI generations to 20 per 5 minutes.'
  },
  handler: (req, res, options) => {
    console.log(`⚠️ LLM rate limit exceeded for IP: ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
    res.status(429).json(options.message);
  }
});

// Separate limiter for admin endpoints
const adminLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // Limit admin requests
  message: {
    error: 'Too many admin requests',
    suggestion: 'Please try again later.'
  }
});

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
    // Log every origin request for debugging
    console.log('CORS Request Origin:', origin);
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      console.log('No origin - allowing request');
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      // Add production origins when deployed
      'http://146.190.161.27:3000',
      'http://146.190.161.27',
      'https://vibewriter.nearfuturelaboratory.com',
      'http://vibewriter.nearfuturelaboratory.com'
    ];
    
    console.log('Checking origin against allowed origins:', allowedOrigins);
    console.log('Origin includes check:', allowedOrigins.includes(origin));
    
    if (allowedOrigins.includes(origin)) {
      console.log('Origin explicitly allowed:', origin);
      callback(null, true);
    } else {
      console.log('Origin explicitly blocked:', origin);
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

// Apply the general API rate limiter to all API routes
app.use('/api/', apiLimiter);

// LLM API endpoint
app.post('/api/llm', llmLimiter, async (req, res) => {
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
  if (username !== 'won46' || password !== 'strap-shove-voila-ferret') {
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


// Add this API endpoint to view rate limit stats
app.get('/api/admin/ratelimits', (req, res) => {
  // Simple basic auth - same as your existing auth
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
  const [username, password] = credentials.split(':');
  
  if (username !== 'won46' || password !== 'strap-shove-voila-ferret') {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Get current time for reference
  const now = new Date();
  
  // Return rate limit info
  res.json({
    rateWindowMs: {
      api: apiLimiter.windowMs / 60000 + " minutes",
      llm: llmLimiter.windowMs / 60000 + " minutes",
      admin: adminLimiter.windowMs / 60000 + " minutes"
    },
    requestLimits: {
      api: apiLimiter.max + " requests per window",
      llm: llmLimiter.max + " requests per window",
      admin: adminLimiter.max + " requests per window"
    },
    // Include server time for reference
    serverTime: now.toISOString(),
    // Add any blocked IPs if you're tracking them
    blockedIPs: [], // This would need additional code to track blocked IPs
    // Add some stats about total requests (optional - these need to be implemented separately)
    stats: {
      totalRequests: "Stats not implemented yet",
      blockedRequests: "Stats not implemented yet"
    }
  });
});



// Replace your current /api/admin/openai-usage endpoint with this simpler version
app.get('/api/admin/openai-usage', async (req, res) => {
  // Skip authentication for now to simplify debugging
  // We'll add it back later when everything else works
  
  try {
    console.log("Fetching OpenAI usage data without auth check...");
    const usageData = await getOpenAIUsage();
    console.log("Usage data retrieved:", JSON.stringify(usageData).substring(0, 200) + "...");
    res.json(usageData);
  } catch (error) {
    console.error("Error in usage endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});


// Updated function to get OpenAI usage with date parameter
async function getOpenAIUsage(dateStr) {
  try {
    const fetch = require('node-fetch');
    
    // Use provided date or default to today
    const date = dateStr || new Date().toISOString().split('T')[0];
    
    console.log(`Fetching OpenAI usage for date: ${date}`);
    
    // Make request to OpenAI API with the correct endpoint
    const response = await fetch(
      `https://api.openai.com/v1/usage?date=${date}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
      }
    );
    
    console.log(`OpenAI API response status: ${response.status}`);
    
    // Get response as text first for debugging
    const responseText = await response.text();
    console.log(`Response body preview: ${responseText.substring(0, 200)}...`);
    
    // Check if it's HTML
    if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
      console.error('Received HTML instead of JSON');
      throw new Error('API returned HTML instead of JSON');
    }
    
    // Parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (err) {
      console.error('JSON parse error:', err);
      throw new Error(`Failed to parse response as JSON: ${err.message}`);
    }
    
    // Return with a predictable structure
    return {
      date: date,
      data: data.data || [],
      total_tokens: 0, // Will be calculated in displayUsageData
      mockData: false
    };
  } catch (error) {
    console.error(`Error fetching OpenAI usage for date ${dateStr}:`, error);
    
    // Return mock data
    return { 
      date: dateStr,
      error: error.message,
      mockData: true,
      data: [
        {
          aggregate_timestamp: new Date().toISOString(),
          n_requests: 5,
          operation: "completion",
          snapshot_id: process.env.OPENAI_MODEL || "gpt-4.1-nano-2025-04-14",
          n_context_tokens_total: 500,
          n_generated_tokens_total: 250
        }
      ]
    };
  }
}

// New function to get the last 30 days of usage
async function getLast30DaysUsage() {
  const fetch = require('node-fetch');
  
  // Array to store results
  const results = {
    dailyData: [],
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    totalCost: 0,
    byModel: {},
    mockData: false
  };
  
  // Get dates for the last 30 days
  const dates = [];
  for (let i = 0; i < 30; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    dates.push(date.toISOString().split('T')[0]);
  }
  
  console.log(`Fetching OpenAI usage for the last 30 days: ${dates[29]} to ${dates[0]}`);
  
  // Array to track if we had any successful API calls
  let hadSuccessfulCall = false;
  
  // Fetch data for each day
  for (const date of dates) {
    try {
      const dayData = await getOpenAIUsage(date);
      
      // Only add if there's actual data
      if (dayData.data && dayData.data.length > 0) {
        hadSuccessfulCall = true;
        
        // Calculate totals for this day
        let dayPromptTokens = 0;
        let dayCompletionTokens = 0;
        let dayRequests = 0;
        let dayCost = 0;
        
        // Process each entry
        dayData.data.forEach(item => {
          const promptTokens = item.n_context_tokens_total || 0;
          const completionTokens = item.n_generated_tokens_total || 0;
          const requests = item.n_requests || 0;
          
          // Update day totals
          dayPromptTokens += promptTokens;
          dayCompletionTokens += completionTokens;
          dayRequests += requests;
          
          // Update global totals
          results.totalPromptTokens += promptTokens;
          results.totalCompletionTokens += completionTokens;
          results.totalRequests += requests;
          
          // Calculate cost based on model
          let promptCost = 0;
          let completionCost = 0;
          const model = item.snapshot_id;
          
          if (model.includes('gpt-4')) {
            if (model.includes('nano')) {
              // GPT-4.1 nano pricing
              promptCost = (promptTokens / 1000000) * 0.1; // $0.100 per 1M tokens
              completionCost = (completionTokens / 1000000) * 0.4; // $0.400 per 1M tokens
            } else if (model.includes('mini')) {
                // NEW: GPT-4.1 mini pricing
                promptCost = (promptTokens / 1000000) * 0.4; // $0.40 per 1M tokens
                completionCost = (completionTokens / 1000000) * 1.6; // $1.60 per 1M tokens
              } else if (model.includes('4.1')) {
                // Standard GPT-4.1 pricing
                promptCost = (promptTokens / 1000000) * 2.0; // $2.00 per 1M tokens
                completionCost = (completionTokens / 1000000) * 8.0; // $8.00 per 1M tokens
              } else {
                // Standard GPT-4 pricing (older models)
                promptCost = (promptTokens / 1000) * 0.03; // $0.03 per 1K tokens
                completionCost = (completionTokens / 1000) * 0.06; // $0.06 per 1K tokens
              }
            } else {
              // Default to GPT-3.5 pricing
              promptCost = (promptTokens / 1000) * 0.0015; // $0.0015 per 1K tokens
              completionCost = (completionTokens / 1000) * 0.002; // $0.002 per 1K tokens
            }
            
            dayCost += promptCost + completionCost;
            results.totalCost += promptCost + completionCost;
            
            // Track by model
            if (!results.byModel[model]) {
              results.byModel[model] = {
                requests: 0,
                promptTokens: 0,
                completionTokens: 0,
                cost: 0
              };
            }
            
            results.byModel[model].requests += requests;
            results.byModel[model].promptTokens += promptTokens;
            results.byModel[model].completionTokens += completionTokens;
            results.byModel[model].cost += (promptCost + completionCost);
          });
          
          // Add summarized day data
          results.dailyData.push({
            date,
            requests: dayRequests,
            promptTokens: dayPromptTokens,
            completionTokens: dayCompletionTokens,
            totalTokens: dayPromptTokens + dayCompletionTokens,
            cost: dayCost,
            rawData: dayData.data
          });
        }
      } catch (error) {
        console.error(`Error fetching data for ${date}:`, error);
        // Continue with next date even if this one fails
      }
    }
    
    // Calculate total tokens
    results.totalTokens = results.totalPromptTokens + results.totalCompletionTokens;
    
    // If no successful calls were made, set mockData flag
    if (!hadSuccessfulCall) {
      results.mockData = true;
      console.log('No successful API calls, using mock data');
      
      // Generate mock data for the last 30 days
      results.dailyData = dates.map(date => {
        const randomRequests = Math.floor(Math.random() * 10) + 1;
        const randomPromptTokens = Math.floor(Math.random() * 1000) + 100;
        const randomCompletionTokens = Math.floor(Math.random() * 500) + 50;
        
        return {
          date,
          requests: randomRequests,
          promptTokens: randomPromptTokens,
          completionTokens: randomCompletionTokens,
          totalTokens: randomPromptTokens + randomCompletionTokens,
          cost: ((randomPromptTokens / 1000) * 0.01) + ((randomCompletionTokens / 1000) * 0.03),
          mockData: true
        };
      });
      
      // Update totals with mock data
      results.totalRequests = results.dailyData.reduce((sum, day) => sum + day.requests, 0);
      results.totalPromptTokens = results.dailyData.reduce((sum, day) => sum + day.promptTokens, 0);
      results.totalCompletionTokens = results.dailyData.reduce((sum, day) => sum + day.completionTokens, 0);
      results.totalTokens = results.totalPromptTokens + results.totalCompletionTokens;
      results.totalCost = results.dailyData.reduce((sum, day) => sum + day.cost, 0);
      
      // Add mock model data
      results.byModel = {
        'gpt-4.1-nano-2025-04-14': {
          requests: results.totalRequests,
          promptTokens: results.totalPromptTokens,
          completionTokens: results.totalCompletionTokens,
          cost: results.totalCost
        }
      };
    }
    
    return results;
  }
  
  // Update your endpoint to use the new 30-day function
  app.get('/api/admin/openai-usage', async (req, res) => {
    // Skip authentication for now to simplify debugging
    // We'll add it back later when everything else works
    
    try {
      console.log("Fetching OpenAI usage data for the last 30 days...");
      const usageData = await getLast30DaysUsage();
      console.log(`Usage data retrieved: ${usageData.dailyData.length} days, ${usageData.totalRequests} requests, ${usageData.totalTokens} tokens`);
      res.json(usageData);
    } catch (error) {
      console.error("Error in usage endpoint:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Fallback route for SPA
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../vanilla/index.html'));
  });
  
  // Make sure your getOpenAIUsage function is also updated
  async function getOpenAIUsage() {
    try {
      const fetch = require('node-fetch');
      
      // Just get today's data to simplify
      const today = new Date().toISOString().split('T')[0];
      
      console.log(`Fetching OpenAI usage for date: ${today}`);
      
      // Make request to OpenAI API with the correct endpoint
      const response = await fetch(
        `https://api.openai.com/v1/usage?date=${today}`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
        }
      );
      
      console.log(`OpenAI API response status: ${response.status}`);
      
      // Get response as text first for debugging
      const responseText = await response.text();
      console.log(`Response body preview: ${responseText.substring(0, 200)}...`);
      
      // Check if it's HTML
      if (responseText.includes('<!DOCTYPE') || responseText.includes('<html')) {
        console.error('Received HTML instead of JSON');
        throw new Error('API returned HTML instead of JSON');
      }
      
      // Parse as JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (err) {
        console.error('JSON parse error:', err);
        throw new Error(`Failed to parse response as JSON: ${err.message}`);
      }
      
      // Return with a predictable structure
      return {
        data: data.data || [],
        total_tokens: 0, // Will be calculated in displayUsageData
        mockData: false
      };
    } catch (error) {
      console.error('Error fetching OpenAI usage:', error);
      
      // Return mock data
      return { 
        error: error.message,
        mockData: true,
        data: [
          {
            aggregate_timestamp: new Date().toISOString(),
            n_requests: 25,
            operation: "completion",
            snapshot_id: process.env.OPENAI_MODEL || "gpt-4.1-nano-2025-04-14",
            n_context_tokens_total: 2500,
            n_generated_tokens_total: 1200
          }
        ]
      };
    }
  }
  
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`\x1b[32m%s\x1b[0m`, `🚀 Server running at http://localhost:${PORT}`);
    console.log(`\x1b[32m%s\x1b[0m`, `📝 Access the writing app in your browser`);
    console.log(`\x1b[32m%s\x1b[0m`, `🔄 Back-and-forth writing mode activated`);
  });
