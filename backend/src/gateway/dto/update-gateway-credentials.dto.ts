import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateGatewayCredentialsDto {
  @ApiProperty({ example: '12345678900' })
  @IsString()
  document: string;

  @ApiProperty({ example: 'suasenha' })
  @IsString()
  @MinLength(1)
  password: string;
}
