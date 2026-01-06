# Security TODOs

This document tracks security improvements that should be implemented in the future.

## Database Transaction Safety

**Priority**: Medium  
**Status**: TODO

Review and ensure atomic operations in the following functions:

- `verify_user_phone()` in `backend/services/user_service.py`
  - Currently performs multiple operations (check for existing verified user, delete unverified accounts, mark user as verified)
  - Should ensure all operations are in a single transaction
  - Consider using explicit transaction boundaries

- `increment_failed_attempts()` in `backend/services/user_service.py`
  - Performs read-then-write operation
  - Could have race conditions if multiple requests come in simultaneously
  - Consider using atomic UPDATE with increment

- `create_refresh_token()` in `backend/services/user_service.py`
  - Deletes old tokens then creates new one
  - Should be atomic to prevent multiple active tokens

**Recommendation**: Review all database operations that involve multiple steps and ensure they're properly wrapped in transactions. Consider using database-level constraints and atomic operations where possible.

## Input Validation

**Priority**: High  
**Status**: TODO

Add comprehensive input validation using Pydantic validators:

### Phone Numbers
- Already using `phonenumbers` library for normalization
- Add Pydantic validator to ensure phone numbers are validated before processing
- Consider adding to `SignupRequest`, `LoginRequest`, `SMSLoginRequest`, etc.

### Passwords
- Add minimum length requirement (e.g., 8 characters)
- Consider adding complexity requirements (optional)
- Add Pydantic validator to `SignupRequest` and `LoginRequest`

### Email Addresses
- Use Pydantic's `EmailStr` type (already imported in some places)
- Add validation to `SignupRequest`

### Verification Codes
- Validate format (6 digits)
- Add Pydantic validator to `VerifyPhoneRequest` and `SMSLoginRequest`

**Example Implementation**:
```python
from pydantic import validator, EmailStr

class SignupRequest(BaseModel):
    phone_number: str
    password: Optional[str] = None
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    
    @validator('phone_number')
    def validate_phone(cls, v):
        normalized = auth_service.normalize_phone_number(v)
        return normalized
    
    @validator('password')
    def validate_password(cls, v):
        if v and len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v
```

## Security Event Logging

**Priority**: Medium  
**Status**: TODO

Implement comprehensive security event logging for:

### Failed Login Attempts
- Log phone number (hashed or masked for privacy)
- Log IP address
- Log timestamp
- Log reason (invalid password, invalid code, account locked, etc.)

### Successful Logins
- Log user ID
- Log IP address
- Log timestamp
- Log authentication method (password vs SMS)

### Account Locks
- Log when account is locked
- Log phone number
- Log number of failed attempts
- Log lock duration

### SMS Send Failures
- Log phone number (masked)
- Log failure reason
- Log timestamp

### Token Refresh Events
- Log successful token refreshes
- Log failed refresh attempts
- Log user ID

**Recommendation**: 
- Use structured logging (JSON format)
- Consider using a separate log file for security events
- Implement log rotation
- Consider sending critical security events to an alerting system
- Ensure logs don't contain sensitive information (passwords, full tokens)

**Example Implementation**:
```python
import logging

security_logger = logging.getLogger("security")

def log_failed_login(phone_number: str, reason: str, ip_address: str):
    security_logger.warning(
        "Failed login attempt",
        extra={
            "event": "failed_login",
            "phone_number": mask_phone(phone_number),
            "reason": reason,
            "ip_address": ip_address,
            "timestamp": datetime.utcnow().isoformat()
        }
    )
```

## Additional Security Considerations

### Rate Limiting Improvements
- Consider per-phone-number rate limiting in addition to IP-based
- Implement progressive delays for repeated failures
- Consider using Redis for distributed rate limiting in production

### Token Security
- Consider implementing token rotation (invalidate old refresh token when issuing new one)
- Consider adding device fingerprinting for additional security
- Implement token revocation endpoint

### Password Security
- Consider implementing password strength requirements
- Consider adding password history to prevent reuse
- Consider implementing password reset flow

### Session Management
- Consider implementing session tracking
- Consider adding "logout all devices" functionality
- Consider implementing session timeout

### Monitoring and Alerting
- Set up monitoring for unusual patterns (e.g., many failed attempts from same IP)
- Alert on account lock events
- Monitor SMS send failures
- Track authentication success/failure rates
