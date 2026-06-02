import express from "express";
import { getFriends, addFriend, addFriendById, removeFriend } from "../controllers/friends.controller.js";
import protect from "../middleware/auth.middleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const router = express.Router();

router.get("/friends", protect, getFriends);
router.post("/friends", protect, addFriend);
router.post("/friends/add-by-id", protect, asyncHandler(addFriendById));
router.delete("/friends/:friendId", protect, removeFriend);

export default router;