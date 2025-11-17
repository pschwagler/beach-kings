"""
User service layer for user and verification code database operations.
"""

from typing import Optional, Dict
from datetime import datetime, timedelta
from backend.database import db
import logging
import sqlite3

logger = logging.getLogger(__name__)

# Verification code expiration (in minutes)
VERIFICATION_CODE_EXPIRATION_MINUTES = 10


def create_user(
    phone_number: str,
    password_hash: str,
    name: Optional[str] = None,
    email: Optional[str] = None
) -> int:
    """
    Create a new user account.
    
    Checks if a verified user with the phone number already exists.
    Optionally cleans up old unverified accounts with the same phone.
    
    Args:
        phone_number: Phone number in E.164 format
        password_hash: Required hashed password
        name: Optional user name
        email: Optional user email
        
    Returns:
        User ID of the created user
        
    Raises:
        ValueError: If a verified user with this phone number already exists
    """
    with db.get_db() as conn:
        # Check if user already exists (unique constraint will also catch this)
        cursor = conn.execute(
            "SELECT id FROM users WHERE phone_number = ?",
            (phone_number,)
        )
        if cursor.fetchone():
            raise ValueError(f"Phone number {phone_number} is already registered")
        
        # Create new verified user (all users are verified since they're only created after verification)
        cursor = conn.execute(
            """INSERT INTO users (phone_number, password_hash, name, email, is_verified)
               VALUES (?, ?, ?, ?, 1)""",
            (phone_number, password_hash, name, email)
        )
        
        user_id = cursor.lastrowid
        # Connection will commit when context manager exits
        
        return user_id


def update_user_password(user_id: int, password_hash: str) -> bool:
    """
    Update a user's password.
    
    Args:
        user_id: User ID
        password_hash: New hashed password
        
    Returns:
        True if successful, False otherwise
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            """UPDATE users 
               SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (password_hash, user_id)
        )
        return cursor.rowcount > 0


def get_user_by_phone(phone_number: str, verified_only: bool = False) -> Optional[Dict]:
    """
    Get user by phone number.
    
    Note: All users are verified (accounts only created after verification).
    The verified_only parameter is kept for backward compatibility but has no effect.
    
    Args:
        phone_number: Phone number in E.164 format
        verified_only: Ignored (all users are verified)
        
    Returns:
        User dictionary or None if not found
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT id, phone_number, password_hash, name, email, is_verified, 
                      failed_verification_attempts, locked_until,
                      created_at, updated_at
               FROM users 
               WHERE phone_number = ?
               LIMIT 1""",
            (phone_number,)
        )
        
        row = cursor.fetchone()
        if row:
            row_dict = dict(row)
            return {
                "id": row_dict["id"],
                "phone_number": row_dict["phone_number"],
                "password_hash": row_dict["password_hash"],
                "name": row_dict["name"],
                "email": row_dict["email"],
                "is_verified": bool(row_dict["is_verified"]),
                "failed_verification_attempts": row_dict.get("failed_verification_attempts", 0) or 0,
                "locked_until": row_dict.get("locked_until"),
                "created_at": row_dict["created_at"],
                "updated_at": row_dict["updated_at"]
            }
        return None


def get_verified_user_by_phone(phone_number: str) -> Optional[Dict]:
    """
    Convenience method to get only verified user by phone number.
    
    Args:
        phone_number: Phone number in E.164 format
        
    Returns:
        Verified user dictionary or None if not found
    """
    return get_user_by_phone(phone_number, verified_only=True)


