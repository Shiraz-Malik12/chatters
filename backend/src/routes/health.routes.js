import { Router } from 'express';

const router = Router();

router.get('/', (request, response) => {
  response.status(200).json({
    success: true,
    message: 'Auth backend is running',
  });
});

export default router;
