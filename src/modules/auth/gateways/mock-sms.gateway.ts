import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { SmsGateway } from './sms.gateway.js';

@Injectable()
export class MockSmsGateway implements SmsGateway {
  private readonly logger = new Logger(MockSmsGateway.name);

  async send(phone: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException(
        '生产环境必须配置真实的短信服务提供商',
      );
    }

    if (process.env.NODE_ENV !== 'test') {
      this.logger.log(`[mock sms] ${phone}: ${code}`);
    }
  }
}