def get_user_by_email(email: str, verified_only: bool = False) -> Optional[Dict]:
    """
    Get user by email address.
    
    Args:
        email: Email address (will be normalized to lowercase)
        verified_only: If True, only return verified users
        
    Returns:
        User dictionary or None if not found
    """
    # Normalize email to lowercase for consistent lookup
    email = email.strip().lower() if email else None
    if not email:
        return None
    
    with db.get_db() as conn:
        if verified_only:
            cursor = conn.execute(
                """SELECT id, phone_number, password_hash, name, email, is_verified, 
                          failed_verification_attempts, locked_until,
                          created_at, updated_at
                   FROM users 
                   WHERE LOWER(TRIM(email)) = ? AND is_verified = 1
                   ORDER BY created_at DESC
                   LIMIT 1""",
                (email,)
            )
        else:
            cursor = conn.execute(
                """SELECT id, phone_number, password_hash, name, email, is_verified, 
                          failed_verification_attempts, locked_until,
                          created_at, updated_at
                   FROM users 
                   WHERE LOWER(TRIM(email)) = ?
                   ORDER BY is_verified DESC, created_at DESC
                   LIMIT 1""",
                (email,)
            )
        
        row = cursor.fetchone()
        if row:
            row_dict = dict(row)
            return {
                "id": row_dict["id"],
                "phone_number": row_dict["phone_number"],
                "password_hash": row_dict["password_hash"],
                "name": row_dict["name"],
                "email": row_dict["email"],
                "is_verified": bool(row_dict["is_verified"]),
                "failed_verification_attempts": row_dict.get("failed_verification_attempts", 0) or 0,
                "locked_until": row_dict.get("locked_until"),
                "created_at": row_dict["created_at"],
                "updated_at": row_dict["updated_at"]
            }
        return None


def get_verified_user_by_email(email: str) -> Optional[Dict]:
    """
    Convenience method to get only verified user by email address.
    
    Args:
        email: Email address
        
    Returns:
        Verified user dictionary or None if not found
    """
    return get_user_by_email(email, verified_only=True)


def get_user_by_id(user_id: int) -> Optional[Dict]:
    """
    Get user by ID.
    
    Args:
        user_id: User ID
        
    Returns:
        User dictionary or None if not found
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT id, phone_number, password_hash, name, email, is_verified, 
                      failed_verification_attempts, locked_until,
                      created_at, updated_at
               FROM users 
               WHERE id = ?""",
            (user_id,)
        )
        
        row = cursor.fetchone()
        if row:
            row_dict = dict(row)
            return {
                "id": row_dict["id"],
                "phone_number": row_dict["phone_number"],
                "password_hash": row_dict["password_hash"],
                "name": row_dict["name"],
                "email": row_dict["email"],
                "is_verified": bool(row_dict["is_verified"]),
                "failed_verification_attempts": row_dict.get("failed_verification_attempts", 0) or 0,
                "locked_until": row_dict.get("locked_until"),
                "created_at": row_dict["created_at"],
                "updated_at": row_dict["updated_at"]
            }
        return None




def check_phone_exists(phone_number: str, verified_only: bool = False) -> bool:
    """
    Check if a phone number exists in the system.
    
    Args:
        phone_number: Phone number in E.164 format
        verified_only: If True, only check verified users
        
    Returns:
        True if phone exists, False otherwise
    """
    user = get_user_by_phone(phone_number, verified_only=verified_only)
    return user is not None




def create_verification_code(
    phone_number: str, 
    code: str, 
    expires_in_minutes: int = VERIFICATION_CODE_EXPIRATION_MINUTES,
    password_hash: Optional[str] = None,
    name: Optional[str] = None,
    email: Optional[str] = None
) -> bool:
    """
    Create a verification code record with optional signup data.
    
    Ensures only one active code exists per phone number by deleting
    any existing unused codes before creating a new one.
    
    Args:
        phone_number: Phone number in E.164 format
        code: Verification code
        expires_in_minutes: Expiration time in minutes (default 10)
        password_hash: Optional hashed password (for signup)
        name: Optional user name (for signup)
        email: Optional user email (for signup)
        
    Returns:
        True if successful, False otherwise
    """
    try:
        expires_at = datetime.utcnow() + timedelta(minutes=expires_in_minutes)
        expires_at_str = expires_at.isoformat()
        
        with db.get_db() as conn:
            # Use a single transaction to delete old codes and insert new one
            # This reduces lock contention by minimizing the time the lock is held
            conn.execute(
                "DELETE FROM verification_codes WHERE phone_number = ? AND used = 0",
                (phone_number,)
            )
            
            # Create new code with signup data
            conn.execute(
                """INSERT INTO verification_codes 
                   (phone_number, code, expires_at, used, password_hash, name, email)
                   VALUES (?, ?, ?, 0, ?, ?, ?)""",
                (phone_number, code, expires_at_str, password_hash, name, email)
            )
            
            return True
    except sqlite3.OperationalError as e:
        if "locked" in str(e).lower():
            logger.error(f"Database locked while creating verification code for {phone_number}: {str(e)}")
        else:
            logger.error(f"Database error creating verification code: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Error creating verification code: {str(e)}")
        return False


