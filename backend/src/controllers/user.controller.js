import asyncHandler from '../middleware/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import { searchUsers } from '../services/user.service.js';

const search = asyncHandler(async (request, response) => {
  const users = await searchUsers({
    query: request.query.query,
    excludeUserId: request.user.id,
  });

  return response.status(200).json(ApiResponse.success(users, 'Users fetched successfully'));
});

export { search };
