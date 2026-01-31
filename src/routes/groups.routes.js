import express from "express";
import { createGroup, getMyGroups, addMemberToGroup, leaveGroup} from "../controllers/groups.controller.js";
import protect from '../middleware/auth.middleware.js';

const router = express.Router();
// Create a new group
router.post("/groups/new", protect, createGroup);
// Get all groups for the authenticated user
router.get("/groups", protect, getMyGroups);
// Add a member to a group
router.post("/groups/:groupId/members", protect, addMemberToGroup);
// Leave a group
router.post("/groups/:groupId/leave", protect, leaveGroup);

export default router;
