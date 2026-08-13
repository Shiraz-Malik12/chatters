import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import { requestVideoUploadSignature } from '../controllers/mediaController.js';

const router = Router();

router.use(auth);

router.post('/upload-signature', requestVideoUploadSignature);

export default router;
