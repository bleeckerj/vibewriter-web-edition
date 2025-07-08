//require('dotenv').config();
const express = require('express');
const { verifyFirebaseToken } = require('./firebase-admin');
const cors = require('cors');
const path = require('path');
const { OpenAI } = require('openai');
const fs = require('fs');
const rfs = require('rotating-file-stream');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
// Check for required environment variables
const requiredEnvVars = ['ADMIN_USERNAME', 'ADMIN_PASSWORD', 'JWT_SECRET'];
//console.log('Required environment variables:', requiredEnvVars.join(', '));
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
//console.log('Process environment variables:', Object.keys(process.env).join(', '));
if (missingEnvVars.length > 0) {
  console.warn('\x1b[33m%s\x1b[0m', `Warning: Missing required environment variables: ${missingEnvVars.join(', ')}`);
  console.warn('\x1b[33m%s\x1b[0m', 'Make sure these are set in your .env file');
  
  // Provide default values only in development
  if (process.env.NODE_ENV === 'development') {
    console.warn('\x1b[33m%s\x1b[0m', 'Using default values for development only');
    
    if (!process.env.ADMIN_USERNAME) process.env.ADMIN_USERNAME = 'admin';
    if (!process.env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = 'password';
    if (!process.env.JWT_SECRET) process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  } else {
    // In production, exit if credentials are missing
    console.error('\x1b[31m%s\x1b[0m', 'Cannot start in production without required environment variables');
    process.exit(1);
  }
}

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

// Initialize cache for OpenAI usage data
let usageCache = {
  data: null,
  timestamp: 0
};

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

// Add this BEFORE your admin routes
console.log('Setting up secure admin routes with JWT authentication');

// Admin endpoint to view logs
app.get('/api/admin/logs', secureAdminRoute, (req, res) => {
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

// Add API endpoint to view rate limit stats
app.get('/api/admin/ratelimits', secureAdminRoute, (req, res) => {
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
    serverTime: now.toISOString(),
    blockedIPs: [], 
    stats: {
      totalRequests: "Stats not implemented yet",
      blockedRequests: "Stats not implemented yet"
    }
  });
});

// OpenAI usage endpoint
app.get('/api/admin/openai-usage', secureAdminRoute, async (req, res) => {
  try {
    // Check if cache is still valid (15 minutes)
    const now = Date.now();
    const cacheAge = now - (usageCache?.timestamp || 0);
    const cacheValidForMs = 15 * 60 * 1000; // 15 minutes
    
    // Force refresh if requested
    const forceRefresh = req.query.refresh === 'true';
    
    if (usageCache?.data && cacheAge < cacheValidForMs && !forceRefresh) {
      console.log(`Using cached OpenAI usage data (${Math.round(cacheAge/1000)}s old)`);
      return res.json(usageCache.data);
    }
    
    console.log("Fetching fresh OpenAI usage data...");
    const usageData = await getLast5DaysUsage();
    
    // Add detailed debug information
    console.log("Usage data structure:", {
      mockData: usageData.mockData,
      totalRequests: usageData.totalRequests,
      totalTokens: usageData.totalTokens,
      dailyDataCount: usageData.dailyData?.length || 0,
      byModelCount: Object.keys(usageData.byModel || {}).length
    });
    
    // Check if data is empty and log
    if (!usageData.dailyData || usageData.dailyData.length === 0) {
      console.log("WARNING: No daily data found in the API response");
    }
    
    // Update cache
    usageCache = {
      data: usageData,
      timestamp: now
    };
    
    res.json(usageData);
  } catch (error) {
    console.error("Error in usage endpoint:", error);
    
    // If we have cached data, return it even if it's expired
    if (usageCache.data) {
      console.log("Returning expired cache due to error");
      return res.json({
        ...usageCache.data,
        error: error.message,
        usingExpiredCache: true
      });
    }
    
    res.status(500).json({ error: error.message });
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

// Modified function to get the last 5 days of usage
async function getLast5DaysUsage() {
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
    mockData: false,
    cachedAt: new Date().toISOString()
  };
  
  try {
    // Calculate start and end time for the 5-day period
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 5);
    
    const startTime = Math.floor(startDate.getTime() / 1000);
    const endTime = Math.floor(endDate.getTime() / 1000);
    
    console.log(`Fetching OpenAI usage for date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
    
    // Build URL with query parameters
    const url = new URL('https://api.openai.com/v1/organization/usage/completions');
    url.searchParams.append('start_time', startTime);
    url.searchParams.append('end_time', endTime);
    url.searchParams.append('bucket_width', '1d'); // Daily buckets
    
    if (process.env.OPENAI_PROJECT_ID) {
      // This is actually a project ID, not an API key ID
      url.searchParams.append('project_ids', process.env.OPENAI_PROJECT_ID);
    }
    console.log(`Making request to: ${url.toString()}`);
    
    // Make a single API call for the entire date range
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`OpenAI API response status: ${response.status}`);
    
    // Get the response as text first for debugging
    const responseText = await response.text();
    console.log(`Response (first 200 chars): ${responseText.substring(0, 200)}...`);
    
    if (response.status !== 200) {
      throw new Error(`API returned status ${response.status}: ${responseText.substring(0, 200)}`);
    }
    
    // Parse as JSON
    const data = JSON.parse(responseText);
    
    // Process each bucket (day) in the response
    if (data.data && data.data.length > 0) {
      data.data.forEach(bucket => {
        // Get the date for this bucket
        const bucketDate = new Date(bucket.start_time * 1000).toISOString().split('T')[0];
        
        // Calculate totals for this day
        let dayPromptTokens = 0;
        let dayCompletionTokens = 0;
        let dayRequests = 0;
        let dayCost = 0;
        
        if (bucket.results && bucket.results.length > 0) {
          bucket.results.forEach(result => {
            // Extract values using the new structure
            const promptTokens = result.input_tokens || 0;
            const completionTokens = result.output_tokens || 0;
            const requests = result.num_model_requests || 0;
            const model = result.model || 'unknown';
            
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
            if (model) {
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
            }
          });
        }
        
        // Add summarized day data
        results.dailyData.push({
          date: bucketDate,
          requests: dayRequests,
          promptTokens: dayPromptTokens,
          completionTokens: dayCompletionTokens,
          totalTokens: dayPromptTokens + dayCompletionTokens,
          cost: dayCost
        });
      });
      
      // Sort daily data by date in descending order (newest first)
      results.dailyData.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // Calculate total tokens
    results.totalTokens = results.totalPromptTokens + results.totalCompletionTokens;
    
    // Add isRealData flag
    results.isRealData = true;
    
    return results;
    
  } catch (error) {
    console.error('Error fetching usage data:', error);
    
    // Return empty results with error information
    return {
      error: `Could not retrieve usage data: ${error.message}`,
      dailyData: [],
      totalRequests: 0,
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      isEmptyResult: true,
      cachedAt: new Date().toISOString()
    };
  }
}


// Update your getOpenAIUsage function
async function getOpenAIUsage(date) {
  try {
    const fetch = require('node-fetch');
    
    console.log(`Fetching OpenAI usage for date: ${date}`);
    
    // Convert date string to Unix timestamp for start and end
    const dateObj = new Date(date);
    const startTime = Math.floor(dateObj.getTime() / 1000); // Beginning of day
    const endTime = startTime + 86400; // End of day (24 hours later)
    
    // Use the correct endpoint with proper parameters
    const response = await fetch(
      `https://api.openai.com/v1/organization/usage/completions?start_time=${startTime}&end_time=${endTime}&bucket_width=1d`,
      {
        headers: {
          // Use the special admin/organization key for usage data
          'Authorization': `Bearer ${process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
      }
    );
    
    console.log(`OpenAI API response status for ${date}: ${response.status}`);
    
    // Get the response as text first for debugging
    const responseText = await response.text();
    console.log(`Response for ${date} (first 100 chars): ${responseText.substring(0, 100)}...`);
    
    if (response.status !== 200) {
      console.warn(`Non-200 status from OpenAI API: ${response.status}`);
      throw new Error(`API returned status ${response.status}: ${responseText.substring(0, 200)}`);
    }
    
    // Parse as JSON
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse response as JSON');
      throw new Error(`Invalid JSON response`);
    }
    
    return data;
  } catch (error) {
    console.error(`Error fetching OpenAI usage for date ${date}:`, error);
    throw error;
  }
}

// JWT auth middleware
function jwtAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Authentication required',
      authType: 'JWT'
    });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    // Use JWT_SECRET from env
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }
    
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (error) {
    console.error('JWT validation error:', error.message);
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token expired, please login again' });
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  }
}

// Add rate limiting specific to admin routes
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit exceeded for admin endpoint: ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests, please try again later.',
      retryAfter: Math.ceil(adminRateLimiter.windowMs / 1000 / 60) + ' minutes'
    });
  }
});

// Create a middleware that combines JWT auth and rate limiting
function secureAdminRoute(req, res, next) {
  // Apply admin rate limiting
  adminRateLimiter(req, res, (err) => {
    if (err) return next(err);
    
    // If rate limit passes, apply JWT auth
    jwtAuth(req, res, next);
  });
}

// Enhance the login endpoint with better debugging
app.post('/api/admin/login', rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 15, // 15 attempts per hour
  standardHeaders: true,
  legacyHeaders: false,
}), async (req, res) => {
  console.log('Login attempt received');
  
  // Check if request body exists
  if (!req.body) {
    console.error('No request body received');
    return res.status(400).json({ error: 'No credentials provided' });
  }
  
  const { username, password } = req.body;
  console.log('Credentials received, username:', username || 'missing');
  
  // Get credentials from environment variables
  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;
  
  console.log('Environment variables loaded:', {
    ADMIN_USERNAME: validUsername ? 'set' : 'missing',
    ADMIN_PASSWORD: validPassword ? 'set' : 'missing',
    JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'missing'
  });
  
  // Make sure credentials are configured
  if (!validUsername || !validPassword) {
    console.error('Missing admin credentials in environment variables');
    return res.status(500).json({ error: 'Server configuration error: Missing credentials' });
  }
  
  // Validate credentials
  if (username === validUsername && password === validPassword) {
    console.log('Credentials valid, generating JWT token');
    
    try {
      // Create JWT token with 8-hour expiry
      const token = jwt.sign(
        { username, role: 'admin' },
        process.env.JWT_SECRET || 'fallback-secret-do-not-use-in-production',
        { expiresIn: '8h' }
      );
      
      // Log successful login
      console.log(`👤 Admin login successful for user: ${username} from IP: ${req.ip}`);
      
      res.json({ 
        success: true, 
        token,
        expiresIn: '8h'
      });
    } catch (tokenError) {
      console.error('Error generating JWT token:', tokenError);
      res.status(500).json({ error: 'Failed to generate authentication token' });
    }
  } else {
    // Log failed attempts
    console.warn(`⚠️ Failed admin login attempt from IP: ${req.ip}`);
    console.warn(`⚠️ Provided username: "${username}", Expected: "${validUsername}"`);
    console.warn(`⚠️ Password match: ${password === validPassword ? 'yes' : 'no'}`);
    
    // Add delay to prevent brute force
    setTimeout(() => {
      res.status(401).json({ error: 'Invalid credentials' });
    }, 500);
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\x1b[32m%s\x1b[0m`, `🚀 Server running at http://localhost:${PORT}`);
  console.log(`\x1b[32m%s\x1b[0m`, `📝 Access the writing app in your browser`);
  console.log(`\x1b[32m%s\x1b[0m`, `🔄 Back-and-forth writing mode activated`);
});
