import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateGatewayWebhookDto } from './dto/create-gateway-webhook.dto';
import { GatewayService } from './gateway.service';

@ApiTags('gateway')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Get('fees')
  fees(@Query('brand') brand?: string) {
    return this.gatewayService.getFees(brand);
  }

  @Get('webhooks')
  webhooks(@CurrentUser() user: { id: string }) {
    return this.gatewayService.listWebhooks(user.id);
  }

  @Post('webhooks')
  createWebhook(@CurrentUser() user: { id: string }, @Body() dto: CreateGatewayWebhookDto) {
    return this.gatewayService.createWebhook(user.id, dto);
  }

  @Delete('webhooks/:id')
  deleteWebhook(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.gatewayService.deleteWebhook(user.id, id);
  }
}
