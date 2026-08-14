import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { CheckoutModule } from './checkout/checkout.module';
import { GatewayModule } from './gateway/gateway.module';
import { WalletModule } from './wallet/wallet.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { CorrelationIdMiddleware } from './common/correlation-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), '..', 'frontend', 'dist'),
      exclude: ['/api', '/api/(.*)', '/docs', '/docs/(.*)']
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        return {
          type: 'mysql',
          url,
          host: url ? undefined : config.get('DB_HOST', 'localhost'),
          port: url ? undefined : config.get<number>('DB_PORT', 3306),
          username: url ? undefined : config.get('DB_USERNAME', 'baas'),
          password: url ? undefined : config.get('DB_PASSWORD', 'baas'),
          database: url ? undefined : config.get('DB_DATABASE', 'baas'),
          autoLoadEntities: true,
          synchronize: true
        };
      }
    }),
    AuthModule,
    GatewayModule,
    CheckoutModule,
    WalletModule,
    WithdrawalsModule,
    WebhooksModule
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
