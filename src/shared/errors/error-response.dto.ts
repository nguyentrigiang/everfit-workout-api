import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from './error-code.js';

// Explicit decorators (not left to the CLI plugin) so the schema also exists in tests.

export class ErrorDetailDto {
  @ApiPropertyOptional({ example: 'entries[0].sets[1].weight' })
  field?: string;

  @ApiProperty({ example: 'weight must not be less than 0' })
  message: string;
}

/** Shape of every error response (see AllExceptionsFilter). */
export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ enum: ErrorCode, enumName: 'ErrorCode' })
  code: ErrorCode;

  @ApiProperty({ example: 'Bad Request' })
  error: string;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ type: [ErrorDetailDto] })
  details: ErrorDetailDto[];

  @ApiProperty({ example: '/api/v1/users/coach-1/workouts' })
  path: string;

  @ApiProperty({ example: '2026-10-08T07:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ example: '1af98283-e5f5-407e-a0ab-255dfa7c1ba3' })
  requestId: string;
}
