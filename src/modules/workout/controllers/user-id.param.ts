import { ApiParam } from '@nestjs/swagger';

/** Swagger docs for the `userId` path parameter shared by every workout route. */
export const ApiUserIdParam = () =>
  ApiParam({
    name: 'userId',
    example: 'demo-coach-1',
    description: '1-64 chars: letters, digits, _ or -',
  });
