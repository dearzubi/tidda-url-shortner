import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Redirect,
  UseGuards,
} from '@nestjs/common';
import type { CreateLinkRequest, CreateLinkResponse } from '@tidda/shared';
import type { Link } from '../link/link.model';
import { LinkService } from '../link/link.service';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { RateLimitPolicy } from '../rate-limit/rate-limit-policy.decorator';
import { CreateLinkBodyPipe } from './create-link-body.pipe';

@Controller()
export class LinksController {
  constructor(private readonly links: LinkService) {}

  @Post('links')
  @RateLimitPolicy('links.create.anonymous')
  @UseGuards(RateLimitGuard)
  async create(@Body(CreateLinkBodyPipe) body: CreateLinkRequest): Promise<CreateLinkResponse> {
    const link = await this.links.createLink({ destinationUrl: body.destinationUrl });
    return toCreateLinkResponse(link);
  }

  @Get('s/:slug')
  @Redirect(undefined, HttpStatus.FOUND)
  async redirect(@Param('slug') slug: string): Promise<{ url: string }> {
    const link = await this.links.resolveLink(slug);

    if (link === null) {
      throw new NotFoundException({ status: 'link_not_found' });
    }

    return { url: link.destinationUrl };
  }
}

function toCreateLinkResponse(link: Link): CreateLinkResponse {
  return {
    slug: link.slug,
    shortPath: `/s/${link.slug}`,
    destinationUrl: link.destinationUrl,
    createdAt: link.createdAt.toISOString(),
  };
}
