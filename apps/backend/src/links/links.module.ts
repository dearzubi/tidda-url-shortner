import { Module } from '@nestjs/common';
import { LinkModule } from '../link/link.module';
import { RateLimitModule } from '../rate-limit/rate-limit.module';
import { LinksController } from './links.controller';

@Module({
  imports: [LinkModule, RateLimitModule],
  controllers: [LinksController],
})
export class LinksModule {}
