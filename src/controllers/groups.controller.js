import Group from "../models/group.js";
import User from "../models/user.js";

// Create a new group
export const createGroup = async (req, res) => {
  const { name } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ message: "Group name is required" });
  }

  const group = await Group.create({
    name: name.trim(),
    members: [req.user._id],
    createdBy: req.user._id
  });

  res.status(201).json({
    id: group._id,
    name: group.name,
    members: group.members,
    createdBy: group.createdBy,
    createdAt: group.createdAt
  });
};

// Get all groups for the authenticated user
export const getMyGroups = async (req, res) => {
  const groups = await Group.find({
    members: req.user._id
  })
    .sort({ updatedAt: -1 })
    .select("name members createdBy createdAt");

  const formattedGroups = groups.map(group => ({
    id: group._id,
    name: group.name,
    memberCount: group.members.length,
    createdBy: group.createdBy,
    createdAt: group.createdAt
  }));

  res.status(200).json(formattedGroups);
};

// Add a member to a group
export const addMemberToGroup = async (req, res) => {
  const { groupId } = req.params;
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  // 1. Find the group
  const group = await Group.findById(groupId);
  if (!group) {
    return res.status(404).json({ message: "Group not found" });
  }

  // 2. Only members can add others
  if (!group.members.includes(req.user._id)) {
    return res.status(403).json({ message: "Not authorized to add members" });
  }

  // 3. Find user by email
  const userToAdd = await User.findOne({ email });
  if (!userToAdd) {
    return res.status(404).json({
      message: "User not found. Invite flow coming next."
    });
  }

  // 4. Prevent duplicates
  if (group.members.includes(userToAdd._id)) {
    return res.status(400).json({
      message: "User already a member of the group"
    });
  }

  // 5. Add user
  group.members.push(userToAdd._id);
  await group.save();

  res.status(200).json({
    message: "Member added successfully",
    groupId: group._id,
    memberId: userToAdd._id
  });
};
