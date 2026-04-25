import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Comment } from "./comment.entity";
import { CommentLike } from "./comment-like.entity";
import { CommentLikeRepairService } from "./comment-like-repair.service";

describe("CommentLikeRepairService", () => {
  let service: CommentLikeRepairService;

  const mockCommentRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockCommentLikeRepository = {
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentLikeRepairService,
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepository,
        },
        {
          provide: getRepositoryToken(CommentLike),
          useValue: mockCommentLikeRepository,
        },
      ],
    }).compile();

    service = module.get<CommentLikeRepairService>(CommentLikeRepairService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("repairs a drifted likes count for a single comment", async () => {
    const comment = {
      id: "comment-uuid",
      likesCount: 5,
    } as Comment;

    mockCommentRepository.findOne.mockResolvedValue(comment);
    mockCommentLikeRepository.count.mockResolvedValue(2);
    mockCommentRepository.save.mockResolvedValue({
      ...comment,
      likesCount: 2,
    });

    const result = await service.repairCommentLikesCount("comment-uuid");

    expect(result.likesCount).toBe(2);
    expect(mockCommentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "comment-uuid",
        likesCount: 2,
      }),
    );
  });

  it("throws when repairing a comment that does not exist", async () => {
    mockCommentRepository.findOne.mockResolvedValue(null);

    await expect(
      service.repairCommentLikesCount("missing-comment"),
    ).rejects.toThrow(NotFoundException);
  });

  it("repairs all drifted comment counters", async () => {
    mockCommentRepository.find.mockResolvedValue([
      { id: "comment-1", likesCount: 4 },
      { id: "comment-2", likesCount: 1 },
    ]);
    mockCommentLikeRepository.count
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(3);

    const repairedCount = await service.repairAllCommentLikesCounts();

    expect(repairedCount).toBe(1);
    expect(mockCommentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "comment-2",
        likesCount: 3,
      }),
    );
  });
});
