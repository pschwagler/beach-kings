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
 * This function is idempotent - if the user already exists, it will return successfully
 * without throwing an error. This makes tests more resilient to parallel execution and
 * cleanup timing issues.
 */
export async function createTestUser({ phoneNumber, password, fullName, email }) {
  const api = createApiClient();
  try {
    const response = await api.post('/api/auth/signup', {
      phone_number: phoneNumber,
      password,
      full_name: fullName,
      email,
    });
    return response.data;
  } catch (error) {
    // If user already exists (400 error), that's okay - return a success-like response
    // This makes the function idempotent and prevents flaky tests
    if (error.response?.status === 400) {
      const errorDetail = error.response?.data?.detail || '';
      // Check if the error is about user already existing
      if (typeof errorDetail === 'string' && 
          (errorDetail.toLowerCase().includes('already') || 
           errorDetail.toLowerCase().includes('exists') ||
           errorDetail.toLowerCase().includes('registered'))) {
        // User already exists - return a mock response to indicate "success"
        // The test can continue as if the user was just created
        return {
          phone_number: phoneNumber,
          message: 'User already exists (idempotent create)'
        };
      }
    }
    // Re-throw other errors (network errors, validation errors, etc.)
    throw error;
  }
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

