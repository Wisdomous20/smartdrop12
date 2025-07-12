import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Alert, ScrollView, SafeAreaView, Dimensions, Modal } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useTOTP } from './components/TOTPGenerator';
import * as SMS from 'expo-sms';
import ENV from './config/environment';

const { width } = Dimensions.get('window');

export default function App() {
  // Configuration States - Initialize with env vars if available
  const [base32Key, setBase32Key] = useState(ENV.BASE32_SECRET_KEY || '');
  const timer = useRef(null);
  const [refresh, setRefresh] = useState(0);
  
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
  const [smsAvailable, setSmsAvailable] = useState(false);

  // Check if system is configured and SMS is available
  useEffect(() => {
    const checkConfiguration = async () => {
      const configured = !!(base32Key || ENV.BASE32_SECRET_KEY);
      const available = await SMS.isAvailableAsync();
      
      setIsConfigured(configured && available);
      setSmsAvailable(available);
    };
    
    checkConfiguration();
  }, [base32Key]);

  // Auto-generate TOTP every 30 seconds when configured
  useEffect(() => {
    if (!isConfigured) return;

    const effectiveBase32Key = base32Key || ENV.BASE32_SECRET_KEY;
    if (!effectiveBase32Key.trim()) return;

    generateTOTP(effectiveBase32Key)
      .then(k => {
        setCurrentTOTP(k);
      });
  }, [isConfigured, base32Key, refresh]);

  // Countdown timer for TOTP
  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = 30 - (Math.floor(Date.now() / 1000) % 30);
      setRefresh(l => l + 1);
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

  // Helper function to validate Philippine phone numbers
  const validatePhoneNumber = (phone) => {
    const phoneRegex = /^(09|\+639)\d{9}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  // Helper function to format Philippine phone numbers
  const formatPhoneNumber = (phone) => {
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.startsWith('+63')) {
      return cleanPhone;
    }
    if (cleanPhone.startsWith('09')) {
      return '+63' + cleanPhone.slice(1);
    }
    return cleanPhone;
  };

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

    if (!validatePhoneNumber(riderPhone)) {
      Alert.alert('Invalid Phone Number', 'Please enter a valid Philippine mobile number (e.g., 09123456789)');
      return;
    }

    if (!smsAvailable) {
      Alert.alert('SMS Not Available', 'SMS is not available on this device.');
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
      
      const formattedPhone = formatPhoneNumber(riderPhone);
      
      console.log('Sending SMS via Expo SMS to:', formattedPhone);
      
      // Send SMS using Expo SMS
      const result = await SMS.sendSMSAsync([formattedPhone], message);
      
      if (result.result === 'sent') {
        const delivery = {
          id: Date.now().toString(),
          code: totpCode,
          smartBoxId,
          riderPhone: formattedPhone,
          message,
          timestamp: new Date().toISOString(),
          messageId: 'expo_sms_' + Date.now(),
          provider: 'expo-sms',
          status: 'sent'
        };
        
        setDeliveryHistory(prev => [delivery, ...prev.slice(0, 9)]);
        
        Alert.alert(
          'SMS Sent!', 
          `Access code sent to ${formattedPhone}\n\nThe rider can now access ${smartBoxId}`,
          [{ text: 'OK', onPress: () => {
            setCustomMessage('');
            setRiderPhone('');
          }}]
        );
      } else {
        Alert.alert('SMS Cancelled', 'SMS sending was cancelled by the user.');
      }
      
    } catch (error) {
      console.error('SMS failed:', error);
      Alert.alert('SMS Failed', error.message || 'An error occurred while sending SMS');
    } finally {
      setIsLoading(false);
    }
  };

  const testSMSConfiguration = async () => {
    try {
      const available = await SMS.isAvailableAsync();
      if (available) {
        Alert.alert('SMS Test', 'SMS is available on this device and ready to use!');
      } else {
        Alert.alert('SMS Test', 'SMS is not available on this device.');
      }
    } catch (error) {
      Alert.alert('SMS Test', `Error checking SMS availability: ${error.message}`);
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
              <Text style={styles.configLabel}>SMS Configuration</Text>
              
              <Text style={styles.providerNote}>
                📱 Using Expo SMS - Opens device's SMS app for manual sending
              </Text>
              
              <TouchableOpacity 
                style={[styles.testButton]}
                onPress={testSMSConfiguration}
              >
                <Text style={styles.testButtonText}>Test SMS Configuration</Text>
              </TouchableOpacity>
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

