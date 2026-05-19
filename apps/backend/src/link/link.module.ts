import { Module } from '@nestjs/common';
import { LinkRepository } from './link.repository';
import { LinkService } from './link.service';

@Module({
  providers: [LinkRepository, LinkService],
  exports: [LinkService],
})
export class LinkModule {}
