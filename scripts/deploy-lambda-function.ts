import { deployFunction } from '@remotion/lambda';
import type { AwsRegion } from '@remotion/lambda/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function deployLambdaFunction() {
	console.log('🚀 Deploying Remotion Lambda function...');

	try {
		const region = (process.env.REMOTION_AWS_REGION || 'us-east-1') as AwsRegion;

		const { functionName } = await deployFunction({
			region,
			timeoutInSeconds: 120,
			memorySizeInMb: 2048,
			diskSizeInMb: 2048,
			createCloudWatchLogGroup: true,
		});

		console.log('✅ Lambda function deployed successfully!');
		console.log(`Function Name: ${functionName}`);
		console.log(`Region: ${region}`);
		console.log('\n📝 Add this to your .env file:');
		console.log(`REMOTION_FUNCTION_NAME=${functionName}`);
		console.log(`REMOTION_AWS_REGION=${region}`);

		return functionName;
	} catch (error) {
		console.error('❌ Failed to deploy Lambda function:', error);
		throw error;
	}
}

// Run if called directly
if (require.main === module) {
	deployLambdaFunction()
		.then(() => process.exit(0))
		.catch(() => process.exit(1));
}

export { deployLambdaFunction };
