import {
	renderMediaOnLambda,
	getRenderProgress as getRemotionRenderProgress,
} from '@remotion/lambda/client';
import { getLambdaConfig } from '~/lib/lambda-config.server';

/**
 * Input props for rendering a timeline composition
 */
export interface RenderInput {
	timelineData: any; // Timeline data structure with scrubbers and transitions
	compositionWidth: number;
	compositionHeight: number;
	durationInFrames: number;
}

/**
 * Result of checking render progress
 */
export interface RenderProgressResult {
	done: boolean;
	progress: number; // 0-1
	outputFile?: string;
	errors?: string[];
}

/**
 * Result of starting a Lambda render
 */
export interface StartRenderResult {
	renderId: string;
	bucketName: string;
}

/**
 * Start a Lambda render job for a timeline composition
 */
export async function startLambdaRender(
	input: RenderInput
): Promise<StartRenderResult> {
	const config = getLambdaConfig();

	try {
		const result = await renderMediaOnLambda({
			region: config.region,
			functionName: config.functionName,
			serveUrl: config.serveUrl,
			composition: 'TimelineComposition',
			inputProps: {
				timelineData: input.timelineData,
				compositionWidth: input.compositionWidth,
				compositionHeight: input.compositionHeight,
				durationInFrames: input.durationInFrames,
			},
			codec: 'h264',
			imageFormat: 'jpeg',
			maxRetries: 1,
			privacy: 'public',
			framesPerLambda: 20,
		});

		return {
			renderId: result.renderId,
			bucketName: result.bucketName,
		};
	} catch (error) {
		throw new Error(
			`Failed to start Lambda render: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}

/**
 * Check the progress of a Lambda render job
 */
export async function pollRenderProgress(
	renderId: string,
	bucketName: string
): Promise<RenderProgressResult> {
	const config = getLambdaConfig();

	try {
		const progress = await getRemotionRenderProgress({
			renderId,
			bucketName,
			functionName: config.functionName,
			region: config.region,
		});

		// Handle different progress states
		if (progress.done) {
			return {
				done: true,
				progress: 1,
				outputFile: progress.outputFile ?? undefined,
				errors:
					progress.errors && progress.errors.length > 0
						? progress.errors.map((e) => e.message)
						: undefined,
			};
		}

		return {
			done: false,
			progress: progress.overallProgress,
			errors:
				progress.errors && progress.errors.length > 0
					? progress.errors.map((e) => e.message)
					: undefined,
		};
	} catch (error) {
		throw new Error(
			`Failed to get render progress: ${error instanceof Error ? error.message : String(error)}`
		);
	}
}
