const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const backupPath = path.join(__dirname, '../prisma/schema.prisma.backup');

console.log('--- Preparing environment for self-contained testing ---');

// 1. Back up original schema
const originalSchema = fs.readFileSync(schemaPath, 'utf8');
fs.writeFileSync(backupPath, originalSchema, 'utf8');
console.log('Backed up prisma/schema.prisma');

try {
  // 2. Modify schema to use SQLite provider
  const sqliteSchema = originalSchema.replace(
    /datasource db \{[\s\S]*?\}/,
    `datasource db {
  provider = "sqlite"
  url      = "file:./test.db"
}`
  );
  fs.writeFileSync(schemaPath, sqliteSchema, 'utf8');
  console.log('Modified schema.prisma to use sqlite provider.');

  // 3. Set environment variable for execution
  process.env.DATABASE_URL = 'file:./test.db';
  process.env.STELLAR_MODE = 'mock';
  process.env.WALLET_PROVIDER = 'mock';

  // 4. Run prisma generate and prisma db push
  console.log('Running prisma generate...');
  execSync('npx prisma generate', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

  console.log('Running prisma db push...');
  execSync('npx prisma db push --accept-data-loss', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

  // 5. Run tests
  console.log('\n--- Running Merkle Tests ---');
  execSync('npx tsx src/lib/merkle.test.ts', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

  console.log('\n--- Running Ticketing Tests ---');
  execSync('npx tsx src/lib/ticketing.test.ts', { cwd: path.join(__dirname, '..'), stdio: 'inherit' });

  console.log('\nAll test suites completed successfully!');
} catch (error) {
  console.error('\nTest runner encountered an error:', error);
  process.exitCode = 1;
} finally {
  // 6. Restore original schema
  if (fs.existsSync(backupPath)) {
    const original = fs.readFileSync(backupPath, 'utf8');
    fs.writeFileSync(schemaPath, original, 'utf8');
    fs.unlinkSync(backupPath);
    console.log('Restored original prisma/schema.prisma');

    // 7. Re-generate original client
    console.log('Re-generating original Prisma client...');
    try {
      execSync('npx prisma generate', { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
      console.log('Original Prisma client restored.');
    } catch (e) {
      console.error('Failed to restore original Prisma client:', e);
    }
  }
}
