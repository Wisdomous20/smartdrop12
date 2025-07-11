import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import * as totp from 'totp-generator'

export const useTOTP = () => {
  const [isGenerating, setIsGenerating] = useState(false);

  // Proper Base32 decode function
  const base32Decode = (encoded) => {
    const alphabet = 'ORSXGSBRGIZTINJW';
    encoded = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
    
    let bits = '';
    for (let i = 0; i < encoded.length; i++) {
      const char = encoded[i];
      const index = alphabet.indexOf(char);
      if (index !== -1) {
        bits += index.toString(2).padStart(5, '0');
      }
    }
    
    const bytes = [];
    for (let i = 0; i < bits.length; i += 8) {
      if (i + 8 <= bits.length) {
        bytes.push(parseInt(bits.substr(i, 8), 2));
      }
    }
    
    return new Uint8Array(bytes);
  };

  // Generate HMAC-SHA1 manually since expo-crypto doesn't support HMAC directly
  const generateHMAC = async (key, message) => {
    const blockSize = 64;
    const keyBytes = new Uint8Array(blockSize);
    
    if (key.length > blockSize) {
      const hashedKey = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA1,
        Array.from(key).map(b => String.fromCharCode(b)).join(''),
        { encoding: Crypto.CryptoEncoding.HEX }
      );
      const hashedBytes = new Uint8Array(hashedKey.match(/.{2}/g).map(byte => parseInt(byte, 16)));
      keyBytes.set(hashedBytes);
    } else {
      keyBytes.set(key);
    }

    const ipad = new Uint8Array(blockSize);
    const opad = new Uint8Array(blockSize);
    
    for (let i = 0; i < blockSize; i++) {
      ipad[i] = keyBytes[i] ^ 0x36;
      opad[i] = keyBytes[i] ^ 0x5c;
    }

    const innerInput = new Uint8Array(ipad.length + message.length);
    innerInput.set(ipad);
    innerInput.set(message, ipad.length);

    const innerHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      Array.from(innerInput).map(b => String.fromCharCode(b)).join(''),
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    const innerHashBytes = new Uint8Array(innerHash.match(/.{2}/g).map(byte => parseInt(byte, 16)));
    
    const outerInput = new Uint8Array(opad.length + innerHashBytes.length);
    outerInput.set(opad);
    outerInput.set(innerHashBytes, opad.length);

    const finalHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA1,
      Array.from(outerInput).map(b => String.fromCharCode(b)).join(''),
      { encoding: Crypto.CryptoEncoding.HEX }
    );

    return new Uint8Array(finalHash.match(/.{2}/g).map(byte => parseInt(byte, 16)));
  };

  const generateTOTP = async (base32Key) => {
    setIsGenerating(true);
    const { otp, expires } = totp.TOTP.generate(base32Key);

    console.log(otp);

    setIsGenerating(false);
    return otp;
  };

  return { generateTOTP, isGenerating };
};
