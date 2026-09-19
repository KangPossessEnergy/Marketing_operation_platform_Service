import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConversationService } from './conversation.service.js';
import {
  CreateConversationDto,
  CreateMessageDto,
  UpdateConversationDto,
} from './dto/conversation.dto.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { CurrentAuthUser } from '../../common/decorators/current-auth-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types/auth.types.js';

@Controller('conversations')
@UseGuards(AccessTokenGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  /**
   * 获取当前登录用户的历史会话列表（按更新时间倒序）
   */
  @Get()
  async getList(@CurrentAuthUser() user: AuthenticatedUser) {
    return this.conversationService.getList(user.id);
  }

  /**
   * 点击“开启新对话”，绑定当前登录用户
   */
  @Post()
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentAuthUser() user: AuthenticatedUser,
  ) {
    return this.conversationService.create(dto, user.id);
  }

  /**
   * 获取某个会话的全部消息记录（附带归属校验）
   */
  @Get(':id')
  async getDetail(
    @Param('id') id: string,
    @CurrentAuthUser() user: AuthenticatedUser,
  ) {
    return this.conversationService.getDetail(id, user.id);
  }

  /**
   * 修改会话标题（附带归属校验）
   */
  @Patch(':id')
  async updateTitle(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
    @CurrentAuthUser() user: AuthenticatedUser,
  ) {
    return this.conversationService.updateTitle(id, dto, user.id);
  }

  /**
   * 追加消息（附带归属校验）
   */
  @Post(':id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
    @CurrentAuthUser() user: AuthenticatedUser,
  ) {
    return this.conversationService.addMessage(id, dto, user.id);
  }

  /**
   * 删除会话（附带归属校验）
   */
  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @CurrentAuthUser() user: AuthenticatedUser,
  ) {
    return this.conversationService.delete(id, user.id);
  }
}
