import { cleanupTestUsers, getVerificationCode } from '../fixtures/db.js';
import { sendVerificationCode } from '../fixtures/api.js';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Generates a valid US phone number in E.164 format for testing.
 * 
 * The generated number is guaranteed to pass validation using libphonenumber-js,
 * which uses the same validation rules as the Python phonenumbers library used
 * in the backend (phonenumbers.is_valid_number(phonenumbers.parse(phone, 'US'))).
 * 
 * Strategy:
 * - Uses known valid US area codes to avoid generating invalid numbers
 * - Uses valid exchange codes (2XX where X != 1)
 * - Generates random subscriber numbers
 * - Validates each generated number before returning
 * 
 * @returns {string} A valid E.164 format phone number (e.g., "+12025551234")
 * 
 * @example
 * const phone = generateTestPhoneNumber();
 * // Returns: "+12025551234" (valid and unique)
 */
export function generateTestPhoneNumber() {
  /**
   * Generates a random digit in the range [min, max] (inclusive)
   */
  const randomDigit = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  
  /**
   * List of known valid US area codes (common ones to avoid generating invalid numbers)
   * These are guaranteed to be valid US area codes
   */
  const validUSAreaCodes = [
    '202', '203', '205', '206', '207', '208', '209', '210', '212', '213',
    '214', '215', '216', '217', '218', '219', '224', '225', '227', '228',
    '229', '231', '234', '239', '240', '248', '251', '252', '253', '254',
    '256', '260', '262', '267', '269', '270', '272', '274', '276', '279',
    '281', '283', '284', '289', '301', '302', '303', '304', '305', '307',
    '308', '309', '310', '312', '313', '314', '315', '316', '317', '318',
    '319', '320', '321', '323', '325', '326', '327', '330', '331', '332',
    '334', '336', '337', '339', '340', '341', '343', '345', '346', '347',
    '351', '352', '360', '361', '364', '380', '385', '386', '401', '402',
    '403', '404', '405', '406', '407', '408', '409', '410', '412', '413',
    '414', '415', '417', '418', '419', '423', '424', '425', '430', '432',
    '434', '435', '440', '442', '443', '445', '447', '448', '458', '463',
    '464', '469', '470', '472', '473', '474', '475', '478', '479', '480',
    '484', '501', '502', '503', '504', '505', '507', '508', '509', '510',
    '512', '513', '515', '516', '517', '518', '520', '521', '522', '523',
    '524', '525', '526', '527', '528', '529', '530', '531', '534', '539',
    '540', '541', '551', '557', '559', '561', '562', '563', '564', '567',
    '570', '571', '572', '573', '574', '575', '580', '582', '585', '586',
    '587', '601', '602', '603', '605', '606', '607', '608', '609', '610',
    '612', '613', '614', '615', '616', '617', '618', '619', '620', '623',
    '626', '628', '629', '630', '631', '636', '640', '641', '645', '646',
    '647', '649', '650', '651', '656', '657', '658', '659', '660', '661',
    '662', '667', '669', '670', '671', '672', '678', '679', '680', '681',
    '682', '684', '689', '701', '702', '703', '704', '706', '707', '708',
    '712', '713', '714', '715', '716', '717', '718', '719', '720', '721',
    '724', '725', '726', '727', '728', '729', '730', '731', '732', '733',
    '734', '737', '740', '743', '747', '754', '757', '760', '762', '763',
    '764', '765', '767', '769', '770', '771', '772', '773', '774', '775',
    '779', '781', '784', '785', '786', '787', '801', '802', '803', '804',
    '805', '806', '807', '808', '810', '812', '813', '814', '815', '816',
    '817', '818', '820', '828', '830', '831', '832', '838', '839', '840',
    '843', '845', '847', '848', '850', '851', '854', '856', '857', '858',
    '859', '860', '862', '863', '864', '865', '870', '872', '873', '878',
    '901', '903', '904', '906', '907', '908', '909', '910', '912', '913',
    '914', '915', '916', '917', '918', '919', '920', '925', '927', '928',
    '929', '930', '931', '934', '936', '937', '938', '940', '941', '947',
    '948', '949', '951', '952', '954', '956', '957', '959', '970', '971',
    '972', '973', '975', '978', '979', '980', '984', '985', '986', '989'
  ];
  
  /**
   * Generates a valid exchange code (first digit 2-9, second digit 0-9, third digit 0-9)
   * Excludes N11 codes (211, 311, 411, etc.)
   */
  const generateExchangeCode = () => {
    const first = randomDigit(2, 9); // 2-9
    let second = randomDigit(0, 9);
    let third = randomDigit(0, 9);
    
    // Avoid N11 codes (211, 311, 411, 511, 611, 711, 811, 911)
    if (second === 1 && third === 1) {
      third = randomDigit(0, 9);
      if (third === 1) {
        third = (third + 1) % 10; // Ensure it's not 1
      }
    }
    
    return `${first}${second}${third}`;
  };
  
  const MAX_ATTEMPTS = 50;
  
  // Generate and validate phone numbers using known valid US area codes
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Pick a random valid US area code
    const areaCode = validUSAreaCodes[Math.floor(Math.random() * validUSAreaCodes.length)];
    const exchange = generateExchangeCode();
    const subscriber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    const phoneNumber = `+1${areaCode}${exchange}${subscriber}`;
    
    // Validate using libphonenumber-js (same validation as Python phonenumbers)
    try {
      if (isValidPhoneNumber(phoneNumber, 'US')) {
        const parsed = parsePhoneNumber(phoneNumber, 'US');
        if (parsed?.isValid()) {
          return phoneNumber;
        }
      }
    } catch (error) {
      // Continue to next attempt if validation fails
      continue;
    }
  }
  
  // Fallback: Use a known valid pattern if random generation fails
  // Area code 202 (Washington DC) with exchange 555 and random subscriber
  const fallbackArea = '202';
  const fallbackExchange = '555';
  const fallbackSubscriber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  const fallbackNumber = `+1${fallbackArea}${fallbackExchange}${fallbackSubscriber}`;
  
  // Final validation
  if (!isValidPhoneNumber(fallbackNumber, 'US')) {
    throw new Error(
      `Failed to generate valid test phone number after ${MAX_ATTEMPTS} attempts. ` +
      'This may indicate an issue with the phone number validation library.'
    );
  }
  
  return fallbackNumber;
}

