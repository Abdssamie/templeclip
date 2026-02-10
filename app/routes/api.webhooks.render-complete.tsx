import type { ActionFunctionArgs } from 'react-router';
import {
	validateWebhookSignature,
	type WebhookPayload,
	type WebhookErrorPayload,
	type WebhookSuccessPayload,
	type WebhookTimeoutPayload,
} from '@remotion/lambda/client';
import { getLambdaConfig } from '~/lib/lambda-config.server';

/**
 * Type guard to check if payload is a valid WebhookPayload
 */
function isWebhookPayload(payload: unknown): payload is WebhookPayload {
	if (!payload || typeof payload !== 'object') {
		return false;
	}

	const p = payload as Record<string, unknown>;

	// Check required base fields
	if (
		typeof p.renderId !== 'string' ||
		typeof p.bucketName !== 'string' ||
		typeof p.expectedBucketOwner !== 'string'
	) {
		return false;
	}

	// Check type field
	if (p.type !== 'success' && p.type !== 'error' && p.type !== 'timeout') {
		return false;
	}

	return true;
}

/**
 * Type guard for success payload
 */
function isSuccessPayload(payload: WebhookPayload): payload is WebhookSuccessPayload {
	return payload.type === 'success';
}

/**
 * Type guard for error payload
 */
function isErrorPayload(payload: WebhookPayload): payload is WebhookErrorPayload {
	return payload.type === 'error';
}

/**
 * Type guard for timeout payload
 */
function isTimeoutPayload(payload: WebhookPayload): payload is WebhookTimeoutPayload {
	return payload.type === 'timeout';
}

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
		const isProduction = process.env.NODE_ENV === 'production';

		// In production, webhook secret is required
		if (isProduction && !webhookSecret) {
			console.error('WEBHOOK_SECRET not set in production - rejecting webhook');
			return Response.json(
				{ error: 'Webhook authentication not configured' },
				{ status: 500 }
			);
		}

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
				'WEBHOOK_SECRET not set - skipping signature validation (development mode only)'
			);
		}

		// Validate payload structure
		if (!isWebhookPayload(body)) {
			console.error('Invalid webhook payload structure:', body);
			return Response.json(
				{ error: 'Invalid webhook payload' },
				{ status: 400 }
			);
		}

		const payload = body;

	// Log webhook receipt
	console.log('Received render completion webhook:', {
		renderId: payload.renderId,
		bucketName: payload.bucketName,
		type: payload.type,
	});

		// Handle different webhook types with type guards
		if (isSuccessPayload(payload)) {
			console.log('Render completed successfully:', {
				renderId: payload.renderId,
				outputUrl: payload.outputUrl,
				outputFile: payload.outputFile,
				timeToFinish: payload.timeToFinish,
				lambdaErrors: payload.lambdaErrors?.length ?? 0,
			});

			// TODO: Store render result in database for history/tracking
			// TODO: Trigger post-processing (e.g., upload to CDN, send notification)
			// TODO: Update render status cache for polling endpoint
		} else if (isErrorPayload(payload)) {
			console.error('Render failed with errors:', {
				renderId: payload.renderId,
				errors: payload.errors?.map((e) => ({
					name: e.name,
					message: e.message,
				})) ?? [],
			});

			// TODO: Store error in database
			// TODO: Send error notification to user
		} else if (isTimeoutPayload(payload)) {
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
