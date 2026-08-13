import { Router } from 'express';
import auth from '../middleware/auth.middleware.js';
import handleImageUpload from '../middleware/uploadMiddleware.js';
import {
  createMessage,
  getConversationMessages,
  markConversationRead,
  reactToAttachment,
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
// Same trick as the send route: handleImageUpload is a no-op for plain JSON
// edits, and only parses files when the edit swaps out the images.
router.put('/:id', handleImageUpload, updateMessage);
router.delete('/:id', removeMessage);
router.post('/:id/react', reactToMessage);
router.post('/attachments/:attachmentId/react', reactToAttachment);
router.get('/search', searchConversationMessages);

export default router;
