import { ForbiddenException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { BlocksService } from "../blocks/blocks.service";
import { CommentSortMode } from "./comment.dto";
import { Comment } from "./comment.entity";
import { CommentLike } from "./comment-like.entity";
import { CommentsService } from "./comments.service";

describe("CommentsService", () => {
  let service: CommentsService;
  let commentRepository: Repository<Comment>;
  let dataSource: DataSource;

  const mockCommentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockCommentLikeRepository = {
    find: jest.fn(),
  };

  const mockBlocksService = {
    getBlockedUserIds: jest.fn().mockResolvedValue([]),
  };

  const mockDataSource = {
    transaction: jest.fn(),
  };

  const createTopLevelQueryBuilder = () => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    loadRelationCountAndMap: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  });

  const createMutationQueryBuilder = (executeResult: unknown) => ({
    insert: jest.fn().mockReturnThis(),
    into: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(executeResult),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepository,
        },
        {
          provide: getRepositoryToken(CommentLike),
          useValue: mockCommentLikeRepository,
        },
        {
          provide: BlocksService,
          useValue: mockBlocksService,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<CommentsService>(CommentsService);
    commentRepository = module.get<Repository<Comment>>(
      getRepositoryToken(Comment),
    );
    dataSource = module.get<DataSource>(DataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates a top-level comment", async () => {
    const createDto = {
      trackId: "track-uuid",
      content: "Great track!",
    };
    const userId = "user-uuid";
    const savedComment = {
      id: "comment-uuid",
      ...createDto,
      userId,
      parentCommentId: null,
      deletedAt: null,
    };

    mockCommentRepository.create.mockReturnValue(savedComment);
    mockCommentRepository.save.mockResolvedValue(savedComment);

    const result = await service.create(createDto, userId);

    expect(mockCommentRepository.create).toHaveBeenCalledWith({
      trackId: createDto.trackId,
      userId,
      content: createDto.content,
      parentCommentId: null,
      deletedAt: null,
    });
    expect(result).toEqual(savedComment);
  });

  it("returns cursor-paginated comments with bounded replies and sort metadata", async () => {
    const createdAt = new Date("2026-04-25T17:00:00.000Z");
    const topLevelQueryBuilder = createTopLevelQueryBuilder();
    const topLevelComments = [
      {
        id: "comment-3",
        content: "Third",
        createdAt: new Date("2026-04-25T16:59:00.000Z"),
        likesCount: 9,
        replyCount: 4,
        replies: [],
      },
      {
        id: "comment-2",
        content: "Second",
        createdAt,
        likesCount: 7,
        replyCount: 2,
        replies: [],
      },
      {
        id: "comment-1",
        content: "First",
        createdAt: new Date("2026-04-25T16:58:00.000Z"),
        likesCount: 5,
        replyCount: 1,
        replies: [],
      },
    ];
    const hydratedReplies = [
      {
        id: "reply-2",
        parentCommentId: "comment-2",
        content: "Reply 2",
        createdAt: new Date("2026-04-25T17:02:00.000Z"),
      },
      {
        id: "reply-1",
        parentCommentId: "comment-3",
        content: "Reply 1",
        createdAt: new Date("2026-04-25T17:01:00.000Z"),
      },
    ];

    topLevelQueryBuilder.getMany.mockResolvedValue(topLevelComments);
    mockCommentRepository.createQueryBuilder.mockReturnValue(
      topLevelQueryBuilder,
    );
    mockCommentRepository.query.mockResolvedValue([
      { id: "reply-1" },
      { id: "reply-2" },
    ]);
    mockCommentRepository.find.mockResolvedValue(hydratedReplies);
    mockCommentLikeRepository.find.mockResolvedValue([
      { commentId: "comment-3" },
      { commentId: "reply-2" },
    ]);

    const result = await service.findByTrack(
      "track-uuid",
      {
        limit: 2,
        replyLimit: 1,
        sort: CommentSortMode.MOST_LIKED,
      },
      "viewer-uuid",
    );

    expect(result.comments).toHaveLength(2);
    expect(result.hasMore).toBe(true);
    expect(result.sort).toBe(CommentSortMode.MOST_LIKED);
    expect(result.replyLimit).toBe(1);
    expect(result.nextCursor).toBeTruthy();
    expect(result.comments[0].replyCount).toBe(4);
    expect(result.comments[0].replies).toHaveLength(1);
    expect(result.comments[0].userLiked).toBe(true);
    expect(result.comments[1].replies[0].userLiked).toBe(true);
    expect(topLevelQueryBuilder.orderBy).toHaveBeenCalledWith(
      "comment.likesCount",
      "DESC",
    );
    expect(mockCommentRepository.query).toHaveBeenCalledWith(
      expect.stringContaining("ROW_NUMBER() OVER"),
      [["comment-3", "comment-2"], 1],
    );
  });

  it("renders deleted parent comments as placeholders while preserving replies", async () => {
    mockCommentRepository.findOne.mockResolvedValue({
      id: "comment-uuid",
      content: "original content",
      deletedAt: new Date("2026-04-25T17:00:00.000Z"),
      isEdited: true,
      createdAt: new Date("2026-04-25T16:59:00.000Z"),
      replies: [
        {
          id: "reply-uuid",
          content: "Still visible",
          createdAt: new Date("2026-04-25T17:01:00.000Z"),
          deletedAt: null,
        },
      ],
    });
    mockCommentLikeRepository.find.mockResolvedValue([]);

    const result = await service.findOne("comment-uuid", "viewer-uuid");

    expect(result.content).toBe("[deleted]");
    expect(result.isDeleted).toBe(true);
    expect(result.replyCount).toBe(1);
    expect(result.replies[0].content).toBe("Still visible");
  });

  it("soft deletes a comment instead of removing the row", async () => {
    const comment = {
      id: "comment-uuid",
      userId: "user-uuid",
      content: "Keep replies",
      deletedAt: null,
    };

    mockCommentRepository.findOne.mockResolvedValue(comment);
    mockCommentRepository.save.mockResolvedValue({
      ...comment,
      deletedAt: new Date(),
      content: "[deleted]",
    });

    await service.delete("comment-uuid", "user-uuid");

    expect(mockCommentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "[deleted]",
        isEdited: false,
      }),
    );
  });

  it("prevents deleting someone else's comment", async () => {
    mockCommentRepository.findOne.mockResolvedValue({
      id: "comment-uuid",
      userId: "owner-uuid",
      deletedAt: null,
    });

    await expect(service.delete("comment-uuid", "other-user")).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("increments likes atomically when a new like is inserted", async () => {
    const insertBuilder = createMutationQueryBuilder({
      affected: 1,
      identifiers: [{ id: "like-uuid" }],
      raw: [],
    });
    const updateBuilder = createMutationQueryBuilder({ affected: 1 });

    mockCommentRepository.findOne.mockResolvedValue({ id: "comment-uuid" });
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback({
        createQueryBuilder: jest
          .fn()
          .mockReturnValueOnce(insertBuilder)
          .mockReturnValueOnce(updateBuilder),
      }),
    );
    jest.spyOn(service, "findOne").mockResolvedValue({
      id: "comment-uuid",
      likesCount: 1,
    } as Comment);

    const result = await service.likeComment("comment-uuid", "user-uuid");

    expect(result.likesCount).toBe(1);
    expect(insertBuilder.orIgnore).toHaveBeenCalled();
    expect(updateBuilder.set).toHaveBeenCalledWith({
      likesCount: expect.any(Function),
    });
  });

  it("treats duplicate likes as idempotent and does not increment the counter", async () => {
    const insertBuilder = createMutationQueryBuilder({
      affected: 0,
      identifiers: [],
      raw: [],
    });

    mockCommentRepository.findOne.mockResolvedValue({ id: "comment-uuid" });
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback({
        createQueryBuilder: jest.fn().mockReturnValue(insertBuilder),
      }),
    );
    jest.spyOn(service, "findOne").mockResolvedValue({
      id: "comment-uuid",
      likesCount: 1,
    } as Comment);

    const result = await service.likeComment("comment-uuid", "user-uuid");

    expect(result.likesCount).toBe(1);
    expect(dataSource.transaction).toHaveBeenCalled();
  });

  it("treats duplicate unlikes as idempotent and never decrements below zero", async () => {
    const deleteBuilder = createMutationQueryBuilder({
      affected: 0,
      raw: [],
    });

    mockCommentRepository.findOne.mockResolvedValue({ id: "comment-uuid" });
    mockDataSource.transaction.mockImplementation(async (callback) =>
      callback({
        createQueryBuilder: jest.fn().mockReturnValue(deleteBuilder),
      }),
    );
    jest.spyOn(service, "findOne").mockResolvedValue({
      id: "comment-uuid",
      likesCount: 0,
    } as Comment);

    const result = await service.unlikeComment("comment-uuid", "user-uuid");

    expect(result.likesCount).toBe(0);
    expect(dataSource.transaction).toHaveBeenCalled();
  });
});
