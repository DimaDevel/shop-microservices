#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SERVICES = [
  'gateway',
  'auth-service',
  'user-service',
  'product-service',
  'order-service',
  'payment-service',
  'notification-service',
];

const ROOT = path.resolve(__dirname, '..');
const PASS = '\x1b[32m✓\x1b[0m';
const FAIL = '\x1b[31m✗\x1b[0m';
const BOLD = (s) => `\x1b[1m${s}\x1b[0m`;
const GREEN = (s) => `\x1b[32m${s}\x1b[0m`;
const RED = (s) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

function pad(str, len, right = false) {
  const plain = str.replace(/\x1b\[[0-9;]*m/g, '');
  const pad = ' '.repeat(Math.max(0, len - plain.length));
  return right ? pad + str : str + pad;
}

function runServiceTests(service) {
  const serviceDir = path.join(ROOT, 'services', service);
  if (!fs.existsSync(serviceDir)) return null;

  const jestBin = path.join(serviceDir, 'node_modules', '.bin', 'jest');
  const bin = fs.existsSync(jestBin) ? jestBin : 'npx jest';

  try {
    const output = execSync(
      `${bin} --config jest.config.js --json 2>/dev/null`,
      { cwd: serviceDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return JSON.parse(output);
  } catch (err) {
    // Jest exits non-zero when tests fail; stdout still has the JSON
    const raw = err.stdout || '';
    const jsonStart = raw.indexOf('{');
    if (jsonStart !== -1) {
      try {
        return JSON.parse(raw.slice(jsonStart));
      } catch (_) {}
    }
    return { success: false, numPassedTests: 0, numFailedTests: 0, numTotalTests: 0, testResults: [], parseError: true };
  }
}

function formatFailedTests(result) {
  const lines = [];
  for (const suite of result.testResults || []) {
    for (const test of suite.testResults || []) {
      if (test.status === 'failed') {
        const shortPath = suite.testFilePath.replace(ROOT + '/', '');
        lines.push(`    ${RED('✗')} ${DIM(shortPath)} › ${test.fullName}`);
        if (test.failureMessages && test.failureMessages.length) {
          const msg = test.failureMessages[0].split('\n')[0];
          lines.push(`      ${DIM(msg)}`);
        }
      }
    }
  }
  return lines;
}

console.log(`\n${BOLD('Running unit tests across all services...')}\n`);

const rows = [];
const failureDetails = [];

for (const service of SERVICES) {
  process.stdout.write(`  Testing ${service.padEnd(25)} `);
  const result = runServiceTests(service);

  if (!result) {
    process.stdout.write(DIM('skipped (not found)\n'));
    rows.push({ service, status: 'skipped', passed: '-', failed: '-', total: '-', suites: '-' });
    continue;
  }

  const passed = result.numPassedTests ?? 0;
  const failed = result.numFailedTests ?? 0;
  const total = result.numTotalTests ?? 0;
  const suites = result.numTotalTestSuites ?? (result.testResults || []).length;
  const ok = result.success && failed === 0;

  process.stdout.write(ok ? GREEN('PASS\n') : RED('FAIL\n'));

  rows.push({ service, status: ok ? 'pass' : 'fail', passed, failed, total, suites });

  if (!ok && !result.parseError) {
    const details = formatFailedTests(result);
    if (details.length) failureDetails.push(...details);
  }
}

// Table
const COL = [28, 8, 8, 8, 8, 8];
const header = [BOLD('Service'), BOLD('Status'), BOLD('Passed'), BOLD('Failed'), BOLD('Total'), BOLD('Suites')];

const divider = '+' + COL.map((w) => '-'.repeat(w + 2)).join('+') + '+';
const rowLine = (cells) =>
  '| ' + cells.map((c, i) => pad(c, COL[i])).join(' | ') + ' |';

console.log(`\n${BOLD('━'.repeat(70))}`);
console.log(BOLD('  TEST SUMMARY'));
console.log(BOLD('━'.repeat(70)));
console.log(divider);
console.log(rowLine(header));
console.log(divider);

let totalPassed = 0, totalFailed = 0, totalTests = 0;

for (const r of rows) {
  const statusCell = r.status === 'pass' ? GREEN(PASS + ' PASS') : r.status === 'fail' ? RED(FAIL + ' FAIL') : DIM('— SKIP');
  const passedCell = r.passed === '-' ? DIM('-') : r.passed > 0 ? GREEN(String(r.passed)) : String(r.passed);
  const failedCell = r.failed === '-' ? DIM('-') : r.failed > 0 ? RED(String(r.failed)) : String(r.failed);
  console.log(rowLine([r.service, statusCell, passedCell, failedCell, String(r.total), String(r.suites)]));
  if (typeof r.passed === 'number') totalPassed += r.passed;
  if (typeof r.failed === 'number') totalFailed += r.failed;
  if (typeof r.total === 'number') totalTests += r.total;
}

console.log(divider);

const totalStatus = totalFailed === 0 ? GREEN('ALL PASS') : RED('FAILED');
console.log(rowLine([BOLD('TOTAL'), totalStatus, GREEN(String(totalPassed)), totalFailed > 0 ? RED(String(totalFailed)) : String(totalFailed), String(totalTests), '']));
console.log(divider);

if (failureDetails.length) {
  console.log(`\n${BOLD(RED('Failed tests:'))}`);
  failureDetails.forEach((l) => console.log(l));
}

console.log('');
process.exit(totalFailed > 0 ? 1 : 0);
