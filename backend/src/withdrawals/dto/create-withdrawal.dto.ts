import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ example: 5000, description: 'Valor em centavos' })
  @IsInt()
  @Min(100)
  amountCents: number;

  @ApiProperty({ example: 'cliente@email.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  pixKey: string;
}
