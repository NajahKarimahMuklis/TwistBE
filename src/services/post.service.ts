// post.service.ts
import { prisma } from "../application/database";
import {
  PostPayload,
  UpdatePostRequest,
  CreateCommentRequest,
  CreateRepostRequest,
  PostResponse,
} from "../model/post.types";

const userPublicSelect = {
  id: true,
  username: true,
  displayName: true,
  isVerified: true,
};

const getPostInclude = (currentUserId?: number) => ({
  user: {
    select: userPublicSelect,
  },
  _count: {
    select: { likes: true, comments: true, reposts: true },
  },
  likes: {
    where: { userId: currentUserId },
    select: { userId: true },
  },
  reposts: {
    where: { userId: currentUserId, isQuotePost: false },
    select: { userId: true },
  },
});

const transformPost = (post: any): PostResponse => {
  const { likes, reposts, ...restOfPost } = post;
  return {
    ...restOfPost,
    isLiked: likes?.length > 0,
    isReposted: reposts?.length > 0,
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    repostCount: post._count.reposts,
    createdAt: post.createdAt.toISOString(), // Pastikan format ISO
    updatedAt: post.updatedAt?.toISOString() || null,
    isEdited: post.isEdited || false,
    isPinned: post.isPinned || false,
  };
};

// Membuat postingan baru atau balasan.
export const createPost = async (userId: number, data: PostPayload) => {
  const post = await prisma.post.create({
    data: {
      userId,
      content: data.content || "",
      parentPostId: data.parentPostId,
      isDeleted: false,
    },
    include: getPostInclude(userId),
  });

  if (post.parentPostId) {
    await prisma.post.update({
      where: { id: post.parentPostId },
      data: { commentCount: { increment: 1 } },
    });
  }

  return transformPost(post);
};

// Mengambil semua postingan (timeline utama) dengan paginasi.
export const getPosts = async (
  currentUserId?: number,
  limit = 10,
  offset = 0
) => {
  const whereClause = { isDeleted: false, parentPostId: null };

  const posts = await prisma.post.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: getPostInclude(currentUserId),
    take: limit,
    skip: offset,
  });

  return posts.map(transformPost);
};

/**
 * Mengambil detail satu postingan beserta interaksinya.
 */
export const getPostDetail = async (postId: number, currentUserId?: number) => {
  const post = await prisma.post.findUnique({
    where: { id: postId, isDeleted: false },
    include: {
      ...getPostInclude(currentUserId),
      comments: {
        where: { isDeleted: false },
        include: { user: { select: userPublicSelect } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!post) return null;
  return transformPost(post);
};

/**
 * Memperbarui konten sebuah postingan.
 */
export const updatePost = async (
  userId: number,
  postId: number,
  data: UpdatePostRequest
) => {
  const postToUpdate = await prisma.post.findFirst({
    where: { id: postId, userId, isDeleted: false },
  });

  if (!postToUpdate) return null;

  return prisma.post.update({
    where: { id: postId },
    data: { content: data.content, isEdited: true, updatedAt: new Date() },
    include: getPostInclude(userId),
  });
};

/**
 * Menghapus postingan (Soft Delete).
 */
export const deletePost = async (userId: number, postId: number) => {
  const result = await prisma.post.updateMany({
    where: { id: postId, userId, isDeleted: false },
    data: { isDeleted: true },
  });
  return result.count > 0;
};

/**
 * Memberi atau menghapus 'like' dari sebuah postingan secara atomik.
 */
export const toggleLikePost = async (userId: number, postId: number) => {
  return prisma.$transaction(async (tx) => {
    const existingLike = await tx.like.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existingLike) {
      await tx.like.delete({ where: { id: existingLike.id } });
      await tx.post.update({
        where: { id: postId },
        data: { likeCount: { decrement: 1 } },
      });
      return false;
    } else {
      await tx.like.create({ data: { userId, postId } });
      await tx.post.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
      });
      return true;
    }
  });
};

/**
 * Melakukan repost atau membatalkan repost (bukan quote post).
 */
export const toggleRepost = async (userId: number, postId: number) => {
  return prisma.$transaction(async (tx) => {
    const existingRepost = await tx.repost.findFirst({
      where: { userId, postId, isQuotePost: false },
    });

    if (existingRepost) {
      await tx.repost.delete({ where: { id: existingRepost.id } });
      await tx.post.update({
        where: { id: postId },
        data: { repostCount: { decrement: 1 } },
      });
      return false;
    } else {
      await tx.repost.create({ data: { userId, postId, isQuotePost: false } });
      await tx.post.update({
        where: { id: postId },
        data: { repostCount: { increment: 1 } },
      });
      return true;
    }
  });
};

/**
 * Membuat quote post (repost dengan komentar).
 */
export const quotePost = async (
  userId: number,
  postId: number,
  data: CreateRepostRequest
) => {
  const repost = await prisma.repost.create({
    data: {
      userId,
      postId,
      quoteContent: data.quoteContent,
      isQuotePost: true,
    },
  });

  await prisma.post.update({
    where: { id: postId },
    data: { repostCount: { increment: 1 } },
  });
  return repost;
};

/**
 * Menambahkan komentar baru ke sebuah postingan.
 */
export const addComment = async (
  userId: number,
  postId: number,
  content: string
) => {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.comment.create({
      data: {
        userId,
        postId,
        content: content.trim(), // Pastikan konten tidak kosong
        createdAt: new Date(), // Set createdAt secara eksplisit
        isDeleted: false,
      },
      include: {
        user: { select: userPublicSelect },
      },
    });

    await tx.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    return {
      id: comment.id,
      content: comment.content,
      user: comment.user,
      createdAt: comment.createdAt.toISOString(),
    };
  });
};

/**
 * Mengambil semua komentar dari sebuah postingan.
 */
export const getPostComments = async (postId: number) => {
  const comments = await prisma.comment.findMany({
    where: { postId, isDeleted: false },
    orderBy: { createdAt: "asc" },
    include: {
      user: {
        select: userPublicSelect,
      },
    },
  });

  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content || "No content", // Default jika null
    user: comment.user,
    createdAt: comment.createdAt.toISOString(),
  }));
};
