import type { LoaderFunctionArgs, ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/lib/auth.utils';
import {
	startLambdaRender,
	pollRenderProgress,
	type RenderInput,
} from '~/services/lambda-render.server';

/**
 * POST /api/render
 * Start a Lambda render job
 *
 * Request body:
 * {
 *   timelineData: TimelineDataItem[],
 *   compositionWidth: number,
 *   compositionHeight: number,
 *   durationInFrames: number
 * }
 *
 * Response:
 * {
 *   renderId: string,
 *   bucketName: string
 * }
 */
export async function action({ request }: ActionFunctionArgs) {
	// Require authentication
	await requireUserId(request);

	try {
		const body = await request.json();

		// Validate request body has required fields
		if (!body || typeof body !== 'object') {
			return Response.json(
				{ error: 'Invalid request body' },
				{ status: 400 }
			);
		}

		if (!Array.isArray(body.timelineData)) {
			return Response.json(
				{ error: 'Missing or invalid required field: timelineData' },
				{ status: 400 }
			);
		}

		if (typeof body.compositionWidth !== 'number') {
			return Response.json(
				{ error: 'Missing or invalid required field: compositionWidth' },
				{ status: 400 }
			);
		}

		if (typeof body.compositionHeight !== 'number') {
			return Response.json(
				{ error: 'Missing or invalid required field: compositionHeight' },
				{ status: 400 }
			);
		}

		if (typeof body.durationInFrames !== 'number') {
			return Response.json(
				{ error: 'Missing or invalid required field: durationInFrames' },
				{ status: 400 }
			);
		}

		// Extract render input from request body
		const renderInput: RenderInput = {
			timelineData: body.timelineData,
			compositionWidth: body.compositionWidth,
			compositionHeight: body.compositionHeight,
			durationInFrames: body.durationInFrames,
		};

		// Start Lambda render (validation happens in the service)
		const result = await startLambdaRender(renderInput);

		return Response.json({
			renderId: result.renderId,
			bucketName: result.bucketName,
		});
	} catch (error) {
		console.error('Error starting Lambda render:', error);

		// Determine if this is a validation error or server error
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to start render';
		
		// Check if error is from validation (more robust detection)
		const isValidationError =
			error instanceof Error &&
			(errorMessage.startsWith('Invalid') ||
				errorMessage.includes('Must be') ||
				errorMessage.includes('Must not be'));

		return Response.json(
			{ error: errorMessage },
			{ status: isValidationError ? 400 : 500 }
		);
	}
}

/**
 * GET /api/render?renderId=X&bucketName=Y
 * Poll the progress of a Lambda render job
 *
 * Query parameters:
 * - renderId: string (required)
 * - bucketName: string (required)
 *
 * Response:
 * {
 *   done: boolean,
 *   status: 'completed' | 'failed' | 'in_progress',
 *   progress: number, // 0-1
 *   outputFile?: string,
 *   errors?: string[]
 * }
 */
export async function loader({ request }: LoaderFunctionArgs) {
	// Require authentication
	await requireUserId(request);

	try {
		const url = new URL(request.url);
		const renderId = url.searchParams.get('renderId');
		const bucketName = url.searchParams.get('bucketName');

		// Validate query parameters (check for null, empty strings, and whitespace-only strings)
		if (!renderId || renderId.trim() === '') {
			return Response.json(
				{ error: 'Missing or empty required query parameter: renderId' },
				{ status: 400 }
			);
		}

		if (!bucketName || bucketName.trim() === '') {
			return Response.json(
				{ error: 'Missing or empty required query parameter: bucketName' },
				{ status: 400 }
			);
		}

		// Poll render progress (validation happens in the service)
		const progress = await pollRenderProgress(renderId, bucketName);

		return Response.json(progress);
	} catch (error) {
		console.error('Error polling render progress:', error);

		// Determine if this is a validation error or server error
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to get render progress';
		
		// Check if error is from validation (more robust detection)
		const isValidationError =
			error instanceof Error &&
			(errorMessage.startsWith('Invalid') ||
				errorMessage.includes('Must be') ||
				errorMessage.includes('Must not be'));

		return Response.json(
			{ error: errorMessage },
			{ status: isValidationError ? 400 : 500 }
		);
	}
}
