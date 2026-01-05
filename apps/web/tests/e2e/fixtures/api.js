import axios from 'axios';

const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:8001';


/**
 * Create an API client for test setup
 */
export function createApiClient(token = null) {
  const client = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  return client;
}

/**
 * Create a test user via API
 */
export async function createTestUser({ phoneNumber, password, fullName, email }) {
  const api = createApiClient();
  const response = await api.post('/api/auth/signup', {
    phone_number: phoneNumber,
    password,
    full_name: fullName,
    email,
  });
  return response.data;
}

/**
 * Send verification code for a phone number
 */
export async function sendVerificationCode(phoneNumber) {
  const api = createApiClient();
  const response = await api.post('/api/auth/send-verification', {
    phone_number: phoneNumber,
  });
  return response.data;
}

/**
 * Login with password
 */
export async function loginWithPassword(phoneNumber, password) {
  const api = createApiClient();
  const response = await api.post('/api/auth/login', {
    phone_number: phoneNumber,
    password,
  });
  return response.data;
}

/**
 * Login with SMS code
 */
export async function loginWithSms(phoneNumber, code) {
  const api = createApiClient();
  const response = await api.post('/api/auth/sms-login', {
    phone_number: phoneNumber,
    code,
  });
  return response.data;
}

/**
 * Verify phone number with code
 */
export async function verifyPhone(phoneNumber, code) {
  const api = createApiClient();
  try {
    const response = await api.post('/api/auth/verify-phone', {
      phone_number: phoneNumber,
      code,
    });
    return response.data;
  } catch (error) {
    // Log the actual error for debugging
    if (error.response) {
      console.error('verifyPhone error:', {
        status: error.response.status,
        data: error.response.data,
        phoneNumber,
        code: code ? '***' : 'missing'
      });
    }
    throw error;
  }
}

/**
 * Get current user (requires authentication)
 */
export async function getCurrentUser(token) {
  const api = createApiClient(token);
  const response = await api.get('/api/auth/me');
  return response.data;
}

