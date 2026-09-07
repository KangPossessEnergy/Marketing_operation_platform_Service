import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ConversationService } from './conversation.service.js';
import {
  CreateConversationDto,
  CreateMessageDto,
  UpdateConversationDto,
} from './dto/conversation.dto.js';

@Controller('conversations')
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) {}

  /**
   * 获取左侧历史会话列表（按更新时间倒序）
   */
  @Get()
  async getList(@Req() req: any) {
    const userId = req.user?.id;
    return this.conversationService.getList(userId);
  }

  /**
   * 点击“开启新对话”
   */
  @Post()
  async create(@Body() dto: CreateConversationDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.conversationService.create(dto, userId);
  }

  /**
   * 获取某个会话的全部消息记录（切换/刷新恢复选中会话）
   */
  @Get(':id')
  async getDetail(@Param('id') id: string) {
    return this.conversationService.getDetail(id);
  }

  /**
   * 修改会话标题
   */
  @Patch(':id')
  async updateTitle(
    @Param('id') id: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.conversationService.updateTitle(id, dto);
  }

  /**
   * 追加消息
   */
  @Post(':id/messages')
  async addMessage(
    @Param('id') id: string,
    @Body() dto: CreateMessageDto,
  ) {
    return this.conversationService.addMessage(id, dto);
  }

  /**
   * 删除会话
   */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.conversationService.delete(id);
  }
}
