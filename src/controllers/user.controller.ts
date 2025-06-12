import { Context } from "hono";
import { UserService } from "../services/user.service";
import { deleteCookie } from "hono/cookie";

/**
 * Controller untuk mengambil semua data pengguna.
 * Tidak memerlukan otentikasi.
 */
export const getAllUsers = async (c: Context) => {
  try {
    // Di sini kita bisa menambahkan logika paginasi dari query params
    const page = Number(c.req.query("page")) || 1;
    const limit = Number(c.req.query("limit")) || 20;

    const result = await UserService.getAllUsers({ page, limit });

    if (!result.data || result.data.length === 0) {
      return c.json({ message: "Data user kosong" }, 404);
    }

    return c.json({
      message: "Berhasil mendapatkan semua user",
      data: result.data,
      pagination: {
        total: result.total,
        page,
        limit,
      },
    });
  } catch (error: any) {
    console.error("Error getAllUsers:", error);
    return c.json(
      { message: "Internal Server Error", error: error.message },
      500
    );
  }
};

/**
 * Memperbarui profil PENGGUNA YANG SEDANG LOGIN.
 * Mengambil userId dari context yang sudah disiapkan oleh middleware.
 */
export const updateUserProfile = async (c: Context) => {
  try {
    // --- LANGKAH DEBUGGING ---
    // Kita akan mencetak isi dari context untuk melihat apa yang diterima dari middleware.
    console.log("--- DEBUG: Inside updateUserProfile ---");
    const userPayload = c.get("user");
    console.log("Payload received from middleware:", userPayload);
    // --- AKHIR DEBUGGING ---

    // Pengecekan keamanan untuk memastikan middleware berjalan
    if (!userPayload || !userPayload.id) {
      console.error(
        "Authentication failed: User payload or ID not found in context."
      );
      return c.json(
        { error: "Otentikasi gagal, user ID tidak ditemukan." },
        401
      );
    }
    const userId = userPayload.id;
    console.log("Attempting to update profile for userId:", userId);

    const dataToUpdate = await c.req.json();
    if (Object.keys(dataToUpdate).length === 0) {
      return c.json(
        { error: "Tidak ada data yang dikirim untuk diupdate" },
        400
      );
    }

    const updatedUser = await UserService.updateProfile(userId, dataToUpdate);

    return c.json({
      message: "Profil berhasil diperbarui",
      user: updatedUser,
    });
  } catch (err: any) {
    console.error("Error in updateUserProfile controller:", err);
    if (err.message?.includes("sudah digunakan")) {
      return c.json({ error: "Username atau email sudah digunakan" }, 409);
    }
    return c.json(
      { error: "Gagal memperbarui profil", details: err.message },
      500
    );
  }
};

/**
 * Menghapus akun PENGGUNA YANG SEDANG LOGIN.
 */
export const deleteUserAccount = async (c: Context) => {
  try {
    const userPayload = c.get("user");
    if (!userPayload || !userPayload.id) {
      return c.json(
        { error: "Otentikasi gagal, user ID tidak ditemukan." },
        401
      );
    }
    const userId = userPayload.id;

    const success = await UserService.deleteUser(userId);

    if (!success) {
      return c.json(
        { message: "Pengguna tidak ditemukan saat proses hapus" },
        404
      );
    }

    // Hapus cookie untuk menyelesaikan proses logout
    deleteCookie(c, "refreshToken", { path: "/" });

    return c.json({ message: "Akun berhasil dihapus secara permanen" });
  } catch (error: any) {
    console.error("Error deleteUserAccount:", error);
    return c.json(
      { message: "Gagal menghapus akun", error: error.message },
      500
    );
  }
};

/**
 * Controller untuk mendapatkan saran pengguna (misalnya untuk fitur "Who to follow").
 */
export const getUserSuggestions = async (c: Context) => {
  try {
    const result = await UserService.getSuggestions();
    return c.json(result);
  } catch (error: any) {
    console.error("Error getUserSuggestions:", error);
    return c.json(
      { message: "Error getting user suggestions", error: error.message },
      500
    );
  }
};
