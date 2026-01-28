import { Pool } from "pg";

async function benchmark() {
  const rawDbUrl = process.env.DATABASE_URL;
  if (!rawDbUrl) {
    console.log("No DATABASE_URL set. Skipping benchmark.");
    return;
  }

  const iterations = 10;
  console.log(`Starting benchmark with ${iterations} iterations...`);

  // 1. New Pool every time
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    const pool = new Pool({ connectionString: rawDbUrl });
    try {
        const client = await pool.connect();
        await client.query("SELECT 1");
        client.release();
    } finally {
        await pool.end();
    }
  }
  const durationNewPool = performance.now() - start;
  console.log(`New Pool per request: ${durationNewPool.toFixed(2)}ms`);

  // 2. Reuse Pool
  const singletonPool = new Pool({ connectionString: rawDbUrl });
  const startReuse = performance.now();
  for (let i = 0; i < iterations; i++) {
    const client = await singletonPool.connect();
    await client.query("SELECT 1");
    client.release();
  }
  const durationReusePool = performance.now() - startReuse;
  await singletonPool.end();
  console.log(`Reuse Pool: ${durationReusePool.toFixed(2)}ms`);

  console.log(`Improvement: ${(durationNewPool / durationReusePool).toFixed(2)}x faster`);
}

benchmark().catch(console.error);
