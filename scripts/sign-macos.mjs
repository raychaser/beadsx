#!/usr/bin/env node
/**
 * Sign and notarize macOS binaries for distribution.
 *
 * This script signs macOS binaries with a Developer ID Application certificate,
 * optionally notarizes them with Apple, and creates ZIP archives for distribution.
 *
 * Prerequisites:
 * - macOS with Xcode Command Line Tools
 * - Developer ID Application certificate installed in Keychain
 * - App Store Connect API key (for notarization)
 *
 * Environment variables:
 * - APPLE_TEAM_ID: Your Apple Developer Team ID (required)
 * - APPLE_IDENTITY: Certificate name (defaults to "Developer ID Application")
 * - APPLE_API_KEY: Path to .p8 API key file (for notarization)
 * - APPLE_API_KEY_ID: API Key ID (for notarization)
 * - APPLE_API_ISSUER_ID: Issuer ID (for notarization)
 *
 * Usage:
 *   node scripts/sign-macos.mjs                    # Sign and notarize
 *   node scripts/sign-macos.mjs --skip-notarize   # Sign only (faster for testing)
 *   node scripts/sign-macos.mjs --list-identities # List available certificates
 *
 * Exit codes:
 *   0 - All binaries signed (and notarized) successfully
 *   1 - Error during signing or notarization
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, unlinkSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const distDir = join(projectRoot, "dist");
const entitlementsPath = join(__dirname, "entitlements.plist");

/** macOS binaries to sign */
const MACOS_BINARIES = ["bdx-darwin-arm64", "bdx-darwin-x64"];

/** Notarization timeout in milliseconds (30 minutes) */
const NOTARIZATION_TIMEOUT_MS = 30 * 60 * 1000;

/** Maximum retries for transient notarization failures */
const NOTARIZATION_MAX_RETRIES = 3;

/** Delay between notarization retries in milliseconds (30 seconds) */
const NOTARIZATION_RETRY_DELAY_MS = 30 * 1000;

/**
 * Sleep for a specified duration.
 * @param {number} ms - Duration in milliseconds
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a command and return stdout/stderr.
 * @param {string} cmd - Command to execute
 * @param {object} options - exec options
 * @returns {Promise<{stdout: string, stderr: string}>}
 * @throws {Error} If the command exits with a non-zero status
 */
async function run(cmd, options = {}) {
  console.log(`  $ ${cmd}`);
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      ...options,
    });
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    // Include stderr in error for better debugging
    const message = error.stderr || error.stdout || error.message;
    throw new Error(`Command failed: ${cmd}\n${message}`);
  }
}

/**
 * Sign a binary with codesign.
 * @param {string} binaryPath - Path to binary
 * @param {string} identity - Signing identity
 */
async function signBinary(binaryPath, identity) {
  console.log(`\nSigning: ${basename(binaryPath)}`);

  // Sign with hardened runtime and timestamp
  await run(
    `codesign --force --sign "${identity}" --options runtime --timestamp --entitlements "${entitlementsPath}" "${binaryPath}"`
  );

  console.log("  Signed successfully");
}

/**
 * Verify a binary's signature.
 * @param {string} binaryPath - Path to binary
 */
async function verifySignature(binaryPath) {
  console.log(`Verifying signature: ${basename(binaryPath)}`);

  const { stdout, stderr } = await run(
    `codesign --verify --verbose=2 "${binaryPath}" 2>&1`
  );

  const output = stdout || stderr;
  if (output.includes("valid on disk")) {
    console.log("  Signature valid");
  } else {
    console.error("  Signature verification failed!");
    console.error(`  Output: ${output}`);
    throw new Error(
      `Signature verification failed for ${basename(binaryPath)}`
    );
  }
}

/**
 * Create a ZIP archive containing the binary.
 * @param {string} binaryPath - Path to binary
 * @returns {Promise<string>} Path to created ZIP
 */
async function createZip(binaryPath) {
  const zipPath = `${binaryPath}.zip`;
  const binaryName = basename(binaryPath);
  const dir = dirname(binaryPath);

  // Remove existing ZIP if present
  if (existsSync(zipPath)) {
    unlinkSync(zipPath);
  }

  // Ensure binary is executable (may be lost during cross-platform transfer)
  await run(`chmod +x "${binaryPath}"`);

  console.log(`Creating ZIP: ${basename(zipPath)}`);
  await run(`cd "${dir}" && zip -j "${basename(zipPath)}" "${binaryName}"`);

  return zipPath;
}

