import { Module } from '@nestjs/common';
import { FlowsController } from './flows.controller';

@Module({ controllers: [FlowsController] })
export class FlowsModule {}
