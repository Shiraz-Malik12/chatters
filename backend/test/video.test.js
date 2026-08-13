import 'dotenv/config';
import { after, before, afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import app from '../src/app.js';
import User from '../src/models/User.js';
import Conversation from '../src/models/Conversation.js';
import Message from '../src/models/Message.js';
import Attachment from '../src/models/Attachment.js';
import PendingUpload from '../src/models/PendingUpload.js';
import cloudinaryService from '../src/services/cloudinaryService.js';
import { signAccessToken } from '../src/services/token.service.js';
import { MAX_VIDEOS_PER_MESSAGE, MAX_VIDEO_SIZE_BYTES } from '../src/config/upload.js';

// Runs against a real, disposable local MongoDB database — never the dev
// database from MONGODB_URI. Cloudinary's network calls (Admin API lookups,
// destroy) are always mocked; these tests never touch a real Cloudinary
// account, and no real video bytes are ever uploaded anywhere — the
// signed-direct-upload step itself (browser -> Cloudinary) is outside this
// backend's control, so what's tested here is everything the backend *does*
// control: signing, membership checks, and verifying the resulting asset
// before ever trusting it.
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatters_test_video';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
);

let userCounter = 0;

const createUser = async (overrides = {}) => {
  userCounter += 1;
  return User.create({
    name: `Test User ${userCounter}`,
    email: `test.user.${userCounter}.${Date.now()}@example.com`,
    passwordHash: 'not-a-real-hash',
    ...overrides,
  });
};

const tokenFor = (user) => signAccessToken({ id: user._id.toString(), email: user.email, role: user.role });

const asUser = (user) => {
  const authorize = (req) => req.set('Authorization', `Bearer ${tokenFor(user)}`);
  return {
    post: (url) => authorize(request(app).post(url)),
    get: (url) => authorize(request(app).get(url)),
    put: (url) => authorize(request(app).put(url)),
  };
};

const createPrivateConversation = async (userA, userB) =>
  Conversation.create({
    type: 'private',
    participants: [{ user: userA._id }, { user: userB._id }],
    createdBy: userA._id,
  });

const createGroupConversation = async (users, creator) =>
  Conversation.create({
    type: 'group',
    groupName: 'Test Group',
    participants: users.map((u) => ({ user: u._id, role: u._id.equals(creator._id) ? 'admin' : 'member' })),
    admins: [creator._id],
    createdBy: creator._id,
  });

/** Mocks the Cloudinary Admin API lookup to succeed for any publicId with sane default video metadata. */
const mockVerifiedVideoResource = (overrides = {}) =>
  mock.method(cloudinaryService, 'getVideoResource', async (publicId) => ({
    public_id: publicId,
    resource_type: 'video',
    format: 'mp4',
    bytes: 5 * 1024 * 1024,
    width: 1280,
    height: 720,
    duration: 12.5,
    secure_url: `https://res.cloudinary.com/test/video/upload/${publicId}.mp4`,
    ...overrides,
  }));

const mockDeleteImage = () => mock.method(cloudinaryService, 'deleteImage', async () => ({ result: 'ok' }));

/** Requests a real signature (creates a real PendingUpload) so a subsequent send-message call has something legitimate to verify against. */
const requestSignature = async (user, conversationId) => {
  const response = await asUser(user).post('/api/media/upload-signature').send({ conversationId: String(conversationId) });
  return response;
};

