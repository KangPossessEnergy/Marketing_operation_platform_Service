import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^1[3-9]\d{9}$/, {
    message: 'phone 必须是有效的中国大陆手机号',
  })
  phone?: string;
}
