import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
   * 获取会话列表（严格按当前用户隔离，按最近更新时间倒序排序）
   */
  async getList(userId: string) {
    if (!userId) {
      return [];
    }

    return this.prisma.conversation.findMany({
      where: { userId },
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
   * 创建新会话（绑定当前用户）
   */
  async create(dto: CreateConversationDto, userId: string) {
    return this.prisma.conversation.create({
      data: {
        title: dto.title?.trim() || '新对话',
        userId,
      },
    });
  }

  /**
   * 获取单个会话详情（包含消息列表），严格校验是否属于当前用户
   */
  async getDetail(id: string, userId?: string) {
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

    // 若会话有所属用户且与当前访问者不一致，禁止跨账号访问
    if (userId && conversation.userId && conversation.userId !== userId) {
      throw new ForbiddenException('无权访问该会话');
    }

    return conversation;
  }

  /**
   * 重命名会话标题
   */
  async updateTitle(id: string, dto: UpdateConversationDto, userId?: string) {
    await this.getDetail(id, userId);
    return this.prisma.conversation.update({
      where: { id },
      data: { title: dto.title.trim() },
    });
  }

  /**
   * 保存单条消息并触发表的 updatedAt 刷新
   */
  async addMessage(conversationId: string, dto: CreateMessageDto, userId?: string) {
    await this.getDetail(conversationId, userId);
    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          conversationId,
          role: dto.role,
          content: dto.content,
          reasoningContent: dto.reasoningContent || null,
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
  async delete(id: string, userId?: string) {
    await this.getDetail(id, userId);
    return this.prisma.conversation.delete({
      where: { id },
    });
  }
}
