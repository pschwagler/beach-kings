# Beach Volleyball ELO - Future Enhancements

This document tracks planned features and improvements that have been deferred for future implementation.

## High Priority

### WhatsApp Automated Notifications

- [ ] **Send WhatsApp Message on Player Signup**
  - Detect when player signs up for session(s)
  - Fetch configured group ID from settings table
  - Send message via WhatsApp service
  - **Estimated Effort**: 1-2 days

### Authentication & Security

- [ ] **Session-Based Authentication for WhatsApp Endpoints**
  - Add FastAPI session middleware
  - Protect all `/api/whatsapp/*` endpoints
  - Create login/logout flow in frontend
  - Store session data securely
  - **Why**: Currently anyone who can reach the service can send messages or logout
  - **Estimated Effort**: 2-3 days
  - **Files to Modify**:
    - `backend/api/main.py` - Add session middleware
    - `backend/api/routes.py` - Add auth decorators
    - `frontend/src/components/WhatsAppPage.jsx` - Add login UI
    - Create `backend/auth/` module

### Rate Limiting

- [ ] **Add Rate Limiting to WhatsApp Endpoints**
  - Implement rate limiting for message sending
  - Prevent spam/abuse
  - Configure limits (e.g., 10 messages per minute per user)
  - **Why**: Prevent abuse and comply with WhatsApp rate limits
  - **Estimated Effort**: 1 day
  - **Dependencies**: `express-rate-limit` or FastAPI rate limiting
  - **Files to Modify**:
    - `whatsapp-service/server.js` - Add rate limiting middleware
    - `whatsapp-service/package.json` - Add dependency

## Low Priority

### Logging Improvements

- [ ] **Replace console.log with Winston Logger**
  - Install and configure Winston
  - Set up log levels (info, warn, error, debug)
  - Configure log rotation
  - Add structured logging (JSON format)
  - **Why**: Better log management, searchability, and analysis
  - **Estimated Effort**: 1 day
  - **Dependencies**: `winston`, `winston-daily-rotate-file`
  - **Files to Modify**:
    - `whatsapp-service/server.js`
    - `whatsapp-service/WhatsAppClientManager.js`
    - Create `whatsapp-service/logger.js`

### Monitoring & Observability

- [ ] **Add Metrics and Monitoring**
  - Track message send success/failure rates
  - Monitor connection uptime
  - Track QR code scan times
  - Expose metrics endpoint (Prometheus format)
  - **Dependencies**: `prom-client` for Node.js
  - **Files to Modify**:
    - `whatsapp-service/server.js` - Add metrics middleware
    - Create `whatsapp-service/metrics.js`

### Testing

- [ ] **Add Unit Tests**
  - Test WhatsAppClientManager class
  - Test API endpoints
  - Test React components
  - Set up CI/CD with test running
  - **Dependencies**: Jest, React Testing Library, Vitest
  - **Target Coverage**: 80%+

### Documentation

- [ ] **Improve API Documentation**
  - Add OpenAPI/Swagger spec for FastAPI backend
  - Document all WhatsApp service endpoints
  - Add example requests/responses
  - Create API usage guide

- [ ] **Add User Guide**
  - How to connect WhatsApp
  - How to send messages
  - Troubleshooting guide
  - FAQ section

### Features

- [ ] **Message Templates**
  - Create reusable message templates
  - Variables/placeholders in messages
  - Save favorite messages
  - **Use Case**: Quickly send common announcements

- [ ] **Scheduled Messages**
  - Schedule messages for future delivery
  - Recurring messages (daily/weekly reminders)
  - **Dependencies**: Background job queue (e.g., Bull, node-cron)

- [ ] **Message History**
  - Store sent message history
  - Search through sent messages
  - Track delivery status
  - **Dependencies**: Database for storage

- [ ] **Multiple Group Support**
  - Select multiple groups for broadcast
  - Group favorites/quick access
  - Group search/filter

- [ ] **Rich Media Support**
  - Send images
  - Send documents/PDFs
  - Send location
  - **Note**: WhatsApp Web.js supports this

## Completed Refactoring (✓)

- [x] Create WhatsAppClientManager class to encapsulate state
- [x] Remove initialization side effect from GET /status endpoint
- [x] Fix race conditions with proper singleton pattern
- [x] Add timeouts to all httpx requests in routes.py
- [x] Fix React stale closures with useRef and useCallback
- [x] Switch frontend to always proxy through backend
- [x] Create proxy helper function in routes.py
- [x] Add health monitoring endpoint
- [x] Document Railway volume setup
- [x] Extract PORT configuration to environment variable

## Notes

- **Priority**: High = needed soon, Medium = nice to have, Low = future consideration
- **Effort**: Rough estimates, may vary based on complexity and requirements
- **Dependencies**: External packages that need to be installed

## Contributing

When picking up a TODO item:
1. Create a feature branch
2. Update this file to mark the item as "In Progress"
3. Implement the feature with tests
4. Update documentation
5. Create a pull request
6. Mark as completed once merged

## Questions?

If you have questions about any of these items, please:
- Open a GitHub issue
- Tag it with the appropriate label (enhancement, documentation, etc.)
- Reference this TODO file
