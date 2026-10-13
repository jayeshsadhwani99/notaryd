import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [PipelineModule],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
