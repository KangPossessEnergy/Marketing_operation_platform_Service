import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

export class SendSmsCodeDto {
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^1[3-9]\d{9}$/, {
    message: 'phone 必须是有效的中国大陆手机号',
  })
  phone!: string;
}
