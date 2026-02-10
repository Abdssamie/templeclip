import { deploySite, getOrCreateBucket } from "@remotion/lambda";
import type { AwsRegion } from "@remotion/lambda/client";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config();

async function deployRemotionSite() {
  console.log("🚀 Deploying Remotion project to S3...");

  try {
    const region = (process.env.REMOTION_AWS_REGION || "us-east-1") as AwsRegion;

    // Get or create S3 bucket
    // TODO: Implement bucket security - see https://remotion.dev/docs/lambda/bucket-security
    // Current bucket allows public listing which is a security risk
    console.log("📦 Getting or creating S3 bucket...");
    const { bucketName } = await getOrCreateBucket({
      region,
    });
    console.log(`✅ Bucket: ${bucketName}`);

    // Deploy site
    console.log("📤 Bundling and uploading Remotion project...");
    const { serveUrl } = await deploySite({
      bucketName,
      entryPoint: path.resolve(process.cwd(), "app/videorender/index.ts"),
      region,
      siteName: "kimu-video-renderer",
      options: {
        onBundleProgress: (progress) => {
          console.log(`Bundle progress: ${progress}%`);
        },
        onUploadProgress: ({ totalFiles, filesUploaded, totalSize, sizeUploaded }) => {
          const uploadPercent = ((sizeUploaded / totalSize) * 100).toFixed(1);
          console.log(`Upload progress: ${filesUploaded}/${totalFiles} files (${uploadPercent}%)`);
        },
      },
    });

    console.log("✅ Remotion project deployed successfully!");
    console.log(`Serve URL: ${serveUrl}`);
    console.log(`Bucket Name: ${bucketName}`);
    console.log("\n📝 Add these to your .env file:");
    console.log(`REMOTION_SERVE_URL=${serveUrl}`);
    console.log(`REMOTION_BUCKET_NAME=${bucketName}`);

    return { serveUrl, bucketName };
  } catch (error) {
    console.error("❌ Failed to deploy Remotion site:", error);
    throw error;
  }
}

// Run if called directly (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  deployRemotionSite()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { deployRemotionSite };
