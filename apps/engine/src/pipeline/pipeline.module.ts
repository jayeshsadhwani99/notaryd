import { Module } from '@nestjs/common';
import { EvidenceModule } from '../evidence/evidence.module';
import { VaultModule } from '../vault/vault.module';
import { ExploreRunner } from './explore.runner';
import { QueueService } from './queue.service';
import { ReviewRunner } from './review.runner';
import { VerifyRunner } from './verify.runner';

@Module({
  imports: [VaultModule, EvidenceModule],
  providers: [ReviewRunner, ExploreRunner, VerifyRunner, QueueService],
  exports: [QueueService],
})
export class PipelineModule {}
