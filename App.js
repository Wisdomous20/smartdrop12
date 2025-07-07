import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, SafeAreaView, Dimensions, Modal } from 'react-native';
import { useState, useEffect } from 'react';
import { useTOTP } from './components/TOTPGenerator';
import { SMSService } from './components/SMSService';
import ENV from './config/environment';

const { width } = Dimensions.get('window');

export default function App() {
  // Configuration States - Initialize with env vars if available
  const [semaphoreApiKey, setSemaphoreApiKey] = useState(ENV.SEMAPHORE_API_KEY || '');
  const [base32Key, setBase32Key] = useState(ENV.BASE32_SECRET_KEY || '');
  
  // SMS Provider Configuration
  const [smsProvider, setSmsProvider] = useState('mock'); // Default to mock for testing
  const [smsConfig, setSmsConfig] = useState({
    textbelt: { apiKey: 'textbelt' }, // Free tier
    twilio: { accountSid: '', authToken: '', fromNumber: '' },
    semaphore: { apiKey: semaphoreApiKey }
  });
  
  // Delivery States
  const [smartBoxId, setSmartBoxId] = useState('SMARTBOX_001'); // Default box ID
  const [riderPhone, setRiderPhone] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  
  // UI States
  const [showSettings, setShowSettings] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  
  // System States
  const [isLoading, setIsLoading] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState([]);
  const [currentTOTP, setCurrentTOTP] = useState(null);
  const [totpCountdown, setTOTPCountdown] = useState(30);
  
  // SmartBox Status - Auto-monitor default box
  const [smartBoxStatus, setSmartBoxStatus] = useState({
    batteryLevel: 0,
    isConnected: false,
    lastSync: null,
    isLocked: true,
    temperature: 25,
    humidity: 60
  });

  const { generateTOTP, isGenerating } = useTOTP();
  const [smsTestResult, setSmsTestResult] = useState(null);

  // Check if system is configured
  useEffect(() => {
    let configured = false;
    
    switch (smsProvider) {
      case 'mock':
        configured = !!(base32Key || ENV.BASE32_SECRET_KEY);
        break;
      case 'textbelt':
        configured = !!(base32Key || ENV.BASE32_SECRET_KEY); // Textbelt works with free tier
        break;
      case 'semaphore':
        configured = (semaphoreApiKey || ENV.SEMAPHORE_API_KEY) && 
                    (base32Key || ENV.BASE32_SECRET_KEY);
        break;
      default:
        configured = false;
    }
    
    setIsConfigured(configured);
  }, [smsProvider, semaphoreApiKey, base32Key, smsConfig]);

  // Auto-generate TOTP every 30 seconds when configured
  useEffect(() => {
    if (!isConfigured) return;

    const effectiveBase32Key = base32Key || ENV.BASE32_SECRET_KEY;
    if (!effectiveBase32Key.trim()) return;

    const generateCurrentTOTP = async () => {
      const code = await generateTOTP(effectiveBase32Key);
      setCurrentTOTP(code);
    };

    generateCurrentTOTP();
    const interval = setInterval(generateCurrentTOTP, 30000);
    
    return () => clearInterval(interval);
  }, [isConfigured, base32Key]);

  // Countdown timer for TOTP
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = 30 - (Math.floor(Date.now() / 1000) % 30);
      setTOTPCountdown(seconds);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Auto-monitor SmartBox status
  useEffect(() => {
    const updateStatus = () => {
      setSmartBoxStatus({
        batteryLevel: Math.floor(Math.random() * 100),
        isConnected: Math.random() > 0.1,
        lastSync: new Date().toLocaleTimeString(),
        isLocked: Math.random() > 0.3,
        temperature: 20 + Math.floor(Math.random() * 15),
        humidity: 40 + Math.floor(Math.random() * 40)
      });
    };

    updateStatus();
    const interval = setInterval(updateStatus, 10000);
    
    return () => clearInterval(interval);
  }, []);

  const sendDeliveryCode = async () => {
    if (!isConfigured) {
      Alert.alert('System Not Configured', 'Please configure the system settings first.');
      setShowSettings(true);
      return;
    }

    if (!riderPhone.trim()) {
      Alert.alert('Missing Information', 'Please enter the rider\'s phone number.');
      return;
    }

    if (!SMSService.validatePhoneNumber(riderPhone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid Philippine mobile number (e.g., 09123456789)');
      return;
    }

    setIsLoading(true);
    
    try {
      const effectiveBase32Key = base32Key || ENV.BASE32_SECRET_KEY;
      const totpCode = await generateTOTP(effectiveBase32Key);
      
      if (!totpCode) {
        throw new Error('Failed to generate access code');
      }

      const message = customMessage.trim() || 
        `SmartDrop Delivery Code: ${totpCode}\n\nBox: ${smartBoxId}\nValid for 30 seconds.\n\nPresent this code to access your delivery.`;
      
      // Get provider config
      let providerConfig = smsConfig[smsProvider];
      if (smsProvider === 'semaphore') {
        providerConfig = { apiKey: semaphoreApiKey || ENV.SEMAPHORE_API_KEY };
      }
      
      console.log('Attempting to send SMS via', smsProvider);
      const smsResult = await SMSService.sendSMS(smsProvider, providerConfig, riderPhone, message);
      
      if (!smsResult.success) {
        throw new Error(smsResult.error);
      }
      
      const delivery = {
        id: Date.now().toString(),
        code: totpCode,
        smartBoxId,
        riderPhone: SMSService.formatPhoneNumber(riderPhone),
        message,
        timestamp: new Date().toISOString(),
        messageId: smsResult.data.message_id,
        provider: smsResult.data.provider,
        status: 'sent'
      };
      
      setDeliveryHistory(prev => [delivery, ...prev.slice(0, 9)]);
      
      Alert.alert(
        'Delivery Code Sent!', 
        `Access code sent to ${riderPhone} via ${smsProvider}\n\nThe rider can now access ${smartBoxId}\n\nMessage ID: ${smsResult.data.message_id}`,
        [{ text: 'OK', onPress: () => {
          setCustomMessage('');
          setRiderPhone('');
        }}]
      );
      
    } catch (error) {
      console.error('Delivery failed:', error);
      Alert.alert('Delivery Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const testSMSConfiguration = async () => {
    setSmsTestResult('Testing...');
    
    try {
      let config = smsConfig[smsProvider];
      if (smsProvider === 'semaphore') {
        config = { apiKey: semaphoreApiKey || ENV.SEMAPHORE_API_KEY };
      }
      
      const result = await SMSService.testConfiguration(smsProvider, config);
      
      if (result.success) {
        setSmsTestResult(`✅ ${smsProvider} configuration valid`);
        let message = `${smsProvider} is configured correctly!`;
        if (result.quotaRemaining !== undefined) {
          message += `\nQuota remaining: ${result.quotaRemaining}`;
        }
        Alert.alert('SMS Configuration Test', message);
      } else {
        setSmsTestResult(`❌ ${smsProvider} configuration failed`);
        Alert.alert('SMS Configuration Test', `Failed: ${result.message}`);
      }
    } catch (error) {
      setSmsTestResult('❌ Test failed');
      Alert.alert('SMS Configuration Test', `Error: ${error.message}`);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.title}>SmartDrop</Text>
          <Text style={styles.subtitle}>Delivery Management System</Text>
        </View>
        <TouchableOpacity 
          style={styles.settingsButton} 
          onPress={() => setShowSettings(true)}
        >
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
        
        {/* System Status */}
        <View style={styles.section}>
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>System Status</Text>
                <View style={[
                  styles.statusBadge, 
                  { backgroundColor: isConfigured ? '#4CAF50' : '#ff9800' }
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {isConfigured ? 'Ready' : 'Setup Required'}
                  </Text>
                </View>
              </View>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Active Box</Text>
                <Text style={styles.statusValue}>{smartBoxId}</Text>
              </View>
            </View>
            
            <View style={styles.statusRow}>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Connection</Text>
                <View style={[
                  styles.statusBadge, 
                  { backgroundColor: smartBoxStatus.isConnected ? '#4CAF50' : '#f44336' }
                ]}>
                  <Text style={styles.statusBadgeText}>
                    {smartBoxStatus.isConnected ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
              <View style={styles.statusItem}>
                <Text style={styles.statusLabel}>Battery</Text>
                <Text style={[
                  styles.statusValue,
                  { color: smartBoxStatus.batteryLevel > 20 ? '#4CAF50' : '#f44336' }
                ]}>
                  {smartBoxStatus.batteryLevel}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Current Access Code */}
        {isConfigured && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current Access Code</Text>
            <View style={[styles.card, styles.totpCard]}>
              <View style={styles.totpDisplay}>
                <Text style={styles.totpCode}>
                  {isGenerating ? '••••••' : currentTOTP || '••••••'}
                </Text>
                <Text style={styles.totpCountdown}>
                  Refreshes in {totpCountdown} seconds
                </Text>
              </View>
              <View style={styles.totpProgress}>
                <View 
                  style={[
                    styles.totpProgressBar, 
                    { width: `${(totpCountdown / 30) * 100}%` }
                  ]} 
                />
              </View>
            </View>
          </View>
        )}

        {/* Send Delivery Code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send Delivery Code</Text>
          <View style={styles.card}>
            <TextInput
              style={styles.input}
              placeholder="Rider's Phone Number (09xxxxxxxxx)"
              value={riderPhone}
              onChangeText={setRiderPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#999"
            />
            
            <TextInput
              style={[styles.input, styles.messageInput]}
              placeholder="Custom message (optional)"
              value={customMessage}
              onChangeText={setCustomMessage}
              multiline
              numberOfLines={3}
              placeholderTextColor="#999"
            />
            
            <TouchableOpacity 
              style={[styles.primaryButton, (isLoading || !isConfigured) && styles.disabledButton]} 
              onPress={sendDeliveryCode}
              disabled={isLoading || !isConfigured}
            >
              <Text style={styles.primaryButtonText}>
                {isLoading ? 'Sending Code...' : 'Send Access Code'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent Deliveries */}
        {deliveryHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Deliveries</Text>
            <View style={styles.card}>
              {deliveryHistory.map((item) => (
                <View key={item.id} style={styles.historyItem}>
                  <View style={styles.historyHeader}>
                    <Text style={styles.historyCode}>#{item.code}</Text>
                    <Text style={styles.historyTime}>
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.historyPhone}>{item.riderPhone}</Text>
                  <Text style={styles.historyStatus}>✅ Delivered</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>System Configuration</Text>
            <TouchableOpacity 
              onPress={() => setShowSettings(false)}
              style={styles.closeButton}
            >
              <Text style={styles.closeButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.configSection}>
              <Text style={styles.configLabel}>SmartBox Configuration</Text>
              <TextInput
                style={styles.input}
                placeholder="SmartBox ID"
                value={smartBoxId}
                onChangeText={setSmartBoxId}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.configSection}>
              <Text style={styles.configLabel}>SMS Provider</Text>
              
              {/* Provider Selection */}
              <View style={styles.providerContainer}>
                {['mock', 'textbelt', 'semaphore'].map((provider) => (
                  <TouchableOpacity
                    key={provider}
                    style={[
                      styles.providerButton,
                      smsProvider === provider && styles.providerButtonActive
                    ]}
                    onPress={() => setSmsProvider(provider)}
                  >
                    <Text style={[
                      styles.providerButtonText,
                      smsProvider === provider && styles.providerButtonTextActive
                    ]}>
                      {provider.charAt(0).toUpperCase() + provider.slice(1)}
                      {provider === 'mock' && ' (Testing)'}
                      {provider === 'textbelt' && ' (Free)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Provider-specific configuration */}
              {smsProvider === 'semaphore' && (
                <TextInput
                  style={styles.input}
                  placeholder="Semaphore API Key"
                  value={semaphoreApiKey}
                  onChangeText={setSemaphoreApiKey}
                  secureTextEntry={true}
                  placeholderTextColor="#999"
                />
              )}

              {smsProvider === 'textbelt' && (
                <View>
                  <Text style={styles.providerNote}>
                    📱 Textbelt provides 1 free SMS per day. For more, get an API key from textbelt.com
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Textbelt API Key (optional - leave empty for free tier)"
                    value={smsConfig.textbelt.apiKey}
                    onChangeText={(value) => 
                      setSmsConfig(prev => ({
                        ...prev,
                        textbelt: { ...prev.textbelt, apiKey: value || 'textbelt' }
                      }))
                    }
                    placeholderTextColor="#999"
                  />
                </View>
              )}

              {smsProvider === 'mock' && (
                <Text style={styles.providerNote}>
                  🧪 Mock service simulates SMS sending for testing. Check console for "sent" messages.
                </Text>
              )}
              
              <TouchableOpacity 
                style={[styles.testButton]}
                onPress={testSMSConfiguration}
              >
                <Text style={styles.testButtonText}>Test {smsProvider} Configuration</Text>
              </TouchableOpacity>
              
              {smsTestResult && (
                <Text style={[
                  styles.testResult,
                  { color: smsTestResult.includes('✅') ? '#4CAF50' : '#f44336' }
                ]}>
                  {smsTestResult}
                </Text>
              )}
            </View>

            <View style={styles.configSection}>
              <Text style={styles.configLabel}>Security Configuration</Text>
              {ENV.BASE32_SECRET_KEY ? (
                <Text style={styles.envLabel}>✓ Secret Key loaded from environment</Text>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Base32 Encoded Secret Key"
                  value={base32Key}
                  onChangeText={setBase32Key}
                  autoCapitalize="characters"
                  placeholderTextColor="#999"
                />
              )}
            </View>

            <View style={styles.configSection}>
              <Text style={styles.configLabel}>SmartBox Status</Text>
              <View style={styles.detailedStatus}>
                <View style={styles.statusDetailRow}>
                  <Text style={styles.statusDetailLabel}>Temperature:</Text>
                  <Text style={styles.statusDetailValue}>{smartBoxStatus.temperature}°C</Text>
                </View>
                <View style={styles.statusDetailRow}>
                  <Text style={styles.statusDetailLabel}>Humidity:</Text>
                  <Text style={styles.statusDetailValue}>{smartBoxStatus.humidity}%</Text>
                </View>
                <View style={styles.statusDetailRow}>
                  <Text style={styles.statusDetailLabel}>Lock Status:</Text>
                  <Text style={[
                    styles.statusDetailValue,
                    { color: smartBoxStatus.isLocked ? '#f44336' : '#4CAF50' }
                  ]}>
                    {smartBoxStatus.isLocked ? 'Locked' : 'Unlocked'}
                  </Text>
                </View>
                <View style={styles.statusDetailRow}>
                  <Text style={styles.statusDetailLabel}>Last Sync:</Text>
                  <Text style={styles.statusDetailValue}>{smartBoxStatus.lastSync}</Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#2196F3',
    paddingVertical: 20,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#e3f2fd',
    marginTop: 4,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  settingsButtonText: {
    fontSize: 20,
  },
  scrollContainer: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusItem: {
    flex: 1,
    marginHorizontal: 4,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  totpCard: {
    backgroundColor: '#e8f5e8',
    borderColor: '#4CAF50',
    borderWidth: 1,
  },
  totpDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  totpCode: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#2e7d32',
    letterSpacing: 6,
    fontFamily: 'monospace',
  },
  totpCountdown: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  totpProgress: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  totpProgressBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 2,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  messageInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyItem: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  historyCode: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  historyTime: {
    fontSize: 12,
    color: '#666',
  },
  historyPhone: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  historyStatus: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    backgroundColor: '#2196F3',
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  closeButtonText: {
    color: '#fff',
    fontWeight: '500',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  configSection: {
    marginBottom: 24,
  },
  configLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  envLabel: {
    fontSize: 12,
    color: '#4CAF50',
    marginBottom: 8,
    fontWeight: '500',
  },
  detailedStatus: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  statusDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  statusDetailLabel: {
    fontSize: 14,
    color: '#666',
  },
  statusDetailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  testButton: {
    backgroundColor: '#ff9800',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  testButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  testResult: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '500',
  },
  providerContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  providerButton: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    marginHorizontal: 2,
    alignItems: 'center',
  },
  providerButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  providerButtonText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  providerButtonTextActive: {
    color: '#fff',
  },
  providerNote: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 8,
    padding: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
  },
});

