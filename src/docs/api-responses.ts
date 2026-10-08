import { ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ErrorResponseDto } from '../common/errors/error-response.dto.js';

type Examples = Record<string, { summary: string; value: unknown }>;

/** Success response documented by real JSON examples (no response classes). */
export const ApiExampleResponse = (
  status: number,
  description: string,
  examples: Examples,
) =>
  ApiResponse({
    status,
    description,
    content: { 'application/json': { examples } },
  });

/** Error response using the shared ErrorResponseDto schema; pass `named` to give a map of examples. */
export const ApiErrorResponse = (
  status: number,
  description: string,
  example: unknown,
  named = false,
) =>
  ApiResponse({
    status,
    description,
    content: {
      'application/json': {
        schema: { $ref: getSchemaPath(ErrorResponseDto) },
        ...(named ? { examples: example as Examples } : { example }),
      },
    },
  });
