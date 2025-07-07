import ENV from '../config/environment';

export const SMSService = {
  // Mock SMS service for testing
  async sendMockSMS(phoneNumber, message) {
    console.log('=== MOCK SMS SERVICE ===');
    console.log('To:', phoneNumber);
    console.log('Message:', message);
    console.log('========================');
    
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    return {
      success: true,
      data: {
        message_id: 'MOCK_' + Date.now(),
        status: 'sent',
        provider: 'mock'
      }
    };
  },

  // Twilio SMS (has free trial credits)
  async sendTwilioSMS(accountSid, authToken, fromNumber, phoneNumber, message) {
    try {
      const auth = btoa(`${accountSid}:${authToken}`);
      
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: phoneNumber,
          Body: message,
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        return {
          success: true,
          data: {
            message_id: result.sid,
            status: result.status,
            provider: 'twilio'
          }
        };
      } else {
        throw new Error(result.message || 'Twilio SMS failed');
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Textbelt SMS (free with limited usage)
  async sendTextbeltSMS(phoneNumber, message, apiKey = 'textbelt') {
    try {
      const response = await fetch('https://textbelt.com/text', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phoneNumber,
          message: message,
          key: apiKey, // 'textbelt' for free (1 SMS per day), or your paid key
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        return {
          success: true,
          data: {
            message_id: result.textId || 'textbelt_' + Date.now(),
            status: 'sent',
            provider: 'textbelt',
            quotaRemaining: result.quotaRemaining
          }
        };
      } else {
        throw new Error(result.error || 'Textbelt SMS failed');
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Original Semaphore SMS
  async sendSemaphoreSMS(apiKey, phoneNumber, message) {
    const effectiveApiKey = apiKey || ENV.SEMAPHORE_API_KEY;
    
    if (!effectiveApiKey) {
      throw new Error('Semaphore API key is required');
    }

    try {
      const formData = new FormData();
      formData.append('apikey', effectiveApiKey);
      formData.append('number', phoneNumber);
      formData.append('message', message);

      const response = await fetch('https://api.semaphore.co/api/v4/messages', {
        method: 'POST',
        body: formData,
        headers: {
          'Accept': 'application/json',
        },
      });

      const responseText = await response.text();
      let result;
      
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid response format: ${responseText}`);
      }

      if (response.ok && (result.status === 'success' || result.message_id)) {
        return {
          success: true,
          data: {
            message_id: result.message_id || 'semaphore_' + Date.now(),
            status: result.status || 'sent',
            provider: 'semaphore'
          }
        };
      } else {
        throw new Error(result.message || result.error || 'Semaphore SMS failed');
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  // Main SMS sending function with provider selection
  async sendSMS(provider, config, phoneNumber, message) {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);
    
    console.log(`Sending SMS via ${provider} to ${formattedPhone}`);
    
    switch (provider) {
      case 'mock':
        return await this.sendMockSMS(formattedPhone, message);
        
      case 'textbelt':
        return await this.sendTextbeltSMS(formattedPhone, message, config.apiKey);
        
      case 'twilio':
        return await this.sendTwilioSMS(
          config.accountSid,
          config.authToken,
          config.fromNumber,
          formattedPhone,
          message
        );
        
      case 'semaphore':
        return await this.sendSemaphoreSMS(config.apiKey, formattedPhone, message);
        
      default:
        throw new Error('Unsupported SMS provider');
    }
  },

  formatPhoneNumber(phone) {
    // Convert to proper format for Philippines
    let formatted = phone.replace(/\D/g, '');
    if (formatted.startsWith('0')) {
      formatted = '63' + formatted.substring(1);
    } else if (!formatted.startsWith('63')) {
      formatted = '63' + formatted;
    }
    return '+' + formatted;
  },

  validatePhoneNumber(phone) {
    const formatted = this.formatPhoneNumber(phone).replace('+', '');
    return /^639\d{9}$/.test(formatted);
  },

  // Test configurations for different providers
  async testConfiguration(provider, config) {
    try {
      switch (provider) {
        case 'mock':
          return { success: true, message: 'Mock service is always available' };
          
        case 'textbelt':
          // Test with a simple API call
          const response = await fetch('https://textbelt.com/text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: '+639171234567', // Test number
              message: 'Test',
              key: config.apiKey || 'textbelt'
            }),
          });
          const result = await response.json();
          return { 
            success: !!result.quotaRemaining || result.success, 
            message: result.error || 'Configuration valid',
            quotaRemaining: result.quotaRemaining
          };
          
        case 'semaphore':
          // Original semaphore test
          const semResponse = await fetch('https://api.semaphore.co/api/v4/account', {
            headers: { 'Authorization': `Bearer ${config.apiKey}` },
          });
          return { 
            success: semResponse.ok, 
            message: semResponse.ok ? 'Valid API key' : 'Invalid API key'
          };
          
        default:
          return { success: false, message: 'Unknown provider' };
      }
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
};
