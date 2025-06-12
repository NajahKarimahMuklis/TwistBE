// post.controller.ts
import { Context } from "hono";
import * as PostService from "../services/post.service";

export const handleCreatePost = async (c: Context) => {
  const userId = c.get("user").id;
  const body = await c.req.json();
  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim() === ""
  ) {
    return c.json({ error: "Content is required and cannot be empty" }, 400);
  }

  try {
    const post = await PostService.createPost(userId, body);
    return c.json(post, 201);
  } catch (error) {
    console.error("Error creating post:", error);
    return c.json({ error: "Failed to create post" }, 500);
  }
};

export const handleGetPosts = async (c: Context) => {
  const userId = c.get("user")?.id;
  const limit = Number(c.req.query("limit") || 10);
  const offset = Number(c.req.query("offset") || 0);
  try {
    const posts = await PostService.getPosts(userId, limit, offset);
    return c.json(posts);
  } catch (error) {
    console.error("Error fetching posts:", error);
    return c.json({ error: "Failed to fetch posts" }, 500);
  }
};

export const handleGetPostDetail = async (c: Context) => {
  const postId = Number(c.req.param("postId"));
  const userId = c.get("user")?.id;
  try {
    const post = await PostService.getPostDetail(postId, userId);
    if (!post) return c.json({ error: "Post not found" }, 404);
    return c.json(post);
  } catch (error) {
    console.error("Error fetching post detail:", error);
    return c.json({ error: "Failed to fetch post detail" }, 500);
  }
};

export const handleUpdatePost = async (c: Context) => {
  const userId = c.get("user").id;
  const postId = Number(c.req.param("postId"));
  const body = await c.req.json();

  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim() === ""
  ) {
    return c.json({ error: "Content is required and cannot be empty" }, 400);
  }

  try {
    const updatedPost = await PostService.updatePost(userId, postId, body);
    if (!updatedPost) {
      return c.json({ error: "Post not found or unauthorized" }, 404);
    }
    return c.json(updatedPost);
  } catch (error) {
    console.error("Error updating post:", error);
    return c.json({ error: "Failed to update post" }, 500);
  }
};

export const handleDeletePost = async (c: Context) => {
  const userId = c.get("user").id;
  const postId = Number(c.req.param("postId"));

  try {
    const deleted = await PostService.deletePost(userId, postId);
    if (!deleted) {
      return c.json({ error: "Post not found or unauthorized" }, 404);
    }
    return c.json({ message: "Post deleted successfully" });
  } catch (error) {
    console.error("Error deleting post:", error);
    return c.json({ error: "Failed to delete post" }, 500);
  }
};

export const handleLikePost = async (c: Context) => {
  const userId = c.get("user").id;
  const postId = Number(c.req.param("postId"));
  try {
    const liked = await PostService.toggleLikePost(userId, postId);
    return c.json({ message: liked ? "Post liked" : "Like removed" });
  } catch (error) {
    console.error("Error liking post:", error);
    return c.json({ error: "Failed to toggle like" }, 500);
  }
};

export const handleRepost = async (c: Context) => {
  const userId = c.get("user").id;
  const postId = Number(c.req.param("postId"));
  try {
    const reposted = await PostService.toggleRepost(userId, postId);
    return c.json({ message: reposted ? "Reposted" : "Repost removed" });
  } catch (error) {
    console.error("Error reposting:", error);
    return c.json({ error: "Failed to toggle repost" }, 500);
  }
};

export const handleQuotePost = async (c: Context) => {
  const userId = c.get("user").id;
  const postId = Number(c.req.param("postId"));
  const body = await c.req.json();
  if (!body.quoteContent || typeof body.quoteContent !== "string") {
    return c.json({ error: "Quote content is required" }, 400);
  }
  try {
    const quote = await PostService.quotePost(userId, postId, body);
    return c.json(quote);
  } catch (error) {
    console.error("Error quoting post:", error);
    return c.json({ error: "Failed to quote post" }, 500);
  }
};

export const handleGetPostComments = async (c: Context) => {
  const postId = Number(c.req.param("postId"));
  try {
    const comments = await PostService.getPostComments(postId);
    if (!comments || comments.length === 0) {
      return c.json({ message: "No comments found" }, 200);
    }
    return c.json(comments);
  } catch (error) {
    console.error("Error fetching comments:", error);
    return c.json({ error: "Failed to fetch comments" }, 500);
  }
};

export const handleAddComment = async (c: Context) => {
  const userId = c.get("user").id;
  const postId = Number(c.req.param("postId"));
  const body = await c.req.json();
  if (
    !body.content ||
    typeof body.content !== "string" ||
    body.content.trim() === ""
  ) {
    return c.json({ error: "Content is required and cannot be empty" }, 400);
  }
  try {
    const comment = await PostService.addComment(userId, postId, body.content);
    return c.json(comment, 201);
  } catch (error) {
    console.error("Error adding comment:", error);
    return c.json({ error: "Failed to add comment" }, 500);
  }
};
