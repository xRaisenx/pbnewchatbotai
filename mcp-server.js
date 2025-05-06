#!/usr/bin/env node

'use strict';

// =============================================
// Dependencies
// =============================================
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =============================================
// Configuration
// =============================================
const config = {
  // Server configuration
  port: process.env.PORT || 3020,
  logFile: path.join(__dirname, 'mcp-server.log'),
  maxLogSize: 10 * 1024 * 1024, // 10MB
  
  // Shopify configuration
  shopify: {
    adminAccessToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    storeName: process.env.SHOPIFY_STORE_NAME,
    apiVersion: '2023-10',
    timeout: 10000 // 10 seconds
  },
  
  // Security configuration
  security: {
    cronSecret: process.env.CRON_SECRET || '',
    requireSecretForSync: true
  },
  
  // Transport mode
  transport: process.env.MCP_STDIO === 'true' ? 'stdio' : 'http'
};

// Validate required configuration
if (!config.shopify.adminAccessToken || !config.shopify.storeName) {
  console.error('ERROR: Missing required Shopify configuration');
  console.error('Please set SHOPIFY_ADMIN_ACCESS_TOKEN and SHOPIFY_STORE_NAME environment variables');
  process.exit(1);
}

// =============================================
// Logger Implementation
// =============================================
class Logger {
  constructor(logFile, maxSize) {
    this.logFile = logFile;
    this.maxSize = maxSize;
    this.initializeLogFile();
  }

  initializeLogFile() {
    try {
      // Create log directory if it doesn't exist
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Create log file if it doesn't exist
      if (!fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '');
      }
    } catch (err) {
      console.error(`Failed to initialize log file: ${err.message}`);
      process.exit(1);
    }
  }

  rotateLogsIfNeeded() {
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > this.maxSize) {
        const logContent = fs.readFileSync(this.logFile, 'utf8');
        const lines = logContent.split('\n');
        // Keep last 50,000 lines when rotating
        const rotatedContent = lines.slice(-50000).join('\n');
        fs.writeFileSync(this.logFile, rotatedContent);
      }
    } catch (err) {
      console.error(`Log rotation failed: ${err.message}`);
    }
  }

  log(message, level = 'info') {
    try {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
      
      fs.appendFileSync(this.logFile, logMessage);
      console.log(logMessage.trim()); // Also output to console
      
      this.rotateLogsIfNeeded();
    } catch (err) {
      console.error(`Failed to write to log: ${err.message}`);
    }
  }
}

const logger = new Logger(config.logFile, config.maxLogSize);

