export const SMS_GATEWAY = Symbol('SMS_GATEWAY');

export interface SmsGateway {
  send(phone: string, code: string): Promise<void>;
}
