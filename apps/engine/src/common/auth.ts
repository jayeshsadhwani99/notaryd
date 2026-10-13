import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  orgId: string;
  orgName: string;
  role: 'admin' | 'member';
};