/**
 * Clean up test data for a specific phone number
 */
export async function cleanupTestData(phoneNumber) {
  await cleanupTestUsers(phoneNumber);
}

/**
 * Get verification code from database (for testing)
 * In a real scenario, this would come from SMS, but for tests we can query the DB
 * 
 * This function ensures we get a fresh, unused verification code.
 * If no unused code exists, it will wait a bit and retry (in case of timing issues).
 */
export async function getVerificationCodeForPhone(phoneNumber, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Try to get an unused code from database
    let code = await getVerificationCode(phoneNumber);
    
    if (code) {
      return code;
    }
    
    // If no unused code exists and this is the first attempt, send a new one
    if (attempt === 0) {
      await sendVerificationCode(phoneNumber);
      // Wait a bit for the code to be stored in the database
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      // On retries, wait a bit longer
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  // If we still don't have a code after retries, throw an error
  throw new Error(`Failed to retrieve verification code for ${phoneNumber} after ${maxRetries} attempts`);
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Clear browser storage (localStorage, sessionStorage, cookies) for test isolation
 * Call this in beforeEach to ensure each test starts with a clean state
 * 
 * This function clears cookies and storage. If the page has an origin, it clears
 * localStorage/sessionStorage. If not, only cookies are cleared (which is the
 * main source of authentication state).
 */
export async function clearBrowserStorage(page) {
  // Clear cookies (works without navigation - main source of auth state)
  const context = page.context();
  await context.clearCookies();
  
  // Try to clear localStorage and sessionStorage if page already has an origin
  // Don't navigate here - let each test navigate on its own to avoid double navigation
  const currentUrl = page.url();
  if (currentUrl && currentUrl !== 'about:blank' && !currentUrl.startsWith('data:')) {
    try {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
    } catch (error) {
      // SecurityError can happen if page doesn't have proper origin
      // Cookies are already cleared which is sufficient for test isolation
    }
  }
}

/**
 * Format phone number for input (E.164 to US format)
 * Converts +15551234567 to (555) 123-4567 format expected by PhoneInput component
 */
export function formatPhoneForInput(phoneNumber) {
  // Remove all non-digits
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Handle E.164 format (+1...)
  let digits = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    digits = cleaned.slice(1); // Remove country code
  }
  
  // Format as (XXX) XXX-XXXX
  if (digits.length === 10) {
    const area = digits.slice(0, 3);
    const first = digits.slice(3, 6);
    const second = digits.slice(6);
    return `(${area}) ${first}-${second}`;
  }
  
  // If not 10 digits, return as-is (component will handle validation)
  return phoneNumber;
}

/**
 * Authenticate a user via API and return the token
 * This is useful for setting up test data that requires authentication
 */
export async function authenticateUser(phoneNumber, password) {
  const { loginWithPassword } = await import('../fixtures/api.js');
  const response = await loginWithPassword(phoneNumber, password);
  return response.access_token;
}

/**
 * Complete a test user's player profile via API.
 * This prevents the "Complete Your Profile" modal from blocking e2e tests.
 * Should be called after user creation/verification and authentication.
 *
 * @param {string} token - Auth token from authenticateUser()
 * @param {object} [profileData] - Optional overrides for profile fields
 */
export async function completeTestUserProfile(token, profileData = {}) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);

  const defaultProfile = {
    gender: 'male',
    level: 'intermediate',
    city: 'San Diego',
    state: 'CA',
    ...profileData,
  };

  const response = await api.put('/api/users/me/player', defaultProfile);
  return response.data;
}

