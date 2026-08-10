import AppError from '../utils/AppError.js';
import User from '../models/User.js';
import { verifyAccessToken } from '../services/token.service.js';

const authMiddleware = async (request, response, next) => {
  try {
    const bearerToken = request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.split(' ')[1]
      : null;

    const token = request.cookies?.accessToken || bearerToken;

    if (!token) {
      throw new AppError('You are not logged in', 401);
    }

    const decodedToken = verifyAccessToken(token);
    const userId = decodedToken.sub;
    const user = await User.findById(userId);

    if (!user) {
      throw new AppError('User no longer exists', 401);
    }

    request.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(new AppError(error.message || 'Unauthorized access', 401));
  }
};

export default authMiddleware;
