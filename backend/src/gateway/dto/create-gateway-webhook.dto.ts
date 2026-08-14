import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUrl } from 'class-validator';

export class CreateGatewayWebhookDto {
  @ApiProperty({ example: 'https://meu-app.up.railway.app/api/webhooks/payment-pix' })
  @IsUrl({ require_tld: false })
  url: string;

  @ApiProperty({ enum: ['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'] })
  @IsIn(['PAYMENT_PIX', 'PAYMENT_CARD', 'WITHDRAWAL'])
  event: string;
}
