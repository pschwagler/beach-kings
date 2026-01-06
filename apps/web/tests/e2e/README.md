# E2E Testing Guide

## Running Tests

### Run All Tests
```bash
npm run test:e2e
```

### Run Specific Test File
```bash
# Run all tests in a specific file
npm run test:e2e -- tests/e2e/auth/signup.spec.js

# Or use the shorthand
npm run test:e2e:file -- tests/e2e/auth/signup.spec.js
```

### Run Tests Matching a Pattern
```bash
# Run tests with "login" in the name
npm run test:e2e -- --grep "login"

# Run tests with "should handle existing user" in the name
npm run test:e2e -- --grep "should handle existing user gracefully"

# Or use the shorthand
npm run test:e2e:grep -- "should handle existing user gracefully"
```

### Run Specific Test by Line Number
```bash
# Run test at line 310 in signup.spec.js
npm run test:e2e -- tests/e2e/auth/signup.spec.js:310
```

### Run Tests in UI Mode (Interactive)
```bash
npm run test:e2e:ui
```
This opens Playwright's UI where you can:
- Select specific tests to run
- Watch tests execute
- Debug tests interactively

### Run Tests in Debug Mode
```bash
npm run test:e2e:debug
```
Opens Playwright Inspector for step-by-step debugging.

### Run Tests in Headed Mode (See Browser)
```bash
npm run test:e2e:headed
```

### Run Tests for Specific Browser
```bash
# Run only Chromium tests
npm run test:e2e -- --project=chromium

# Run only Firefox tests
npm run test:e2e -- --project=firefox

# Run only WebKit tests
npm run test:e2e -- --project=webkit
```

## Temporarily Running a Single Test

If you're debugging a specific test, you can use `test.only()` in the test file:

```javascript
test.only('should handle existing user gracefully', async ({ page }) => {
  // ... test code
});
```

**Important:** Remove `test.only()` before committing! The config has `forbidOnly: !!process.env.CI` to catch this in CI.

## Examples

```bash
# Run only the signup tests
npm run test:e2e -- tests/e2e/auth/signup.spec.js

# Run only tests with "logout" in the name
npm run test:e2e -- --grep "logout"

# Run a specific test in Chromium only
npm run test:e2e -- --grep "should handle existing user gracefully" --project=chromium

# Run tests in UI mode and select which ones to run
npm run test:e2e:ui
```

## Tips

1. **Use UI mode for development**: `npm run test:e2e:ui` is great for iterating on tests
2. **Use grep for quick filtering**: `--grep` is faster than running all tests
3. **Combine filters**: You can combine `--grep` with `--project` to narrow down further
4. **Line numbers**: Use line numbers when you know exactly which test you want
