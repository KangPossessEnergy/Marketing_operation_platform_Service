import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class UpdateOrganizationNodeDto {
  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 64)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: '编码只能包含字母、数字、下划线和短横线',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 64)
  contactName?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 255)
  address?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(5, 32)
  @Matches(/^[0-9+() -]+$/, {
    message: '联系电话格式不正确',
  })
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 32)
  region?: string;

  @IsOptional()
  @IsString()
  @Transform(trimString)
  @Length(1, 32)
  province?: string;
}
