import { type AuthJwtUser, type LoginResponseDto } from '@sermas/api-client';

export interface UserLoginResponseDto {
  token: LoginResponseDto;
  user: AuthJwtUser;
}
