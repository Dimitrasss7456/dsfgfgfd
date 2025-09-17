const { Bot } = require('@maxhub/max-bot-api');
const fs = require('fs').promises;
const path = require('path');

class MessageSender {
  constructor() {
    this.fileCache = new Map(); // Cache for uploaded files
  }

  // Prepare file for sending (read once, reuse for all recipients)
  async prepareFile(filePath, fileName) {
    if (!filePath || !fileName) return null;

    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Check cache first
      const cacheKey = filePath;
      if (this.fileCache.has(cacheKey)) {
        return this.fileCache.get(cacheKey);
      }

      // Read file and prepare for MAX messenger
      const fileBuffer = await fs.readFile(filePath);
      
      // Validate file size (50MB limit for Replit environment)
      if (fileBuffer.length > 50 * 1024 * 1024) {
        throw new Error('Размер файла превышает допустимый лимит (50MB)');
      }

      const fileAttachment = {
        type: 'file',
        payload: {
          filename: fileName,
          file: fileBuffer
        }
      };

      // Cache the prepared file
      this.fileCache.set(cacheKey, fileAttachment);
      
      // Clean up cache after 1 hour
      setTimeout(() => {
        this.fileCache.delete(cacheKey);
      }, 60 * 60 * 1000);

      return fileAttachment;
      
    } catch (error) {
      throw new Error(`Ошибка подготовки файла: ${error.message}`);
    }
  }

  // Send message to a single recipient with retry logic
  async sendToRecipient(bot, contact, messageText, fileAttachment, retries = 2) {
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        let messageOptions = {};
        
        if (messageText) {
          messageOptions.text = messageText;
        }

        if (fileAttachment) {
          messageOptions.attachments = [fileAttachment];
        }

        const result = await bot.api.sendMessage(contact.chat_id, messageOptions);
        return { success: true, result };
        
      } catch (error) {
        if (attempt <= retries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return { success: false, error: error.message };
      }
    }
  }

  // Send bulk messages with proper error handling and rate limiting
  async sendBulkMessages(botToken, contacts, messageText, filePath, fileName, progressCallback) {
    const bot = new Bot(botToken);
    
    // Prepare file once if provided
    let fileAttachment = null;
    try {
      fileAttachment = await this.prepareFile(filePath, fileName);
    } catch (error) {
      throw new Error(error.message);
    }

    const results = {
      total: contacts.length,
      success: 0,
      failed: 0,
      errors: []
    };

    // Process contacts in batches to avoid overwhelming the API
    const BATCH_SIZE = 5;
    const DELAY_BETWEEN_BATCHES = 1000; // 1 second
    const DELAY_BETWEEN_MESSAGES = 200; // 200ms

    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      
      // Process batch in parallel
      const batchPromises = batch.map(async (contact, index) => {
        // Small delay to prevent rate limiting
        if (index > 0) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_MESSAGES));
        }

        const sendResult = await this.sendToRecipient(
          bot, 
          contact, 
          messageText, 
          fileAttachment
        );

        const contactResult = {
          contact: contact,
          ...sendResult
        };

        if (sendResult.success) {
          results.success++;
        } else {
          results.failed++;
          results.errors.push({
            contact: contact.name,
            error: sendResult.error
          });
        }

        // Call progress callback if provided
        if (progressCallback) {
          progressCallback({
            processed: results.success + results.failed,
            total: results.total,
            contact: contact.name,
            success: sendResult.success
          });
        }

        return contactResult;
      });

      // Wait for current batch to complete
      await Promise.allSettled(batchPromises);

      // Delay between batches (except for the last batch)
      if (i + BATCH_SIZE < contacts.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }

    return results;
  }

  // Clean up file cache
  clearCache() {
    this.fileCache.clear();
  }
}

// Export singleton instance
module.exports = new MessageSender();