// =============================================
// Shopify Service
// =============================================
class ShopifyService {
  constructor(config) {
    this.config = config;
    this.axiosInstance = axios.create({
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MCP-Server/1.0'
      }
    });
  }

  async getProducts(options = {}) {
    const { adminAccessToken, storeName, apiVersion } = this.config;
    
    try {
      logger.log(`Fetching products from Shopify store: ${storeName}`);
      
      const response = await this.axiosInstance.get(
        `https://${storeName}/admin/api/${apiVersion}/products.json`,
        {
          headers: {
            'X-Shopify-Access-Token': adminAccessToken
          },
          params: options.params || {}
        }
      );

      logger.log(`Successfully fetched ${response.data.products?.length || 0} products`);
      return response.data.products || [];
    } catch (error) {
      let errorMessage = 'Failed to fetch products';
      
      if (error.response) {
        // Shopify API returned an error response
        errorMessage += `: ${error.response.status} ${error.response.statusText}`;
        if (error.response.data?.errors) {
          errorMessage += ` - ${JSON.stringify(error.response.data.errors)}`;
        }
      } else if (error.request) {
        // Request was made but no response received
        errorMessage += ': No response received from Shopify';
      } else {
        // Something happened in setting up the request
        errorMessage += `: ${error.message}`;
      }
      
      logger.log(errorMessage, 'error');
      throw new Error(errorMessage);
    }
  }

  async syncProducts(options = {}) {
    try {
      logger.log('Starting product sync process');
      
      // In a real implementation, this would sync products with another system
      // For this example, we'll just simulate a sync by fetching products
      const products = await this.getProducts(options);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = {
        status: 'completed',
        timestamp: new Date().toISOString(),
        productsSynced: products.length,
        stats: {
          created: 0,
          updated: products.length,
          deleted: 0,
          skipped: 0
        }
      };
      
      logger.log(`Product sync completed: ${JSON.stringify(result)}`);
      return result;
    } catch (error) {
      logger.log(`Product sync failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

const shopifyService = new ShopifyService(config.shopify);

// =============================================
// Command Processor
// =============================================
class CommandProcessor {
  constructor(services) {
    this.services = services;
  }

  async process(command, params = {}) {
    logger.log(`Processing command: ${command} with params: ${JSON.stringify(params)}`);
    
    try {
      switch (command) {
        case 'get-products':
          const products = await this.services.shopify.getProducts(params);
          return {
            success: true,
            data: products,
            metadata: {
              count: products.length,
              timestamp: new Date().toISOString()
            }
          };
        
        case 'sync-products':
          if (config.security.requireSecretForSync && !this.validateCronSecret(params.secret)) {
            throw new Error('Invalid or missing sync secret');
          }
          
          const syncResult = await this.services.shopify.syncProducts(params);
          return {
            success: true,
            data: syncResult,
            metadata: {
              timestamp: new Date().toISOString()
            }
          };
        
        case 'ping':
          return {
            success: true,
            data: {
              status: 'ok',
              timestamp: new Date().toISOString(),
              server: 'mcp-server',
              version: '1.0.0'
            }
          };
        
        default:
          return {
            success: false,
            error: 'Unknown command',
            availableCommands: ['get-products', 'sync-products', 'ping']
          };
      }
    } catch (error) {
      logger.log(`Command processing failed: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      };
    }
  }

  validateCronSecret(secret) {
    if (!config.security.cronSecret) {
      logger.log('Warning: No CRON_SECRET configured, sync operations are not secured', 'warn');
      return true;
    }
    
    try {
      return crypto.timingSafeEqual(
        Buffer.from(secret || ''),
        Buffer.from(config.security.cronSecret)
      );
    } catch (err) {
      logger.log(`Secret validation error: ${err.message}`, 'error');
      return false;
    }
  }
}

const commandProcessor = new CommandProcessor({ shopify: shopifyService });

// =============================================
// JSON-RPC Handler
// =============================================
class JsonRpcHandler {
  constructor(commandProcessor) {
    this.commandProcessor = commandProcessor;
    this.supportedMethods = ['get-products', 'sync-products', 'ping', 'initialize'];
  }

  async handle(request) {
    const { id, method, params = {} } = request;
    
    logger.log(`Received JSON-RPC request - ID: ${id}, Method: ${method}`);
    
    // Validate request
    if (typeof id === 'undefined') {
      return this.errorResponse(null, -32600, 'ID is required');
    }
    
    if (typeof method !== 'string') {
      return this.errorResponse(id, -32600, 'Method must be a string');
    }
    
    if (typeof params !== 'object' || params === null) {
      return this.errorResponse(id, -32600, 'Params must be an object');
    }

    try {
      if (method === 'initialize') {
        return this.successResponse(id, {
          capabilities: {
            commandProvider: true,
            supportedMethods: this.supportedMethods,
            version: '1.0.0'
          }
        });
      }

      if (!this.supportedMethods.includes(method)) {
        return this.errorResponse(id, -32601, `Method not supported: ${method}`);
      }

      const result = await this.commandProcessor.process(method, params);
      
      if (result.success) {
        return this.successResponse(id, result.data, result.metadata);
      } else {
        return this.errorResponse(id, -32000, result.error, result.metadata);
      }
    } catch (error) {
      return this.errorResponse(id, -32603, error.message);
    }
  }

  successResponse(id, result, metadata = {}) {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        ...result,
        metadata: {
          timestamp: new Date().toISOString(),
          ...metadata
        }
      }
    };
  }

  errorResponse(id, code, message, metadata = {}) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        data: {
          metadata: {
            timestamp: new Date().toISOString(),
            ...metadata
          }
        }
      }
    };
  }
}

const jsonRpcHandler = new JsonRpcHandler(commandProcessor);

// =============================================
// Transport Handlers
// =============================================
class StdioTransport {
  constructor(handler) {
    this.handler = handler;
    this.initialize();
  }

