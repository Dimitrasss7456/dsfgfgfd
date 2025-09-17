// Rate limiting utility for SMS verification security
const crypto = require('crypto');

class RateLimiter {
  constructor() {
    // In-memory storage for rate limiting (in production, use Redis or similar)
    this.phoneAttempts = new Map(); // phone -> {count, firstAttempt, lastAttempt}
    this.ipAttempts = new Map(); // ip -> {count, firstAttempt, lastAttempt}
    this.verificationAttempts = new Map(); // phone -> {attempts, lockedUntil}
    
    // Cleanup old entries every 10 minutes
    setInterval(() => {
      this.cleanup();
    }, 10 * 60 * 1000);
  }

  /**
   * Check if SMS request is allowed for phone number
   * Limits: 1 per minute, 5 per hour per phone
   */
  checkSMSRateLimit(phone) {
    const now = Date.now();
    const phoneKey = this.hashPhone(phone);
    
    const phoneData = this.phoneAttempts.get(phoneKey) || { count: 0, firstAttempt: now, lastAttempt: 0 };
    
    // Reset if more than 1 hour passed since first attempt
    if (now - phoneData.firstAttempt > 60 * 60 * 1000) {
      phoneData.count = 0;
      phoneData.firstAttempt = now;
    }
    
    // Check if less than 1 minute since last attempt
    if (now - phoneData.lastAttempt < 60 * 1000) {
      return {
        allowed: false,
        reason: 'Слишком частые запросы. Подождите 1 минуту между запросами кода.',
        retryAfter: 60 - Math.floor((now - phoneData.lastAttempt) / 1000)
      };
    }
    
    // Check hourly limit
    if (phoneData.count >= 5) {
      return {
        allowed: false,
        reason: 'Превышен лимит запросов. Максимум 5 кодов в час для одного номера.',
        retryAfter: Math.ceil((phoneData.firstAttempt + 60 * 60 * 1000 - now) / 1000)
      };
    }
    
    // Update counters
    phoneData.count++;
    phoneData.lastAttempt = now;
    this.phoneAttempts.set(phoneKey, phoneData);
    
    return { allowed: true };
  }

  /**
   * Check IP rate limiting for SMS requests
   * Limits: 10 requests per hour per IP
   */
  checkIPRateLimit(ip) {
    const now = Date.now();
    const ipData = this.ipAttempts.get(ip) || { count: 0, firstAttempt: now };
    
    // Reset if more than 1 hour passed
    if (now - ipData.firstAttempt > 60 * 60 * 1000) {
      ipData.count = 0;
      ipData.firstAttempt = now;
    }
    
    if (ipData.count >= 10) {
      return {
        allowed: false,
        reason: 'Превышен лимит запросов с вашего IP адреса. Попробуйте через час.',
        retryAfter: Math.ceil((ipData.firstAttempt + 60 * 60 * 1000 - now) / 1000)
      };
    }
    
    ipData.count++;
    this.ipAttempts.set(ip, ipData);
    
    return { allowed: true };
  }

  /**
   * Check verification attempt limits
   * Limits: 5 failed attempts, then 15-minute lockout
   */
  checkVerificationAttempts(phone) {
    const now = Date.now();
    const phoneKey = this.hashPhone(phone);
    const data = this.verificationAttempts.get(phoneKey) || { attempts: 0, lockedUntil: 0 };
    
    // Check if locked
    if (data.lockedUntil > now) {
      return {
        allowed: false,
        reason: 'Слишком много неверных попыток. Номер заблокирован.',
        retryAfter: Math.ceil((data.lockedUntil - now) / 1000)
      };
    }
    
    // Reset if lock expired
    if (data.lockedUntil > 0 && data.lockedUntil <= now) {
      data.attempts = 0;
      data.lockedUntil = 0;
    }
    
    return { allowed: true };
  }

  /**
   * Record failed verification attempt
   */
  recordFailedVerification(phone) {
    const phoneKey = this.hashPhone(phone);
    const data = this.verificationAttempts.get(phoneKey) || { attempts: 0, lockedUntil: 0 };
    
    data.attempts++;
    
    // Lock for 15 minutes after 5 failed attempts
    if (data.attempts >= 5) {
      data.lockedUntil = Date.now() + 15 * 60 * 1000;
      console.log(`Phone ${phone.substring(0, 4)}***${phone.slice(-2)} locked due to too many failed verification attempts`);
    }
    
    this.verificationAttempts.set(phoneKey, data);
  }

  /**
   * Clear verification attempts after successful verification
   */
  clearVerificationAttempts(phone) {
    const phoneKey = this.hashPhone(phone);
    this.verificationAttempts.delete(phoneKey);
  }

  /**
   * Hash phone number for privacy
   */
  hashPhone(phone) {
    return crypto.createHash('sha256').update(phone).digest('hex');
  }

  /**
   * Clean up old entries
   */
  cleanup() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    // Clean phone attempts older than 1 hour
    for (const [key, data] of this.phoneAttempts.entries()) {
      if (now - data.firstAttempt > oneHour) {
        this.phoneAttempts.delete(key);
      }
    }
    
    // Clean IP attempts older than 1 hour
    for (const [key, data] of this.ipAttempts.entries()) {
      if (now - data.firstAttempt > oneHour) {
        this.ipAttempts.delete(key);
      }
    }
    
    // Clean verification attempts that are no longer locked
    for (const [key, data] of this.verificationAttempts.entries()) {
      if (data.lockedUntil > 0 && data.lockedUntil < now - oneHour) {
        this.verificationAttempts.delete(key);
      }
    }
  }

  /**
   * Get statistics (for monitoring)
   */
  getStats() {
    return {
      phoneAttempts: this.phoneAttempts.size,
      ipAttempts: this.ipAttempts.size,
      lockedPhones: Array.from(this.verificationAttempts.values()).filter(data => data.lockedUntil > Date.now()).length
    };
  }
}

module.exports = new RateLimiter();