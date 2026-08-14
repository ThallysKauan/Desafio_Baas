import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCheckoutLinkDto {
  @ApiProperty({ example: 'Pedido camiseta VBA' })
  @IsString()
  @MinLength(3)
  description: string;

  @ApiProperty({ example: 1990, description: 'Valor em centavos' })
  @IsInt()
  @Min(100)
  amountCents: number;

  @ApiProperty({ example: 'cliente@email.com' })
  @IsEmail()
  customerEmail: string;

  @ApiProperty({ enum: ['PIX', 'CARD', 'BOTH'] })
  @IsIn(['PIX', 'CARD', 'BOTH'])
  method: 'PIX' | 'CARD' | 'BOTH';

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(21)
  installments?: number;

}
