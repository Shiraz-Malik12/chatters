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
import cloudinaryService from '../src/services/cloudinaryService.js';
import { signAccessToken } from '../src/services/token.service.js';
import { MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_SIZE_BYTES } from '../src/config/upload.js';

// Runs against a real, disposable local MongoDB database — never the dev
// database from MONGODB_URI — so these are true integration tests. Cloudinary
// is always mocked; these tests never touch a real Cloudinary account.
const TEST_DB_URI = 'mongodb://127.0.0.1:27017/chatters_test_attachments';

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

/** Mocks cloudinaryService so no test ever calls the real Cloudinary API. */
const mockSuccessfulUploads = () => {
  let counter = 0;

  const uploadMock = mock.method(cloudinaryService, 'uploadImage', async (buffer) => {
    counter += 1;
    return {
      public_id: `test/mock-${Date.now()}-${counter}`,
      secure_url: `https://res.cloudinary.com/test/image/upload/mock-${counter}.png`,
      width: 1,
      height: 1,
      bytes: buffer.length,
      format: 'png',
    };
  });
  const deleteMock = mock.method(cloudinaryService, 'deleteImage', async () => ({ result: 'ok' }));

  return { uploadMock, deleteMock };
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

test('text-only message still works (backward compatible JSON API)', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'hello there' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.content, 'hello there');
  assert.deepEqual(response.body.data.attachments, []);
});

test('authenticated user can send an image-only message', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    .attach('images', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.content, '');
  assert.equal(response.body.data.attachments.length, 1);
  assert.equal(response.body.data.attachments[0].type, 'image');
  assert.ok(response.body.data.attachments[0].url);
});

test('authenticated user can send text + image together', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'check this out')
    .attach('images', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.content, 'check this out');
  assert.equal(response.body.data.attachments.length, 1);
});

test('multiple images in one message work', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'a few photos')
    .attach('images', TINY_PNG, { filename: 'a.png', contentType: 'image/png' })
    .attach('images', TINY_PNG, { filename: 'b.png', contentType: 'image/png' })
    .attach('images', TINY_PNG, { filename: 'c.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.attachments.length, 3);
});

test('empty message (no text, no attachments) is rejected', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice).post(`/api/messages/conversation/${conversation._id}`).send({ content: '' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
});

test('file whose real content does not match an allowed image type is rejected', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    // Declares image/jpeg but the bytes are plain text — must be caught by
    // the magic-byte sniff, not the (spoofable) declared mimetype.
    .attach('images', Buffer.from('this is not actually an image'), {
      filename: 'fake.jpg',
      contentType: 'image/jpeg',
    });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.success, false);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
});

test('oversized image is rejected', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);
  const oversized = Buffer.alloc(MAX_IMAGE_SIZE_BYTES + 1024, 0);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    .attach('images', oversized, { filename: 'huge.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 413);
});

test('too many images in one message is rejected', async () => {
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  let req = asUser(alice).post(`/api/messages/conversation/${conversation._id}`).field('content', '');
  for (let i = 0; i < MAX_IMAGES_PER_MESSAGE + 1; i += 1) {
    req = req.attach('images', TINY_PNG, { filename: `img-${i}.png`, contentType: 'image/png' });
  }

  const response = await req;

  assert.equal(response.statusCode, 400);
});

test('a non-member cannot send a message (text or image) into a conversation they know the id of', async () => {
  const { uploadMock } = mockSuccessfulUploads();
  const [alice, bob, outsider] = await Promise.all([createUser(), createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(outsider)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    .attach('images', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 403);
  // Membership must be checked before any Cloudinary upload is attempted.
  assert.equal(uploadMock.mock.calls.length, 0);
});

test('sending to a non-existent conversation returns 404', async () => {
  const alice = await createUser();
  const missingId = new mongoose.Types.ObjectId().toString();

  const response = await asUser(alice).post(`/api/messages/conversation/${missingId}`).send({ content: 'hi' });

  assert.equal(response.statusCode, 404);
});

test('a Cloudinary failure does not save the message (and leaves no attachment records)', async () => {
  mock.method(cloudinaryService, 'uploadImage', async () => {
    throw new Error('cloudinary is down');
  });
  mock.method(cloudinaryService, 'deleteImage', async () => ({ result: 'ok' }));

  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', '')
    .attach('images', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 502);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
  assert.equal(await Attachment.countDocuments({ uploadedBy: alice._id }), 0);
});

test('a MongoDB failure after upload triggers Cloudinary + attachment cleanup', async () => {
  const { deleteMock } = mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const originalCreate = Message.create;
  Message.create = async () => {
    throw new Error('simulated MongoDB write failure');
  };

  let response;
  try {
    response = await asUser(alice)
      .post(`/api/messages/conversation/${conversation._id}`)
      .field('content', '')
      .attach('images', TINY_PNG, { filename: 'photo.png', contentType: 'image/png' });
  } finally {
    Message.create = originalCreate;
  }

  assert.equal(response.statusCode, 500);
  assert.equal(await Message.countDocuments({ conversationId: conversation._id }), 0);
  assert.equal(await Attachment.countDocuments({ uploadedBy: alice._id }), 0);
  assert.equal(deleteMock.mock.calls.length, 1);
});

test('successful image message response includes populated attachments', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  const response = await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'nice view')
    .attach('images', TINY_PNG, { filename: 'view.png', contentType: 'image/png' });

  assert.equal(response.statusCode, 201);
  const [attachment] = response.body.data.attachments;
  assert.equal(attachment.type, 'image');
  assert.ok(attachment.url);
  assert.equal(attachment.mimetype, 'image/png');
  assert.ok(typeof attachment.size === 'number');
});

test('GET conversation messages returns attachment metadata for image messages', async () => {
  mockSuccessfulUploads();
  const [alice, bob] = await Promise.all([createUser(), createUser()]);
  const conversation = await createPrivateConversation(alice, bob);

  await asUser(alice)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'from history')
    .attach('images', TINY_PNG, { filename: 'view.png', contentType: 'image/png' });

  const response = await asUser(bob).get(`/api/messages/conversation/${conversation._id}`);

  assert.equal(response.statusCode, 200);
  const found = response.body.data.messages.find((message) => message.content === 'from history');
  assert.ok(found, 'expected the image message to appear in conversation history');
  assert.equal(found.attachments.length, 1);
  assert.ok(found.attachments[0].url);
});

test('group chat image message works, and non-members are still rejected', async () => {
  mockSuccessfulUploads();
  const [owner, memberA, memberB, outsider] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser(),
  ]);
  const conversation = await createGroupConversation([owner, memberA, memberB], owner);

  const memberResponse = await asUser(memberA)
    .post(`/api/messages/conversation/${conversation._id}`)
    .field('content', 'group photo')
    .attach('images', TINY_PNG, { filename: 'group.png', contentType: 'image/png' });

  assert.equal(memberResponse.statusCode, 201);
  assert.equal(memberResponse.body.data.attachments.length, 1);

  const outsiderResponse = await asUser(outsider)
    .post(`/api/messages/conversation/${conversation._id}`)
    .send({ content: 'trying to sneak in' });

  assert.equal(outsiderResponse.statusCode, 403);
});
