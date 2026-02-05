#!/usr/bin/env node

/**
 * Script to ensure test infrastructure (Docker containers) is running
 * Checks if containers are running and starts them if needed
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '../../../../..');

// Check if this script is being run directly (not imported)
const isMainModule = () => {
  if (!process.argv[1]) return false;
  try {
    const scriptPath = resolve(process.argv[1]);
    const currentPath = resolve(__filename);
    return scriptPath === currentPath || 
           scriptPath.replace(/\\/g, '/') === currentPath.replace(/\\/g, '/');
  } catch (error) {
    return process.argv[1]?.includes('ensure-test-infra.js') ?? false;
  }
};

const REQUIRED_SERVICES = ['postgres-test', 'redis-test', 'backend-test'];
const CONTAINER_NAMES = {
  'postgres-test': 'beach-kings-postgres-test',
  'redis-test': 'beach-kings-redis-test',
  'backend-test': 'beach-kings-backend-test',
};
const COMPOSE_FILE = join(projectRoot, 'docker-compose.test.yml');

/**
 * Check if a port is already in use
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true); // Port is in use
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(false); // Port is free
    });
    
    server.listen(port);
  });
}

/**
 * Get the process ID using a specific port (Unix/macOS)
 */
function getProcessUsingPort(port) {
  try {
    // Use lsof to find the process using the port
    const output = execSync(`lsof -ti:${port}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    return output ? parseInt(output, 10) : null;
  } catch (error) {
    return null;
  }
}

function checkDockerAvailable() {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    // Try docker compose (V2) first, then docker-compose (V1)
    try {
      execSync('docker compose version', { stdio: 'ignore' });
      return { available: true, composeCommand: 'docker compose' };
    } catch (error) {
      try {
        execSync('docker-compose --version', { stdio: 'ignore' });
        return { available: true, composeCommand: 'docker-compose' };
      } catch (error) {
        return { available: false, composeCommand: null };
      }
    }
  } catch (error) {
    return { available: false, composeCommand: null };
  }
}

function getRunningContainers() {
  try {
    const output = execSync('docker ps --format "{{.Names}}"', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch (error) {
    return [];
  }
}

function checkContainersRunning() {
  const running = getRunningContainers();
  const requiredRunning = REQUIRED_SERVICES.filter(service => {
    const containerName = CONTAINER_NAMES[service];
    return running.includes(containerName);
  });
  return {
    allRunning: requiredRunning.length === REQUIRED_SERVICES.length,
    running: requiredRunning,
    missing: REQUIRED_SERVICES.filter(service => {
      const containerName = CONTAINER_NAMES[service];
      return !running.includes(containerName);
    }),
  };
}

function startContainers(composeCommand) {
  console.log('Starting test infrastructure containers...');
  try {
    execSync(
      `${composeCommand} -f ${COMPOSE_FILE} up -d ${REQUIRED_SERVICES.join(' ')}`,
      { 
        cwd: projectRoot,
        stdio: 'inherit',
      }
    );
    console.log('✓ Containers started');
    return true;
  } catch (error) {
    console.error('✗ Failed to start containers:', error.message);
    return false;
  }
}

async function waitForHealthy(service, maxWait = 60000) {
  const startTime = Date.now();
  const checkInterval = 2000;
  const containerName = CONTAINER_NAMES[service] || service;
  
  console.log(`Waiting for ${service} to be ready...`);
  
  while (Date.now() - startTime < maxWait) {
    try {
      // Check if container exists and is running
      const isRunning = execSync(
        `docker inspect --format='{{.State.Running}}' ${containerName} 2>/dev/null`,
        { encoding: 'utf-8', stdio: 'pipe' }
      ).trim();
      
      if (isRunning !== 'true') {
        // Container not running yet
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }
      
      // Check health status if available
      let healthStatus = null;
      try {
        healthStatus = execSync(
          `docker inspect --format='{{.State.Health.Status}}' ${containerName} 2>/dev/null`,
          { encoding: 'utf-8', stdio: 'pipe' }
        ).trim();
      } catch (error) {
        // No health check configured - that's okay
      }
      
      // If health check exists and is healthy, we're good
      if (healthStatus === 'healthy') {
        console.log(`✓ ${service} is healthy`);
        return true;
      }
      
      // If health check exists but not healthy yet, wait
      if (healthStatus && healthStatus !== 'none' && healthStatus !== '' && healthStatus !== 'starting') {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }
      
      // For backend-test, check if API is responding
      if (service === 'backend-test') {
        // Give backend more time to start (it needs to run migrations and initialize)
        if (Date.now() - startTime < 15000) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          continue;
        }
        
        // Check if backend process is actually running (not just container)
        try {
          const exitCode = execSync(
            `docker exec ${containerName} pgrep -f uvicorn > /dev/null 2>&1; echo $?`,
            { encoding: 'utf-8', stdio: 'pipe' }
          ).trim();
          
          if (exitCode !== '0') {
            // Backend process not running yet
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            continue;
          }
        } catch (error) {
          // Can't check process, continue with API check
        }
        
        // Try to connect to the API with retries
        let apiReady = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const apiUrl = process.env.TEST_API_URL || 'http://localhost:8001';
            const response = await fetch(`${apiUrl}/api/leagues`, {
              signal: controller.signal,
              headers: { 'Accept': 'application/json' }
            }).catch(() => null);
            clearTimeout(timeoutId);
            
            // Accept 200 (success), 401 (unauthorized - API is working), or 404 (endpoint exists)
            if (response && (response.ok || response.status === 401 || response.status === 404)) {
              apiReady = true;
              break;
            }
          } catch (error) {
            // API not ready yet, try again
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        }
        
        if (apiReady) {
          console.log(`✓ ${service} API is responding`);
          return true;
        }
        
        // After 45 seconds, if container is still running and process exists, assume it's ready
        // (backend might have started but API check is failing for other reasons)
        if (Date.now() - startTime > 45000 && isRunning === 'true') {
          try {
            const exitCode = execSync(
              `docker exec ${containerName} pgrep -f uvicorn > /dev/null 2>&1; echo $?`,
              { encoding: 'utf-8', stdio: 'pipe' }
            ).trim();
            if (exitCode === '0') {
              console.log(`✓ ${service} is running (process verified, assuming ready after ${Math.round((Date.now() - startTime) / 1000)}s)`);
              return true;
            }
          } catch (error) {
            // Can't verify process
          }
        }
      }
      
      // For postgres-test and redis-test, if they're running and have been for a bit, assume ready
      if ((service === 'postgres-test' || service === 'redis-test')) {
        if (Date.now() - startTime > 5000) {
          // Try to actually connect to verify
          if (service === 'postgres-test') {
            try {
              const pg = await import('pg');
              const { Client } = pg.default || pg;
              const client = new Client({
                connectionString: 'postgresql://beachkings:beachkings@localhost:5433/beachkings_test'
              });
              await client.connect();
              await client.query('SELECT 1');
              await client.end();
              console.log(`✓ ${service} is ready (verified connection)`);
              return true;
            } catch (error) {
              // Not ready yet
            }
          } else if (service === 'redis-test') {
            try {
              execSync(`docker exec ${containerName} redis-cli ping`, { stdio: 'pipe' });
              console.log(`✓ ${service} is ready (verified connection)`);
              return true;
            } catch (error) {
              // Not ready yet
            }
          }
        }
      }
      
      // Container is running but no health check - wait a bit more for services to initialize
      if (Date.now() - startTime > 10000) {
        console.log(`✓ ${service} is running (assuming ready after ${Math.round((Date.now() - startTime) / 1000)}s)`);
        return true;
      }
    } catch (error) {
      // Container might not exist yet
    }
    
    // Wait before checking again
    const waitTime = Math.min(checkInterval, maxWait - (Date.now() - startTime));
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  // Final check - if container is running, assume it's ready
  try {
    const isRunning = execSync(
      `docker inspect --format='{{.State.Running}}' ${containerName} 2>/dev/null`,
      { encoding: 'utf-8', stdio: 'pipe' }
    ).trim();
    
    if (isRunning === 'true') {
      console.warn(`⚠ ${service} is running but health check timed out, continuing anyway...`);
      return true;
    }
  } catch (error) {
    // Container not running
  }
  
  console.error(`✗ ${service} did not become ready within ${maxWait}ms`);
  return false;
}

async function ensureTestInfrastructure() {
  console.log('Checking test infrastructure...');
  
  // Check if port 3002 is already in use (test server port)
  const portInUse = await isPortInUse(3002);
  if (portInUse) {
    const pid = getProcessUsingPort(3002);
    if (pid) {
      try {
        // Try to get process info
        const processInfo = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
        console.log(`ℹ Port 3002 is already in use by process ${pid}`);
        if (processInfo) {
          console.log(`  Process: ${processInfo.substring(0, 80)}${processInfo.length > 80 ? '...' : ''}`);
        }
        console.log(`  Playwright will reuse this existing server (reuseExistingServer: true)`);
        console.log(`  Make sure it's started with BACKEND_PROXY_TARGET=http://localhost:8001 (test backend)`);
        
        // Verify the server is actually responding
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const response = await fetch('http://localhost:3002', {
            signal: controller.signal,
            headers: { 'Accept': 'text/html' }
          }).catch(() => null);
          clearTimeout(timeoutId);
          
          if (response && (response.ok || response.status < 500)) {
            console.log(`  ✓ Server on port 3002 is responding (status: ${response.status})`);
          } else {
            console.warn(`  ⚠ Server on port 3002 may not be responding correctly`);
          }
        } catch (error) {
          console.warn(`  ⚠ Could not verify server response on port 3002`);
        }
        
        console.log(`  If you want a fresh test server, kill this process:`);
        console.log(`    kill -9 ${pid}  # or: kill -9 $(lsof -ti:3002)`);
      } catch (error) {
        console.log(`ℹ Port 3002 is already in use by process ${pid} (could not get process details)`);
        console.log(`  Playwright will reuse this existing server`);
        console.log(`  If you want a fresh test server, kill this process:`);
        console.log(`    kill -9 ${pid}  # or: kill -9 $(lsof -ti:3002)`);
      }
    } else {
      console.log(`ℹ Port 3002 appears to be in use (could not identify process)`);
      console.log(`  Playwright will try to reuse the existing server`);
    }
  }
  
  // Check if Docker is available
  const dockerCheck = checkDockerAvailable();
  if (!dockerCheck.available) {
    console.error('✗ Docker is not available');
    console.error('Please install Docker to run E2E tests');
    console.error('Docker Compose V2 (docker compose) or V1 (docker-compose) is required');
    process.exit(1);
  }
  
  const composeCommand = dockerCheck.composeCommand;
  console.log(`Using: ${composeCommand}`);
  
  // Check if compose file exists
  if (!existsSync(COMPOSE_FILE)) {
    console.error(`✗ Docker compose file not found: ${COMPOSE_FILE}`);
    process.exit(1);
  }
  
  // Check which containers are running
  const status = checkContainersRunning();
  
  if (status.allRunning) {
    console.log('✓ All test infrastructure containers are running');
    return true;
  }
  
  console.log(`Found ${status.running.length}/${REQUIRED_SERVICES.length} containers running`);
  if (status.missing.length > 0) {
    console.log(`Missing: ${status.missing.join(', ')}`);
  }
  
  // Reset test database if backend needs to be restarted (to avoid migration conflicts)
  // This ensures a clean database state for each test run
  if (status.missing.includes('backend-test') || status.missing.includes('postgres-test')) {
    console.log('Resetting test database to ensure clean state...');
    try {
      // Stop containers first
      execSync(
        `${composeCommand} -f ${COMPOSE_FILE} stop postgres-test backend-test 2>/dev/null || true`,
        { cwd: projectRoot, stdio: 'pipe' }
      );
      // Remove containers and volumes
      execSync(
        `${composeCommand} -f ${COMPOSE_FILE} rm -f -v postgres-test 2>/dev/null || true`,
        { cwd: projectRoot, stdio: 'pipe' }
      );
    } catch (error) {
      // Ignore errors - containers might not exist
    }
  }
  
  // Start missing containers
  if (!startContainers(composeCommand)) {
    process.exit(1);
  }
  
  // Wait for containers to be healthy
  console.log('Waiting for containers to be ready...');
  const healthChecks = await Promise.all(
    REQUIRED_SERVICES.map(service => waitForHealthy(service))
  );
  
  const allHealthy = healthChecks.every(result => result === true);
  if (!allHealthy) {
    console.error('✗ Some containers failed to become ready');
    console.error('Check container logs: docker compose -f docker-compose.test.yml logs');
    process.exit(1);
  }
  
  console.log('✓ Test infrastructure is ready');
  return true;
}

// Run if called directly
if (isMainModule()) {
  ensureTestInfrastructure()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Error ensuring test infrastructure:', error);
      process.exit(1);
    });
}

export default ensureTestInfrastructure;
