import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchLog } from '../entities';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { GeoService } from './geo.service';
import { RetentionService } from './retention.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([SearchLog]), UsersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, GeoService, RetentionService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
