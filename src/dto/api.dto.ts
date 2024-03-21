import { AuthJwtUser, LoginResponseDto } from '@sermas/api-client';

export interface SendAudioQueryParamsDto
  extends Record<string, string | number | undefined> {
  language?: string;
  gender?: string;
  llm?: string;
}

export interface UserLoginResponseDto {
  token: LoginResponseDto;
  user: AuthJwtUser;
}
