import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCheckoutLinkDto {
  @ApiProperty({ example: 'Pedido camiseta VBA' })
  @IsString()
  description: string;

  @ApiProperty({ example: 1990, description: 'Valor em centavos' })
  @IsInt()
  @Min(100)
  amountCents: number;

  @ApiProperty({ enum: ['PIX', 'CARD'] })
  @IsIn(['PIX', 'CARD'])
  method: 'PIX' | 'CARD';

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(21)
  installments?: number;

  @ApiPropertyOptional({ example: 2.99 })
  @IsOptional()
  @IsNumber()
  feePercent?: number;

  @ApiPropertyOptional({ example: 'VISA' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsOptional()
  @IsString()
  payerDocument?: string;

  @ApiPropertyOptional({ example: '4111111111111111' })
  @IsOptional()
  @IsString()
  cardNumber?: string;

  @ApiPropertyOptional({ example: 'Cliente Teste' })
  @IsOptional()
  @IsString()
  cardHolder?: string;

  @ApiPropertyOptional({ example: '12' })
  @IsOptional()
  @IsString()
  expiryMonth?: string;

  @ApiPropertyOptional({ example: '2030' })
  @IsOptional()
  @IsString()
  expiryYear?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsOptional()
  @IsString()
  cvv?: string;
}
