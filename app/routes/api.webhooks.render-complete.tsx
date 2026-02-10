import type { ActionFunctionArgs } from 'react-router';
import {
	validateWebhookSignature,
	type WebhookPayload,
} from '@remotion/lambda/client';
import { getLambdaConfig } from '~/lib/lambda-config.server';

/**
 * POST /api/webhooks/render-complete
 * Webhook endpoint to receive Lambda render completion notifications
 *
 * This endpoint is called by Remotion Lambda when a render completes.
 * It verifies the webhook signature and logs the render result.
 *
 * Request headers:
 * - X-Remotion-Signature: Signature for verification
 * - X-Remotion-Status: success | timeout | error
 * - X-Remotion-Mode: production | demo
 *
 * Request body: WebhookPayload (varies by type)
 *
 * Response:
 * { received: true }
 */
export async function action({ request }: ActionFunctionArgs) {
	try {
		// Parse request body
		const body = await request.json();

		// Get webhook secret from config
		const config = getLambdaConfig();
		const webhookSecret = config.webhookSecret;

		// Validate webhook signature if secret is available
		if (webhookSecret) {
			const signatureHeader = request.headers.get('x-remotion-signature');

			if (!signatureHeader) {
				console.error('Webhook signature missing');
				return Response.json(
					{ error: 'Missing webhook signature' },
					{ status: 400 }
				);
			}

			try {
				validateWebhookSignature({
					secret: webhookSecret,
					body,
					signatureHeader,
				});
			} catch (error) {
				console.error('Webhook signature validation failed:', error);
				return Response.json(
					{ error: 'Invalid webhook signature' },
					{ status: 401 }
				);
			}
		} else {
			console.warn(
				'WEBHOOK_SECRET not set - skipping signature validation (not recommended for production)'
			);
		}

		// Cast body to WebhookPayload
		const payload = body as WebhookPayload;

		// Log webhook receipt
		console.log('Received render completion webhook:', {
			renderId: payload.renderId,
			bucketName: payload.bucketName,
			type: payload.type,
		});

		// Handle different webhook types
		if (payload.type === 'success') {
			console.log('Render completed successfully:', {
				renderId: payload.renderId,
				outputUrl: payload.outputUrl,
				outputFile: payload.outputFile,
				timeToFinish: payload.timeToFinish,
				lambdaErrors: payload.lambdaErrors.length,
			});

			// TODO: Store render result in database for history/tracking
			// TODO: Trigger post-processing (e.g., upload to CDN, send notification)
			// TODO: Update render status cache for polling endpoint
		} else if (payload.type === 'error') {
			console.error('Render failed with errors:', {
				renderId: payload.renderId,
				errors: payload.errors.map((e) => ({
					name: e.name,
					message: e.message,
				})),
			});

			// TODO: Store error in database
			// TODO: Send error notification to user
		} else if (payload.type === 'timeout') {
			console.warn('Render timed out:', {
				renderId: payload.renderId,
			});

			// TODO: Store timeout event in database
			// TODO: Send timeout notification to user
		}

		// Return success response
		return Response.json({ received: true });
	} catch (error) {
		console.error('Error processing webhook:', error);

		// Return error response
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to process webhook';

		return Response.json({ error: errorMessage }, { status: 500 });
	}
}
