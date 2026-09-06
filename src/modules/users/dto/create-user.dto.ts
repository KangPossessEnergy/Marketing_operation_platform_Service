import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username 只能包含字母、数字和下划线',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^1[3-9]\d{9}$/, {
    message: 'phone 必须是有效的中国大陆手机号',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(6, 128)
  password?: string;
}
