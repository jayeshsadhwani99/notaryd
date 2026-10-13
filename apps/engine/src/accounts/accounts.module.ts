import { Module } from '@nestjs/common';
import { VaultModule } from '../vault/vault.module';
import { AccountsController } from './accounts.controller';

@Module({
  imports: [VaultModule],
  controllers: [AccountsController],
})
export class AccountsModule {}
