import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class LoginPasswordDto {
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username 只能包含字母、数字和下划线',
  })
  username!: string;

  @IsString()
  @Length(1, 128)
  password!: string;
}
