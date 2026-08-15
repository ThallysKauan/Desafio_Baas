import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';

export class PayCheckoutDto {
  @ApiProperty({ enum: ['PIX', 'CARD'] })
  @IsIn(['PIX', 'CARD'])
  method: 'PIX' | 'CARD';

  @ApiPropertyOptional({ example: 'cliente@email.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsString()
  @Matches(/^(\d{11}|\d{14})$/)
  payerDocument: string;

  @ApiPropertyOptional({ example: '4111111111111111' })
  @IsOptional()
  @Matches(/^\d{13,19}$/)
  cardNumber?: string;

  @ApiPropertyOptional({ example: 'CLIENTE TESTE' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  cardHolder?: string;

  @ApiPropertyOptional({ example: '12' })
  @IsOptional()
  @Matches(/^(0[1-9]|1[0-2])$/)
  expiryMonth?: string;

  @ApiPropertyOptional({ example: '2030' })
  @IsOptional()
  @Matches(/^\d{4}$/)
  expiryYear?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @Matches(/^\d{3,4}$/)
  cvv?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(21)
  installments?: number;

  @ApiPropertyOptional({ example: 'VISA' })
  @IsOptional()
  @IsString()
  brand?: string;
}