def verify_and_mark_code_used(phone_number: str, code: str) -> Optional[Dict]:
    """
    Atomically verify a code and mark it as used, returning signup data if present.
    
    This prevents race conditions where the same code could be verified twice.
    Only marks as used if the code is valid and not expired.
    
    Args:
        phone_number: Phone number in E.164 format
        code: Verification code
        
    Returns:
        Dictionary with signup data (password_hash, name, email) if code was valid and marked as used,
        None otherwise
    """
    with db.get_db() as conn:
        # Get the code and signup data before marking as used
        cursor = conn.execute(
            """SELECT password_hash, name, email
               FROM verification_codes
               WHERE phone_number = ? 
                 AND code = ? 
                 AND used = 0
                 AND expires_at > datetime('now')""",
            (phone_number, code)
        )
        row = cursor.fetchone()
        if not row:
            return None
        
        # Extract signup data (may be None for password reset codes)
        signup_data = {
            "password_hash": row[0],
            "name": row[1],
            "email": row[2]
        }
        
        # Atomically mark as used
        cursor = conn.execute(
            """UPDATE verification_codes
               SET used = 1
               WHERE phone_number = ? 
                 AND code = ? 
                 AND used = 0
                 AND expires_at > datetime('now')""",
            (phone_number, code)
        )
        
        if cursor.rowcount > 0:
            # Return signup_data dict (even if all fields are None for password reset)
            return signup_data
        return None


# Account locking configuration
MAX_FAILED_ATTEMPTS = 5
LOCK_DURATION_MINUTES = 15


def is_account_locked(user: Dict) -> bool:
    """
    Check if a user account is currently locked.
    
    Args:
        user: User dictionary with locked_until field
        
    Returns:
        True if account is locked, False otherwise
    """
    if not user.get("locked_until"):
        return False
    
    locked_until = datetime.fromisoformat(user["locked_until"])
    if datetime.utcnow() < locked_until:
        return True
    
    # Lock has expired, clear it
    clear_account_lock(user["id"])
    return False


def increment_failed_attempts(phone_number: str) -> bool:
    """
    Increment failed verification attempts for a user.
    Locks the account if MAX_FAILED_ATTEMPTS is reached.
    
    Args:
        phone_number: Phone number in E.164 format
        
    Returns:
        True if account was locked, False otherwise
    """
    with db.get_db() as conn:
        # Get current attempts
        cursor = conn.execute(
            """SELECT id, failed_verification_attempts
               FROM users
               WHERE phone_number = ?
               ORDER BY is_verified DESC, created_at DESC
               LIMIT 1""",
            (phone_number,)
        )
        row = cursor.fetchone()
        if not row:
            return False

        row_dict = dict(row)
        user_id = row_dict["id"]
        current_attempts = row_dict.get("failed_verification_attempts", 0) or 0
        new_attempts = current_attempts + 1
        
        # Update attempts
        if new_attempts >= MAX_FAILED_ATTEMPTS:
            # Lock the account
            locked_until = datetime.utcnow() + timedelta(minutes=LOCK_DURATION_MINUTES)
            locked_until_str = locked_until.isoformat()
            conn.execute(
                """UPDATE users
                   SET failed_verification_attempts = ?,
                       locked_until = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (new_attempts, locked_until_str, user_id)
            )
            logger.warning(f"Account locked for phone {phone_number} after {new_attempts} failed attempts")
            return True
        else:
            # Just increment attempts
            conn.execute(
                """UPDATE users
                   SET failed_verification_attempts = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (new_attempts, user_id)
            )
            return False