/**
 * Check if an error is likely transient and worth retrying.
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error appears transient
 */
function isTransientError(error) {
  const message = error.message.toLowerCase();

  // Permanent errors - fail immediately, no retry
  const permanentPatterns = [
    "invalid credentials",
    "authentication failed",
    "certificate expired",
    "certificate revoked",
    "not authorized",
    "forbidden",
    "status: invalid", // Notarization rejected the binary
    "401",
    "403",
  ];

  for (const pattern of permanentPatterns) {
    if (message.includes(pattern)) {
      return false;
    }
  }

  // Transient errors - worth retrying
  const transientPatterns = [
    "network",
    "timeout",
    "etimedout",
    "econnreset",
    "econnrefused",
    "connection",
    "temporarily unavailable",
    "service unavailable",
    "unable to process",
    "rate limit",
    "try again",
    "busy",
    "429",
    "500",
    "502",
    "503",
    "504",
  ];

  for (const pattern of transientPatterns) {
    if (message.includes(pattern)) {
      return true;
    }
  }

  // Unknown error type - fail fast rather than waste time on retries
  return false;
}

/**
 * Submit a ZIP for notarization and wait for completion.
 * Includes retry logic with exponential backoff for transient failures.
 * @param {string} zipPath - Path to ZIP file
 * @param {string} apiKeyPath - Path to .p8 API key
 * @param {string} apiKeyId - API Key ID
 * @param {string} issuerId - Issuer ID
 * @throws {Error} If notarization fails after all retries
 */
async function notarize(zipPath, apiKeyPath, apiKeyId, issuerId) {
  console.log(`Submitting for notarization: ${basename(zipPath)}`);
  console.log("  This may take 5-15 minutes (timeout: 30 minutes)...");

  let lastError;

  for (let attempt = 1; attempt <= NOTARIZATION_MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      // Exponential backoff: 30s, 60s, 120s (capped at 5 minutes)
      const delay = Math.min(
        NOTARIZATION_RETRY_DELAY_MS * Math.pow(2, attempt - 2),
        5 * 60 * 1000
      );
      console.log(
        `  Retry attempt ${attempt}/${NOTARIZATION_MAX_RETRIES} after ${delay / 1000}s delay...`
      );
      await sleep(delay);
    }

    try {
      const { stdout } = await run(
        `xcrun notarytool submit "${zipPath}" --key "${apiKeyPath}" --key-id "${apiKeyId}" --issuer "${issuerId}" --wait --timeout 30m`,
        { timeout: NOTARIZATION_TIMEOUT_MS }
      );

      // Check for success
      if (stdout.includes("status: Accepted")) {
        console.log("  Notarization successful");
        return;
      } else if (stdout.includes("status: Invalid")) {
        // Get detailed log for debugging
        const submissionIdMatch = stdout.match(/id: ([a-f0-9-]+)/);
        if (submissionIdMatch) {
          const logCmd = `xcrun notarytool log ${submissionIdMatch[1]} --key "${apiKeyPath}" --key-id "${apiKeyId}" --issuer "${issuerId}"`;
          console.error("\n  Notarization failed. Fetching log...");
          try {
            const { stdout: logOutput } = await run(logCmd);
            console.error(logOutput);
          } catch (logError) {
            console.error(
              `  Warning: Could not fetch notarization log: ${logError.message}`
            );
            console.error(
              `  Note: If this is a network/auth error, it may be related to the notarization failure above.`
            );
            console.error(`  You can manually fetch the log with:`);
            console.error(`    ${logCmd}`);
          }
        }
        // Invalid status is not transient - fail immediately
        throw new Error("Notarization failed: status Invalid");
      } else {
        // Unknown status - treat as failure to be safe
        console.error("  Notarization returned unexpected status");
        console.error(`  Output: ${stdout}`);
        console.error("  Expected 'status: Accepted' but did not find it");
        throw new Error(
          "Notarization failed: unexpected response (status not Accepted)"
        );
      }
    } catch (error) {
      lastError = error;

      // Don't retry for non-transient errors (like "status: Invalid")
      if (!isTransientError(error)) {
        throw error;
      }

      console.warn(`  Transient error on attempt ${attempt}: ${error.message}`);

      if (attempt === NOTARIZATION_MAX_RETRIES) {
        console.error(
          `  All ${NOTARIZATION_MAX_RETRIES} notarization attempts failed`
        );
        throw new Error(
          `Notarization failed after ${NOTARIZATION_MAX_RETRIES} attempts: ${lastError.message}`
        );
      }
    }
  }

  // Defensive: should never reach here, but guard against future refactoring
  throw lastError ?? new Error("Notarization failed: unknown error");
}