  initialize() {
    logger.log('Initializing stdio transport');
    
    process.stdin
      .setEncoding('utf8')
      .on('data', async (data) => {
        try {
          if (!data || data.trim() === '') {
            logger.log('Received empty input, ignoring', 'warn');
            return;
          }
          
          logger.log(`Received stdin data: ${data.trim()}`);
          const input = JSON.parse(data.trim());
          
          if (typeof input !== 'object' || input === null) {
            throw new Error('Input must be a JSON object');
          }
          
          const response = await this.handler.handle(input);
          process.stdout.write(JSON.stringify(response) + '\n');
          logger.log(`Sent response for request ID: ${input.id || 'unknown'}`);
        } catch (err) {
          const errorResponse = {
            jsonrpc: '2.0',
            id: null,
            error: {
              code: -32700,
              message: `Parse error: ${err.message}`,
              data: {
                input: data.trim()
              }
            }
          };
          
          process.stdout.write(JSON.stringify(errorResponse) + '\n');
          logger.log(`Error processing input: ${err.message}`, 'error');
        }
      })
      .on('error', (err) => {
        logger.log(`Stdin error: ${err.message}`, 'error');
      })
      .on('end', () => {
        logger.log('Stdin stream ended', 'warn');
      });

    process.stdin.resume();
    
    // Handle process termination
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
    
    logger.log('Stdio transport ready');
  }

  shutdown() {
    logger.log('Shutting down stdio transport');
    process.stdin.pause();
    process.exit(0);
  }
}

class HttpTransport {
  constructor(handler, port) {
    this.handler = handler;
    this.port = port;
    this.app = express();
    this.server = null;
    this.initialize();
  }

  initialize() {
    logger.log(`Initializing HTTP transport on port ${this.port}`);
    
    // Middleware
    this.app.use(express.json());
    this.app.use((req, res, next) => {
      logger.log(`HTTP ${req.method} ${req.path} from ${req.ip}`);
      next();
    });
    
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString()
      });
    });
    
    // MCP endpoint
    this.app.post('/mcp', async (req, res) => {
      try {
        const { jsonrpc, id, method, params = {} } = req.body;
        
        // Handle both JSON-RPC and simple command formats
        if (jsonrpc === '2.0') {
          const response = await this.handler.handle({ id, method, params });
          res.json(response);
        } else {
          // Simple command format
          const { command, ...commandParams } = req.body;
          const result = await commandProcessor.process(command, commandParams);
          
          const status = result.success ? 200 : 
            result.error === 'Unknown command' ? 400 : 500;
          
          res.status(status).json(result);
        }
      } catch (err) {
        logger.log(`HTTP request error: ${err.message}`, 'error');
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // Error handling
    this.app.use((err, req, res, next) => {
      logger.log(`Unhandled error: ${err.stack}`, 'error');
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      });
    });
    
    // Start server
    this.server = this.app.listen(this.port, () => {
      logger.log(`HTTP server listening on port ${this.port}`);
    });
    
    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.log(`Port ${this.port} is already in use`, 'error');
        process.exit(1);
      } else {
        logger.log(`Server error: ${err.message}`, 'error');
        process.exit(1);
      }
    });
    
    // Handle process termination
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  shutdown() {
    logger.log('Shutting down HTTP transport');
    if (this.server) {
      this.server.close(() => {
        logger.log('HTTP server stopped');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

// =============================================
// Startup
// =============================================
logger.log('Starting MCP Server');
logger.log(`Running in ${config.transport} mode`);
logger.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

try {
  if (config.transport === 'stdio') {
    new StdioTransport(jsonRpcHandler);
  } else {
    new HttpTransport(jsonRpcHandler, config.port);
  }
} catch (err) {
  logger.log(`Failed to initialize server: ${err.stack}`, 'error');
  process.exit(1);
}

// =============================================
// Process Event Handlers
// =============================================
process.on('uncaughtException', (err) => {
  logger.log(`Uncaught exception: ${err.stack}`, 'error');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.log(`Unhandled rejection at: ${promise}, reason: ${reason}`, 'error');
});

process.on('exit', (code) => {
  logger.log(`Process exiting with code ${code}`);
});