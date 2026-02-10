import type { AwsRegion } from '@remotion/lambda/client';

export interface LambdaConfig {
	region: AwsRegion;
	functionName: string;
	serveUrl: string;
	bucketName: string;
	awsAccessKeyId: string;
	awsSecretAccessKey: string;
	webhookSecret?: string;
	prodDomain?: string;
}

/**
 * Load and validate Lambda configuration from environment variables
 */
export function getLambdaConfig(): LambdaConfig {
	const region = process.env.REMOTION_AWS_REGION;
	const functionName = process.env.REMOTION_FUNCTION_NAME;
	const serveUrl = process.env.REMOTION_SERVE_URL;
	const bucketName = process.env.REMOTION_BUCKET_NAME;
	const awsAccessKeyId = process.env.REMOTION_AWS_ACCESS_KEY_ID;
	const awsSecretAccessKey = process.env.REMOTION_AWS_SECRET_ACCESS_KEY;
	const webhookSecret = process.env.WEBHOOK_SECRET;
	const prodDomain = process.env.PROD_DOMAIN;

	// Validate required configuration
	const missingVars: string[] = [];

	if (!region) missingVars.push('REMOTION_AWS_REGION');
	if (!functionName) missingVars.push('REMOTION_FUNCTION_NAME');
	if (!serveUrl) missingVars.push('REMOTION_SERVE_URL');
	if (!bucketName) missingVars.push('REMOTION_BUCKET_NAME');
	if (!awsAccessKeyId) missingVars.push('REMOTION_AWS_ACCESS_KEY_ID');
	if (!awsSecretAccessKey) missingVars.push('REMOTION_AWS_SECRET_ACCESS_KEY');

	if (missingVars.length > 0) {
		throw new Error(
			`Missing required Lambda configuration environment variables: ${missingVars.join(', ')}\n` +
				'Please ensure these are set in your .env file. ' +
				'Run the deployment scripts to generate REMOTION_FUNCTION_NAME, REMOTION_SERVE_URL, and REMOTION_BUCKET_NAME.'
		);
	}

	return {
		region: region as AwsRegion,
		functionName: functionName!,
		serveUrl: serveUrl!,
		bucketName: bucketName!,
		awsAccessKeyId: awsAccessKeyId!,
		awsSecretAccessKey: awsSecretAccessKey!,
		webhookSecret,
		prodDomain,
	};
}

/**
 * Check if Lambda configuration is available
 */
export function hasLambdaConfig(): boolean {
	try {
		getLambdaConfig();
		return true;
	} catch {
		return false;
	}
}