// Note: Stapling is not possible for ZIP files or standalone binaries.
// Only .app bundles, .dmg, and .pkg can be stapled.
// For ZIPs, Gatekeeper checks the notarization ticket online when the user
// extracts and runs the binary. This is the expected behavior for CLI tools.

/**
 * Get the signing identity string by finding a matching Developer ID certificate.
 * @param {string} teamId - Apple Team ID
 * @param {string} customIdentity - Custom identity override
 * @returns {Promise<string>} Signing identity
 * @throws {Error} If no matching certificate is found or keychain access fails
 */
async function getSigningIdentity(teamId, customIdentity) {
  if (customIdentity && customIdentity !== "Developer ID Application") {
    return customIdentity;
  }

  // Find the actual identity from keychain that matches our team ID
  try {
    const { stdout } = await run(
      'security find-identity -v -p codesigning 2>/dev/null | grep "Developer ID Application"',
      { maxBuffer: 1024 * 1024 }
    );

    // Parse output like: 1) ABC123... "Developer ID Application: Name (TEAMID)"
    const lines = stdout.split("\n");
    for (const line of lines) {
      if (line.includes(teamId)) {
        const match = line.match(/"([^"]+)"/);
        if (match) {
          return match[1];
        }
      }
    }

    // No matching identity found - this is a real error
    throw new Error(
      `No Developer ID Application certificate found for team ${teamId}.\n` +
        `Run 'node scripts/sign-macos.mjs --list-identities' to see available certificates.`
    );
  } catch (error) {
    // If it's our "not found" error, re-throw as-is
    if (error.message.includes("No Developer ID Application certificate")) {
      throw error;
    }

    // Keychain access failure - provide helpful context
    throw new Error(
      `Failed to query keychain for signing identities.\n` +
        `Original error: ${error.message}\n\n` +
        `Possible causes:\n` +
        `  - Keychain is locked (try: security unlock-keychain)\n` +
        `  - No Developer ID certificate installed\n` +
        `  - Xcode Command Line Tools not properly configured\n\n` +
        `Run 'node scripts/sign-macos.mjs --list-identities' to diagnose.`
    );
  }
}

/**
 * List available signing identities.
 */
async function listIdentities() {
  console.log("\nAvailable signing identities:");
  try {
    const { stdout } = await run("security find-identity -v -p codesigning");
    if (!stdout.trim()) {
      console.log("  No signing identities found in keychain");
      console.log(
        "  Install a Developer ID Application certificate from Apple Developer Portal"
      );
    } else {
      console.log(stdout);
    }
  } catch (error) {
    console.error("Failed to query keychain:");
    console.error(`  ${error.message}`);
    console.error("\nPossible causes:");
    console.error("  - Keychain is locked (try: security unlock-keychain)");
    console.error("  - Xcode Command Line Tools not installed");
    process.exit(1);
  }
}

/**
 * Main function.
 */
