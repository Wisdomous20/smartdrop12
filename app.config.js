import 'dotenv/config';

export default {
  expo: {
    name: "SmartDrop",
    slug: "smartdrop",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#2196F3"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#2196F3"
      }
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      semaphoreApiKey: process.env.SEMAPHORE_API_KEY,
      base32SecretKey: process.env.BASE32_SECRET_KEY,
    }
  }
};
