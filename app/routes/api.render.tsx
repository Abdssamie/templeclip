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

		// Extract render input from request body
		const renderInput: RenderInput = {
			timelineData: body.timelineData,
			compositionWidth: body.compositionWidth,
			compositionHeight: body.compositionHeight,
			durationInFrames: body.durationInFrames,
		};

		// Start Lambda render (validation happens in the service)
		const result = await startLambdaRender(renderInput);

		return Response.json(
			{
				renderId: result.renderId,
				bucketName: result.bucketName,
			},
			{ status: 200 }
		);
	} catch (error) {
		console.error('Error starting Lambda render:', error);

		// Determine if this is a validation error or server error
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to start render';
		const isValidationError =
			errorMessage.includes('Invalid') || errorMessage.includes('Must');

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

		// Validate query parameters
		if (!renderId || !bucketName) {
			return Response.json(
				{ error: 'Missing required query parameters: renderId and bucketName' },
				{ status: 400 }
			);
		}

		// Poll render progress (validation happens in the service)
		const progress = await pollRenderProgress(renderId, bucketName);

		return Response.json(progress, { status: 200 });
	} catch (error) {
		console.error('Error polling render progress:', error);

		// Determine if this is a validation error or server error
		const errorMessage =
			error instanceof Error ? error.message : 'Failed to get render progress';
		const isValidationError =
			errorMessage.includes('Invalid') || errorMessage.includes('Must');

		return Response.json(
			{ error: errorMessage },
			{ status: isValidationError ? 400 : 500 }
		);
	}
}
