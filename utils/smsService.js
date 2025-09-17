// Lazy load Twilio to prevent server crash if package is not installed
let twilio = null;

// SMS service using Twilio integration for MAX Messenger app
class SMSService {
  constructor() {
    this.client = null;
    this.fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    
    // Initialize Twilio client if credentials are available
    if (this.accountSid && this.authToken) {
      try {
        if (!twilio) {
          twilio = require('twilio');
        }
        this.client = twilio(this.accountSid, this.authToken);
      } catch (error) {
        console.error('Twilio package not found. SMS functionality disabled:', error.message);
        this.client = null;
      }
    }
  }

  /**
   * Check if SMS service is properly configured
   */
  isConfigured() {
    return !!(this.client && this.fromPhoneNumber);
  }

  /**
   * Send SMS verification code
   * @param {string} phoneNumber - Phone number in international format (+7xxxxxxxxxx)
   * @param {string} verificationCode - 6-digit verification code
   * @returns {Promise<Object>} - Result of SMS sending
   */
  async sendVerificationCode(phoneNumber, verificationCode) {
    if (!this.isConfigured()) {
      throw new Error('SMS service not configured. Please check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables.');
    }

    try {
      const message = `Ваш код подтверждения для MAX Messenger: ${verificationCode}\n\nКод действителен в течение 10 минут.\nНе передавайте этот код никому!`;
      
      const result = await this.client.messages.create({
        body: message,
        from: this.fromPhoneNumber,
        to: phoneNumber
      });

      return {
        success: true,
        messageSid: result.sid,
        status: result.status,
        message: 'SMS успешно отправлен'
      };
    } catch (error) {
      console.error('SMS sending error:', error);
      
      // Handle specific Twilio errors
      if (error.code === 21608) {
        throw new Error('Номер телефона не может получать SMS от этого номера');
      } else if (error.code === 21614) {
        throw new Error('Неверный формат номера телефона');
      } else if (error.code === 21211) {
        throw new Error('Номер телефона не действителен или не может получать SMS');
      } else {
        throw new Error(`Ошибка отправки SMS: ${error.message}`);
      }
    }
  }

  /**
   * Validate phone number format for Russian/Belarusian numbers
   * @param {string} phoneNumber - Phone number to validate
   * @returns {boolean} - True if valid format
   */
  validatePhoneNumber(phoneNumber) {
    // Russian numbers: +7xxxxxxxxxx (10 digits after +7)
    // Belarusian numbers: +375xxxxxxxxx (9 digits after +375)
    const russianPattern = /^\+7\d{10}$/;
    const belarusianPattern = /^\+375\d{9}$/;
    
    return russianPattern.test(phoneNumber) || belarusianPattern.test(phoneNumber);
  }

  /**
   * Format phone number for display (hide middle digits for security)
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} - Formatted phone number
   */
  formatPhoneNumberForDisplay(phoneNumber) {
    if (!phoneNumber) return '';
    
    if (phoneNumber.startsWith('+7') && phoneNumber.length === 12) {
      // Russian number: +7xxx***xx-xx
      return `${phoneNumber.slice(0, 4)}***${phoneNumber.slice(-4)}`;
    } else if (phoneNumber.startsWith('+375') && phoneNumber.length === 13) {
      // Belarusian number: +375xx***xx-xx
      return `${phoneNumber.slice(0, 6)}***${phoneNumber.slice(-4)}`;
    }
    
    return phoneNumber;
  }
}

module.exports = new SMSService();