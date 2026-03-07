import express from "express";
import {
  createGroup,
  getMyGroups,
  addMemberToGroup,
  leaveGroup,
  getGroupsSummary,
  getGroupMembers,
  getGroupSettings,
  renameGroup,
  updateGroupEmoji,
  updateDefaultSplitType,
  removeMemberFromGroup,
  deleteGroup,
} from "../controllers/groups.controller.js";
import protect from "../middleware/auth.middleware.js";

const router = express.Router();

// ── Static routes first ───────────────────────────────────────────────────────
router.post("/groups/new", protect, createGroup);
router.get("/groups", protect, getMyGroups);
router.get("/groups/summary", protect, getGroupsSummary);

// ── Member routes ─────────────────────────────────────────────────────────────
router.post("/groups/:groupId/members", protect, addMemberToGroup);
router.delete("/groups/:groupId/members/:memberId", protect, removeMemberFromGroup);
router.get("/groups/:groupId/members", protect, getGroupMembers);

// ── Settings routes ───────────────────────────────────────────────────────────
router.get("/groups/:groupId/settings", protect, getGroupSettings);
router.patch("/groups/:groupId/name", protect, renameGroup);
router.patch("/groups/:groupId/emoji", protect, updateGroupEmoji);
router.patch("/groups/:groupId/settings/split-type", protect, updateDefaultSplitType);

// ── Broad routes last ─────────────────────────────────────────────────────────
router.post("/groups/:groupId/leave", protect, leaveGroup);
router.delete("/groups/:groupId", protect, deleteGroup);

export default router;