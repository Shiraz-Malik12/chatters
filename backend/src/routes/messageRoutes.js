import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import handleImageUpload from '../middleware/uploadMiddleware.js';
import {
  createMessage,
  getConversationMessages,
  markConversationRead,
  reactToMessage,
  removeMessage,
  searchConversationMessages,
  updateMessage,
} from '../controllers/messageController.js';

const router = Router();

router.use(auth);

router.get('/conversation/:id', getConversationMessages);
// handleImageUpload only engages for multipart/form-data bodies, so this
// single endpoint keeps serving plain JSON text messages unchanged.
router.post('/conversation/:id', handleImageUpload, createMessage);
router.put('/conversation/:id/read', markConversationRead);
router.put('/:id', updateMessage);
router.delete('/:id', removeMessage);
router.post('/:id/react', reactToMessage);
router.get('/search', searchConversationMessages);

export default router;
