import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('payment-pix')
  pix(@Body() payload: Record<string, unknown>, @Headers('x-lera-box-signature') signature?: string) {
    return this.webhooksService.handle('PAYMENT_PIX', payload, signature);
  }

  @Post('payment-card')
  card(@Body() payload: Record<string, unknown>, @Headers('x-lera-box-signature') signature?: string) {
    return this.webhooksService.handle('PAYMENT_CARD', payload, signature);
  }

  @Post('withdrawal')
  withdrawal(@Body() payload: Record<string, unknown>, @Headers('x-lera-box-signature') signature?: string) {
    return this.webhooksService.handle('WITHDRAWAL', payload, signature);
  }
}
