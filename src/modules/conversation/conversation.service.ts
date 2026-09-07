import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service.js';
import {
  CreateConversationDto,
  CreateMessageDto,
  UpdateConversationDto,
} from './dto/conversation.dto.js';

@Injectable()
export class ConversationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取会话列表（按最近更新时间倒序排序）
   */
  async getList(userId?: string) {
    return this.prisma.conversation.findMany({
      where: userId ? { userId } : {},
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { messages: true },
        },
      },
    });
  }

  /**
   * 创建新会话（点击“开启新对话”）
   */
  async create(dto: CreateConversationDto, userId?: string) {
    return this.prisma.conversation.create({
      data: {
        title: dto.title?.trim() || '新对话',
        userId: userId || null,
      },
    });
  }

  /**
   * 获取单个会话详情（包含消息列表）
   */
  async getDetail(id: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('会话不存在');
    }

    return conversation;
  }

  /**
   * 重命名会话标题
   */
  async updateTitle(id: string, dto: UpdateConversationDto) {
    await this.getDetail(id);
    return this.prisma.conversation.update({
      where: { id },
      data: { title: dto.title.trim() },
    });
  }

  /**
   * 保存单条消息并触发表的 updatedAt 刷新
   */
  async addMessage(conversationId: string, dto: CreateMessageDto) {
    await this.getDetail(conversationId);
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role: dto.role,
          content: dto.content,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return message;
  }

  /**
   * 删除会话
   */
  async delete(id: string) {
    await this.getDetail(id);
    return this.prisma.conversation.delete({
      where: { id },
    });
  }
}
