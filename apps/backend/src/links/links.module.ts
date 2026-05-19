import { Module } from '@nestjs/common';
import { LinkModule } from '../link/link.module';
import { LinksController } from './links.controller';

@Module({
  imports: [LinkModule],
  controllers: [LinksController],
})
export class LinksModule {}
