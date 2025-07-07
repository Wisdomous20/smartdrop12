import Constants from 'expo-constants';

const ENV = {
  development: {
    SEMAPHORE_API_KEY: Constants.expoConfig?.extra?.semaphoreApiKey || '',
    BASE32_SECRET_KEY: Constants.expoConfig?.extra?.base32SecretKey || '',
  },
  production: {
    SEMAPHORE_API_KEY: Constants.expoConfig?.extra?.semaphoreApiKey || '',
    BASE32_SECRET_KEY: Constants.expoConfig?.extra?.base32SecretKey || '',
  }
};

const getEnvVars = (env = Constants.expoConfig?.releaseChannel) => {
  if (__DEV__) {
    return ENV.development;
  } else {
    return ENV.production;
  }
};

export default getEnvVars();
