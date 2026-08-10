import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import { search } from '../controllers/user.controller.js';

const router = Router();

router.use(auth);

router.get('/', search);

export default router;