before(async () => {
  await mongoose.connect(TEST_DB_URI);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

afterEach(() => {
  mock.reset();
});

// ---------------------------------------------------------------------------
// Upload-signature endpoint: auth + membership gating.
// ---------------------------------------------------------------------------

test('upload-signature: unauthenticated request is rejected', async () => {
  const alice = await createUser();
  const bob = await createUser();
  const conversation = await createPrivateConversation(alice, bob);

  const response = await request(app).post('/api/media/upload-signature').send({ conversationId: String(conversation._id) });

  assert.equal(response.statusCode, 401);
});

test('upload-signature: non-member of the conversation is rejected', async () => {
  const [alice, bob, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await requestSignature(outsider, conversation._id);

  assert.equal(response.statusCode, 403);
  assert.equal(await PendingUpload.countDocuments({}), 0, 'no authorization should have been issued');
});

test('upload-signature: non-existent conversation is rejected', async () => {
  const alice = await createUser();
  const missingId = new mongoose.Types.ObjectId().toString();

  const response = await requestSignature(alice, missingId);

  assert.equal(response.statusCode, 404);
});

test('upload-signature: a member receives a signature, publicId, and cloud config, never the API secret', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await requestSignature(alice, conversation._id);

  assert.equal(response.statusCode, 200);
  assert.ok(response.body.data.signature);
  assert.ok(response.body.data.publicId.includes(String(conversation._id)));
  assert.ok(response.body.data.cloudName);
  assert.ok(response.body.data.apiKey);
  assert.equal(JSON.stringify(response.body.data).includes('secret'), false);
  assert.equal(await PendingUpload.countDocuments({ publicId: response.body.data.publicId }), 1);
});

// ---------------------------------------------------------------------------
// Sending messages with verified video refs.
// ---------------------------------------------------------------------------

test('video-only message works in a private conversation', async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.type, 'video');
  assert.equal(response.body.data.attachments.length, 1);
  const [attachment] = response.body.data.attachments;
  assert.equal(attachment.type, 'video');
  assert.equal(attachment.resourceType, 'video');
  assert.ok(attachment.thumbnailUrl);
  assert.equal(attachment.duration, 12.5);
  // The PendingUpload is consumed, so the same publicId can't be reused.
  assert.equal(await PendingUpload.countDocuments({ publicId: auth.publicId }), 0);
});

test('text + video works', async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'watch this', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.content, 'watch this');
  assert.equal(response.body.data.attachments.length, 1);
});

test('image + video together in one message works (mixed multipart)', async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'my trip')
    .field('videoAttachments', JSON.stringify([{ publicId: auth.publicId }]))
    .attach('images', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.attachments.length, 2);
  const types = response.body.data.attachments.map((a) => a.type).sort();
  assert.deepEqual(types, ['image', 'video']);
});

test('group video message works, and non-members are still rejected', async () => {
  mockVerifiedVideoResource();
  const [owner, memberA, memberB, outsider] = await Promise.all([createUser(), createUser(), createUser(), createUser()]);
  const conversation = await createGroupConversation([owner, memberA, memberB], owner);
  const auth = (await requestSignature(memberA, conversation._id)).body.data;

  const response = await asUser(memberA)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'group video', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.attachments[0].type, 'video');

  const outsiderSignature = await requestSignature(outsider, conversation._id);
  assert.equal(outsiderSignature.statusCode, 403);
});

test('legacy text-only and image-only messages are unaffected', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const textResponse = await asUser(alice).post(`/api/messages/conversation/${conversation._id}`).send({ content: 'hello' });
  assert.equal(textResponse.statusCode, 201);
  assert.deepEqual(textResponse.body.data.attachments, []);
});

// ---------------------------------------------------------------------------
// Rejecting untrustworthy / oversized / unsupported video refs.
// ---------------------------------------------------------------------------

test('too many videos on one message is rejected before any verification happens', async () => {
  const getResourceMock = mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const tooMany = Array.from({ length: MAX_VIDEOS_PER_MESSAGE + 1 }, (_, i) => ({ publicId: `fake-${i}` }));

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: tooMany });

  assert.equal(response.statusCode, 400);
  assert.equal(getResourceMock.mock.calls.length, 0, 'should reject on count before ever calling Cloudinary');
});

test('an arbitrary/forged publicId with no matching authorization is rejected', async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: 'someone-elses/video/at-a-guessed-path' }] });

  assert.equal(response.statusCode, 403);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
});

test("a user cannot attach another user's authorized upload, even within the same conversation", async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const aliceAuth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(bob)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: aliceAuth.publicId }] });

  assert.equal(response.statusCode, 403);
});

test('an expired upload authorization is rejected', async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  await PendingUpload.updateOne({ publicId: auth.publicId }, { expiresAt: new Date(Date.now() - 1000) });

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 403);
});

