import { Hono } from "hono";
import {
  deleteUserAccount,
  getAllUsers,
  updateUserProfile,
} from "../controllers/user.controller";
import { authMiddleware } from "../middleware/auth";

const user = new Hono();

user.get("/", getAllUsers);

user.patch("/update", authMiddleware, updateUserProfile);
user.delete("/delete", authMiddleware, deleteUserAccount);

export default user;
