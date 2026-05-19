import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import {
  type CreateLinkRequest,
  CreateLinkRequestSchema,
  parseSchema,
  SchemaValidationError,
} from '@tidda/shared';

@Injectable()
export class CreateLinkBodyPipe implements PipeTransform<unknown, CreateLinkRequest> {
  transform(value: unknown): CreateLinkRequest {
    try {
      return parseSchema(CreateLinkRequestSchema, value, 'Invalid create link request');
    } catch (err) {
      if (err instanceof SchemaValidationError) {
        throw new BadRequestException({
          status: 'invalid_request',
          issues: err.issues,
        });
      }

      throw err;
    }
  }
}