/**
 * Create a test league via API (requires authentication token)
 * Note: The user who creates the league should automatically be added as an admin member
 */
export async function createTestLeague(token, leagueData = {}) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);
  
  const defaultLeagueData = {
    name: leagueData.name || `Test League ${Date.now()}`,
    description: leagueData.description || 'Test league description',
    is_open: leagueData.is_open !== undefined ? leagueData.is_open : true,
    ...leagueData
  };
  
  const response = await api.post('/api/leagues', defaultLeagueData);
  const league = response.data;
  
  // Wait a moment for the backend to process the league creation and add the creator as admin
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return league;
}

/**
 * Create a test season for a league via API (requires authentication token)
 */
export async function createTestSeason(token, leagueId, seasonData = {}) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);
  
  // Default to yesterday for start_date (to ensure it includes today), and one year from now for end_date
  // This avoids timezone issues where today might not match exactly
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const oneYearLater = new Date();
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  
  const defaultSeasonData = {
    name: seasonData.name || `Test Season ${Date.now()}`,
    start_date: seasonData.start_date || yesterday.toISOString().split('T')[0],
    // end_date is required, so provide a default if not specified
    end_date: seasonData.end_date !== undefined ? seasonData.end_date : oneYearLater.toISOString().split('T')[0],
    ...seasonData
  };
  
  // Remove is_active if it was passed - it's computed by the API based on date ranges
  delete defaultSeasonData.is_active;
  
  const response = await api.post(`/api/leagues/${leagueId}/seasons`, defaultSeasonData);
  return response.data;
}

/**
 * Add a player to a league via API (requires authentication token)
 * First creates/gets the player by name, then adds them to the league
 */
export async function addPlayerToLeague(token, leagueId, playerName) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);
  
  // First, create/get the player by name
  const playerResponse = await api.post('/api/players', {
    name: playerName
  });
  const playerId = playerResponse.data.player_id;
  
  // Then add the player to the league
  const response = await api.post(`/api/leagues/${leagueId}/members`, {
    player_id: playerId,
    role: 'member'
  });
  return response.data;
}

/**
 * Create a pickup (non-league) session via API (requires authentication token)
 * Returns the session object with code for shareable link
 */
export async function createPickupSession(token, sessionData = {}) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);

  const defaultSessionData = {
    name: sessionData.name || `Pickup Session ${Date.now()}`,
    ...sessionData
  };

  try {
    const response = await api.post('/api/sessions', defaultSessionData);
    // The API returns { status: "success", session: {...} }
    return response.data.session || response.data;
  } catch (error) {
    if (error.response) {
      console.error('Pickup session creation failed:', {
        status: error.response.status,
        data: error.response.data,
        sessionData: defaultSessionData
      });
    }
    throw error;
  }
}

/**
 * Invite a player to a session via API (requires authentication token)
 */
export async function invitePlayerToSession(token, sessionId, playerId) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);

  const response = await api.post(`/api/sessions/${sessionId}/invite`, {
    player_id: playerId
  });
  return response.data;
}

/**
 * Create a test session for a league via API (requires authentication token)
 */
export async function createTestSession(token, leagueId, sessionData = {}) {
  const { createApiClient } = await import('../fixtures/api.js');
  const api = createApiClient(token);
  
  // Format date as MM/DD/YYYY (not ISO format)
  // Python backend expects date without leading zeros in format: M/D/YYYY
  const formatDate = (date) => {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    // No leading zeros - Python backend uses %-m/%-d/%Y
    return `${month}/${day}/${year}`;
  };
  
  // If date is provided and in ISO format, convert it
  let sessionDate = sessionData.date;
  if (sessionDate && sessionDate.includes('T')) {
    // ISO format - convert to MM/DD/YYYY
    sessionDate = formatDate(new Date(sessionDate));
  } else if (!sessionDate) {
    sessionDate = formatDate(new Date());
  }
  
  const defaultSessionData = {
    date: sessionDate,
    ...sessionData
  };
  
  // Remove undefined/null values (but keep date and name even if undefined)
  Object.keys(defaultSessionData).forEach(key => {
    if (defaultSessionData[key] === undefined || defaultSessionData[key] === null) {
      // Only remove if it's season_id - date and name can be omitted
      if (key === 'season_id') {
        delete defaultSessionData[key];
      }
    }
  });
  
  try {
    const response = await api.post(`/api/leagues/${leagueId}/sessions`, defaultSessionData);
    // The API returns { status: "success", session: {...} }, so return the session object
    return response.data.session || response.data;
  } catch (error) {
    // Log the error for debugging
    if (error.response) {
      console.error('Session creation failed:', {
        status: error.response.status,
        data: error.response.data,
        leagueId,
        sessionData: defaultSessionData
      });
    }
    throw error;
  }
}
