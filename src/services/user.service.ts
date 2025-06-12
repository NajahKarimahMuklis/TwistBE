import { prisma } from "../application/database";
import {
  UpdateProfileRequest,
  UserProfile,
  PaginationQuery,
  UserSettingsRequest,
  UserSearchResult,
  SearchUsersQuery,
} from "../model/user.types"; // Pastikan path ini benar

// Objek select standar untuk data user yang aman dan bersifat publik.
const userPublicSelect = {
  id: true,
  username: true,
  email: true,
  displayName: true,
  bio: true,
  followerCount: true,
  followingCount: true,
  createdAt: true,
  isVerified: true,
};

export class UserService {
  /**
   * Mengambil profil publik satu user dan status follow dari user saat ini.
   */
  static async getProfile(
    userId: number,
    currentUserId?: number
  ): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect,
    });

    if (!user) {
      return null;
    }

    let isFollowing = false;
    if (currentUserId && currentUserId !== userId) {
      const follow = await prisma.follower.findUnique({
        where: {
          userId_followingId: { userId: currentUserId, followingId: userId },
        },
      });
      isFollowing = !!follow;
    }

    return { ...user, isFollowing };
  }

  /**
   * Memperbarui profil pengguna yang sedang login.
   */
  static async updateProfile(
    userId: number,
    data: UpdateProfileRequest
  ): Promise<UserProfile> {
    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data,
        select: userPublicSelect,
      });
      return updatedUser;
    } catch (err: any) {
      if (err.code === "P2002") {
        throw new Error("Username atau email sudah digunakan");
      }
      throw err;
    }
  }

  /**
   * Menghapus akun pengguna dan semua data terkaitnya secara permanen.
   */
  static async deleteUser(userId: number): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return false;

    await prisma.$transaction([
      prisma.like.deleteMany({ where: { userId } }),
      prisma.comment.deleteMany({ where: { userId } }),
      prisma.repost.deleteMany({ where: { userId } }),
      prisma.follower.deleteMany({
        where: { OR: [{ userId }, { followingId: userId }] },
      }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
      prisma.post.deleteMany({ where: { userId } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);

    return true;
  }

  /**
   * Mengambil daftar followers dengan paginasi.
   */
  static async getFollowers(userId: number, pagination: PaginationQuery) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;
    const whereClause = { followingId: userId };

    const [followers, total] = await prisma.$transaction([
      prisma.follower.findMany({
        where: whereClause,
        include: { follower: { select: userPublicSelect } },
        take: limit,
        skip: skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.follower.count({ where: whereClause }),
    ]);

    return { data: followers.map((f) => f.follower), total };
  }

  /**
   * Mengambil daftar orang yang di-follow dengan paginasi.
   */
  static async getFollowing(userId: number, pagination: PaginationQuery) {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;
    const whereClause = { userId: userId };

    const [following, total] = await prisma.$transaction([
      prisma.follower.findMany({
        where: whereClause,
        include: { following: { select: userPublicSelect } },
        take: limit,
        skip: skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.follower.count({ where: whereClause }),
    ]);

    return { data: following.map((f) => f.following), total };
  }

  /**
   * Mencari pengguna berdasarkan username atau displayName.
   */
  static async searchUsers(query: SearchUsersQuery) {
    const { q, limit = 10, offset = 0 } = query;
    const whereClause = {
      OR: [
        { username: { contains: q, mode: "insensitive" as const } },
        { displayName: { contains: q, mode: "insensitive" as const } },
      ],
      isActive: true,
    };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where: whereClause,
        select: { id: true, username: true, displayName: true },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    return { data: users, total };
  }

  /**
   * Logika untuk follow seorang pengguna.
   */
  static async followUser(userId: number, followingId: number): Promise<void> {
    if (userId === followingId) {
      throw new Error("Tidak bisa mem-follow diri sendiri");
    }

    // Cek apakah sudah follow sebelumnya untuk menghindari duplikasi
    const existingFollow = await prisma.follower.findUnique({
      where: { userId_followingId: { userId, followingId } },
    });

    if (existingFollow) {
      return; // Jika sudah follow, tidak melakukan apa-apa
    }

    // Gunakan transaksi untuk memastikan semua update count berhasil
    await prisma.$transaction([
      prisma.follower.create({ data: { userId, followingId } }),
      prisma.user.update({
        where: { id: userId },
        data: { followingCount: { increment: 1 } },
      }),
      prisma.user.update({
        where: { id: followingId },
        data: { followerCount: { increment: 1 } },
      }),
    ]);
  }

  /**
   * Logika untuk unfollow seorang pengguna.
   */
  static async unfollowUser(
    userId: number,
    followingId: number
  ): Promise<void> {
    // Gunakan transaksi untuk memastikan semua update count berhasil
    // deleteMany akan mengembalikan jumlah record yang dihapus
    const deleteResult = await prisma.$transaction(async (tx) => {
      const deletedFollow = await tx.follower.deleteMany({
        where: { userId, followingId },
      });

      if (deletedFollow.count > 0) {
        await tx.user.update({
          where: { id: userId },
          data: { followingCount: { decrement: 1 } },
        });
        await tx.user.update({
          where: { id: followingId },
          data: { followerCount: { decrement: 1 } },
        });
      }
      return deletedFollow;
    });
  }

  /**
   * Memperbarui pengaturan pengguna.
   * Note: Berdasarkan skema, field 'isPrivate' tidak ada.
   * Fungsi ini akan meng-handle field yang ada di UserSettingsRequest.
   */
  static async updateSettings(
    userId: number,
    data: UserSettingsRequest
  ): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        displayName: data.displayName,
        bio: data.bio,
        email: data.email,
        // Anda bisa menambahkan field lain di sini jika ada di skema
      },
    });
  }

  /**
   * Mengambil daftar pengguna yang disarankan (misal, paling populer).
   */
  static async getSuggestions(): Promise<UserSearchResult[]> {
    return prisma.user.findMany({
      where: { isActive: true },
      orderBy: { followerCount: "desc" },
      select: {
        id: true,
        username: true,
        displayName: true,
      },
      take: 10,
    });
  }

  /**
   * Mengambil daftar semua pengguna dengan paginasi (untuk admin).
   */
  static async getAllUsers(
    pagination: PaginationQuery
  ): Promise<{ data: UserProfile[]; total: number }> {
    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;
    const whereClause = { isActive: true };

    const [users, total] = await prisma.$transaction([
      prisma.user.findMany({
        where: whereClause,
        select: userPublicSelect,
        take: limit,
        skip: skip,
        orderBy: { createdAt: "desc" },
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    return { data: users, total };
  }
}
