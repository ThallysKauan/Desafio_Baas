import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutLinkDto } from './dto/create-checkout-link.dto';

@ApiTags('checkout')
@Controller('checkout-links')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateCheckoutLinkDto) {
    return this.checkoutService.create(user.id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  list(@CurrentUser() user: { id: string }, @Query('status') status?: string) {
    return this.checkoutService.list(user.id, status);
  }

  @Get(':id')
  publicCheckout(@Param('id') id: string) {
    return this.checkoutService.findPublic(id);
  }
}
