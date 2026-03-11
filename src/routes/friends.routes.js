import express from "express";
import { getFriends, addFriend, removeFriend } from "../controllers/friends.controller.js";
import protect from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/friends", protect, getFriends);
router.post("/friends", protect, addFriend);
router.delete("/friends/:friendId", protect, removeFriend);

export default router;