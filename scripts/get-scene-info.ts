#!/usr/bin/env tsx
/**
 * Helper script to get project and scene information for testing the Scene API
 *
 * Usage:
 *   pnpm dlx tsx scripts/get-scene-info.ts
 */

import "dotenv/config";
import { Pool } from "pg";

async function main() {
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error("❌ DATABASE_URL not set in .env file");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log("🔍 Fetching projects and scenes...\n");

    // Get all projects with their scenes
    const { rows } = await pool.query(`
      SELECT 
        id,
        user_id,
        name,
        scenes,
        created_at
      FROM projects
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (rows.length === 0) {
      console.log("⚠️  No projects found in database");
      console.log("\nCreate a project first by:");
      console.log("1. Starting the app: pnpm dev");
      console.log("2. Opening http://localhost:5173");
      console.log("3. Logging in and creating a project\n");
      process.exit(0);
    }

    console.log(`📦 Found ${rows.length} project(s):\n`);

    for (const project of rows) {
      const scenes = project.scenes || [];
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📁 Project: ${project.name}`);
      console.log(`   ID: ${project.id}`);
      console.log(`   User ID: ${project.user_id}`);
      console.log(`   Scenes: ${scenes.length}`);
      console.log(`   Created: ${new Date(project.created_at).toLocaleString()}`);

      if (scenes.length > 0) {
        console.log(`\n   🎬 Scenes:`);
        scenes.forEach((scene: any, idx: number) => {
          console.log(`      ${idx + 1}. ${scene.name || "Untitled"}`);
          console.log(`         Scene ID: ${scene.id}`);
          if (scene.description) {
            console.log(`         Description: ${scene.description}`);
          }
          if (scene.variableSchema && scene.variableSchema.length > 0) {
            console.log(`         Variables: ${scene.variableSchema.map((v: any) => v.name).join(", ")}`);
          }
        });
      } else {
        console.log(`   ⚠️  No scenes in this project yet`);
      }
      console.log();
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Show example API calls
    if (rows.length > 0 && rows[0].scenes && rows[0].scenes.length > 0) {
      const exampleProject = rows[0];
      const exampleScene = exampleProject.scenes[0];

      console.log(`📋 Example API Calls:\n`);
      console.log(`1️⃣  List all scenes in project:`);
      console.log(`   curl -X GET "http://localhost:5173/api/scenes/${exampleProject.id}" \\`);
      console.log(`     -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN"\n`);

      console.log(`2️⃣  Get single scene:`);
      console.log(`   curl -X GET "http://localhost:5173/api/scenes/${exampleProject.id}/${exampleScene.id}" \\`);
      console.log(`     -H "Cookie: better-auth.session_token=YOUR_SESSION_TOKEN"\n`);
    }

    console.log(`🔑 How to get your session token:\n`);
    console.log(`1. Open your app in browser: http://localhost:5173`);
    console.log(`2. Log in with Better Auth (email/password or Google)`);
    console.log(`3. Open DevTools (F12) → Application/Storage → Cookies`);
    console.log(`4. Find cookie named: better-auth.session_token`);
    console.log(`5. Copy the cookie value (NOT the Clerk token!)\n`);

    console.log(`💡 Note: The token you provided is from Clerk, but this app uses Better Auth.\n`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
