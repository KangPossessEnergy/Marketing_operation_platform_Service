import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class LoginSmsDto {
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^1[3-9]\d{9}$/, {
    message: 'phone 必须是有效的中国大陆手机号',
  })
  phone!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'code 必须是 6 位数字',
  })
  code!: string;
}
