import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './common/access.module';
import { DbModule } from './db/db.module';
import { EvidenceModule } from './evidence/evidence.module';
import { FlowsModule } from './flows/flows.module';
import { HealthController } from './health.controller';
import { LlmModule } from './llm/llm.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { ProjectsModule } from './projects/projects.module';
import { RunsModule } from './runs/runs.module';
import { VaultModule } from './vault/vault.module';

@Module({
  imports: [
    DbModule,
    AuditModule,
    AccessModule,
    LlmModule,
    AuthModule,
    VaultModule,
    EvidenceModule,
    PipelineModule,
    ProjectsModule,
    AccountsModule,
    FlowsModule,
    RunsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