async function main() {
  const skipNotarize = process.argv.includes("--skip-notarize");
  const listOnly = process.argv.includes("--list-identities");

  // Check platform
  if (process.platform !== "darwin") {
    console.error("Error: This script must be run on macOS");
    process.exit(1);
  }

  // List identities mode
  if (listOnly) {
    await listIdentities();
    process.exit(0);
  }

  // Configuration from environment
  const teamId = process.env.APPLE_TEAM_ID;
  const customIdentity = process.env.APPLE_IDENTITY;
  const apiKeyPath = process.env.APPLE_API_KEY;
  const apiKeyId = process.env.APPLE_API_KEY_ID;
  const issuerId = process.env.APPLE_API_ISSUER_ID;

  // Validate required configuration
  if (!teamId) {
    console.error("Error: APPLE_TEAM_ID environment variable is required");
    console.error("\nUsage:");
    console.error(
      "  export APPLE_TEAM_ID='YOUR_TEAM_ID'  # Find in Apple Developer Portal"
    );
    console.error("  node scripts/sign-macos.mjs");
    console.error("\nTo list available identities:");
    console.error("  node scripts/sign-macos.mjs --list-identities");
    process.exit(1);
  }

  if (!skipNotarize && (!apiKeyPath || !apiKeyId || !issuerId)) {
    console.error(
      "Error: Notarization requires APPLE_API_KEY, APPLE_API_KEY_ID, and APPLE_API_ISSUER_ID"
    );
    console.error("\nOptions:");
    console.error("  1. Provide all notarization credentials:");
    console.error("     export APPLE_API_KEY='/path/to/AuthKey_KEYID.p8'");
    console.error("     export APPLE_API_KEY_ID='YOUR_KEY_ID'");
    console.error("     export APPLE_API_ISSUER_ID='YOUR_ISSUER_ID'");
    console.error("\n  2. Skip notarization (for local testing):");
    console.error("     node scripts/sign-macos.mjs --skip-notarize");
    process.exit(1);
  }

  // Check entitlements file exists
  if (!existsSync(entitlementsPath)) {
    console.error(`Error: Entitlements file not found: ${entitlementsPath}`);
    process.exit(1);
  }

  const identity = await getSigningIdentity(teamId, customIdentity);
  console.log(`\n=== macOS Code Signing ===`);
  console.log(`Identity: ${identity}`);
  console.log(`Notarize: ${skipNotarize ? "No (skipped)" : "Yes"}`);
  console.log(`Output: ${distDir}`);

  let signed = 0;
  let missing = 0;
  const failures = [];

  for (const binaryName of MACOS_BINARIES) {
    const binaryPath = join(distDir, binaryName);

    console.log(`\n--- Processing ${binaryName} ---`);

    // Check binary exists
    if (!existsSync(binaryPath)) {
      console.warn(`Warning: Binary not found: ${binaryPath}`);
      console.warn("  Run 'pnpm run cli:build:all' first");
      missing++;
      continue;
    }

    try {
      // 1. Sign the binary
      await signBinary(binaryPath, identity);

      // 2. Verify signature
      await verifySignature(binaryPath);

      // 3. Create ZIP for distribution
      const zipPath = await createZip(binaryPath);

      if (!skipNotarize) {
        // 4. Submit for notarization
        // Note: ZIP files cannot be stapled, but Gatekeeper will check
        // the notarization ticket online when users extract and run the binary
        await notarize(zipPath, apiKeyPath, apiKeyId, issuerId);
      }

      console.log(`\nCompleted: ${binaryName}`);
      signed++;
    } catch (error) {
      console.error(`\nFailed: ${binaryName}`);
      console.error(`  Error: ${error.message}`);
      failures.push({ binary: binaryName, error: error.message.split("\n")[0] });
    }
  }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Signed: ${signed}/${MACOS_BINARIES.length}`);
  if (missing > 0) {
    console.log(`Missing: ${missing}`);
  }
  if (failures.length > 0) {
    console.log(`Failed: ${failures.length}`);
    for (const f of failures) {
      console.log(`  - ${f.binary}: ${f.error}`);
    }
  }
  if (!skipNotarize && signed > 0) {
    console.log(`\nNotarized ZIPs are ready for distribution:`);
    for (const binaryName of MACOS_BINARIES) {
      const zipPath = join(distDir, `${binaryName}.zip`);
      if (existsSync(zipPath)) {
        console.log(`  ${zipPath}`);
      }
    }
  }

  if (missing > 0 || failures.length > 0) {
    process.exit(1);
  }

  console.log("\nAll macOS binaries signed successfully!");
}

main().catch((error) => {
  console.error("\nSigning failed:", error.message);
  process.exit(1);
});