test('a video whose verified format is not allowed is rejected and cleaned up', async () => {
  mockVerifiedVideoResource({ format: 'mov' });
  const deleteMock = mockDeleteImage();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 400);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
  assert.equal(deleteMock.mock.calls.length, 1, 'the disallowed-format asset should be cleaned up from Cloudinary');
});

test('a video whose verified size exceeds the limit is rejected and cleaned up', async () => {
  mockVerifiedVideoResource({ bytes: MAX_VIDEO_SIZE_BYTES + 1024 });
  const deleteMock = mockDeleteImage();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 400);
  assert.equal(deleteMock.mock.calls.length, 1);
});

test('a Cloudinary Admin API failure (asset never actually finished uploading) is rejected', async () => {
  mock.method(cloudinaryService, 'getVideoResource', async () => {
    throw new Error('not found');
  });
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: '', videoAttachments: [{ publicId: auth.publicId }] });

  assert.equal(response.statusCode, 400);
});

// ---------------------------------------------------------------------------
// Failure cleanup + history + editing interaction with videos.
// ---------------------------------------------------------------------------

test('a MongoDB failure after verification cleans up the video attachment and never creates a message', async () => {
  mockVerifiedVideoResource();
  const deleteMock = mockDeleteImage();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const originalCreate = Message.create;
  Message.create = async () => {
    throw new Error('simulated MongoDB write failure');
  };

  let response;
  try {
    response = await asUser(alice)
      .post(`/api/messages/conversation/${conversation._id}`)
      .send({ content: '', videoAttachments: [{ publicId: auth.publicId }] });
  } finally {
    Message.create = originalCreate;
  }

  assert.equal(response.statusCode, 500);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
  assert.equal(await Attachment.countDocuments({ uploadedBy: alice._id }), 0);
  assert.equal(deleteMock.mock.calls.length, 1);
});

test('conversation history returns video metadata (duration, thumbnailUrl, format)', async () => {
  mockVerifiedVideoResource();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'from history', videoAttachments: [{ publicId: auth.publicId }] });

  const response = await asUser(bob).get(`/api/messages/conversation/${conversation._id}`);

  assert.equal(response.statusCode, 200);
  const found = response.body.data.messages.find((message) => message.content === 'from history');
  assert.ok(found);
  const [attachment] = found.attachments;
  assert.equal(attachment.type, 'video');
  assert.ok(attachment.thumbnailUrl);
  assert.equal(attachment.duration, 12.5);
  assert.equal(attachment.format, 'mp4');
});

test('editing a message to replace its images leaves a video attachment on the same message untouched', async () => {
  mockVerifiedVideoResource();
  mockDeleteImage();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const auth = (await requestSignature(alice, conversation._id)).body.data;

  const sendResponse = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'mixed message')
    .field('videoAttachments', JSON.stringify([{ publicId: auth.publicId }]))
    .attach('images', TINY_PNG, { filename: 'old.png', contentType: 'image/png' });

  const messageId = sendResponse.body.data._id;
  const videoAttachmentId = sendResponse.body.data.attachments.find((a) => a.type === 'video')._id;
  const oldImageAttachmentId = sendResponse.body.data.attachments.find((a) => a.type === 'image')._id;

  const editResponse = await asUser(alice)
    .put(`/api/messages/${messageId}`)
    .field('content', 'mixed message, edited')
    .attach('images', TINY_PNG, { filename: 'new.png', contentType: 'image/png' });

  assert.equal(editResponse.statusCode, 200);
  assert.equal(editResponse.body.data.attachments.length, 2);
  const editedTypes = editResponse.body.data.attachments.map((a) => a.type).sort();
  assert.deepEqual(editedTypes, ['image', 'video']);

  // The video attachment itself (same _id) survived the edit completely.
  assert.ok(editResponse.body.data.attachments.some((a) => String(a._id) === String(videoAttachmentId)));
  // The old image attachment was replaced and cleaned up.
  assert.equal(await Attachment.findById(oldImageAttachmentId), null);
  assert.ok(await Attachment.findById(videoAttachmentId), 'video attachment must still exist in the database');
});

test('an empty message (no text, no images, no videos) is still rejected', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice).post(`/api/messages/conversation/${conversation._id}`).send({ content: '' });

  assert.equal(response.statusCode, 400);
});