def reset_failed_attempts(user_id: int):
    """
    Reset failed verification attempts for a user (on successful verification).
    
    Args:
        user_id: User ID
    """
    with db.get_db() as conn:
        conn.execute(
            """UPDATE users
               SET failed_verification_attempts = 0,
                   locked_until = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (user_id,)
        )


def clear_account_lock(user_id: int):
    """
    Clear an expired account lock.
    
    Args:
        user_id: User ID
    """
    with db.get_db() as conn:
        conn.execute(
            """UPDATE users
               SET locked_until = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND locked_until < datetime('now')""",
            (user_id,)
        )


# Refresh token functions

def create_refresh_token(user_id: int, token: str, expires_at: datetime) -> bool:
    """
    Create a refresh token record.
    
    Args:
        user_id: User ID
        token: Refresh token string
        expires_at: Expiration datetime
        
    Returns:
        True if successful, False otherwise
    """
    try:
        expires_at_str = expires_at.isoformat()
        with db.get_db() as conn:
            # Delete old refresh tokens for this user (single active token per user)
            conn.execute(
                "DELETE FROM refresh_tokens WHERE user_id = ?",
                (user_id,)
            )
            
            # Create new refresh token
            conn.execute(
                """INSERT INTO refresh_tokens (user_id, token, expires_at)
                   VALUES (?, ?, ?)""",
                (user_id, token, expires_at_str)
            )
            return True
    except Exception as e:
        logger.error(f"Error creating refresh token: {str(e)}")
        return False


def get_refresh_token(token: str) -> Optional[Dict]:
    """
    Get refresh token record by token string.
    
    Args:
        token: Refresh token string
        
    Returns:
        Refresh token dictionary with user_id and expires_at, or None if not found
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            """SELECT id, user_id, token, expires_at, created_at
               FROM refresh_tokens
               WHERE token = ?""",
            (token,)
        )
        row = cursor.fetchone()
        if row:
            return {
                "id": row["id"],
                "user_id": row["user_id"],
                "token": row["token"],
                "expires_at": row["expires_at"],
                "created_at": row["created_at"]
            }
        return None


def delete_refresh_token(token: str) -> bool:
    """
    Delete a refresh token (on logout or token rotation).
    
    Args:
        token: Refresh token string
        
    Returns:
        True if token was deleted, False otherwise
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM refresh_tokens WHERE token = ?",
            (token,)
        )
        return cursor.rowcount > 0


def delete_user_refresh_tokens(user_id: int) -> int:
    """
    Delete all refresh tokens for a user.
    
    Args:
        user_id: User ID
        
    Returns:
        Number of tokens deleted
    """
    with db.get_db() as conn:
        cursor = conn.execute(
            "DELETE FROM refresh_tokens WHERE user_id = ?",
            (user_id,)
        )
        return cursor.rowcount


# Password reset token functions

def create_password_reset_token(user_id: int, token: str, expires_at: datetime) -> bool:
    """
    Create a password reset token record.
    
    Args:
        user_id: User ID
        token: Reset token string
        expires_at: Expiration datetime
        
    Returns:
        True if successful, False otherwise
    """
    try:
        expires_at_str = expires_at.isoformat()
        with db.get_db() as conn:
            # Delete old unused reset tokens for this user
            conn.execute(
                "DELETE FROM password_reset_tokens WHERE user_id = ? AND used = 0",
                (user_id,)
            )
            
            # Create new reset token
            conn.execute(
                """INSERT INTO password_reset_tokens (user_id, token, expires_at, used)
                   VALUES (?, ?, ?, 0)""",
                (user_id, token, expires_at_str)
            )
            return True
    except Exception as e:
        logger.error(f"Error creating password reset token: {str(e)}")
        return False


def verify_and_use_password_reset_token(token: str) -> Optional[int]:
    """
    Verify a password reset token and mark it as used.
    
    Args:
        token: Reset token string
        
    Returns:
        User ID if token is valid and was marked as used, None otherwise
    """
    with db.get_db() as conn:
        # Get the token and verify it's valid and not expired
        cursor = conn.execute(
            """SELECT user_id
               FROM password_reset_tokens
               WHERE token = ? 
                 AND used = 0
                 AND expires_at > datetime('now')""",
            (token,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        
        user_id = row[0]
        
        # Atomically mark as used
        cursor = conn.execute(
            """UPDATE password_reset_tokens
               SET used = 1
               WHERE token = ? 
                 AND used = 0
                 AND expires_at > datetime('now')""",
            (token,)
        )
        
        if cursor.rowcount > 0:
            return user_id
        return None


